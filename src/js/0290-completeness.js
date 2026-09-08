  /* =============================================================================
   * MODULE: App.completeness
   * PURPOSE: Item completeness & device readiness (spec §6.5, §8.3). Wraps the
   *          adapter's isComplete with the optional REQUIRE_CONTROL_REF policy fold,
   *          and computes per-device readiness with reasons for generate-gating.
   * PURITY:  pure
   * DEPENDS: App.registry
   * INVARIANTS: a device is ready ⇔ every APPLICABLE item is complete; "applicable"
   *             = item.key ∈ that device's snapshot keys for the dataset.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * Is an item complete? adapter.isComplete + optional ISM-ref policy (§6.5) + the
     * item's declared value format (VF-7).
     *
     * `project`/`captured` are OPTIONAL and only needed for the format fold: without
     * them the function behaves exactly as it did before formats existed, so every
     * pre-existing caller (and the pure engine paths that have no project to hand)
     * keeps working. This is why the format check lives here rather than inside the
     * adapter: the format catalogue is project state, and adapters are project-blind.
     * @param {DatasetAdapter} adapter
     * @param {RegisterItem} item
     * @param {Project} [project]
     * @param {Object<string,{value:*,type:string}>} [captured]  adapter.capturedDefaults output
     * @returns {boolean}
     */
    function itemComplete(adapter, item, project, captured) {
      // HELD-2: "decided, but I want to look at this again". The value is intact; it just
      // does not count as done, so the item reads as undecided and the device stays
      // un-ready until someone releases it. Checked first — nothing else matters.
      if (item && item.held) return false;
      if (!adapter || !adapter.isComplete(item)) return false;
      if (mod.REQUIRE_CONTROL_REF && !(item.controlRefs && item.controlRefs.length)) return false;
      if (project && App.valueFormats) {
        if (formatIssues(adapter, item, project, captured).length) return false;
      }
      return true;
    }

    /**
     * The format violations for one item, or [] (VF-7). Exposed so the table can show
     * WHY a cell is invalid rather than just tinting it.
     * @returns {Issue[]}
     */
    function formatIssues(adapter, item, project, captured) {
      if (!project || !App.valueFormats || !item || item.decision == null) return [];
      var schema = (adapter && adapter.decisionSchema) || [];
      var primary = schema[0];
      // Formats describe a VALUE. A dataset whose primary decision field is an enum
      // (packages: keep/disable/remove) already has a closed vocabulary, so it is
      // deliberately out of scope — the adapter validates it.
      if (!primary || (primary.kind !== 'value-typed' && primary.kind !== 'string')) return [];
      // CUS-1: a dataset may declare that formats do not apply to it (Custom Security
      // Actions), in which case there is no shape to be in violation of.
      if (adapter.noValueFormats) return [];
      var cap = captured && captured[item.key];
      var fmt = App.valueFormats.resolve(project, item, cap ? cap.type : undefined, cap ? cap.value : undefined);
      return App.valueFormats.validate(fmt, item.decision[primary.name], item.key);
    }

    /**
     * Per-device readiness with reasons (for generate-button gating & messages).
     * @param {Project} project
     * @param {string} deviceId
     * @returns {{ready:boolean, totalUndecided:number, reasons:{datasetId:string,label:string,undecided:number}[]}}
     */
    function deviceReadiness(project, deviceId) {
      var ids = App.registry.datasetIds(project.platformProfileId);
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      var reasons = [], total = 0;
      if (!dc) return { ready: false, totalUndecided: 0, reasons: [{ datasetId: '', label: 'device', undecided: 0 }] };
      ids.forEach(function (dsId) {
        var adapter = App.registry.getDataset(project.platformProfileId, dsId);
        if (!adapter || !App.registry.deviceHasDataset(project, dc, dsId)) return;
        // CUS-1: applicable = snapshot keys, or the whole register for a virtual dataset.
        var keySet = App.registry.applicableKeySet(project, dc, dsId);
        // VF-7: readiness now also honours declared value formats, so this needs the
        // captured types (which supply the INFERRED format for items that declare none).
        // Fleet-merged, this device first (registry capturedDefaults): an item assigned
        // here by hand (DEV-1) is not in THIS device's capture, and reading only that
        // capture inferred `string` for it — so a valid boolean read as undecided here
        // while the data tab, which uses the merged map, showed it decided.
        var captured = App.registry.capturedDefaults(project, dsId, deviceId);
        // Evaluate the EFFECTIVE decision (default→group→device, spec §19.2/OVR-3) so a
        // device/group override can satisfy completeness even when the default is undecided.
        var undecided = (project.items[dsId] || []).filter(function (it) {
          if (!keySet[it.key]) return false;
          var eff = App.overrides ? App.overrides.effectiveItem(project, dsId, it, deviceId) : it;
          return !itemComplete(adapter, eff, project, captured);
        }).length;
        if (undecided > 0) reasons.push({ datasetId: dsId, label: adapter.label, undecided: undecided });
        total += undecided;
      });
      return { ready: total === 0, totalUndecided: total, reasons: reasons };
    }

    /** @returns {boolean} true when every applicable item is complete (§6.5). */
    function deviceReady(project, deviceId) { return deviceReadiness(project, deviceId).ready; }

    var mod = {
      itemComplete: itemComplete, formatIssues: formatIssues,
      deviceReady: deviceReady, deviceReadiness: deviceReadiness,
      // Config flag (spec §6.5 / §18.3 CTL-8): when true, completeness also requires >=1 control ref.
      // A single switch so the team can tighten traceability without code surgery.
      REQUIRE_CONTROL_REF: false
    };
    App.completeness = mod;
  })(App);
