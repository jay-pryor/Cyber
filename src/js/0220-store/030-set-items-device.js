    // ---- DEV-1: manual device assignment ---------------------------------------
    /**
     * Assign (or unassign) register items to ONE device by hand.
     *
     * The capture is evidence and is never edited. What this writes is a `scope`
     * adjustment on the DeviceConfig (registry DEV-1), and it is written in CANONICAL
     * form: an adjustment that merely restates what the capture already says is not
     * recorded at all, so assigning an item the device already has, or unassigning one
     * it never had, changes nothing and leaves nothing behind. That is what keeps a
     * tick-then-untick byte-identical to never having ticked (DOD-7).
     *
     * @param {string} datasetId
     * @param {string[]} keys      register keys (unknown ones are skipped with a warning)
     * @param {string} deviceId    MUST be a latest config
     * @param {boolean} on         true ⇒ applies to the device; false ⇒ does not
     * @returns {{ok:boolean, issues:Issue[], changed:number}}
     */
    function setItemsDevice(datasetId, keys, deviceId, on) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }], changed: 0 };
      var dc = latestConfigById(deviceId);
      if (!dc) return { ok: false, changed: 0, issues: [{ category: 'state', severity: 'error', message: 'Items can only be assigned to the latest version of a device.' }] };
      var adapter = adapterFor(datasetId);
      if (!adapter) return { ok: false, changed: 0, issues: [{ category: 'state', severity: 'error', message: 'Unknown dataset "' + datasetId + '".' }] };
      // A captured dataset the device never carried has no artifact to write into — the
      // generators build from its snapshot. Assigning into that void would produce a tick
      // that changes nothing downstream, so it is refused with the reason rather than
      // accepted and quietly ignored.
      if (!App.registry.deviceHasDataset(_project, dc, datasetId)) {
        return { ok: false, changed: 0, issues: [{ category: 'validation', severity: 'error',
          message: dc.name + ' has no ' + adapter.label + ' capture, so nothing in this register can be assigned to it.',
          location: datasetId, fix: 'Onboard a ' + adapter.label + ' capture for ' + dc.name + ' first.' }] };
      }
      var known = {}; (_project.items[datasetId] || []).forEach(function (it) { known[it.key] = true; });
      var want = [], unknown = [];
      (keys || []).forEach(function (k) { if (known[k]) want.push(k); else unknown.push(k); });
      var issues = unknown.length
        ? [{ category: 'validation', severity: 'warning', message: 'Skipped ' + unknown.length + ' key(s) that are not in the register: ' + unknown.slice(0, 10).join(', ') + '.', location: datasetId }]
        : [];
      if (!want.length) {
        return { ok: false, changed: 0, issues: issues.concat([{ category: 'validation', severity: 'error', message: 'No register items to assign.', location: datasetId }]) };
      }

      var base = {}; App.registry.baseApplicableKeys(_project, dc, datasetId).forEach(function (k) { base[k] = true; });
      var sc = App.registry.deviceScope(dc, datasetId);
      var addSet = {}, remSet = {};
      sc.add.forEach(function (k) { addSet[k] = true; });
      sc.remove.forEach(function (k) { remSet[k] = true; });
      var changed = 0;
      want.forEach(function (k) {
        var now = base[k] ? !remSet[k] : !!addSet[k];
        if (now === !!on) return;                 // already in the wanted state
        changed++;
        // Away from the capture ⇒ record it; back to the capture ⇒ erase the record.
        if (base[k]) { if (on) delete remSet[k]; else remSet[k] = true; }
        else if (on) addSet[k] = true;
        else delete addSet[k];
      });
      if (!changed) return { ok: true, changed: 0, issues: issues };
      var add = Object.keys(addSet).sort(), rem = Object.keys(remSet).sort();
      commit(function (p) {
        var c = p.deviceConfigs.filter(function (x) { return x.id === deviceId; })[0];
        if (!c) return;
        if (add.length || rem.length) {
          c.scope = c.scope || {};
          var next = {};
          if (add.length) next.add = add;
          if (rem.length) next.remove = rem;
          c.scope[datasetId] = next;
        } else if (c.scope) {
          delete c.scope[datasetId];
          if (!Object.keys(c.scope).length) delete c.scope;
        }
      });
      return { ok: true, changed: changed, issues: issues.concat([{ category: 'state', severity: 'success',
        message: (on ? 'Assigned ' : 'Unassigned ') + changed + ' ' + adapter.label + ' item(s) ' + (on ? 'to ' : 'from ') + dc.name + '.' }]) };
    }
    /** DEV-1: the one-item form — what a single tick in the table calls. */
    function setItemDevice(datasetId, key, deviceId, on) {
      return setItemsDevice(datasetId, [key], deviceId, on);
    }

    // ---- Control catalogue CRUD (spec §18.3 CTL-6) ----
    function findControl(p, id) { return (p.controls || []).filter(function (c) { return c.id === id; })[0]; }
    function uniqueControlId(p, title) {
      var base = slugify(title) || 'control', ids = {}; (p.controls || []).forEach(function (c) { ids[c.id] = true; });
      var id = base, n = 2; while (ids[id]) { id = base + '-' + n; n++; } return id;
    }
    /** @returns {{ok:boolean, issues:Issue[], id?:string}} */
    function addControl(input) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var title = ((input && input.title) || '').trim();
      if (!title) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Control title is required.', location: 'title' }] };
      var id = uniqueControlId(_project, title);
      var ctl = { id: id, title: title, type: (input.type || 'Custom'), description: (input.description || ''), assignedDeviceIds: (input.assignedDeviceIds || []).slice() };
      if (Array.isArray(input.tags) && input.tags.length) ctl.tags = normTags(input.tags);   // TAG-1
      // review-12 #1: a control added to a device starts UNSATISFIED on that device.
      ctl.deviceStates = {}; ctl.assignedDeviceIds.forEach(function (b) { ctl.deviceStates[b] = 'unsatisfied'; });
      commit(function (p) { if (!Array.isArray(p.controls)) p.controls = []; p.controls.push(ctl); });
      return { ok: true, issues: [], id: id };
    }
    /** @returns {{ok:boolean, issues:Issue[]}} */
    function updateControl(id, patch) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      if (!findControl(_project, id)) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown control "' + id + '".' }] };
      commit(function (p) {
        var c = findControl(p, id); if (!c) return;
        if ('title' in patch) c.title = patch.title;
        if ('type' in patch) c.type = patch.type;
        if ('description' in patch) c.description = patch.description;
        // TAG-1: an empty list is dropped, so "no tags" has one canonical form.
        if ('tags' in patch) { var t = normTags(patch.tags); if (t.length) c.tags = t; else delete c.tags; }
        if ('assignedDeviceIds' in patch) {
          c.assignedDeviceIds = (patch.assignedDeviceIds || []).slice();
          // review-12 #1: keep deviceStates in step with assignment — a newly-assigned
          // device starts 'unsatisfied'; an un-assigned device's state is dropped.
          c.deviceStates = c.deviceStates || {};
          var keep = {};
          c.assignedDeviceIds.forEach(function (b) { keep[b] = true; if (!c.deviceStates[b]) c.deviceStates[b] = 'unsatisfied'; });
          Object.keys(c.deviceStates).forEach(function (b) { if (!keep[b]) delete c.deviceStates[b]; });
        }
      });
      return { ok: true, issues: [] };
    }

    /**
     * Set a control's per-device satisfaction state (review-12 #1). The state is keyed
     * by device baseId, so it survives re-onboarding (a new version of the same device).
     * @param {string} controlId
     * @param {string} baseId  device baseId
     * @param {'unsatisfied'|'satisfied'|'exception'} state  EXC-1
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function setControlDeviceState(controlId, baseId, state) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var c = findControl(_project, controlId);
      if (!c) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown control "' + controlId + '".' }] };
      if (App.projectIo.CONTROL_STATES.indexOf(state) === -1) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Control state must be one of: ' + App.projectIo.CONTROL_STATES.join(', ') + '.', location: controlId }] };
      if ((c.assignedDeviceIds || []).indexOf(baseId) === -1) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Control "' + controlId + '" is not assigned to device "' + baseId + '".', location: controlId }] };
      commit(function (p) {
        var ctl = findControl(p, controlId);
        ctl.deviceStates = ctl.deviceStates || {};
        ctl.deviceStates[baseId] = state;
      });
      return { ok: true, issues: [] };
    }

    /**
     * JUS-1: the free-text justification for a control's state ON ONE DEVICE — "why do we
     * say this control is met here?". Stored per (control, device baseId) beside the
     * state, so it survives re-onboarding like the state does, and it is the evidence the
     * report carries. Setting a blank string clears it, so "no justification" has one
     * canonical form.
     * @param {string} controlId @param {string} baseId @param {string} text
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function setControlDeviceJustification(controlId, baseId, text) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var c = findControl(_project, controlId);
      if (!c) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown control "' + controlId + '".' }] };
      if ((c.assignedDeviceIds || []).indexOf(baseId) === -1) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Control "' + controlId + '" is not assigned to device "' + baseId + '".', location: controlId }] };
      }
      var t = String(text == null ? '' : text);
      commit(function (p) {
        var ctl = findControl(p, controlId);
        ctl.deviceJustifications = ctl.deviceJustifications || {};
        if (t.trim()) ctl.deviceJustifications[baseId] = t;
        else delete ctl.deviceJustifications[baseId];
        if (!Object.keys(ctl.deviceJustifications).length) delete ctl.deviceJustifications;
      });
      return { ok: true, issues: [] };
    }

    /** @returns {'unsatisfied'|'satisfied'|'exception'} a control's state on a device.
     *  Anything unrecognised reads as 'unsatisfied' — the safe direction to fail in for
     *  a coverage claim (EXC-1). */
    function controlDeviceState(control, baseId) {
      var s = control && control.deviceStates && control.deviceStates[baseId];
      return App.projectIo.CONTROL_STATES.indexOf(s) === -1 ? 'unsatisfied' : s;
    }
    /** @returns {string} a control's justification on a device ('' when none). */
    function controlDeviceJustification(control, baseId) {
      return (control && control.deviceJustifications && control.deviceJustifications[baseId]) || '';
    }
    /** Remove a control and strip its id from every item's controlRefs (CTL-6). */
    function removeControl(id) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      if (!findControl(_project, id)) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown control "' + id + '".' }] };
      var affected = 0;
      commit(function (p) {
        p.controls = (p.controls || []).filter(function (c) { return c.id !== id; });
        Object.keys(p.items || {}).forEach(function (dsId) {
          (p.items[dsId] || []).forEach(function (it) {
            if (Array.isArray(it.controlRefs) && it.controlRefs.indexOf(id) >= 0) { it.controlRefs = it.controlRefs.filter(function (r) { return r !== id; }); affected++; }
          });
        });
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Removed control; cleared from ' + affected + ' item(s).' }] };
    }

    // ---- VALUE FORMATS (VF-5): the named, reusable custom-format catalogue --------
    // Mirrors the control CRUD above: add/update/remove, transactional, and remove
    // strips the id from every item that referenced it so nothing is left dangling.

    /** @returns {string} a unique slug id derived from a format name. */
    function uniqueFormatId(project, name) {
      var base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'format';
      var used = {};
      (App.projectIo.BUILTIN_FORMAT_IDS || []).forEach(function (b) { used[b] = true; });
      (project.valueFormats || []).forEach(function (f) { used[f.id] = true; });
      var id = base, n = 2;
      while (used[id]) { id = base + '-' + n; n++; }
      return id;
    }

    /**
     * Create a custom value format (VF-5).
     * @param {{name:string, kind?:string, description?:string, options?:Array, min?:number, max?:number, pattern?:string}} input
     * @returns {{ok:boolean, issues:Issue[], id?:string}}
     */
    function addValueFormat(input) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var name = ((input && input.name) || '').trim();
      if (!name) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Format name is required.', location: 'name' }] };
      var kind = (input && input.kind) || 'options';
      if ((App.projectIo.CUSTOM_FORMAT_KINDS || []).indexOf(kind) === -1) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Unknown format kind "' + kind + '".', location: 'kind' }] };
      }
      var id = uniqueFormatId(_project, name);
      var fmt = { id: id, name: name, kind: kind, description: (input.description || ''), options: normOptions(input.options) };
      ['min', 'max'].forEach(function (k) { if (typeof input[k] === 'number') fmt[k] = input[k]; });
      if (input.pattern) fmt.pattern = String(input.pattern);
      commit(function (p) { if (!Array.isArray(p.valueFormats)) p.valueFormats = []; p.valueFormats.push(fmt); });
      return { ok: true, issues: [], id: id };
    }

    /** Normalise an options list: drop blanks, de-duplicate by value, keep ORDER. */
    function normOptions(list) {
      var out = [], seen = {};
      (list || []).forEach(function (o) {
        if (!o) return;
        var v = String(o.value == null ? '' : o.value).trim();
        if (!v || seen[v]) return;
        seen[v] = true;
        out.push({ value: v, description: String(o.description == null ? '' : o.description) });
      });
      return out;
    }

    /** @returns {{ok:boolean, issues:Issue[]}} */
    function updateValueFormat(id, patch) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      if (!findValueFormat(_project, id)) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown value format "' + id + '".' }] };
      if ('name' in patch && !String(patch.name || '').trim()) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Format name is required.', location: 'name' }] };
      }
      if ('kind' in patch && (App.projectIo.CUSTOM_FORMAT_KINDS || []).indexOf(patch.kind) === -1) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Unknown format kind "' + patch.kind + '".', location: 'kind' }] };
      }
      commit(function (p) {
        var f = findValueFormat(p, id); if (!f) return;
        if ('name' in patch) f.name = String(patch.name).trim();
        if ('kind' in patch) f.kind = patch.kind;
        if ('description' in patch) f.description = String(patch.description || '');
        if ('options' in patch) f.options = normOptions(patch.options);
        ['min', 'max'].forEach(function (k) {
          if (k in patch) { if (typeof patch[k] === 'number' && isFinite(patch[k])) f[k] = patch[k]; else delete f[k]; }
        });
        if ('pattern' in patch) { if (patch.pattern) f.pattern = String(patch.pattern); else delete f.pattern; }
      });
      return { ok: true, issues: [] };
    }

    /**
     * Remove a custom format and clear it from every item that referenced it (VF-5).
     * Those items fall back to the format inferred from their captured type; their
     * decisions are untouched.
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function removeValueFormat(id) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      if (!findValueFormat(_project, id)) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown value format "' + id + '".' }] };
      var affected = 0;
      commit(function (p) {
        p.valueFormats = (p.valueFormats || []).filter(function (f) { return f.id !== id; });
        Object.keys(p.items || {}).forEach(function (dsId) {
          (p.items[dsId] || []).forEach(function (it) { if (it && it.format === id) { delete it.format; affected++; } });
        });
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Removed value format; cleared from ' + affected + ' item(s).' }] };
    }

    function findValueFormat(p, id) { return (p.valueFormats || []).filter(function (f) { return f.id === id; })[0] || null; }

    /**
     * Apply one format to many items in a single transaction (VF-6) — the bulk path
     * behind "apply this format to every item that currently shares this shape".
     * @param {string} datasetId @param {string[]} keys @param {string} formatId ('' clears)
     * @returns {{ok:boolean, issues:Issue[], applied:number}}
     */
    function setItemFormats(datasetId, keys, formatId) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }], applied: 0 };
      var items = _project.items[datasetId];
      if (!items) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown dataset "' + datasetId + '".' }], applied: 0 };
      if (formatId && (App.projectIo.BUILTIN_FORMAT_IDS || []).indexOf(formatId) === -1 && !findValueFormat(_project, formatId)) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Unknown value format "' + formatId + '".' }], applied: 0 };
      }
      var want = {}; (keys || []).forEach(function (k) { want[k] = true; });
      var applied = 0;
      commit(function (p) {
        (p.items[datasetId] || []).forEach(function (it) {
          if (!want[it.key]) return;
          if (formatId) it.format = formatId; else delete it.format;
          applied++;
        });
      });
      return { ok: true, issues: [], applied: applied };
    }

    // ---- Control TAGS (TAG-1) -----------------------------------------------------
    // A control's `type` is a single classification; `tags` is a free, multi-valued one —
    // "administrative", "physical", "out-of-scope" — so a control can be filed under
    // several at once. The catalogue mirrors controlTypes: a stored list unioned with
    // whatever is actually in use, so a tag never silently disappears from the picker.

    /** Trim, drop blanks, de-duplicate, sort. @param {string[]} list @returns {string[]} */
    function normTags(list) {
      var seen = {}, out = [];
      (list || []).forEach(function (t) {
        var v = String(t == null ? '' : t).trim();
        if (!v || seen[v]) return;
        seen[v] = true; out.push(v);
      });
      return out.sort();
    }

    /** Every tag offered by the picker: the project's catalogue ∪ the tags in use. */
    function knownControlTags() {
      var seen = {}, out = [];
      if (_project) {
        (_project.controlTags || []).forEach(function (t) { if (t && !seen[t]) { seen[t] = true; out.push(t); } });
        (_project.controls || []).forEach(function (c) {
          (c.tags || []).forEach(function (t) { if (t && !seen[t]) { seen[t] = true; out.push(t); } });
        });
      }
      return out.sort();
    }

    /** Register a tag so it can be picked before any control uses it. */
    function addControlTag(name) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var t = String(name || '').trim();
      if (!t) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Tag name is required.', location: 'tag' }] };
      if (knownControlTags().indexOf(t) !== -1) return { ok: true, issues: [{ category: 'state', severity: 'info', message: 'Tag "' + t + '" already exists.' }] };
      commit(function (p) { if (!Array.isArray(p.controlTags)) p.controlTags = []; p.controlTags.push(t); });
      return { ok: true, issues: [] };
    }

    /** Remove a tag from the catalogue AND from every control carrying it. */
    function removeControlTag(name) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var t = String(name || '').trim(), affected = 0;
      commit(function (p) {
        p.controlTags = (p.controlTags || []).filter(function (x) { return x !== t; });
        if (!p.controlTags.length) delete p.controlTags;
        (p.controls || []).forEach(function (c) {
          if (Array.isArray(c.tags) && c.tags.indexOf(t) !== -1) {
            c.tags = c.tags.filter(function (x) { return x !== t; });
            if (!c.tags.length) delete c.tags;
            affected++;
          }
        });
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Removed tag "' + t + '" from ' + affected + ' control(s).' }] };
    }

