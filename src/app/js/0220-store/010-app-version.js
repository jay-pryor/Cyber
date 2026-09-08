  /* =============================================================================
   * MODULE: App.store
   * PURPOSE: In-memory project + mutations + change events (spec §7.1). Holds the
   *          single mutable copy of canonical state; exposes deep-readonly snapshots
   *          and an event emitter. Performs NO I/O.
   * PURITY:  yes* (mutable state, but mutations are transactional + emit; no DOM/IO)
   * DEPENDS: App.util.clock, App.util.stable, App.registry, App.projectIo
   * INVARIANTS:
   *   * getProject() returns a deep clone — external code can never mutate state.
   *   * Every mutation bumps meta.modifiedUtc (from the injected clock) and emits.
   *   * Item status is recomputed (never trusted from disk) when adapters exist.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var APP_VERSION = '1.0';
    var _project = null;
    var _handlers = [];
    var _dirty = false;

    function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

    function emit() {
      var snap = getProject();
      _handlers.forEach(function (h) { try { h(snap); } catch (e) { /* handler errors are UI's problem */ } });
    }

    /**
     * Build a blank project for a platform.
     * @param {string} platformProfileId
     * @returns {Project}
     */
    function empty(platformProfileId) {
      var now = App.util.clock.nowIso();
      var items = {};
      // Pre-seed an empty array per dataset so tables render immediately.
      App.registry.datasetIds(platformProfileId).forEach(function (dsId) { items[dsId] = []; });
      return {
        schemaVersion: App.projectIo.SCHEMA_VERSION,
        platformProfileId: platformProfileId,
        meta: { createdUtc: now, modifiedUtc: now, appVersion: APP_VERSION },
        deviceConfigs: [],
        groups: [],
        controls: [],
        controlTypes: [],
        items: items
      };
    }

    /**
     * Load a parsed project as the current state. Recomputes item status.
     * @param {Project} project
     * @returns {void}
     */
    function init(project) {
      _project = clone(project);
      recomputeStatus();
      _dirty = false;
      emit();
    }

    /**
     * Recompute every item's status from its adapter's isComplete (spec §6.5).
     * No-op for datasets whose adapter is not registered yet.
     */
    function recomputeStatus() {
      if (!_project) return;
      var pid = _project.platformProfileId;
      Object.keys(_project.items).forEach(function (dsId) {
        var adapter = App.registry.getDataset(pid, dsId);
        _project.items[dsId].forEach(function (it) {
          if (adapter && typeof adapter.isComplete === 'function') {
            // Use completeness.itemComplete so the REQUIRE_CONTROL_REF policy (§6.5)
            // folds into the derived status; fall back to the raw adapter check.
            var complete = App.completeness ? App.completeness.itemComplete(adapter, it) : adapter.isComplete(it);
            it.status = complete ? 'decided' : 'undecided';
          }
        });
      });
    }

    /** @returns {Project|null} deep-readonly snapshot */
    function getProject() { return _project ? clone(_project) : null; }

    /** @returns {boolean} */
    function isDirty() { return _dirty; }

    /** Mark the in-memory state clean (e.g. just after a successful Save). */
    function markSaved() { _dirty = false; emit(); }

    /** Mark in-memory state unsaved (e.g. after restoring a non-canonical draft). */
    function markDirty() { _dirty = true; emit(); }

    /**
     * Subscribe to state changes. Handler receives a fresh snapshot.
     * @param {(project:Project)=>void} handler
     * @returns {()=>void} unsubscribe
     */
    function onChange(handler) {
      _handlers.push(handler);
      return function () {
        var i = _handlers.indexOf(handler);
        if (i >= 0) _handlers.splice(i, 1);
      };
    }

    /**
     * Internal: apply a mutator to the live project inside a transaction, bumping
     * modifiedUtc and emitting. Mutations of state happen ONLY here.
     * @param {(p:Project)=>void} mutator
     */
    function commit(mutator) {
      if (!_project) throw new Error('store: no project loaded');
      mutator(_project);
      _project.meta.modifiedUtc = App.util.clock.nowIso();
      _dirty = true;
      recomputeStatus();
      emit();
    }

    // ---- identity / slug helpers (spec §8.7) -------------------------------
    /** Slugify a label into [a-z0-9] groups joined by '-'. */
    function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

    /** Latest (active) configs = those not referenced by any supersedesId. */
    function getLatestConfigs(p) {
      var referenced = {};
      p.deviceConfigs.forEach(function (c) { if (c.supersedesId) referenced[c.supersedesId] = true; });
      return p.deviceConfigs.filter(function (c) { return !referenced[c.id]; });
    }

    /**
     * Onboard OR re-onboard a device (single shared code path, spec §8.7). Identity
     * is resolved by baseId = slug(name + model); behaviour branches on whether a
     * latest config with that baseId exists and whether all snapshot hashes match.
     * Never auto-deletes items (append-only, §8.5).
     * @param {{name:string, model:string, firmware:string, snapshots:Object<string,Snapshot>}} input
     * @returns {{ok:boolean, issues:Issue[], result?:Object}}
     */
    function onboardDevice(input) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.', fix: 'Load or create a project first.' }] };
      var name = (input.name || '').trim();
      if (!name) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Device name is required.', location: 'name', fix: 'Enter a non-empty device name.' }] };
      var model = input.model || '', firmware = input.firmware || '';
      var snapshots = input.snapshots || {};
      var descriptions = input.descriptions || {};  // review-10 #3: per-dataset {key: description} imported at onboard
      var datasetIds = App.registry.datasetIds(_project.platformProfileId);
      var baseId = slugify(name + '-' + model) || slugify(name);
      if (!baseId) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Could not derive a device id from the name/model.', location: 'name' }] };

      var latestConfigs = getLatestConfigs(_project);
      var existing = latestConfigs.filter(function (c) { return c.baseId === baseId; })
        .sort(function (a, b) { return b.version - a.version; })[0] || null;

      // CUS-1: only CAPTURED datasets take part in onboarding. A virtual dataset has no
      // file, no snapshot and no triage, so including it here would make every
      // re-onboard look different (its snapshot is absent on both sides) and would
      // prune every custom override as "no longer applicable".
      var capturedDsIds = datasetIds.filter(function (dsId) {
        return !App.registry.isVirtualDataset(App.registry.getDataset(_project.platformProfileId, dsId));
      });

      // ---- identity check: identical snapshots => NO-OP (do not mutate) ----
      if (existing) {
        var identical = capturedDsIds.every(function (dsId) {
          var ns = snapshots[dsId], os = existing.snapshots[dsId];
          return ns && os && ns.sha256 === os.sha256;
        });
        if (identical) {
          return { ok: true, issues: [{ category: 'state', severity: 'info', message: 'Re-onboard of ' + name + ': identical snapshots, nothing to do.' }], result: { noop: true, baseId: baseId } };
        }
      }

      var version = existing ? existing.version + 1 : 1;
      var id = existing ? (baseId + '-v' + version) : baseId;
      var supersedesId = existing ? existing.id : null;
      var newConfig = { id: id, baseId: baseId, version: version, supersedesId: supersedesId, name: name, model: model, firmware: firmware, onboardedUtc: App.util.clock.nowIso(), snapshots: snapshots };

      // Re-onboard override carry-forward (spec §19.2.1): copy the prior latest
      // config's overrides into the new version, pruning keys that left the snapshot.
      var carried = {}, prunedOverrides = [];
      if (existing && existing.overrides) {
        datasetIds.forEach(function (dsId) {
          var src = existing.overrides[dsId]; if (!src) return;
          // CUS-1: a virtual dataset's applicable set is the register, not a snapshot —
          // its overrides survive a re-onboard as long as the item still exists.
          var virtual = App.registry.isVirtualDataset(App.registry.getDataset(_project.platformProfileId, dsId));
          var keyset = {};
          if (virtual) (_project.items[dsId] || []).forEach(function (it) { keyset[it.key] = true; });
          else ((snapshots[dsId] && snapshots[dsId].keys) || []).forEach(function (k) { keyset[k] = true; });
          var kept = {};
          Object.keys(src).forEach(function (key) { if (keyset[key]) kept[key] = src[key]; else prunedOverrides.push(dsId + '/' + key); });
          if (Object.keys(kept).length) carried[dsId] = kept;
        });
      }
      newConfig.overrides = carried;

      // ---- triage per dataset + drift detection (captured datasets only, CUS-1) ----
      var perDataset = {}, drift = [], newItemsByDs = {}, driftSeen = {};
      capturedDsIds.forEach(function (dsId) {
        var snap = snapshots[dsId];
        var parsedKeys = snap && snap.keys ? snap.keys : [];
        var registerKeys = (_project.items[dsId] || []).map(function (it) { return it.key; });
        var tri = App.diff.triage(parsedKeys, registerKeys);
        perDataset[dsId] = { newCount: tri.newKeys.length, existingCount: tri.existingKeys.length };
        newItemsByDs[dsId] = tri.newKeys.map(function (k) { return { key: k, decision: null, controlRefs: [], status: 'undecided' }; });
        // Captured-default drift (spec §8.4): for any dataset whose snapshot records
        // per-key capture values, compare existing keys against other devices'
        // recorded values. Informational only.
        if (snap && snap.values) {
          tri.existingKeys.forEach(function (k) {
            var newVal = snap.values[k];
            if (newVal === undefined) return;
            latestConfigs.forEach(function (c) {
              var os = c.snapshots[dsId];
              if (os && os.values && os.values[k] !== undefined && os.values[k] !== newVal) {
                var msg = k + ' default differs: ' + newVal + ' on ' + name + ', ' + os.values[k] + ' on ' + c.name;
                if (!driftSeen[msg]) { driftSeen[msg] = true; drift.push({ category: 'validation', severity: 'info', message: msg }); }
              }
            });
          });
        }
      });

      commit(function (p) {
        p.deviceConfigs.push(newConfig);
        datasetIds.forEach(function (dsId) {
          if (!p.items[dsId]) p.items[dsId] = [];
          (newItemsByDs[dsId] || []).forEach(function (it) { p.items[dsId].push(it); });
          // review-10 #3: apply imported descriptions to the register items (new and
          // existing) for this dataset. Only non-empty descriptions are present in the
          // map, so nothing clobbers an existing description with a blank.
          var dmap = descriptions[dsId];
          if (dmap) {
            var byKey = {}; p.items[dsId].forEach(function (it) { byKey[it.key] = it; });
            Object.keys(dmap).forEach(function (k) { if (byKey[k]) byKey[k].description = dmap[k]; });
          }
        });
      });

      var totalNew = 0, totalExisting = 0;
      capturedDsIds.forEach(function (dsId) { totalNew += perDataset[dsId].newCount; totalExisting += perDataset[dsId].existingCount; });
      var verb = existing ? ('Re-onboarded ' + name + ' as v' + version + ' (supersedes ' + supersedesId + ')') : ('Onboarded ' + name);
      var issues = [{ category: 'state', severity: 'success', message: verb + ': ' + totalNew + ' new, ' + totalExisting + ' inherited, 0 errors.' }].concat(drift);
      if (prunedOverrides.length) issues.push({ category: 'state', severity: 'info', message: 'Carried forward overrides; pruned ' + prunedOverrides.length + ' no-longer-applicable key(s): ' + prunedOverrides.join(', ') + '.' });

      return { ok: true, issues: issues, result: { noop: false, deviceId: id, baseId: baseId, version: version, supersedesId: supersedesId, perDataset: perDataset, drift: drift } };
    }

    /** Re-onboard alias — shares the onboardDevice code path (spec §8.7). */
    function reonboardDevice(input) { return onboardDevice(input); }

    /**
     * Items applicable to a device for a dataset: register items whose key is in
     * the device's snapshot keys for that dataset (spec §6.5) — or, for a virtual
     * dataset, all of them (CUS-1).
     * @returns {RegisterItem[]}
     */
    function applicableItems(deviceId, datasetId) {
      if (!_project) return [];
      var dc = _project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return [];
      if (!App.registry.deviceHasDataset(_project, dc, datasetId)) return [];
      var keySet = App.registry.applicableKeySet(_project, dc, datasetId);
      return (_project.items[datasetId] || []).filter(function (it) { return keySet[it.key]; });
    }

    /**
     * Count of undecided items — overall, or applicable to one device.
     * @param {string} [deviceId]
     * @returns {number}
     */
    function undecidedCount(deviceId) {
      if (!_project) return 0;
      var datasetIds = App.registry.datasetIds(_project.platformProfileId);
      if (!deviceId) {
        var n = 0;
        datasetIds.forEach(function (dsId) {
          (_project.items[dsId] || []).forEach(function (it) { if (it.status !== 'decided') n++; });
        });
        return n;
      }
      var c = 0;
      datasetIds.forEach(function (dsId) {
        applicableItems(deviceId, dsId).forEach(function (it) { if (it.status !== 'decided') c++; });
      });
      return c;
    }

    /**
     * Record (or clear) a decision for one register item (spec §7.1). The value is
     * always stored (never silently dropped, DOD-10); validation issues are returned
     * for inline display, and completeness/status recompute decides readiness — an
     * invalid decision simply stays incomplete rather than blocking the keystroke.
     * @param {string} datasetId
     * @param {string} key
     * @param {Object|null} decision  Full decision object, or null to clear.
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function setDecision(datasetId, key, decision) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var items = _project.items[datasetId];
      if (!items) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown dataset "' + datasetId + '".' }] };
      var item = items.filter(function (i) { return i.key === key; })[0];
      if (!item) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown item "' + key + '".', location: datasetId }] };
      var adapter = App.registry.getDataset(_project.platformProfileId, datasetId);
      var issues = (decision === null || !adapter) ? [] : (adapter.validateDecision({ key: key, decision: decision, controlRefs: item.controlRefs }) || []);
      commit(function (p) {
        var it = p.items[datasetId].filter(function (i) { return i.key === key; })[0];
        it.decision = decision;
        // HELD-3: editing a value IS reviewing it, so a held item is released. (Clearing
        // the decision outright also drops the flag — there is no value left to review.)
        delete it.held;
      });
      return { ok: issues.every(function (i) { return i.severity !== 'error'; }), issues: issues };
    }

    /**
     * HELD-1: mark an item "decided but flagged for review" — or release it.
     *
     * The point is to be able to record a value and STILL be forced back to it later.
     * Previously the only way to make an item undecided was to clear its decision, which
     * threw the value away; you could not say "this is my answer, but check it again".
     * A held item keeps its `decision` untouched and simply does not count as complete,
     * so it reads as undecided everywhere and blocks the device from being ready.
     * @param {string} datasetId @param {string} key @param {boolean} held
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function setHeld(datasetId, key, held) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var items = _project.items[datasetId];
      var item = items && items.filter(function (i) { return i.key === key; })[0];
      if (!item) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown item "' + key + '".', location: datasetId }] };
      if (held && item.decision == null) {
        return { ok: false, issues: [{ category: 'state', severity: 'error',
          message: 'Nothing to hold — this item has no recorded value yet.', location: datasetId + ' / ' + key }] };
      }
      commit(function (p) {
        var it = p.items[datasetId].filter(function (i) { return i.key === key; })[0];
        if (held) it.held = true; else delete it.held;   // absent ⇒ not held (canonical)
      });
      return { ok: true, issues: [] };
    }

