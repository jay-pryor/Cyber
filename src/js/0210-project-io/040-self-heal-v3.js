    /**
     * Self-heal v3 groups & overrides on load (spec §19.7): drop dangling/duplicate
     * group memberships and non-applicable/invalid override entries, returning a
     * warning Issue per removal. Mutates `p`. Never a hard error.
     * @returns {Issue[]}
     */
    function selfHealV3(p) {
      var warnings = [];
      function warn(msg, loc) { warnings.push({ category: 'validation', severity: 'warning', message: msg, location: loc }); }
      var validDs = (typeof p.platformProfileId === 'string' && App.registry.hasPlatform(p.platformProfileId)) ? App.registry.datasetIds(p.platformProfileId) : null;
      var pid = p.platformProfileId;
      var latest = latestByBase(p.deviceConfigs);

      // ---- CUS-1: seed a register for every dataset the platform now has --------
      // A project saved before a dataset existed simply has no `items` entry for it.
      // Everything READING the register tolerates that (`items[dsId] || []`), but the
      // mutation paths do not — `setDecision` refuses an unknown dataset — so an older
      // project would show the new tab and then refuse the first edit made in it.
      // Seeding an empty array here is not a fix-up of bad data; it is the same
      // pre-seeding `App.store.empty()` does for a fresh project.
      if (validDs && isPlainObject(p.items)) {
        validDs.forEach(function (dsId) { if (!Array.isArray(p.items[dsId])) p.items[dsId] = []; });
      }

      // ---- adapter-driven snapshot completion (review-17 #4, extended by FW-1) ----
      // A dataset may guarantee keys that OLDER captures predate — the tactical
      // `imsSettings` block, which an untouched Knox export omits and the parser now
      // fills in. Any adapter can opt in with a `completeSnapshot(snap)` hook (core
      // stays dataset-agnostic, DOD-11); whatever it adds is mirrored into the
      // register as an undecided item, so a device onboarded before the change lists
      // the keys as applicable and later imports/generation stay consistent.
      //
      // FW-1 added the other direction. When a flattening rule changes, a stored
      // snapshot can also carry keys the adapter NO LONGER produces (the positional
      // `firewallRules[0].addressType` keys, now one `firewallRules` leaf). Those are
      // unreachable: not applicable to any device, never generated, and impossible to
      // re-create. Left in the register they are permanently-undecided rows inflating
      // every count. So the hook may return `{added, removed}` as well as a plain array
      // of added keys, and a removed key that survives in NO snapshot takes its register
      // item with it — loudly, never silently.
      if (pid && App.registry.hasPlatform(pid)) {
        var completed = {}, retired = {};
        (p.deviceConfigs || []).forEach(function (dc) {
          if (!dc || !isPlainObject(dc.snapshots)) return;
          Object.keys(dc.snapshots).forEach(function (dsId) {
            if (validDs && validDs.indexOf(dsId) === -1) return;
            var adapter = App.registry.getDataset(pid, dsId);
            if (!adapter || typeof adapter.completeSnapshot !== 'function') return;
            var res = adapter.completeSnapshot(dc.snapshots[dsId]) || [];
            var added = Array.isArray(res) ? res : (res.added || []);
            (Array.isArray(res) ? [] : (res.removed || [])).forEach(function (k) { (retired[dsId] = retired[dsId] || {})[k] = true; });
            if (!added.length) return;
            if (!Array.isArray(p.items[dsId])) p.items[dsId] = [];
            var have = {};
            p.items[dsId].forEach(function (it) { if (it) have[it.key] = true; });
            added.forEach(function (k) {
              (completed[dsId] = completed[dsId] || {})[k] = true;
              if (have[k]) return;
              have[k] = true;
              p.items[dsId].push({ key: k, decision: null, controlRefs: [], status: 'undecided' });
            });
          });
        });
        Object.keys(completed).forEach(function (dsId) {
          var ks = Object.keys(completed[dsId]).sort();
          warn('this dataset now always carries ' + ks.length + ' key(s) your capture predates: ' +
            ks.join(', ') + ' — added as undecided.', dsId);
        });
        // Drop retired keys only where NO snapshot still lists them — another device (or
        // an older version of this one) that genuinely still has the key keeps its item.
        Object.keys(retired).forEach(function (dsId) {
          var stillUsed = {};
          (p.deviceConfigs || []).forEach(function (dc) {
            var sn = dc && isPlainObject(dc.snapshots) ? dc.snapshots[dsId] : null;
            if (sn && Array.isArray(sn.keys)) sn.keys.forEach(function (k) { stillUsed[k] = true; });
          });
          var gone = Object.keys(retired[dsId]).filter(function (k) { return !stillUsed[k]; }).sort();
          if (!gone.length) return;
          var goneSet = {}; gone.forEach(function (k) { goneSet[k] = true; });
          if (Array.isArray(p.items[dsId])) {
            p.items[dsId] = p.items[dsId].filter(function (it) { return !(it && goneSet[it.key]); });
          }
          warn(gone.length + ' key(s) are no longer produced from your capture and have been removed ' +
            'from the register: ' + gone.slice(0, 6).join(', ') + (gone.length > 6 ? ', …' : '') +
            '. Firewall rules are now a single item holding the whole rule list, so the number of rules ' +
            'no longer changes the register.', dsId);
        });
      }

      function pruneOverrideMap(map, keysFor, label) {
        if (!isPlainObject(map)) return;
        Object.keys(map).forEach(function (dsId) {
          var bucket = map[dsId];
          if (!isPlainObject(bucket)) { delete map[dsId]; return; }
          if (validDs && validDs.indexOf(dsId) === -1) { delete map[dsId]; warn(label + ': override dataset "' + dsId + '" is not registered — removed.', 'overrides'); return; }
          var ks = {}; (keysFor(dsId) || []).forEach(function (k) { ks[k] = true; });
          var adapter = (pid && App.registry.hasPlatform(pid)) ? App.registry.getDataset(pid, dsId) : null;
          Object.keys(bucket).forEach(function (key) {
            if (!ks[key]) { delete bucket[key]; warn(label + ': override "' + dsId + '/' + key + '" is not applicable — removed.', 'overrides'); return; }
            if (adapter && typeof adapter.validateDecision === 'function') {
              var bad = (adapter.validateDecision({ key: key, decision: bucket[key], controlRefs: [] }) || []).some(function (i) { return i.severity === 'error'; });
              if (bad) { delete bucket[key]; warn(label + ': override "' + dsId + '/' + key + '" has an invalid value — removed.', 'overrides'); }
            }
          });
          if (!Object.keys(bucket).length) delete map[dsId];
        });
      }

      // DEV-1: prune the by-hand device-assignment adjustments. An entry may name a key
      // that has since left the register (an item deleted in another session, a capture
      // re-onboarded without it), and an adjustment pointing at nothing is not an
      // adjustment. Run BEFORE the override prune, so an override is judged against the
      // scope that survived.
      (p.deviceConfigs || []).forEach(function (dc) {
        if (!dc || !isPlainObject(dc.scope)) return;
        Object.keys(dc.scope).forEach(function (dsId) {
          var sc = dc.scope[dsId];
          if (!isPlainObject(sc) || (validDs && validDs.indexOf(dsId) === -1)) {
            delete dc.scope[dsId];
            warn('device "' + dc.id + '": device assignments for "' + dsId + '" are not a registered dataset — removed.', 'scope');
            return;
          }
          var known = {}; (Array.isArray(p.items && p.items[dsId]) ? p.items[dsId] : []).forEach(function (it) { if (it) known[it.key] = true; });
          ['add', 'remove'].forEach(function (f) {
            if (!Array.isArray(sc[f])) { delete sc[f]; return; }
            var kept = sc[f].filter(function (k) {
              if (known[k]) return true;
              warn('device "' + dc.id + '": device assignment "' + dsId + '/' + k + '" names an item that is no longer in the register — removed.', 'scope');
              return false;
            });
            if (kept.length) sc[f] = kept.slice().sort(); else delete sc[f];
          });
          if (!sc.add && !sc.remove) delete dc.scope[dsId];
        });
        if (!Object.keys(dc.scope).length) delete dc.scope;
      });

      // DEV-1: the keys an override may legitimately reference. Deliberately the capture
      // PLUS anything manually added, and NOT minus anything manually removed: taking an
      // item off a device is a reversible view of what applies there, so it must not also
      // delete the per-device value recorded for it. The override goes dormant; putting
      // the item back brings it with it. Only a key that has left the evidence entirely
      // is dangling, which is what the prune is for.
      function overrideKeyUniverse(p2, dc, dsId) {
        return App.registry.baseApplicableKeys(p2, dc, dsId).concat(App.registry.deviceScope(dc, dsId).add);
      }

      // Groups: enforce single-group membership + existing baseIds; prune group overrides.
      var claimed = {};
      (p.groups || []).forEach(function (g) {
        if (!g) return;
        if (Array.isArray(g.deviceBaseIds)) {
          g.deviceBaseIds = g.deviceBaseIds.filter(function (b) {
            if (!latest[b]) { warn('group "' + g.id + '": unknown device "' + b + '" — removed from membership.', 'groups'); return false; }
            if (claimed[b]) { warn('device "' + b + '" is already in another group — removed from "' + g.id + '".', 'groups'); return false; }
            claimed[b] = true; return true;
          });
        }
        pruneOverrideMap(g.overrides, function (dsId) {
          // CUS-1: registry.applicableKeys answers this for captured AND virtual
          // datasets — reading snapshots directly here would prune every custom-action
          // override on load, since a virtual dataset has no snapshot to read.
          var keys = [];
          (g.deviceBaseIds || []).forEach(function (b) {
            if (latest[b]) keys = keys.concat(overrideKeyUniverse(p, latest[b], dsId));   // DEV-1
          });
          return keys;
        }, 'group "' + g.id + '"');
      });

      // Per-config overrides: applicable = THAT version's applicable keys (snapshot keys
      // for a captured dataset; the whole register for a virtual one, CUS-1).
      (p.deviceConfigs || []).forEach(function (dc) {
        if (!dc || !isPlainObject(dc.overrides)) return;
        pruneOverrideMap(dc.overrides, function (dsId) {
          return overrideKeyUniverse(p, dc, dsId);   // DEV-1
        }, 'device "' + dc.id + '"');
      });

      return warnings;
    }

    /**
     * Parse + validate + migrate project text.
     * @param {string} text
     * @returns {{ok:boolean, value?:Project, issues:Issue[]}}
     */
    function parseProject(text) {
      var obj;
      try { obj = JSON.parse(text); }
      catch (e) {
        return { ok: false, issues: [{ category: 'parse', severity: 'error', message: 'Project file is not valid JSON: ' + e.message, location: 'file', fix: 'Check for a truncated or corrupted file.' }] };
      }
      var migrated = migrate(obj);
      // Strip retired datasets BEFORE the schema check, or their ids fail the
      // dataset cross-check and an otherwise-valid older project cannot open.
      var retiredWarnings = dropRetiredDatasets(migrated);
      // REL-1: likewise BEFORE the schema check — the relevance vocabulary is closed.
      var renameWarnings = renameLegacyRelevance(migrated);
      var issues = validateSchema(migrated);
      var hasError = issues.some(function (i) { return i.severity === 'error'; });
      if (hasError) return { ok: false, issues: retiredWarnings.concat(renameWarnings, issues) };
      // Self-heal v3 groups/overrides (prune dangling/non-applicable/invalid + warn).
      var healWarnings = selfHealV3(migrated);
      return { ok: true, value: migrated, issues: retiredWarnings.concat(renameWarnings, issues, healWarnings) };
    }

    /** Deep clone via JSON (project data is plain JSON). */
    function clone(v) { return JSON.parse(JSON.stringify(v)); }

    /** Drop empty override buckets/maps from a config or group so output stays canonical (§19.7). */
    function dropEmptyOverrides(obj) {
      if (!obj || !isPlainObject(obj.overrides)) return;
      Object.keys(obj.overrides).forEach(function (dsId) {
        var b = obj.overrides[dsId];
        if (!isPlainObject(b) || !Object.keys(b).length) delete obj.overrides[dsId];
      });
      if (!Object.keys(obj.overrides).length) delete obj.overrides;
    }

    /**
     * TW-1/TBS-1: the canonical form of one document part.
     *
     * `widths` absent means auto, and `styleHead`/`styleFirstColumn` absent mean
     * unstyled, so the OFF state is written as absence rather than as `false`. Widths
     * are rounded to four places on the way out: they are computed by dividing pixels
     * by pixels, and two operators dragging a column to the same place must produce the
     * same bytes or DOD-7 is only true of projects nobody edited.
     */
    function canonicalPart(pt) {
      if (!isPlainObject(pt)) return;
      /* SPC-1: a measurement of zero is no measurement, and is written as absence — the
       * rule every optional field here follows, so a gap that was set and cleared
       * serialises exactly as one that never existed (DOD-7). Rounded to a hundredth of
       * a millimetre, which is finer than any printer and coarser than a float. */
      ['height', 'rowHeight'].forEach(function (k) {
        if (pt[k] === undefined) return;
        var n = Number(pt[k]);
        if (!isFinite(n) || n <= 0) delete pt[k];
        else pt[k] = Math.round(Math.min(n, 500) * 100) / 100;
      });
      if (pt.kind !== 'table') return;
      /* SPC-1: the tick list is a DEVIATION from "every row", so it is written only while
       * it says something — no height, a length that does not match the rows, or every
       * row ticked, and it goes. The same presence rule as everything else here (DOD-7). */
      if (pt.tallRows !== undefined) {
        var rowN = Array.isArray(pt.rows) ? pt.rows.length : 0;
        if (!Array.isArray(pt.tallRows) || !pt.rowHeight || pt.tallRows.length !== rowN ||
            pt.tallRows.every(function (v) { return v !== false; })) delete pt.tallRows;
        else pt.tallRows = pt.tallRows.map(function (v) { return v !== false; });
      }
      if (Array.isArray(pt.widths)) {
        if (!pt.widths.length || !Array.isArray(pt.header) || pt.widths.length !== pt.header.length) delete pt.widths;
        else pt.widths = pt.widths.map(function (w) { return Math.round(Number(w) * 10000) / 10000; });
      }
      // CAP-4: `noCaption` follows the same rule — captioned is the default, so only the
      // switched-on state is written.
      ['styleHead', 'styleFirstColumn', 'noCaption'].forEach(function (k) { if (pt[k] !== true) delete pt[k]; });
    }

