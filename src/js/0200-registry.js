  /* =============================================================================
   * MODULE: App.registry
   * PURPOSE: Platform/adapter registration (spec §5.3). The generic machinery
   *          discovers datasets/columns/decision-schemas by iterating the active
   *          platform — it never hardcodes dataset ids. Adding a platform = one
   *          registerPlatform call, zero core edits (DOD-11).
   * PURITY:  pure (holds registration state but no DOM/IO; pure queries)
   * DEPENDS: (none)
   * INVARIANTS: platform ids unique; active platform is one of the registered set.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var _platforms = {};   // id -> PlatformProfile
    var _order = [];       // registration order (stable listing)
    var _activeId = null;

    /**
     * Register a platform profile. First registered becomes active by default.
     * @param {PlatformProfile} profile
     * @returns {void}
     */
    function registerPlatform(profile) {
      if (!profile || !profile.id) throw new Error('registerPlatform: profile.id required');
      if (!_platforms[profile.id]) _order.push(profile.id);
      _platforms[profile.id] = profile;
      if (_activeId === null) _activeId = profile.id;
    }

    /** @returns {PlatformProfile[]} in registration order */
    function listPlatforms() { return _order.map(function (id) { return _platforms[id]; }); }

    /** @param {string} id @returns {boolean} */
    function hasPlatform(id) { return Object.prototype.hasOwnProperty.call(_platforms, id); }

    /** @param {string} id @returns {PlatformProfile|null} */
    function getPlatform(id) { return _platforms[id] || null; }

    /** @returns {PlatformProfile|null} */
    function getActivePlatform() { return _activeId ? _platforms[_activeId] : null; }

    /** @param {string} id @returns {void} */
    function setActivePlatform(id) {
      if (!hasPlatform(id)) throw new Error('setActivePlatform: unknown platform ' + id);
      _activeId = id;
    }

    /**
     * Look up a dataset adapter on a platform.
     * @param {string} platformId
     * @param {string} dsId
     * @returns {DatasetAdapter|null}
     */
    function getDataset(platformId, dsId) {
      var p = _platforms[platformId];
      if (!p) return null;
      for (var i = 0; i < p.datasets.length; i++) if (p.datasets[i].id === dsId) return p.datasets[i];
      return null;
    }

    /**
     * Convenience: the dataset ids of a platform (or active platform if omitted).
     * @param {string} [platformId]
     * @returns {string[]}
     */
    function datasetIds(platformId) {
      var p = platformId ? _platforms[platformId] : getActivePlatform();
      return p ? p.datasets.map(function (d) { return d.id; }) : [];
    }

    // ---- CUS-1: virtual (authored, uncaptured) datasets -------------------------
    // Packages and Tactical are CAPTURED: a device carries a Snapshot listing exactly
    // the keys that exist on it, and "applicable to this device" means "in that list".
    // A virtual dataset — Custom Security Actions — has no capture file and therefore
    // no Snapshot, so that question has a different but equally definite answer: an
    // action you wrote by hand applies to EVERY device in the project.
    //
    // Every place that used to reach for `dc.snapshots[dsId].keys` asks these helpers
    // instead, so the rule lives once here rather than as a null-check repeated (and
    // eventually forgotten) in readiness, generation, overrides and the tables.

    /** @param {?DatasetAdapter} adapter @returns {boolean} authored in-tool, never captured */
    function isVirtualDataset(adapter) { return !!(adapter && adapter.virtual); }

    /**
     * Does this device carry this dataset at all? Captured ⇒ it has a snapshot;
     * virtual ⇒ always, because there is nothing to capture.
     * @param {Project} project @param {DeviceConfig} dc @param {string} dsId
     * @returns {boolean}
     */
    function deviceHasDataset(project, dc, dsId) {
      if (!project || !dc) return false;
      if (isVirtualDataset(getDataset(project.platformProfileId, dsId))) return true;
      return !!(dc.snapshots && dc.snapshots[dsId]);
    }

    /**
     * The keys of `dsId` applicable to `dc` BEFORE any manual adjustment: the device's
     * snapshot keys, or — for a virtual dataset — every key in the register. This is
     * what the evidence says on its own.
     * @param {Project} project @param {?DeviceConfig} dc @param {string} dsId
     * @returns {string[]}
     */
    function baseApplicableKeys(project, dc, dsId) {
      if (!project) return [];
      if (isVirtualDataset(getDataset(project.platformProfileId, dsId))) {
        return ((project.items && project.items[dsId]) || []).map(function (it) { return it.key; });
      }
      var sn = dc && dc.snapshots && dc.snapshots[dsId];
      return (sn && Array.isArray(sn.keys)) ? sn.keys.slice() : [];
    }

    // ---- DEV-1: manual device assignment ----------------------------------------
    // Applicability is EVIDENCE first, and that is right for what a capture proves and
    // wrong for what an operator knows. A package a device never reported can still be
    // the subject of a decision ("keep it absent"), and a hand-authored action that
    // applies to "every device" by construction is not always wanted on every device.
    // Before this there was no way to say either without editing the capture, which
    // would have destroyed the evidence to record an opinion.
    //
    // So a DeviceConfig may carry a `scope` adjustment per dataset — `{add:[], remove:[]}`
    // — folded in HERE, at the one choke point every consumer of "does this apply?"
    // already goes through: readiness, generation, overrides, the tables and the report.
    // The snapshot is never touched: it stays the record of what the device reported,
    // and the adjustment stays a separate, visible, undoable decision layered on top.

    /** @param {?DeviceConfig} dc @param {string} dsId @returns {{add:string[], remove:string[]}} */
    function deviceScope(dc, dsId) {
      var s = dc && dc.scope && dc.scope[dsId];
      return {
        add: (s && Array.isArray(s.add)) ? s.add.slice() : [],
        remove: (s && Array.isArray(s.remove)) ? s.remove.slice() : []
      };
    }

    /**
     * The keys of `dsId` that are applicable to `dc` — the evidence, plus/minus whatever
     * has been assigned by hand (DEV-1). An added key is honoured only if it is a real
     * register item; nothing may become applicable that does not exist.
     * @param {Project} project @param {?DeviceConfig} dc @param {string} dsId
     * @returns {string[]}
     */
    function applicableKeys(project, dc, dsId) {
      var base = baseApplicableKeys(project, dc, dsId);
      var sc = deviceScope(dc, dsId);
      if (!sc.add.length && !sc.remove.length) return base;
      var drop = {}; sc.remove.forEach(function (k) { drop[k] = true; });
      var known = {}; ((project && project.items && project.items[dsId]) || []).forEach(function (it) { known[it.key] = true; });
      var out = [], seen = {};
      base.forEach(function (k) { if (!drop[k] && !seen[k]) { seen[k] = true; out.push(k); } });
      // Sorted, so the fold is deterministic however the adjustments were made (DOD-7).
      sc.add.slice().sort().forEach(function (k) { if (known[k] && !seen[k]) { seen[k] = true; out.push(k); } });
      return out;
    }

    /** applicableKeys as a lookup set. @returns {Object<string,boolean>} */
    function applicableKeySet(project, dc, dsId) {
      var set = {};
      applicableKeys(project, dc, dsId).forEach(function (k) { set[k] = true; });
      return set;
    }

    /** The active (non-superseded) device configs. @param {Project} project @returns {DeviceConfig[]} */
    function latestConfigs(project) {
      var list = (project && project.deviceConfigs) || [];
      var referenced = {};
      list.forEach(function (c) { if (c.supersedesId) referenced[c.supersedesId] = true; });
      return list.filter(function (c) { return !referenced[c.id]; });
    }

    /**
     * The captured leaf {value,type} per key for `dsId`, merged across the FLEET.
     *
     * A register item is fleet-wide, and so is the thing this map is used for: the
     * value format an item's decision has to satisfy (VF-2 infers it from the captured
     * type). Reading it from one device's snapshot alone made the format an accident of
     * which device you were looking at — so an item hand-assigned to a device that never
     * captured that key (DEV-1) had NO captured type there, inferred `string`, and a
     * perfectly good boolean decision failed validation and read as undecided on the
     * Devices tab while the data tab showed it decided. Hence one merged map, used by
     * readiness and by every table.
     *
     * `preferDeviceId` puts that device's own capture first, because where a device did
     * report the key its own evidence is the authority on the key's type; the rest of the
     * fleet only fills the gaps. Iteration is in project order, so the fold is
     * deterministic (DOD-7).
     * @param {Project} project @param {string} dsId @param {string} [preferDeviceId]
     * @returns {Object<string,{value:*,type:string}>}
     */
    function capturedDefaults(project, dsId, preferDeviceId) {
      var out = {};
      if (!project) return out;
      var adapter = getDataset(project.platformProfileId, dsId);
      if (!adapter || typeof adapter.capturedDefaults !== 'function') return out;
      var list = latestConfigs(project);
      if (preferDeviceId) {
        // Any version, not just the latest: readiness is asked about superseded configs too.
        var own = (project.deviceConfigs || []).filter(function (c) { return c.id === preferDeviceId; });
        list = own.concat(list.filter(function (c) { return c.id !== preferDeviceId; }));
      }
      list.forEach(function (c) {
        var snap = c.snapshots && c.snapshots[dsId];
        if (!snap) return;
        var d = adapter.capturedDefaults(snap);
        Object.keys(d).forEach(function (k) { if (!(k in out)) out[k] = d[k]; });
      });
      return out;
    }

    /** Test-only: clear all registrations. */
    function _reset() { _platforms = {}; _order = []; _activeId = null; }

    App.registry = {
      registerPlatform: registerPlatform, listPlatforms: listPlatforms,
      hasPlatform: hasPlatform, getPlatform: getPlatform,
      getActivePlatform: getActivePlatform, setActivePlatform: setActivePlatform,
      getDataset: getDataset, datasetIds: datasetIds, _reset: _reset,
      // CUS-1: the applicability rule, shared by every consumer of "does this item
      // apply to this device" so captured and authored datasets answer it in one place.
      isVirtualDataset: isVirtualDataset, deviceHasDataset: deviceHasDataset,
      applicableKeys: applicableKeys, applicableKeySet: applicableKeySet,
      // DEV-1: the evidence on its own, and the manual adjustment sitting on top of it.
      baseApplicableKeys: baseApplicableKeys, deviceScope: deviceScope,
      // VF-2/DEV-1: the one captured-value map, merged across the fleet.
      latestConfigs: latestConfigs, capturedDefaults: capturedDefaults
    };
  })(App);
