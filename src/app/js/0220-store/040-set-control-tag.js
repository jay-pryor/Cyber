    /**
     * TAG-2: add or remove one tag across many controls in a single transaction — the
     * bulk path behind "tag everything currently shown".
     * @param {string[]} controlIds @param {string} tag @param {boolean} on
     * @returns {{ok:boolean, issues:Issue[], changed:number}}
     */
    function setControlTag(controlIds, tag, on) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }], changed: 0 };
      var t = String(tag || '').trim();
      if (!t) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Tag name is required.', location: 'tag' }], changed: 0 };
      var want = {}; (controlIds || []).forEach(function (id) { want[id] = true; });
      var changed = 0;
      commit(function (p) {
        if (on && !Array.isArray(p.controlTags)) p.controlTags = [];
        if (on && p.controlTags.indexOf(t) === -1) p.controlTags.push(t);
        (p.controls || []).forEach(function (c) {
          if (!want[c.id]) return;
          var tags = (c.tags || []).slice(), has = tags.indexOf(t) !== -1;
          if (on && !has) { tags.push(t); changed++; }
          else if (!on && has) { tags = tags.filter(function (x) { return x !== t; }); changed++; }
          else return;
          tags = normTags(tags);
          if (tags.length) c.tags = tags; else delete c.tags;
        });
      });
      return { ok: true, issues: [], changed: changed };
    }

    /**
     * TAG-3: assign or un-assign ONE device across many controls in a single
     * transaction — the column-header toggle in the Control Manager.
     * @param {string[]} controlIds @param {string} baseId @param {boolean} on
     * @returns {{ok:boolean, issues:Issue[], changed:number}}
     */
    function setControlsDevice(controlIds, baseId, on) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }], changed: 0 };
      var want = {}; (controlIds || []).forEach(function (id) { want[id] = true; });
      var changed = 0;
      commit(function (p) {
        (p.controls || []).forEach(function (c) {
          if (!want[c.id]) return;
          var ids = (c.assignedDeviceIds || []).slice(), has = ids.indexOf(baseId) !== -1;
          if (on && !has) ids.push(baseId);
          else if (!on && has) ids = ids.filter(function (b) { return b !== baseId; });
          else return;
          changed++;
          c.assignedDeviceIds = ids.sort();
          // review-12 #1: keep deviceStates in step — a newly-assigned device starts
          // 'unsatisfied'; an un-assigned device's state is dropped.
          c.deviceStates = c.deviceStates || {};
          if (on) { if (!c.deviceStates[baseId]) c.deviceStates[baseId] = 'unsatisfied'; }
          else delete c.deviceStates[baseId];
        });
      });
      return { ok: true, issues: [], changed: changed };
    }

    // ---- Control TYPES (review-3 #5a): seeded list + user-added + types in use ----
    var DEFAULT_CONTROL_TYPES = ['ISM', 'AHG', 'Custom'];
    /** Union of seeded types, project.controlTypes, and types used by controls. */
    function knownControlTypes() {
      var seen = {}, out = [];
      DEFAULT_CONTROL_TYPES.forEach(function (t) { if (!seen[t]) { seen[t] = true; out.push(t); } });
      if (_project) {
        (_project.controlTypes || []).forEach(function (t) { if (t && !seen[t]) { seen[t] = true; out.push(t); } });
        (_project.controls || []).forEach(function (c) { if (c.type && !seen[c.type]) { seen[c.type] = true; out.push(c.type); } });
      }
      return out;
    }
    /** Add a control type to the project's type list (no-op if already known). */
    function addControlType(name) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var t = (name || '').trim();
      if (!t) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Type name is required.', location: 'type' }] };
      if (knownControlTypes().indexOf(t) !== -1) return { ok: true, issues: [{ category: 'state', severity: 'info', message: 'Type "' + t + '" already exists.' }] };
      commit(function (p) { if (!Array.isArray(p.controlTypes)) p.controlTypes = []; p.controlTypes.push(t); });
      return { ok: true, issues: [] };
    }
    /**
     * Import a list of controls in one transaction (review-3 #5b). Unknown types are
     * auto-registered. @param {{title,type,description}[]} list
     * @returns {{ok:boolean, issues:Issue[], count:number}}
     */
    function importControls(list) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }], count: 0 };
      var added = 0, newTypes = {};
      commit(function (p) {
        if (!Array.isArray(p.controls)) p.controls = [];
        if (!Array.isArray(p.controlTypes)) p.controlTypes = [];
        var ids = {}; p.controls.forEach(function (c) { ids[c.id] = true; });
        var known = {}; DEFAULT_CONTROL_TYPES.concat(p.controlTypes).forEach(function (t) { known[t] = true; });
        p.controls.forEach(function (c) { known[c.type] = true; });
        list.forEach(function (row) {
          var title = (row.title || '').trim(); if (!title) return;
          var type = (row.type || 'Custom').trim() || 'Custom';
          var base = slugify(title) || 'control', id = base, n = 2;
          while (ids[id]) { id = base + '-' + n; n++; } ids[id] = true;
          if (!known[type]) { known[type] = true; p.controlTypes.push(type); newTypes[type] = true; }
          p.controls.push({ id: id, title: title, type: type, description: (row.description || ''), assignedDeviceIds: [], deviceStates: {} });
          added++;
        });
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Imported ' + added + ' control(s)' + (Object.keys(newTypes).length ? '; new types: ' + Object.keys(newTypes).join(', ') : '') + '.' }], count: added };
    }

    // ---- v1.2 per-config & group overrides (spec §19.3) -----------------------
    function errNoProject() { return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] }; }
    function err(msg, loc) { return { ok: false, issues: [{ category: msg && /applicable/.test(msg) ? 'validation' : 'state', severity: 'error', message: msg, location: loc }] }; }
    var stableStr = function (v) { return App.util.stable.stableStringify(v); };

    function adapterFor(dsId) { return App.registry.getDataset(_project.platformProfileId, dsId); }
    /** The DeviceConfig for deviceId, but only if it is the latest version of its baseId. */
    function latestConfigById(deviceId) {
      var dc = _project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return null;
      return getLatestConfigs(_project).some(function (c) { return c.id === deviceId; }) ? dc : null;
    }
    /** Keys applicable to a device for a dataset (snapshot keys, or the whole register
     *  for a virtual dataset — CUS-1). */
    function snapshotKeySet(dc, dsId) {
      return App.registry.applicableKeySet(_project, dc, dsId);
    }
    /** Union of applicable keys across a group's member latest configs for a dataset. */
    function groupApplicableKeySet(g, dsId) {
      var set = {}, latest = getLatestConfigs(_project);
      (g.deviceBaseIds || []).forEach(function (b) {
        var c = latest.filter(function (x) { return x.baseId === b; })[0];
        if (c) App.registry.applicableKeys(_project, c, dsId).forEach(function (k) { set[k] = true; });
      });
      return set;
    }
    function itemDefault(dsId, key) {
      var it = (_project.items[dsId] || []).filter(function (x) { return x.key === key; })[0];
      return it && it.decision != null ? it.decision : null;
    }
    /** The value a device would inherit WITHOUT its own override (group-or-default). */
    function groupOrDefaultFor(dsId, key, deviceId) {
      var g = App.overrides.groupForDevice(_project, deviceId);
      if (g && g.overrides && g.overrides[dsId] && Object.prototype.hasOwnProperty.call(g.overrides[dsId], key)) return g.overrides[dsId][key];
      return itemDefault(dsId, key);
    }
    function validateOverrideDecision(adapter, key, decision) {
      return (adapter.validateDecision({ key: key, decision: decision, controlRefs: [] }) || []).filter(function (i) { return i.severity === 'error'; });
    }

    /** Set a device override (value-only, OVR-2/OVR-8). No-op vs inherited clears it. */
    function setDeviceOverride(deviceId, datasetId, key, decision) {
      if (!_project) return errNoProject();
      var dc = latestConfigById(deviceId);
      if (!dc) return err('Overrides can only be set on the latest version of a device.');
      var adapter = adapterFor(datasetId);
      if (!adapter) return err('Unknown dataset "' + datasetId + '".');
      if (!snapshotKeySet(dc, datasetId)[key]) return err('Key "' + key + '" is not applicable to this device.', key);
      var verr = validateOverrideDecision(adapter, key, decision);
      if (verr.length) return { ok: false, issues: verr };
      if (stableStr(decision) === stableStr(groupOrDefaultFor(datasetId, key, deviceId))) return clearDeviceOverride(deviceId, datasetId, key);
      commit(function (p) {
        var c = p.deviceConfigs.filter(function (x) { return x.id === deviceId; })[0];
        if (!c.overrides) c.overrides = {};
        if (!c.overrides[datasetId]) c.overrides[datasetId] = {};
        c.overrides[datasetId][key] = decision;
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Set device override for "' + key + '".' }] };
    }
    function clearDeviceOverride(deviceId, datasetId, key) {
      if (!_project) return errNoProject();
      var dc = latestConfigById(deviceId);
      if (!dc) return err('Overrides can only be cleared on the latest version of a device.');
      if (!(dc.overrides && dc.overrides[datasetId] && Object.prototype.hasOwnProperty.call(dc.overrides[datasetId], key))) return { ok: true, issues: [] };
      commit(function (p) {
        var c = p.deviceConfigs.filter(function (x) { return x.id === deviceId; })[0];
        delete c.overrides[datasetId][key];
        if (!Object.keys(c.overrides[datasetId]).length) delete c.overrides[datasetId];
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Reverted "' + key + '" to inherited.' }] };
    }
    /** Set a group override (value-only). No-op vs the DEFAULT value clears it. */
    function setGroupOverride(groupId, datasetId, key, decision) {
      if (!_project) return errNoProject();
      var g = (_project.groups || []).filter(function (x) { return x.id === groupId; })[0];
      if (!g) return err('Unknown group "' + groupId + '".');
      var adapter = adapterFor(datasetId);
      if (!adapter) return err('Unknown dataset "' + datasetId + '".');
      if (!groupApplicableKeySet(g, datasetId)[key]) return err('Key "' + key + '" is not applicable to any device in this group.', key);
      var verr = validateOverrideDecision(adapter, key, decision);
      if (verr.length) return { ok: false, issues: verr };
      if (stableStr(decision) === stableStr(itemDefault(datasetId, key))) return clearGroupOverride(groupId, datasetId, key);
      commit(function (p) {
        var gg = p.groups.filter(function (x) { return x.id === groupId; })[0];
        if (!gg.overrides) gg.overrides = {};
        if (!gg.overrides[datasetId]) gg.overrides[datasetId] = {};
        gg.overrides[datasetId][key] = decision;
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Set group override for "' + key + '".' }] };
    }
    function clearGroupOverride(groupId, datasetId, key) {
      if (!_project) return errNoProject();
      var g = (_project.groups || []).filter(function (x) { return x.id === groupId; })[0];
      if (!g) return err('Unknown group "' + groupId + '".');
      if (!(g.overrides && g.overrides[datasetId] && Object.prototype.hasOwnProperty.call(g.overrides[datasetId], key))) return { ok: true, issues: [] };
      commit(function (p) {
        var gg = p.groups.filter(function (x) { return x.id === groupId; })[0];
        delete gg.overrides[datasetId][key];
        if (!Object.keys(gg.overrides[datasetId]).length) delete gg.overrides[datasetId];
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Cleared group override for "' + key + '".' }] };
    }
    function uniqueGroupId(name) {
      var base = slugify(name) || 'group', id = base, n = 2, used = {};
      (_project.groups || []).forEach(function (g) { used[g.id] = true; });
      while (used[id]) { id = base + '-' + n; n++; }
      return id;
    }
    /** Create a device group; member baseIds are MOVED out of any prior group (single-group rule). */
    function addGroup(input) {
      if (!_project) return errNoProject();
      var name = ((input && input.name) || '').trim();
      if (!name) return err('Group name is required.', 'name');
      var baseIds = ((input && input.deviceBaseIds) || []).slice();
      var id = uniqueGroupId(name);
      commit(function (p) {
        if (!Array.isArray(p.groups)) p.groups = [];
        p.groups.forEach(function (g) { g.deviceBaseIds = (g.deviceBaseIds || []).filter(function (b) { return baseIds.indexOf(b) === -1; }); });
        p.groups.push({ id: id, name: name, deviceBaseIds: baseIds, overrides: {} });
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Added group "' + name + '".' }], id: id };
    }
    function updateGroup(id, patch) {
      if (!_project) return errNoProject();
      if (!(_project.groups || []).some(function (g) { return g.id === id; })) return err('Unknown group "' + id + '".');
      patch = patch || {};
      commit(function (p) {
        var g = p.groups.filter(function (x) { return x.id === id; })[0]; if (!g) return;
        if ('name' in patch && String(patch.name).trim()) g.name = String(patch.name).trim();
        if ('deviceBaseIds' in patch) {
          var ids = (patch.deviceBaseIds || []).slice();
          p.groups.forEach(function (o) { if (o.id !== id) o.deviceBaseIds = (o.deviceBaseIds || []).filter(function (b) { return ids.indexOf(b) === -1; }); });
          g.deviceBaseIds = ids;
        }
      });
      return { ok: true, issues: [] };
    }
    function removeGroup(id) {
      if (!_project) return errNoProject();
      if (!(_project.groups || []).some(function (g) { return g.id === id; })) return err('Unknown group "' + id + '".');
      commit(function (p) { p.groups = (p.groups || []).filter(function (g) { return g.id !== id; }); });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Removed group; members fall back to default.' }] };
    }

    // ---- NOTE-1: per-device knowledge notes -----------------------------------
    // Free-form rich text about a device — the things that are true of the platform but
    // are not a decision on any one register key: quirks found during hardening, why a
    // model behaves differently, what to check next time. Keyed by device BASE id so a
    // re-onboarded device (a new version of the same device) keeps what was written
    // about it, exactly like a control's per-device state and justification.
    //
    // The value is HTML, and the store deliberately does NOT sanitise it: sanitising is
    // the job of whatever puts it back on the page (App.ui.views.notes), which has to do
    // it anyway for notes arriving from a hand-edited project file. Doing it here as
    // well would just mean two rules that can disagree.

    /**
     * @param {string} baseId device baseId @param {string} html sanitised rich text
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function setDeviceNotes(baseId, html) {
      if (!_project) return errNoProject();
      if (!baseId) return err('A device is required.');
      var t = String(html == null ? '' : html);
      commit(function (p) {
        if (!p.deviceNotes) p.deviceNotes = {};
        // Blank clears — "nothing written" has one canonical form (see serializeProject).
        if (t.trim()) p.deviceNotes[baseId] = t; else delete p.deviceNotes[baseId];
        if (!Object.keys(p.deviceNotes).length) delete p.deviceNotes;
      });
      return { ok: true, issues: [] };
    }
    /** @param {Project} project @param {string} baseId @returns {string} '' when none. */
    function deviceNotes(project, baseId) {
      var p = project || _project;
      return (p && p.deviceNotes && p.deviceNotes[baseId]) || '';
    }

    // ---- PRO-2: the Procedure report's step order + per-step notes --------------
    // The order the work is done in is a decision like any other, so it lives in the
    // project rather than in session state: configure it once and it is there next time
    // the report is generated, on any machine the project file reaches.

    /** @param {string[]} order step ids, in the order they are performed. */
    function setProcedureOrder(order) {
      if (!_project) return errNoProject();
      var ids = (order || []).map(String);
      commit(function (p) {
        p.procedure = p.procedure || {};
        p.procedure.order = ids;
        if (!ids.length) delete p.procedure.order;
        if (!Object.keys(p.procedure).length) delete p.procedure;
      });
      return { ok: true, issues: [] };
    }
    /**
     * RPT-3: the Reporting report's SECTION order, saved with the project for the same
     * reason the procedure's step order is (see setProcedureOrder above).
     * @param {string[]} order  section ids, in the order they should appear
     */
    /* RPT-3: the document's own section order, written by the document module. CH
     * keeps the name because the Generate tab and a dozen suites call it, but there is
     * one implementation of the write, and it is the module's. */
    function setReportOrder(order) {
      if (!_project) return errNoProject();
      return App.docStore.setReportOrder(order);
    }
    /** @param {string} stepId @param {string} text prose for a whole-register step. */
    function setProcedureNote(stepId, text) {
      if (!_project) return errNoProject();
      if (!stepId) return err('A step is required.');
      var t = String(text == null ? '' : text);
      commit(function (p) {
        p.procedure = p.procedure || {};
        p.procedure.notes = p.procedure.notes || {};
        if (t.trim()) p.procedure.notes[stepId] = t; else delete p.procedure.notes[stepId];
        if (!Object.keys(p.procedure.notes).length) delete p.procedure.notes;
        if (!Object.keys(p.procedure).length) delete p.procedure;
      });
      return { ok: true, issues: [] };
    }
    /** @param {Project} project @param {string} stepId @returns {string} '' when none. */
    function procedureNote(project, stepId) {
      var p = project || _project;
      return (p && p.procedure && p.procedure.notes && p.procedure.notes[stepId]) || '';
    }

    App.store = {
      empty: empty, init: init, getProject: getProject,
      onChange: onChange, isDirty: isDirty, markSaved: markSaved, markDirty: markDirty,
      recomputeStatus: recomputeStatus,
      onboardDevice: onboardDevice, reonboardDevice: reonboardDevice,
      setDecision: setDecision, setItemFields: setItemFields, applyDeviceAssignment: applyDeviceAssignment,
      // DEV-1: assign register items to a device by hand (Assign to Device mode).
      setItemDevice: setItemDevice, setItemsDevice: setItemsDevice,
      // CUS-2: hand-authored register items (Custom Security Actions).
      addItem: addItem, renameItem: renameItem,
      // review-12 #2: explicit item deletion + the one-step undo primitives.
      removeItems: removeItems, datasetSnapshot: datasetSnapshot, restoreDatasetSnapshot: restoreDatasetSnapshot,
      setHeld: setHeld,
      addControl: addControl, updateControl: updateControl, removeControl: removeControl,
      // TAG-1/2/3: control tags + the two Control Manager bulk paths.
      knownControlTags: knownControlTags, addControlTag: addControlTag,
      removeControlTag: removeControlTag, setControlTag: setControlTag,
      setControlsDevice: setControlsDevice,
      // VF-5/VF-6: the reusable value-format catalogue + bulk item assignment.
      addValueFormat: addValueFormat, updateValueFormat: updateValueFormat,
      removeValueFormat: removeValueFormat, setItemFormats: setItemFormats,
      // NOTE-1: per-device knowledge notes. PRO-2: the Procedure report's step order.
      setDeviceNotes: setDeviceNotes, deviceNotes: deviceNotes,
      setProcedureOrder: setProcedureOrder, setProcedureNote: setProcedureNote, procedureNote: procedureNote,
      setReportOrder: setReportOrder,
      setControlDeviceState: setControlDeviceState, controlDeviceState: controlDeviceState,
      // JUS-1: per-(control, device) justification for the satisfied decision.
      setControlDeviceJustification: setControlDeviceJustification,
      controlDeviceJustification: controlDeviceJustification,
      addControlType: addControlType, knownControlTypes: knownControlTypes, importControls: importControls,
      setDeviceOverride: setDeviceOverride, clearDeviceOverride: clearDeviceOverride,
      setGroupOverride: setGroupOverride, clearGroupOverride: clearGroupOverride,
      addGroup: addGroup, updateGroup: updateGroup, removeGroup: removeGroup,
      applicableItems: applicableItems, undecidedCount: undecidedCount,
      slugify: slugify, getLatestConfigs: getLatestConfigs,
      // exposed for later-phase mutation modules within this file:
      _commit: commit
    };
  })(App);
