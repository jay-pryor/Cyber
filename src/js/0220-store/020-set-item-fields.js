    /**
     * Set human-authored item fields (spec §7.1). Only provided keys are changed.
     * @param {string} datasetId
     * @param {string} key
     * @param {{description?:string, controlRefs?:string[], rationale?:string, rollback?:string,
     *          relevance?:string, diverges?:boolean, divergenceNarrative?:string,
     *          procedure?:string}} fields
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function setItemFields(datasetId, key, fields) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var items = _project.items[datasetId];
      var item = items && items.filter(function (i) { return i.key === key; })[0];
      if (!item) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown item "' + key + '".', location: datasetId }] };
      // review-12 #3: Security Relevance is a closed vocabulary ('' clears it).
      if ('relevance' in fields && !isRelevance(fields.relevance)) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'Security Relevance must be empty or one of ' + App.projectIo.RELEVANCE_OPTIONS.join('/') + '.', location: datasetId + ' / ' + key }] };
      }
      commit(function (p) {
        var it = p.items[datasetId].filter(function (i) { return i.key === key; })[0];
        if ('description' in fields) it.description = fields.description;
        if ('rationale' in fields) it.rationale = fields.rationale;
        if ('rollback' in fields) it.rollback = fields.rollback;
        // PRO-1: the written procedure for a manual action. Blank clears it, so "no
        // procedure written yet" has one canonical form (as with the narrative below).
        if ('procedure' in fields) {
          if (fields.procedure) it.procedure = String(fields.procedure);
          else delete it.procedure;
        }
        if ('controlRefs' in fields) it.controlRefs = (fields.controlRefs || []).slice();
        if ('relevance' in fields) {
          if (fields.relevance) it.relevance = fields.relevance; else delete it.relevance; // '' ⇒ unset (canonical)
        }
        // VF-4: '' ⇒ unset (fall back to the format inferred from the captured type).
        if ('format' in fields) {
          if (fields.format) it.format = fields.format; else delete it.format;
        }
        // DIV-1: "diverges from guidelines" is a flag, and absent means it does not —
        // so the canonical form carries no `false`, exactly like HELD-1's `held`.
        if ('diverges' in fields) {
          if (fields.diverges) it.diverges = true; else delete it.diverges;
        }
        // DIV-2: the narrative behind the flag. Unticking the flag deliberately does NOT
        // delete it — losing a paragraph of written reasoning to a mis-click is a far
        // worse outcome than carrying a few unused characters, and re-ticking brings it
        // straight back. '' still clears it, so emptying the box is a real erasure.
        if ('divergenceNarrative' in fields) {
          if (fields.divergenceNarrative) it.divergenceNarrative = String(fields.divergenceNarrative);
          else delete it.divergenceNarrative;
        }
      });
      return { ok: true, issues: [] };
    }

    /**
     * CUS-2: create a register item by hand, for a dataset that declares itself
     * `userCreatable` (Custom Security Actions). Every other register entry arrives from
     * a capture, which is why this is gated on the adapter rather than open to any
     * dataset: hand-adding a package the device does not have would put a row in the
     * register that no snapshot backs, and it would silently never generate.
     *
     * The name IS the key — it identifies the row in the tables, the overrides, the
     * manifest and the report, exactly as a package name does. Renaming is therefore a
     * real operation, not a field edit; see renameItem.
     * @param {string} datasetId
     * @param {string} key  the action name (trimmed)
     * @param {{description?:string}} [fields]
     * @returns {{ok:boolean, issues:Issue[], key?:string}}
     */
    function addItem(datasetId, key, fields) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var adapter = App.registry.getDataset(_project.platformProfileId, datasetId);
      if (!adapter) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown dataset "' + datasetId + '".' }] };
      if (!adapter.userCreatable) {
        return { ok: false, issues: [{ category: 'state', severity: 'error', message: adapter.label + ' items come from a capture and cannot be added by hand.', location: datasetId, fix: 'Onboard a device whose capture contains the item.' }] };
      }
      var name = String(key == null ? '' : key).trim();
      if (!name) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'A name is required.', location: datasetId, fix: 'Give the ' + (adapter.newItemNoun || 'item') + ' a short, unique name.' }] };
      if (!Array.isArray(_project.items[datasetId])) _project.items[datasetId] = [];
      if (_project.items[datasetId].some(function (it) { return it.key === name; })) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'There is already a ' + (adapter.newItemNoun || 'item') + ' called "' + name + '".', location: datasetId, fix: 'Pick a different name, or edit the existing row.' }] };
      }
      var f = fields || {};
      commit(function (p) {
        if (!Array.isArray(p.items[datasetId])) p.items[datasetId] = [];
        var it = { key: name, decision: null, controlRefs: [], status: 'undecided' };
        if (f.description) it.description = String(f.description);
        p.items[datasetId].push(it);
      });
      return { ok: true, key: name, issues: [{ category: 'state', severity: 'success', message: 'Added ' + (adapter.newItemNoun || 'item') + ' "' + name + '".' }] };
    }

    /**
     * CUS-2: rename a hand-authored item. Because the name is the key, this has to move
     * everything keyed BY it — the overrides on every device and group — or the rename
     * would quietly orphan them (they would be pruned as "not applicable" on the next
     * load, taking a real per-device decision with them). Snapshots are untouched: a
     * userCreatable dataset is virtual and has none.
     * @param {string} datasetId @param {string} oldKey @param {string} newKey
     * @returns {{ok:boolean, issues:Issue[], key?:string}}
     */
    function renameItem(datasetId, oldKey, newKey) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var adapter = App.registry.getDataset(_project.platformProfileId, datasetId);
      if (!adapter || !adapter.userCreatable) {
        return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'This item\'s name comes from a capture and cannot be edited.', location: datasetId }] };
      }
      var items = _project.items[datasetId] || [];
      if (!items.some(function (it) { return it.key === oldKey; })) {
        return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown item "' + oldKey + '".', location: datasetId }] };
      }
      var name = String(newKey == null ? '' : newKey).trim();
      if (!name) return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'A name is required.', location: datasetId + ' / ' + oldKey }] };
      if (name === oldKey) return { ok: true, key: oldKey, issues: [] };
      if (items.some(function (it) { return it.key === name; })) {
        return { ok: false, issues: [{ category: 'validation', severity: 'error', message: 'There is already a ' + (adapter.newItemNoun || 'item') + ' called "' + name + '".', location: datasetId }] };
      }
      commit(function (p) {
        (p.items[datasetId] || []).forEach(function (it) { if (it.key === oldKey) it.key = name; });
        function move(holder) {
          var bucket = holder && holder.overrides && holder.overrides[datasetId];
          if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, oldKey)) return;
          bucket[name] = bucket[oldKey];
          delete bucket[oldKey];
        }
        (p.deviceConfigs || []).forEach(move);
        (p.groups || []).forEach(move);
        // DEV-1: the by-hand device assignments are keyed by the name too, so they move
        // with it — a rename must not silently un-assign the item from every device.
        (p.deviceConfigs || []).forEach(function (dc) {
          var sc = dc.scope && dc.scope[datasetId];
          if (!sc) return;
          ['add', 'remove'].forEach(function (f) {
            if (Array.isArray(sc[f])) sc[f] = sc[f].map(function (k) { return k === oldKey ? name : k; });
          });
        });
      });
      return { ok: true, key: name, issues: [{ category: 'state', severity: 'success', message: 'Renamed "' + oldKey + '" to "' + name + '".' }] };
    }

    /** @returns {boolean} true if v is '' (unset) or a known Security Relevance option. */
    function isRelevance(v) {
      return v === '' || v === undefined || v === null || App.projectIo.RELEVANCE_OPTIONS.indexOf(v) !== -1;
    }

    /**
     * Delete register items by key (review-12 #2, "Delete Mode"). Items are normally
     * append-only (§8.5); this is the ONE explicit, user-driven exception, so it also
     * prunes any device/group override that referenced a deleted key (nothing may be
     * left pointing at an item that no longer exists). Snapshots are evidence and are
     * left untouched — a later re-onboard of the same capture re-creates the item.
     * @param {string} datasetId
     * @param {string[]} keys
     * @returns {{ok:boolean, issues:Issue[], removed:number}}
     */
    function removeItems(datasetId, keys) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }], removed: 0 };
      if (!_project.items[datasetId]) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown dataset "' + datasetId + '".' }], removed: 0 };
      var kill = {}; (keys || []).forEach(function (k) { kill[k] = true; });
      var present = _project.items[datasetId].filter(function (it) { return kill[it.key]; }).length;
      if (!present) return { ok: false, issues: [{ category: 'state', severity: 'warning', message: 'Nothing to delete.', location: datasetId }], removed: 0 };
      commit(function (p) {
        p.items[datasetId] = p.items[datasetId].filter(function (it) { return !kill[it.key]; });
        function prune(holder) {
          var bucket = holder && holder.overrides && holder.overrides[datasetId];
          if (!bucket) return;
          Object.keys(bucket).forEach(function (k) { if (kill[k]) delete bucket[k]; });
          if (!Object.keys(bucket).length) delete holder.overrides[datasetId];
        }
        (p.deviceConfigs || []).forEach(prune);
        (p.groups || []).forEach(prune);
        // DEV-1: a device assignment naming a deleted item is dangling in exactly the way
        // an override is, and goes the same way.
        (p.deviceConfigs || []).forEach(function (dc) {
          var sc = dc.scope && dc.scope[datasetId];
          if (!sc) return;
          ['add', 'remove'].forEach(function (f) {
            if (!Array.isArray(sc[f])) return;
            var kept = sc[f].filter(function (k) { return !kill[k]; });
            if (kept.length) sc[f] = kept; else delete sc[f];
          });
          if (!sc.add && !sc.remove) delete dc.scope[datasetId];
          if (!Object.keys(dc.scope).length) delete dc.scope;
        });
      });
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Deleted ' + present + ' ' + datasetId + ' item(s).' }], removed: present };
    }

    /**
     * Capture everything a dataset-scoped bulk edit can touch, for one-step undo
     * (review-12 #2): the items array plus every device/group override bucket for it.
     * @param {string} datasetId
     * @returns {?{datasetId:string, items:Array, deviceOverrides:Object, groupOverrides:Object}}
     */
    function datasetSnapshot(datasetId) {
      if (!_project || !_project.items[datasetId]) return null;
      var snap = { datasetId: datasetId, items: clone(_project.items[datasetId]), deviceOverrides: {}, groupOverrides: {},
        // DEV-1: the by-hand device assignments are dataset-scoped state too, so an undo
        // of a device-assignment run has to put them back with everything else.
        deviceScopes: {} };
      (_project.deviceConfigs || []).forEach(function (dc) {
        if (dc.overrides && dc.overrides[datasetId]) snap.deviceOverrides[dc.id] = clone(dc.overrides[datasetId]);
        if (dc.scope && dc.scope[datasetId]) snap.deviceScopes[dc.id] = clone(dc.scope[datasetId]);
      });
      (_project.groups || []).forEach(function (g) {
        if (g.overrides && g.overrides[datasetId]) snap.groupOverrides[g.id] = clone(g.overrides[datasetId]);
      });
      return snap;
    }

    /**
     * Restore a datasetSnapshot verbatim (review-12 #2 Undo).
     * @param {{datasetId:string, items:Array, deviceOverrides:Object, groupOverrides:Object}} snap
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function restoreDatasetSnapshot(snap) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      if (!snap || !snap.datasetId || !Array.isArray(snap.items)) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Nothing to undo.' }] };
      var dsId = snap.datasetId;
      commit(function (p) {
        p.items[dsId] = clone(snap.items);
        function restore(holder, saved) {
          if (saved) { holder.overrides = holder.overrides || {}; holder.overrides[dsId] = clone(saved); }
          else if (holder.overrides) { delete holder.overrides[dsId]; if (!Object.keys(holder.overrides).length) delete holder.overrides; }
        }
        (p.deviceConfigs || []).forEach(function (dc) { restore(dc, snap.deviceOverrides[dc.id]); });
        (p.groups || []).forEach(function (g) { restore(g, snap.groupOverrides[g.id]); });
        // DEV-1: same shape, on `scope` rather than `overrides`. An older snapshot (taken
        // before this existed) carries no map, and then scopes are left alone rather than
        // wiped — an undo must not take away what it never captured.
        if (snap.deviceScopes) (p.deviceConfigs || []).forEach(function (dc) {
          var saved = snap.deviceScopes[dc.id];
          if (saved) { dc.scope = dc.scope || {}; dc.scope[dsId] = clone(saved); }
          else if (dc.scope) { delete dc.scope[dsId]; if (!Object.keys(dc.scope).length) delete dc.scope; }
        });
      });
      return { ok: true, issues: [] };
    }

    /**
     * Bulk-apply a parsed assignment file to a device's decisions (spec §18.2).
     * Validates that the file's keys EXACTLY equal the device's applicable keys for
     * the dataset (refusing with deltas otherwise), validates each decision, then
     * applies all in one transaction. NOTE (§8.4): decisions are unified, so this
     * updates the shared decisions for the device's applicable keys.
     * @param {string} deviceId  MUST be a latest config
     * @param {string} datasetId
     * @param {{assignments:Array,errors:Issue[],warnings:Issue[]}} parsed
     * @returns {{ok:boolean, issues:Issue[]}}
     */
    function applyDeviceAssignment(deviceId, datasetId, parsed) {
      if (!_project) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] };
      var dc = _project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown device "' + deviceId + '".' }] };
      if (!getLatestConfigs(_project).some(function (c) { return c.id === deviceId; })) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Bulk assignment applies to the latest device version only.' }] };
      var adapter = App.registry.getDataset(_project.platformProfileId, datasetId);
      if (!adapter) return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown dataset "' + datasetId + '".' }] };
      if (parsed.errors && parsed.errors.length) return { ok: false, issues: parsed.errors.slice() };

      // Exact key-set equality (ASG-2): no more, no less than the device's applicable keys.
      var applicable = App.registry.applicableKeySet(_project, dc, datasetId);
      var asg = {}; parsed.assignments.forEach(function (a) { asg[a.key] = true; });
      var missing = Object.keys(applicable).filter(function (k) { return !asg[k]; }).sort();
      var extra = parsed.assignments.map(function (a) { return a.key; }).filter(function (k) { return !applicable[k]; }).sort();
      if (missing.length || extra.length) {
        var issues = [{ category: 'validation', severity: 'error', message: 'File keys must exactly match this device\'s applicable ' + adapter.label + ' keys (no more, no less).', location: datasetId }];
        function trunc(a) { return a.slice(0, 25).join(', ') + (a.length > 25 ? ' … (' + a.length + ' total)' : ''); }
        if (missing.length) issues.push({ category: 'validation', severity: 'error', message: missing.length + ' applicable key(s) missing from the file: ' + trunc(missing), location: datasetId });
        if (extra.length) issues.push({ category: 'validation', severity: 'error', message: extra.length + ' key(s) in the file are not applicable to this device: ' + trunc(extra), location: datasetId });
        return { ok: false, issues: issues };
      }

      // Validate each decision (ASG-3).
      var decErrors = [];
      parsed.assignments.forEach(function (a) {
        (adapter.validateDecision({ key: a.key, decision: a.decision, controlRefs: [] }) || []).forEach(function (i) {
          if (i.severity === 'error') decErrors.push({ category: 'validation', severity: 'error', message: i.message, location: datasetId + ' / ' + a.key });
        });
      });
      if (decErrors.length) return { ok: false, issues: decErrors };

      // review-12 #4: the optional Relevance column is a closed vocabulary — refuse the
      // whole file (atomically) rather than importing a value the column cannot hold.
      var relErrors = [];
      parsed.assignments.forEach(function (a) {
        if (a.fields && 'relevance' in a.fields && !isRelevance(a.fields.relevance)) {
          relErrors.push({ category: 'validation', severity: 'error', message: 'Invalid Relevance "' + a.fields.relevance + '" (expected empty, ' + App.projectIo.RELEVANCE_OPTIONS.join(', ') + ').', location: datasetId + ' / ' + a.key });
        }
      });
      if (relErrors.length) return { ok: false, issues: relErrors };

      // Apply atomically (ASG-5).
      var extras = { rationale: 0, relevance: 0 };
      commit(function (p) {
        var byKey = {}; p.items[datasetId].forEach(function (it) { byKey[it.key] = it; });
        parsed.assignments.forEach(function (a) {
          var it = byKey[a.key]; if (!it) return;
          it.decision = a.decision;
          if (a.fields && 'description' in a.fields) it.description = a.fields.description;
          // review-12 #4: optional 4th/5th CSV columns fill the item's Rationale box and
          // its Security Relevance column.
          if (a.fields && 'rationale' in a.fields) { it.rationale = a.fields.rationale; extras.rationale++; }
          if (a.fields && 'relevance' in a.fields) {
            if (a.fields.relevance) it.relevance = a.fields.relevance; else delete it.relevance;
            extras.relevance++;
          }
        });
      });
      var extraNote = '';
      if (extras.rationale) extraNote += ' + ' + extras.rationale + ' rationale(s)';
      if (extras.relevance) extraNote += ' + ' + extras.relevance + ' relevance value(s)';
      return { ok: true, issues: [{ category: 'state', severity: 'success', message: 'Applied ' + parsed.assignments.length + ' ' + adapter.label + ' decision(s)' + extraNote + ' to ' + dc.name + '.' }] };
    }

