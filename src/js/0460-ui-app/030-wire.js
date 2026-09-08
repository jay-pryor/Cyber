    // ---- events ----
    function wire() {
      dom.on(_root, 'click', '[data-tab]', function (e, el) { closeRun(); _state.activeTab = el.getAttribute('data-tab'); render(); });
      dom.on(_root, 'click', 'th[data-col]', function (e, el) {
        // Ignore clicks on the resize handle (review-2 #4) so resizing doesn't sort.
        if (e.target && e.target.matches && e.target.matches('[data-col-resize]')) return;
        if (_colResizing) return;
        var ui = uiFor(_state.activeTab), col = el.getAttribute('data-col');
        // SORT-1: ascending → descending → off, so a rule that has done its job can be
        // taken away rather than only flipped. The transition itself is pure.
        var next = App.ui.model.nextSort(ui, col);
        ui.sortKey = next.sortKey; ui.sortDir = next.sortDir;
        renderTableHost();
      });
      // Manual column resizing (review-2 #4): drag the handle on a header.
      dom.on(_root, 'mousedown', '[data-col-resize]', function (e, el) {
        e.preventDefault(); e.stopPropagation();
        var col = el.getAttribute('data-col-resize');
        var th = el; while (th && th.tagName !== 'TH') th = th.parentNode;
        if (!th) return;
        var startX = e.clientX, startW = th.offsetWidth;
        _colResizing = true;
        function onMove(ev) { th.style.width = Math.max(MIN_COL_WIDTH_PX, startW + (ev.clientX - startX)) + 'px'; }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
          var ui = uiFor(_state.activeTab); ui.colWidths = ui.colWidths || {};
          ui.colWidths[col] = Math.max(MIN_COL_WIDTH_PX, startW + (ev.clientX - startX));
          setTimeout(function () { _colResizing = false; }, 0); // swallow the trailing click
        }
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      });
      dom.on(_root, 'input', '[data-search]', function (e, el) {
        var dsId = el.getAttribute('data-search'), val = el.value;
        if (_searchTimer) clearTimeout(_searchTimer);
        _searchTimer = setTimeout(function () { uiFor(dsId).search = val; renderTableHost(); updateShownCount(); }, 150);
      });
      dom.on(_root, 'change', '[data-incomplete]', function (e, el) {
        uiFor(el.getAttribute('data-incomplete')).incompleteOnly = el.checked; renderTableHost(); updateShownCount();
      });
      // REL-8: an Include toggle ADDS its parked category to the table; unticked it is
      // hidden again. renderMain so the toggle chip and the note follow.
      dom.on(_root, 'change', '[data-include-rel]', function (e, el) {
        var ui = uiFor(_state.activeTab), value = el.getAttribute('data-include-rel');
        var on = (ui.includeRelevance || []).filter(function (v) { return v !== value; });
        if (el.checked) on.push(value);
        ui.includeRelevance = on;
        renderMain();
      });
      // ---- CUS-2: create / rename a hand-authored register item -------------------
      // The name box is kept in UI state as you type (rather than read only on click) so
      // a failed add — a duplicate name, an empty box — can re-render the bar with the
      // reason without also throwing away what was typed.
      dom.on(_root, 'input', '[data-add-item-key]', function (e, el) {
        var ui = uiFor(el.getAttribute('data-add-item-key'));
        ui.addKey = el.value;
        // A refusal is about the name that WAS in the box; the moment it changes, the
        // message is stale. It is cleared in state only — re-rendering the bar here
        // would take the focus off the box mid-keystroke.
        if (ui.addError) {
          ui.addError = null;
          var box = _root && _root.querySelector('.add-item-bar .add-item-error');
          if (box && box.parentNode) box.parentNode.removeChild(box);
        }
      });
      dom.on(_root, 'keydown', '[data-add-item-key]', function (e, el) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        addItemFromBar(el.getAttribute('data-add-item-key'));
      });
      dom.on(_root, 'click', '[data-add-item]', function (e, el) { addItemFromBar(el.getAttribute('data-add-item')); });
      dom.on(_root, 'change', '[data-rename-key]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
        var ui = uiFor(dsId);
        var res = withUndo(dsId, 'rename of "' + key + '"', function () {
          return App.store.renameItem(dsId, key, el.value);
        });
        if (!res.ok) {
          App.ui.activity.logIssues(res.issues, 'Rename');
          el.value = key;                     // put the box back to the name that still stands
          return;
        }
        // The expander is keyed by the item key, so the open row has to follow the rename
        // or it would silently collapse the moment the name changed.
        if (ui.expanded && ui.expanded[key]) { delete ui.expanded[key]; ui.expanded[res.key] = true; }
        App.ui.activity.logIssues(res.issues);
      });

      // ---- Apply Control Mode (review-7 #2) ----
      /**
       * BULK-4: the bulk modes are exclusive — they all own the same tick column, so two
       * armed at once would mean one column with two meanings. Stand every one down
       * except the one being entered. Declared from PICK_MODES rather than listed here,
       * so adding a sixth mode is an entry in that table and nothing else.
       * @param {Object} ui @param {?string} keep  the mode id being entered
       */
      function clearOtherModes(ui, keep) {
        App.ui.tables.PICK_MODES.forEach(function (m) {
          if (m.id === keep) return;
          ui[m.flag] = false;
          ui[m.pick] = null;   // exiting clears the SELECTION; the changes it made persist
        });
        if (keep !== 'delete') { ui.deleteMode = false; ui.deleteSel = {}; }
      }
      /** Enter or leave one of the pick-then-tick modes. */
      function toggleMode(dsId, id) {
        var ui = uiFor(dsId);
        var m = App.ui.tables.PICK_MODES.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        var entering = !ui[m.flag];
        clearOtherModes(ui, entering ? id : null);
        ui[m.flag] = entering;
        if (!entering) ui[m.pick] = null;
        closeRun();   // entering/leaving a mode ends the current undoable run
        renderMain();
      }
      dom.on(_root, 'click', '[data-apply-toggle]', function (e, el) {
        toggleMode(el.getAttribute('data-apply-toggle'), 'apply');
      });
      // ---- DEV-1: Assign to Device Mode ----
      // Deliberately the same shape as Apply Control Mode: arm the mode, pick the thing in
      // the rail, tick the rows. What differs is only WHAT is being attached to the rows.
      dom.on(_root, 'click', '[data-assign-toggle]', function (e, el) {
        toggleMode(el.getAttribute('data-assign-toggle'), 'assign');
      });
      // ---- BULK-4: Apply Security Relevance / Apply Decision ----
      // Same shape again, and they share a tick column because they are the same gesture
      // over a different field: pick a value in the rail, tick the rows that get it.
      dom.on(_root, 'click', '[data-relevance-toggle]', function (e, el) {
        toggleMode(el.getAttribute('data-relevance-toggle'), 'relevance');
      });
      dom.on(_root, 'click', '[data-decision-toggle]', function (e, el) {
        toggleMode(el.getAttribute('data-decision-toggle'), 'decision');
      });
      // Pick the value to apply. Clicking the active chip again de-selects it, exactly as
      // the control and device pickers do.
      dom.on(_root, 'click', '[data-rail-value]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), v = el.getAttribute('data-rail-value');
        var ui = uiFor(dsId);
        var field = ui.relevanceMode ? 'relevanceValue' : ui.decisionMode ? 'decisionValue' : null;
        if (!field) return;
        ui[field] = (ui[field] === v) ? null : v;
        closeRun();     // a different value means a different action
        renderMain();   // the tick column now reflects a different value
      });
      // Pick the device to assign to. Clicking the active card again de-selects it, exactly
      // as the control picker does.
      dom.on(_root, 'click', '[data-rail-device]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), id = el.getAttribute('data-rail-device');
        var ui = uiFor(dsId);
        ui.assignDeviceId = (ui.assignDeviceId === id) ? null : id;
        closeRun();     // a different device means a different action
        renderMain();   // the tick column now reflects a different device
      });
      // Tick/untick one row's applicability to the selected device. Quiet (STAB-3): the
      // box is already in its new state and the page must not jump, so only the two things
      // the tick actually changes are repainted — the "Applies to" cell and the heading.
      dom.on(_root, 'change', '[data-device-check]', function (e, el) {
        var dsId = _state.activeTab, ui = uiFor(dsId);
        var deviceId = ui.assignDeviceId;
        if (!deviceId) { el.checked = !el.checked; return; }
        var key = el.getAttribute('data-key'), on = !!el.checked;
        var project = App.store.getProject();
        var dc = project && (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0];
        noteDeviceTick(dsId, deviceId, (dc && dc.name) || deviceId);
        var res;
        quietEdit(function () { res = App.store.setItemDevice(dsId, key, deviceId, on); });
        if (!res.ok) {
          unnoteTickRun();                        // take back only THIS tick, not the run
          el.checked = !on;                       // the store refused — put the box back
          App.ui.activity.logIssues(res.issues, 'Assign to device');
        }
        refreshUndoButton(dsId);
        refreshAppliesCells(dsId, [key]);
        refreshAssignHead(dsId);
      });
      // DEV-1: the column heading — assign (or unassign) every row the table is showing.
      // The plan comes from the same helper that labelled the button, so the count
      // promised and the set acted on cannot drift apart (as BULK-1).
      dom.on(_root, 'click', '[data-assign-all]', function (e, el) {
        var dsId = el.getAttribute('data-assign-all'), ui = uiFor(dsId);
        var deviceId = ui.assignDeviceId;
        if (!deviceId) return;
        var project = App.store.getProject();
        var plan = App.ui.model.assignAllShownPlan(project, dsId, ui, deviceId);
        if (!plan.items.length) return;
        var dc = (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0];
        var what = (dc && dc.name) || deviceId;
        closeRun();
        pushUndo(dsId, (plan.removing ? 'un-assignment' : 'device assignment') + ' of ' + plan.items.length + ' shown item(s) ' +
          (plan.removing ? 'from' : 'to') + ' "' + what + '"');
        var res;
        _suppressRender = true;
        try {
          res = App.store.setItemsDevice(dsId, plan.items.map(function (it) { return it.key; }), deviceId, !plan.removing);
        } finally { _suppressRender = false; }
        if (!res.ok || !res.changed) dropUndo(dsId);   // nothing actually changed
        App.ui.activity.logIssues(res.issues, res.ok ? null : 'Assign to device');
        renderMain(); // refresh the tick states and the heading label
      });
      /**
       * BULK-4: write one row's value for the active mode. An empty value CLEARS the
       * field — "not set" for a relevance, "undecided" for a decision — which is what
       * makes unticking a row a real undo of the tick rather than a no-op.
       *
       * A decision is merged onto whatever the item already carries rather than replacing
       * it, so an adapter whose decisionSchema grows a second field does not silently lose
       * it the first time someone bulk-sets the enum one.
       */
      function writeValue(dsId, spec, item, value) {
        if (spec.mode === 'relevance') return App.store.setItemFields(dsId, item.key, { relevance: value || '' });
        var d = null;
        if (value) { d = Object.assign({}, item.decision || {}); d[spec.field] = value; }
        return App.store.setDecision(dsId, item.key, d);
      }
      /** The active value spec for a dataset, or null. */
      function specFor(dsId) {
        var project = App.store.getProject(); if (!project) return null;
        var adapter = App.registry.getDataset(project.platformProfileId, dsId);
        return adapter ? App.ui.tables.valueApplySpec(adapter, uiFor(dsId)) : null;
      }
      // Tick/untick one row: set the chosen value on it, or clear the field. Quiet
      // (STAB-3) — the box is already in its new state and the page must not jump, so only
      // what the tick actually changed is repainted.
      dom.on(_root, 'change', '[data-value-check]', function (e, el) {
        var dsId = _state.activeTab, ui = uiFor(dsId);
        var spec = specFor(dsId);
        if (!spec || !spec.value) { el.checked = !el.checked; return; }
        var key = el.getAttribute('data-key'), on = !!el.checked;
        var project = App.store.getProject();
        var item = (project.items[dsId] || []).filter(function (it) { return it.key === key; })[0];
        if (!item) { el.checked = false; return; }
        // review-13 #2: consecutive ticks with the SAME value fold into one undo entry.
        noteApplyTick(dsId, spec.mode + ':' + spec.value, spec.label + ' "' + spec.value + '"');
        // Deliberately NOT a quiet edit, unlike the control and device ticks. Those change
        // one cell; this one changes the row's badge, its Status and (for a decision) its
        // undecided styling, so a surgical repaint would be three patches that can drift
        // from the renderer. The store change re-renders, and STAB-2's anchor correction
        // keeps the row you clicked under the pointer.
        var res = writeValue(dsId, spec, item, on ? spec.value : '');
        if (res && !res.ok) {
          unnoteTickRun();                        // take back only THIS tick, not the run
          el.checked = !on;                       // the store refused — put the box back
          App.ui.activity.logIssues(res.issues, spec.label);
        }
      });
      // The column heading — set (or clear) the value on every row the table is showing.
      // The plan comes from the same helper that labelled the button, so the count
      // promised and the set acted on cannot drift apart (as BULK-1).
      dom.on(_root, 'click', '[data-value-all]', function (e, el) {
        var dsId = el.getAttribute('data-value-all'), ui = uiFor(dsId);
        var spec = specFor(dsId);
        if (!spec || !spec.value) return;
        var project = App.store.getProject();
        var plan = App.ui.model.valueAllShownPlan(project, dsId, ui, spec.read, spec.value);
        if (!plan.items.length) return;
        var removing = plan.removing, count = 0, issues = [];
        closeRun();
        pushUndo(dsId, (removing ? 'clearing' : 'setting') + ' of ' + spec.label + ' "' + spec.value + '" on ' +
          plan.items.length + ' shown item(s)');
        _suppressRender = true;
        try {
          plan.items.forEach(function (it) {
            var has = spec.read(it) === spec.value;
            if (removing === has) {              // set what differs, or clear what matches
              var res = writeValue(dsId, spec, it, removing ? '' : spec.value);
              if (res && !res.ok) { issues = issues.concat(res.issues || []); return; }
              count++;
            }
          });
        } finally { _suppressRender = false; }
        if (!count) dropUndo(dsId);              // nothing actually changed
        App.ui.activity.logIssues(issues, issues.length ? spec.label : null);
        App.ui.activity.log({ severity: 'info',
          message: (removing ? 'Cleared ' : 'Set ') + spec.label + ' ' + (removing ? '"' + spec.value + '" from' : 'to "' + spec.value + '" on') + ' ' +
            count + ' of the ' + plan.items.length + ' item(s) shown' +
            (ui.search ? ' (search: "' + ui.search + '")' : '') + '.' });
        renderMain(); // refresh the tick states and the heading label
      });
      // ---- Delete Mode (review-12 #2): arm → tick rows → click again to delete ----
      dom.on(_root, 'click', '[data-delete-toggle]', function (e, el) {
        var dsId = el.getAttribute('data-delete-toggle'), ui = uiFor(dsId);
        if (!ui.deleteMode) {
          clearOtherModes(ui, 'delete');   // BULK-4: exclusive with every pick-then-tick mode
          ui.deleteMode = true; ui.deleteSel = {};
          renderMain();
          return;
        }
        // Second click actions the selection.
        var sel = ui.deleteSel || {};
        var keys = Object.keys(sel).filter(function (k) { return sel[k]; });
        ui.deleteMode = false; ui.deleteSel = {};
        if (!keys.length) {
          App.ui.activity.log({ severity: 'info', message: 'Delete Mode exited — no items were ticked.' });
          renderMain();
          return;
        }
        closeRun();
        pushUndo(dsId, 'deletion of ' + keys.length + ' item(s)');
        var res = App.store.removeItems(dsId, keys);
        if (!res.ok) dropUndo(dsId); // nothing changed — keep the stack honest
        App.ui.activity.logIssues(res.issues, res.ok ? null : 'Delete items');
        renderMain();
      });
      dom.on(_root, 'click', '[data-delete-cancel]', function (e, el) {
        var ui = uiFor(el.getAttribute('data-delete-cancel'));
        ui.deleteMode = false; ui.deleteSel = {};
        App.ui.activity.log({ severity: 'info', message: 'Delete Mode cancelled — nothing was deleted.' });
        renderMain();
      });
      // Tick/untick a row for deletion. Selection is UI-only until the mode is actioned,
      // so this updates the row tint + the button count in place (no re-render).
      dom.on(_root, 'change', '[data-delete-check]', function (e, el) {
        var dsId = _state.activeTab, ui = uiFor(dsId);
        var key = el.getAttribute('data-key');
        ui.deleteSel = ui.deleteSel || {};
        if (el.checked) ui.deleteSel[key] = true; else delete ui.deleteSel[key];
        var tr = el; while (tr && tr.tagName !== 'TR') tr = tr.parentNode;
        if (tr && tr.classList) { if (el.checked) tr.classList.add('del-marked'); else tr.classList.remove('del-marked'); }
        var btn = _root.querySelector('[data-delete-toggle="' + dsId + '"]');
        if (btn) btn.textContent = 'Delete selected (' + Object.keys(ui.deleteSel).length + ')';
      });
      // ---- Undo / Redo the last bulk action (review-12 #2, review-13 #2/#3) ----
      dom.on(_root, 'click', '[data-undo]', function (e, el) {
        var dsId = el.getAttribute('data-undo');
        if (stepHistory(dsId, _undo, _redo, 'Undid')) renderMain();
      });
      dom.on(_root, 'click', '[data-redo]', function (e, el) {
        var dsId = el.getAttribute('data-redo');
        if (stepHistory(dsId, _redo, _undo, 'Redid')) renderMain();
      });
      // ---- Security Relevance (review-12 #3) ----
      dom.on(_root, 'change', '[data-relevance]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
        var res = withUndo(dsId, 'Security Relevance change' + onRow(key), function () {
          return App.store.setItemFields(dsId, key, { relevance: el.value });
        });
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Security Relevance');
        // store.onChange re-renders, so the badge colour follows the new value.
      });
      // SP-3: pick the control to apply from the rail's card list. Clicking the active
      // card again de-selects it, so the rail needs no separate "clear" affordance.
      dom.on(_root, 'click', '[data-rail-control]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), id = el.getAttribute('data-rail-control');
        var ui = uiFor(dsId);
        ui.applyControlId = (ui.applyControlId === id) ? null : id;
        closeRun();     // a different control means a different action
        renderMain();   // enable/disable "Apply to" + refresh the row checkbox states
      });
      // SP-3: filter the rail's control list. Re-render, then restore focus/caret so
      // typing is not interrupted (the same trick the Control Manager search uses).
      dom.on(_root, 'input', '[data-rail-search]', function (e, el) {
        var dsId = el.getAttribute('data-rail-search'), pos = el.selectionStart;
        uiFor(dsId).railSearch = el.value;
        renderMain();
        var again = _root.querySelector('[data-rail-search="' + dsId + '"]');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
      });
      // CTLSORT-1: order the rail's control list, and narrow it to one tag. Neither
      // touches the project or the selected control — they only change what you are
      // looking at, so a control picked under one order stays picked under the next.
      dom.on(_root, 'change', '[data-rail-sort]', function (e, el) {
        uiFor(el.getAttribute('data-rail-sort')).railSort = el.value;
        renderMain();
      });
      dom.on(_root, 'change', '[data-rail-tag]', function (e, el) {
        uiFor(el.getAttribute('data-rail-tag')).railTag = el.value;
        renderMain();
      });
      // ---- FIL-1: per-column value filters -----------------------------------------
      dom.on(_root, 'change', '[data-col-filter]', function (e, el) {
        var dsId = el.getAttribute('data-col-filter'), col = el.getAttribute('data-col');
        var ui = uiFor(dsId);
        ui.colFilters = ui.colFilters || {};
        if (el.value) ui.colFilters[col] = el.value; else delete ui.colFilters[col];
        renderMain();
      });
      // ---- COL-1: the column picker -------------------------------------------
      // The tick has already put the box in its new state, so the BAR is deliberately
      // not re-rendered — rebuilding it would take the focus off the box you just
      // clicked, and hiding three columns is three clicks in a row. Only the table and
      // the bar's own count are refreshed (the same reasoning as STAB-3).
      dom.on(_root, 'change', '[data-col-vis]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), col = el.getAttribute('data-col-vis');
        var ui = uiFor(dsId);
        ui.hiddenCols = ui.hiddenCols || {};
        if (el.checked) delete ui.hiddenCols[col]; else hideColumn(ui, col);
        renderTableHost(); refreshColumnCount(dsId); updateShownCount();
      });
      dom.on(_root, 'click', '[data-col-vis-all]', function (e, el) {
        var ui = uiFor(el.getAttribute('data-col-vis-all'));
        ui.hiddenCols = {};
        renderMain(); // every box changes state, so the bar itself has to be rebuilt
      });
      dom.on(_root, 'click', '[data-col-vis-none]', function (e, el) {
        var dsId = el.getAttribute('data-col-vis-none'), ui = uiFor(dsId);
        var project = App.store.getProject(); if (!project) return;
        var adapter = App.registry.getDataset(project.platformProfileId, dsId); if (!adapter) return;
        var locked = App.ui.tables.lockedColumnKey(adapter);
        ui.hiddenCols = ui.hiddenCols || {};
        App.ui.tables.allColumns(adapter).forEach(function (c) { if (c.key !== locked) hideColumn(ui, c.key); });
        renderMain();
      });
      dom.on(_root, 'click', '[data-col-filter-clear]', function (e, el) {
        var ui = uiFor(el.getAttribute('data-col-filter-clear'));
        ui.colFilters = {};
        renderMain();
      });

      // SP-1: collapse/expand the rail (UI-state only, per dataset).
      dom.on(_root, 'click', '[data-rail-toggle]', function (e, el) {
        var dsId = el.getAttribute('data-rail-toggle');
        var ui = uiFor(dsId);
        ui.railCollapsed = !ui.railCollapsed;
        renderMain();
      });

      // ---- VF-4: per-item value format --------------------------------------------
      dom.on(_root, 'change', '[data-format-pick]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
        var res = withUndo(dsId, 'value-format change' + onRow(key), function () {
          return App.store.setItemFields(dsId, key, { format: el.value });
        });
        App.ui.activity.logIssues(res.issues, 'Value format');
        renderMain();
      });

      // ---- VF-5: the value-format manager modal ------------------------------------
      var FM = function () { return App.ui.views.formats; };
      function fmtRefresh() { render(); }
      function currentFmt() {
        var p = App.store.getProject();
        return FM() && p ? FM().current(p) : null;
      }
      /** Read the modal's option rows back into a {value, description}[] list. */
      function readOptionRows() {
        var out = [];
        var vals = _root.querySelectorAll('[data-fmt-opt-value]');
        Array.prototype.forEach.call(vals, function (v) {
          var idx = v.getAttribute('data-idx');
          var d = _root.querySelector('[data-fmt-opt-desc][data-idx="' + idx + '"]');
          out.push({ value: v.value, description: d ? d.value : '' });
        });
        return out;
      }
      function saveOptions(extra) {
        var f = currentFmt(); if (!f) return;
        var patch = { options: readOptionRows() };
        if (extra) patch.options = patch.options.concat([extra]);
        var res = App.store.updateValueFormat(f.id, patch);
        App.ui.activity.logIssues(res.issues, 'Value format');
        fmtRefresh();
      }

      dom.on(_root, 'click', '[data-format-manage]', function () { FM().open(null); render(); });
      dom.on(_root, 'click', '[data-fmt-close]', function () { FM().close(); render(); });
      dom.on(_root, 'click', '[data-fmt-modal]', function (e, el) { if (e.target === el) { FM().close(); render(); } });
      dom.on(_root, 'click', '[data-fmt-select]', function (e, el) { FM()._fm.selected = el.getAttribute('data-fmt-select'); render(); });
      dom.on(_root, 'input', '[data-fmt-new-name]', function (e, el) { FM()._fm.draftName = el.value; });
      dom.on(_root, 'click', '[data-fmt-create]', function () {
        var nameEl = _root.querySelector('[data-fmt-new-name]');
        var kindEl = _root.querySelector('[data-fmt-kind-pick]');
        var res = App.store.addValueFormat({ name: nameEl ? nameEl.value : '', kind: kindEl ? kindEl.value : 'options' });
        App.ui.activity.logIssues(res.issues, 'Value format');
        if (res.ok) { FM()._fm.selected = res.id; FM()._fm.draftName = ''; }
        render();
      });
      dom.on(_root, 'change', '[data-fmt-name]', function (e, el) {
        var f = currentFmt(); if (!f) return;
        App.ui.activity.logIssues(App.store.updateValueFormat(f.id, { name: el.value }).issues, 'Value format');
        fmtRefresh();
      });
      dom.on(_root, 'change', '[data-fmt-desc]', function (e, el) {
        var f = currentFmt(); if (!f) return;
        App.store.updateValueFormat(f.id, { description: el.value }); fmtRefresh();
      });
      dom.on(_root, 'change', '[data-fmt-kind-pick]', function (e, el) {
        // On the "new format" pane there is nothing to update yet — the kind is read
        // at create time instead.
        if (FM()._fm.selected === 'new') return;
        var f = currentFmt(); if (!f) return;
        App.ui.activity.logIssues(App.store.updateValueFormat(f.id, { kind: el.value }).issues, 'Value format');
        fmtRefresh();
      });
      dom.on(_root, 'change', '[data-fmt-min]', function (e, el) {
        var f = currentFmt(); if (!f) return;
        var v = el.value.trim();
        App.store.updateValueFormat(f.id, { min: v === '' ? null : Number(v) }); fmtRefresh();
      });
      dom.on(_root, 'change', '[data-fmt-max]', function (e, el) {
        var f = currentFmt(); if (!f) return;
        var v = el.value.trim();
        App.store.updateValueFormat(f.id, { max: v === '' ? null : Number(v) }); fmtRefresh();
      });
      dom.on(_root, 'change', '[data-fmt-pattern]', function (e, el) {
        var f = currentFmt(); if (!f) return;
        App.store.updateValueFormat(f.id, { pattern: el.value.trim() }); fmtRefresh();
      });
      dom.on(_root, 'change', '[data-fmt-opt-value]', function () { saveOptions(); });
      dom.on(_root, 'change', '[data-fmt-opt-desc]', function () { saveOptions(); });
      dom.on(_root, 'click', '[data-fmt-opt-remove]', function (e, el) {
        var f = currentFmt(); if (!f) return;
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var rows = readOptionRows().filter(function (_, i) { return i !== idx; });
        App.store.updateValueFormat(f.id, { options: rows });
        fmtRefresh();
      });
      dom.on(_root, 'click', '[data-fmt-opt-add]', function () {
        var vEl = _root.querySelector('[data-fmt-new-value]'), dEl = _root.querySelector('[data-fmt-new-desc]');
        var v = vEl ? vEl.value.trim() : '';
        if (!v) { App.ui.activity.log({ severity: 'error', message: 'Value format: an allowed value cannot be blank.' }); return; }
        saveOptions({ value: v, description: dEl ? dEl.value : '' });
      });
      dom.on(_root, 'click', '[data-fmt-remove]', function (e, el) {
        var id = el.getAttribute('data-id');
        var p = App.store.getProject();
        var used = App.valueFormats.usageCount(p, id);
        if (used && !window.confirm('Delete this format? ' + used + ' item(s) use it and will fall back to the format inferred from their capture. Their values are not changed.')) return;
        App.ui.activity.logIssues(App.store.removeValueFormat(id).issues, 'Value format');
        FM()._fm.selected = null;
        render();
      });
      // review-8 #2 / review-9 #1: apply the selected control to all items with the chosen
      // action — but TOGGLE: if every matching item already has it, remove it from all;
      // otherwise add it to the ones still missing it.
      // BULK-1: apply (or remove) the selected control across every row the table is
      // currently showing. "Currently showing" is whatever the search box and filters
      // have narrowed it to, so `search: bluetooth` → one click tags every Bluetooth
      // package. The plan comes from the same helper that labelled the button, so the
      // count promised and the set acted on cannot drift apart.
      dom.on(_root, 'click', '[data-apply-all]', function (e, el) {
        var dsId = el.getAttribute('data-apply-all');
        var ui = uiFor(dsId);
        var controlId = ui.applyControlId;
        if (!controlId) return;
        var project = App.store.getProject();
        var plan = App.ui.model.applyAllShownPlan(project, dsId, ui, controlId);
        if (!plan.items.length) return;
        var removing = plan.removing, count = 0;
        var ctl = (project.controls || []).filter(function (c) { return c.id === controlId; })[0];
        var what = (ctl && ctl.title) || controlId;
        // review-12 #2: the whole bulk run is ONE undo entry.
        closeRun();
        pushUndo(dsId, (removing ? 'removal' : 'application') + ' of "' + what + '" to ' + plan.items.length + ' shown item(s)');
        _suppressRender = true;
        try {
          plan.items.forEach(function (it) {
            var refs = it.controlRefs || [];
            var has = refs.indexOf(controlId) !== -1;
            if (removing && has) { App.store.setItemFields(dsId, it.key, { controlRefs: refs.filter(function (r) { return r !== controlId; }) }); count++; }
            else if (!removing && !has) { App.store.setItemFields(dsId, it.key, { controlRefs: refs.concat([controlId]) }); count++; }
          });
        } finally { _suppressRender = false; }
        if (!count) dropUndo(dsId); // nothing actually changed
        App.ui.activity.log({ severity: 'info',
          message: (removing ? 'Removed' : 'Applied') + ' control "' + what + '" ' + (removing ? 'from' : 'to') + ' ' +
            count + ' of the ' + plan.items.length + ' item(s) shown' +
            (ui.search ? ' (search: "' + ui.search + '")' : '') + '.' });
        renderMain(); // refresh the checkbox states and the button label
      });
      // Tick/untick a row's box: add/remove the selected control from that item's
      // controlRefs. Suppress the full re-render so bulk assignment stays fast and the
      // scroll position is kept (the box already reflects the click).
      dom.on(_root, 'change', '[data-apply-check]', function (e, el) {
        var dsId = _state.activeTab, ui = uiFor(dsId);
        if (!ui.applyControlId) return;
        var key = el.getAttribute('data-key');
        var project = App.store.getProject();
        var item = (project.items[dsId] || []).filter(function (it) { return it.key === key; })[0];
        if (!item) { el.checked = false; return; }
        var refs = (item.controlRefs || []).filter(function (r) { return r !== ui.applyControlId; });
        if (el.checked) refs.push(ui.applyControlId);
        // review-13 #2: consecutive ticks with the same control are ONE action, so they
        // fold into a single undo entry (snapshot taken before the first tick).
        var ctl = (project.controls || []).filter(function (c) { return c.id === ui.applyControlId; })[0];
        noteApplyTick(dsId, ui.applyControlId, (ctl && ctl.title) || ui.applyControlId);
        _suppressRender = true;
        try { App.store.setItemFields(dsId, key, { controlRefs: refs }); } finally { _suppressRender = false; }
        refreshUndoButton(dsId); // the full re-render was suppressed to keep scroll position
        refreshApplyHead(dsId);  // BULK-3: …and so was the heading that counts these ticks
      });
      // ---- EDIT-1: open a cell for editing (Ctrl+click, or double-click) ----------
      // The row expander is where a Description, a Rationale or a set of Control Refs is
      // edited, and the ▸ button that opens it is at the far left of a table that can be
      // 2000px wide. So the cell showing the text is now a way in to editing it, with
      // that field focused and selected — you land in the box you were reading.
      //
      // Ctrl+click is the primary gesture (the one asked for) and double-click is the
      // familiar fallback; a plain click is left alone so selecting text still works.
      /**
       * @param {Element} td the cell that was activated
       */
      function openCellEditor(td) {
        var key = td.getAttribute('data-key'), col = td.getAttribute('data-edit-col');
        var dsId = _state.activeTab;
        var project = App.store.getProject(); if (!project) return;
        var adapter = App.registry.getDataset(project.platformProfileId, dsId); if (!adapter) return;
        var ui = uiFor(dsId);
        ui.expanded = ui.expanded || {};
        var wasOpen = !!ui.expanded[key];
        // An open row is left open: the gesture means "edit this", never "close this".
        if (!wasOpen) { ui.expanded[key] = true; renderTableHost(); }
        var tgt = App.ui.tables.cellEditTarget(adapter, col);
        if (!tgt || !tgt.sel) return;
        var host = document.getElementById('table-host'); if (!host) return;
        // Found by walking rather than by selector: an item key is free text on an
        // authored dataset, and a quote in it would break an attribute selector.
        var rows = host.querySelectorAll('tr.detail-row'), row = null;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].getAttribute('data-detail-key') === key) { row = rows[i]; break; }
        }
        var field = row && row.querySelector(tgt.sel);
        if (!field) return;
        field.focus();
        // Select what is there, so typing replaces it and the caret is somewhere sane —
        // a plain focus on a full textarea leaves the caret at position 0.
        if (field.select) { try { field.select(); } catch (err) {} }
        if (field.scrollIntoView) field.scrollIntoView({ block: 'nearest' });
      }
      dom.on(_root, 'click', 'td[data-edit-col]', function (e, el) {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openCellEditor(el);
      });
      dom.on(_root, 'dblclick', 'td[data-edit-col]', function (e, el) {
        e.preventDefault();   // otherwise the browser also selects the word under the pointer
        openCellEditor(el);
      });
      // The value cell is already an editor, so the same gesture just puts the caret in it
      // rather than opening anything — consistency of gesture, not of destination.
      dom.on(_root, 'click', 'td.dcell', function (e, el) {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        var box = el.querySelector('.val-edit');
        if (!box) return;
        e.preventDefault();
        box.focus();
        if (box.select) { try { box.select(); } catch (err) {} }
      });

      // ---- inline decision editing & per-row expander (spec §11.2) ----
      dom.on(_root, 'click', '[data-expand-key]', function (e, el) {
        var ui = uiFor(_state.activeTab); ui.expanded = ui.expanded || {};
        var key = el.getAttribute('data-expand-key');
        if (ui.expanded[key]) delete ui.expanded[key]; else ui.expanded[key] = true;
        renderTableHost();
      });
      dom.on(_root, 'change', '[data-decision]', function (e, el) {
        var cell = el; while (cell && !(cell.classList && cell.classList.contains('dcell'))) cell = cell.parentNode;
        if (cell) commitDecisionFromCell(cell);
      });
      // review-16 #1: explicit "back to undecided" for text-valued datasets, whose empty
      // value box now means "set this to blank" rather than "no decision".
      dom.on(_root, 'click', '[data-decision-clear]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
        withUndo(dsId, 'return to undecided' + onRow(key), function () {
          App.store.setDecision(dsId, key, null);
        });
        _editIssues[dsId + '|' + key] = [];
        renderTableHost(); refreshUndoButton(dsId);
      });
      // review-17 #3: the Status badge flips the item's state on click (or Enter/Space,
      // since it is exposed as a button). Decided -> undecided clears the decision;
      // undecided -> decided adopts whatever the row's value editor is showing.
      dom.on(_root, 'click', '[data-status-toggle]', function (e, el) { toggleStatus(el); });
      dom.on(_root, 'keydown', '[data-status-toggle]', function (e, el) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        toggleStatus(el);
      });
      dom.on(_root, 'click', '[data-action="rationale-preset"]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
        withUndo(dsId, 'rationale preset' + onRow(key), function () {
          App.store.setItemFields(dsId, key, { rationale: 'Not required for device use-case.' });
        });
        // store.onChange re-renders; the expander (persisted in ui.expanded) shows the filled value.
      });
      dom.on(_root, 'change', '[data-field-edit]', function (e, el) {
        var field = el.getAttribute('data-field-edit'), dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
        var fields = {};
        fields[field] = el.value;
        withUndo(dsId, fieldLabel(field) + ' edit' + onRow(key), function () {
          App.store.setItemFields(dsId, key, fields);
        });
      });
      // ---- DIV-1: "Diverges from Guidelines" ----------------------------------
      // A quiet edit (STAB-3), because this is a checkbox: the click has already put the
      // box in its new state, and a full re-render would replace the element under the
      // pointer and repaint from the top. What the tick DOES have to change is repainted
      // by hand — the cell's own hover text and missing-narrative tint, and the expander,
      // where the Divergence Narrative box appears the moment the flag goes on.
      dom.on(_root, 'change', '[data-diverges]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key'), on = !!el.checked;
        withUndo(dsId, 'divergence flag change' + onRow(key), function () {
          quietEdit(function () { App.store.setItemFields(dsId, key, { diverges: on }); });
        });
        refreshUndoButton(dsId); // the re-render was suppressed to keep the box under the pointer
        var project = App.store.getProject();
        var item = project && (project.items[dsId] || []).filter(function (it) { return it.key === key; })[0];
        if (item) {
          var label = el.parentNode, td = label && label.parentNode;
          if (label && label.setAttribute) label.setAttribute('title', App.ui.tables.divergesHint(item));
          if (td && td.className !== undefined) {
            td.className = 'div-cell' + (item.diverges && !item.divergenceNarrative ? ' div-nonarr' : '');
          }
        }
        refreshDetailRow(dsId, key);
      });
      // Control-refs checkbox toggle (review-5 #2): tick/untick adds/removes one ref
      // from the item's controlRefs, so multiple can be selected and any one removed.
      dom.on(_root, 'change', '[data-control-ref-toggle]', function (e, el) {
        var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key'), id = el.getAttribute('data-control-id');
        var project = App.store.getProject(); if (!project) return;
        var item = (project.items[dsId] || []).filter(function (it) { return it.key === key; })[0];
        if (!item) return;
        var refs = (item.controlRefs || []).filter(function (r) { return r !== id; });
        if (el.checked) refs.push(id);
        withUndo(dsId, 'control-reference change' + onRow(key), function () {
          App.store.setItemFields(dsId, key, { controlRefs: refs });
        });
      });
      // Filter the control checkbox list in place (no store round-trip / re-render).
      dom.on(_root, 'input', '[data-control-search]', function (e, el) {
        var q = el.value.toLowerCase().trim();
        var box = el.closest('[data-control-multiselect]');
        if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('[data-ctl-opt]'), function (lab) {
          lab.style.display = (!q || lab.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
        });
      });
      dom.on(_root, 'click', '[data-action="toggle-drawer"]', function () { _state.drawerCollapsed = !_state.drawerCollapsed; render(); });
      dom.on(_root, 'click', '[data-action="clear-drawer"]', function () { App.ui.activity.clear(); });
      dom.on(_root, 'click', '[data-action="load"]', function () { var i = document.getElementById('file-load'); if (i) i.click(); });
      // review-9 #5: Save opens a name-the-file modal instead of a fixed download.
      dom.on(_root, 'click', '[data-action="save"]', function () { if (!App.store.getProject()) return; _state.saveModal = true; render(); });
      dom.on(_root, 'input', '[data-save-name]', function (e, el) { _state.saveName = el.value; });
      dom.on(_root, 'keydown', '[data-save-name]', function (e, el) { if (e.key === 'Enter') { saveProject(el.value); _state.saveModal = false; render(); } });
      dom.on(_root, 'click', '[data-save-confirm]', function () { saveProject(_state.saveName); _state.saveModal = false; render(); });
      dom.on(_root, 'click', '[data-save-cancel]', function () { _state.saveModal = false; render(); });
      dom.on(_root, 'click', '[data-save-modal]', function (e, el) { if (e.target === el) { _state.saveModal = false; render(); } });
      dom.on(_root, 'click', '[data-action="export-csv"]', function () { exportCsv(); });
      dom.on(_root, 'change', '[data-action="platform"]', function (e, el) {
        try { App.registry.setActivePlatform(el.value); _state.activeTab = defaultTab(); render(); } catch (err) { logErr(err); }
      });
      dom.on(_root, 'click', '[data-action="toggle-theme"]', function () { toggleTheme(); });
      dom.on(_root, 'click', '[data-action="restore-draft"]', function () { restoreDraft(); });
      dom.on(_root, 'click', '[data-action="discard-draft"]', function () { clearDraft(); _state.draftDismissed = true; render(); App.ui.activity.log({ severity: 'info', message: 'Discarded local draft autosave.' }); });
      // file input change (not delegated — direct)
      _root.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'file-load') loadProjectFile(e.target.files[0]);
      });
    }

