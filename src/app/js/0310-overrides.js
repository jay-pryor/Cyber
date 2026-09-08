  /* =============================================================================
   * MODULE: App.overrides
   * PURPOSE: The single choke point (spec §19.2.3, OVR-3) that resolves the
   *          default → group → device decision chain for an (item, device) pair,
   *          classifies value divergence for highlighting, and lists deviations.
   *          Adapters stay override-blind: callers use effectiveItem(...) and pass
   *          the resulting item to adapters unchanged.
   * PURITY:  pure
   * DEPENDS: App.registry, App.util.stable
   * INVARIANTS:
   *   * Precedence device > group > default; classification is by VALUE (stableStringify),
   *     so a redundant override never mis-colours (OVR-8).
   *   * Overrides are value-only — applicability is unchanged (callers filter by snapshot).
   * ============================================================================= */
  (function (App) {
    'use strict';
    var stable = App.util.stable.stableStringify;

    function deviceById(project, deviceId) {
      return (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0] || null;
    }

    /** The group whose deviceBaseIds includes this device's baseId, or null. */
    function groupForDevice(project, deviceId) {
      var dc = deviceById(project, deviceId);
      if (!dc) return null;
      var groups = project.groups || [];
      for (var i = 0; i < groups.length; i++) {
        if ((groups[i].deviceBaseIds || []).indexOf(dc.baseId) !== -1) return groups[i];
      }
      return null;
    }

    /** Read an override value (or undefined) from an overrides map. */
    function ovOf(map, dsId, key) {
      if (!map || !map[dsId] || !Object.prototype.hasOwnProperty.call(map[dsId], key)) return undefined;
      return map[dsId][key];
    }

    /** The default/group/device layered values for one (item, device). */
    function layers(project, datasetId, item, deviceId) {
      var dc = deviceById(project, deviceId);
      var dV = (item.decision != null) ? item.decision : null;
      var group = groupForDevice(project, deviceId);
      var gV = dV, hasGroup = false;
      if (group) { var go = ovOf(group.overrides, datasetId, item.key); if (go !== undefined) { gV = go; hasGroup = true; } }
      var eV = gV, hasDevice = false;
      if (dc) { var dov = ovOf(dc.overrides, datasetId, item.key); if (dov !== undefined) { eV = dov; hasDevice = true; } }
      return { dV: dV, gV: gV, eV: eV, hasGroup: hasGroup, hasDevice: hasDevice, group: group };
    }

    /**
     * Effective decision + provenance for one (item, device) (spec §19.2).
     * @returns {{decision:Object|null, source:'default'|'group'|'device'}}
     */
    function effectiveDecision(project, datasetId, item, deviceId) {
      var L = layers(project, datasetId, item, deviceId);
      return { decision: L.eV, source: L.hasDevice ? 'device' : (L.hasGroup ? 'group' : 'default') };
    }

    /** The item shallow-cloned with its decision replaced by the effective value. */
    function effectiveItem(project, datasetId, item, deviceId) {
      var eff = effectiveDecision(project, datasetId, item, deviceId);
      var out = {};
      for (var k in item) if (Object.prototype.hasOwnProperty.call(item, k)) out[k] = item[k];
      out.decision = eff.decision;
      return out;
    }

    /** Value-based divergence class for highlighting (OVR-4/OVR-8). */
    function classify(project, datasetId, item, deviceId) {
      var L = layers(project, datasetId, item, deviceId);
      if (stable(L.eV) !== stable(L.gV)) return 'device';
      if (stable(L.gV) !== stable(L.dV)) return 'group';
      return 'default';
    }

    function byDsKey(a, b) {
      if (a.datasetId !== b.datasetId) return a.datasetId < b.datasetId ? -1 : 1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    }

    /** Every applicable item whose effective value diverges from default, for a device (§19.6). */
    function deviceDeviations(project, deviceId) {
      var dc = deviceById(project, deviceId);
      if (!dc) return [];
      var pid = project.platformProfileId, out = [];
      App.registry.datasetIds(pid).forEach(function (dsId) {
        var adapter = App.registry.getDataset(pid, dsId);
        if (!adapter || !App.registry.deviceHasDataset(project, dc, dsId)) return;
        var keySet = App.registry.applicableKeySet(project, dc, dsId);   // CUS-1
        var dispKey = adapter.displayKey || function (k) { return k; };
        (project.items[dsId] || []).forEach(function (it) {
          if (!keySet[it.key]) return;
          var cls = classify(project, dsId, it, deviceId);
          if (cls === 'default') return;
          var L = layers(project, dsId, it, deviceId);
          out.push({ datasetId: dsId, key: it.key, displayKey: dispKey(it.key), source: cls, defaultValue: L.dV, groupValue: L.gV, deviceValue: L.eV });
        });
      });
      out.sort(byDsKey);
      return out;
    }

    /** Every group override that diverges from default, for a group (§19.4/§19.6). */
    function groupDeviations(project, groupId) {
      var group = (project.groups || []).filter(function (g) { return g.id === groupId; })[0];
      if (!group) return [];
      var pid = project.platformProfileId, out = [];
      Object.keys(group.overrides || {}).forEach(function (dsId) {
        var adapter = App.registry.getDataset(pid, dsId);
        var dispKey = (adapter && adapter.displayKey) || function (k) { return k; };
        var itemsByKey = {}; (project.items[dsId] || []).forEach(function (it) { itemsByKey[it.key] = it; });
        Object.keys(group.overrides[dsId]).forEach(function (key) {
          var it = itemsByKey[key];
          var dV = (it && it.decision != null) ? it.decision : null;
          var gV = group.overrides[dsId][key];
          if (stable(gV) === stable(dV)) return; // redundant, not a real deviation
          out.push({ datasetId: dsId, key: key, displayKey: dispKey(key), source: 'group', defaultValue: dV, groupValue: gV, deviceValue: gV });
        });
      });
      out.sort(byDsKey);
      return out;
    }

    App.overrides = {
      groupForDevice: groupForDevice,
      effectiveDecision: effectiveDecision,
      effectiveItem: effectiveItem,
      classify: classify,
      deviceDeviations: deviceDeviations,
      groupDeviations: groupDeviations
    };
  })(App);
