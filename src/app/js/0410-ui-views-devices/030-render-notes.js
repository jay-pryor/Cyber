    /** The notes page for one device: what it is, then an open box to write in. */
    function renderNotes(project, deviceId) {
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return '<div class="empty-state">Device not found. <button data-notes-back>Back</button></div>';
      var isLatest = App.ui.model.getLatestConfigs(project).some(function (c) { return c.id === deviceId; });
      var ds = datasets(project);
      var counts = ds.map(function (d) {
        var ap = applicable(project, deviceId, d.id);
        return '<span>' + esc(d.label) + ' <strong>' + ap.filter(function (it) { return it.status === 'decided'; }).length + '/' + ap.length + '</strong> decided</span>';
      }).join('');
      var nCtl = (project.controls || []).filter(function (c) { return (c.assignedDeviceIds || []).indexOf(dc.baseId) !== -1; }).length;
      var group = (project.groups || []).filter(function (g) { return (g.deviceBaseIds || []).indexOf(dc.baseId) !== -1; })[0];

      var facts = [
        ['Model', dc.model], ['Firmware', dc.firmware], ['Version', 'v' + dc.version],
        ['Onboarded', dc.onboardedUtc.slice(0, 10)], ['Device group', group ? group.name : '—'],
        ['Assigned controls', String(nCtl)]
      ].map(function (f) {
        return '<div class="note-fact"><span class="note-fact-label">' + esc(f[0]) + '</span><span>' + esc(f[1] || '—') + '</span></div>';
      }).join('');

      var tools = NOTE_TOOLS.map(function (t) {
        return '<button type="button" data-note-cmd="' + esc(t.cmd) + '"' + (t.arg ? ' data-note-arg="' + esc(t.arg) + '"' : '') +
          ' title="' + esc(t.title) + '"' + (t.style ? ' style="' + t.style + '"' : '') + '>' + esc(t.label) + '</button>';
      }).join('');

      var body = scrubNotes(App.store.deviceNotes(project, dc.baseId));
      return '<div class="notes-view">' +
        '<button data-notes-back>← Devices</button>' +
        '<div class="dev-detail-head" style="margin-top:10px">' +
          '<h2 style="margin:0">' + esc(dc.name) + ' — platform notes</h2>' +
          '<span class="dev-meta">' + esc(dc.model) + ' · ' + esc(dc.firmware) + ' · v' + dc.version + '</span>' +
        '</div>' +
        (isLatest ? '' : '<div class="superseded-banner">This is a superseded version. Notes are kept per device, so what you write here is the same page the active version shows.</div>') +
        '<div class="note-facts">' + facts + '</div>' +
        '<div class="note-counts muted">' + counts + '</div>' +
        '<p class="muted" style="font-size:12px;margin:10px 0 4px">Anything worth knowing about this device that is not a decision on a single item — quirks, ' +
          'gotchas, what to check next time, why something was done the way it was. Kept with the project and shared across every version of this device.</p>' +
        '<div class="note-toolbar" role="toolbar" aria-label="Text formatting">' + tools +
          '<span class="spacer"></span><span class="muted note-status" data-note-status>Saved as you type.</span></div>' +
        '<div class="note-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Platform notes for ' + esc(dc.name) + '"' +
          ' data-note-editor="' + esc(dc.baseId) + '">' + (body || '') + '</div>' +
        '</div>';
    }

    /** Read the editor back, sanitise it, and store it without disturbing the caret. */
    function saveNotes() {
      var ed = document.querySelector('[data-note-editor]');
      if (!ed) return;
      var baseId = ed.getAttribute('data-note-editor');
      var html = scrubNotes(ed.innerHTML);
      var before = App.store.deviceNotes(App.store.getProject(), baseId);
      if (html === before) return;                 // nothing changed: no commit, no dirty flag
      // Quiet: a full re-render would replace the element being typed into and take the
      // caret with it. This is the same reason the Control Manager's ticks are quiet.
      if (_ctx && _ctx.quietEdit) _ctx.quietEdit(function () { App.store.setDeviceNotes(baseId, html); });
      else App.store.setDeviceNotes(baseId, html);
      var status = document.querySelector('[data-note-status]');
      if (status) status.textContent = 'Saved ' + App.util.clock.toAest(App.util.clock.nowIso()).slice(11, 19);
    }

    function render(project) {
      if (!project) return '<div class="empty-state"><h2>Devices</h2><p>Load a project or onboard a device first.</p></div>';
      // If the selected device no longer exists (e.g. project reloaded), fall back to the list.
      if (_dev.selectedId && !project.deviceConfigs.some(function (c) { return c.id === _dev.selectedId; })) _dev.selectedId = null;
      if (_dev.notesId && !project.deviceConfigs.some(function (c) { return c.id === _dev.notesId; })) _dev.notesId = null;
      if (_dev.notesId) return renderNotes(project, _dev.notesId);
      return _dev.selectedId ? renderDetail(project, _dev.selectedId) : renderList(project);
    }

    function wire(ctx) {
      _ctx = ctx;
      App.util.dom.on(ctx.root, 'click', '[data-device-view]', function (e, el) { _dev.selectedId = el.getAttribute('data-device-view'); _dev.assignResults = {}; _dev.detailSearch = ''; _dev.collapsed = {}; _dev.openControlId = null; ctx.refreshMain(); });
      App.util.dom.on(ctx.root, 'click', '[data-device-back]', function () { _dev.selectedId = null; _dev.assignResults = {}; _dev.detailSearch = ''; _dev.collapsed = {}; _dev.openControlId = null; ctx.refreshMain(); });

      // ---- NOTE-1: the platform-notes page ---------------------------------------
      App.util.dom.on(ctx.root, 'click', '[data-device-notes]', function (e, el) {
        _dev.notesId = el.getAttribute('data-device-notes'); _dev.selectedId = null; ctx.refreshMain();
      });
      App.util.dom.on(ctx.root, 'click', '[data-notes-back]', function () {
        saveNotes();                       // leaving the page must not lose the last words
        _dev.notesId = null; ctx.refreshMain();
      });
      // A toolbar button must not steal focus from the editor, or execCommand has no
      // selection to act on. mousedown is where focus moves, so that is where it is stopped.
      App.util.dom.on(ctx.root, 'mousedown', '[data-note-cmd]', function (e) { e.preventDefault(); });
      App.util.dom.on(ctx.root, 'click', '[data-note-cmd]', function (e, el) {
        var ed = document.querySelector('[data-note-editor]'); if (!ed) return;
        ed.focus();
        try { document.execCommand(el.getAttribute('data-note-cmd'), false, el.getAttribute('data-note-arg') || null); }
        catch (err) { App.ui.activity.log({ severity: 'warning', message: 'This browser refused that formatting command.' }); }
        saveNotes();
      });
      // Typed text saves on a pause, and again when focus leaves — the pause so a crash
      // or a stray tab-close costs a second of typing rather than a page of it.
      App.util.dom.on(ctx.root, 'input', '[data-note-editor]', function () {
        if (_noteTimer) clearTimeout(_noteTimer);
        _noteTimer = setTimeout(saveNotes, 700);
      });
      App.util.dom.on(ctx.root, 'focusout', '[data-note-editor]', function () {
        if (_noteTimer) { clearTimeout(_noteTimer); _noteTimer = null; }
        saveNotes();
      });

      // ---- device groups (spec §19.4 / T10.5) ----
      App.util.dom.on(ctx.root, 'input', '[data-group-newname]', function (e, el) { _dev.newGroupName = el.value; });
      App.util.dom.on(ctx.root, 'click', '[data-action="add-group"]', function () {
        var res = App.store.addGroup({ name: _dev.newGroupName, deviceBaseIds: [] });
        if (res.ok) _dev.newGroupName = ''; else App.ui.activity.logIssues(res.issues, 'Add group');
        ctx.refreshMain();
      });
      App.util.dom.on(ctx.root, 'change', '[data-group-name]', function (e, el) {
        App.store.updateGroup(el.getAttribute('data-group-id'), { name: el.value });
      });
      App.util.dom.on(ctx.root, 'click', '[data-group-remove]', function (e, el) {
        var res = App.store.removeGroup(el.getAttribute('data-group-remove'));
        App.ui.activity.logIssues(res.issues);
        ctx.refreshMain();
      });
      // review-6 #1: a toggle dropdown — selecting a device adds it, selecting a
      // current member removes it. The select resets to the placeholder on re-render.
      App.util.dom.on(ctx.root, 'change', '[data-group-member-select]', function (e, el) {
        var id = el.getAttribute('data-group-id'), baseId = el.value;
        if (!baseId) return;
        var g = (App.store.getProject().groups || []).filter(function (x) { return x.id === id; })[0]; if (!g) return;
        var isMember = (g.deviceBaseIds || []).indexOf(baseId) !== -1;
        var set = (g.deviceBaseIds || []).filter(function (b) { return b !== baseId; });
        if (!isMember) set.push(baseId); // toggle membership
        App.store.updateGroup(id, { deviceBaseIds: set });
        ctx.refreshMain();
      });
      // Group deviations modal open/close.
      App.util.dom.on(ctx.root, 'click', '[data-group-deviations]', function (e, el) {
        _dev.openGroupId = el.getAttribute('data-group-deviations');
        _dev.groupAdd = { dsId: (datasets(App.store.getProject())[0] || {}).id || null, key: '' };
        ctx.refreshMain();
      });
      App.util.dom.on(ctx.root, 'click', '[data-group-modal-close]', function () { _dev.openGroupId = null; ctx.refreshMain(); });
      App.util.dom.on(ctx.root, 'click', '[data-group-modal]', function (e, el) { if (e.target === el) { _dev.openGroupId = null; ctx.refreshMain(); } });
      // Edit an existing group override (gather the row's controls -> setGroupOverride).
      App.util.dom.on(ctx.root, 'change', '[data-gov]', function (e, el) {
        var dsId = el.getAttribute('data-gov-ds'), key = el.getAttribute('data-gov-key');
        var cell = el; while (cell && cell.tagName !== 'TD') cell = cell.parentNode;
        if (!cell || !_dev.openGroupId) return;
        var decision = govDecision(cell.querySelectorAll('[data-gov]'));
        var res = decision === null
          ? App.store.clearGroupOverride(_dev.openGroupId, dsId, key)
          : App.store.setGroupOverride(_dev.openGroupId, dsId, key, decision);
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Group override');
      });
      App.util.dom.on(ctx.root, 'click', '[data-gov-remove]', function (e, el) {
        var res = App.store.clearGroupOverride(_dev.openGroupId, el.getAttribute('data-ds'), el.getAttribute('data-key'));
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Remove group override');
      });
      // Add-override form: change dataset (re-render keys/editor), pick key, Set.
      App.util.dom.on(ctx.root, 'change', '[data-gov-add-ds]', function (e, el) { _dev.groupAdd = { dsId: el.value, key: '' }; ctx.refreshMain(); });
      App.util.dom.on(ctx.root, 'change', '[data-gov-add-key]', function (e, el) { _dev.groupAdd.key = el.value; });
      App.util.dom.on(ctx.root, 'click', '[data-gov-add-set]', function (e, el) {
        var dsId = el.getAttribute('data-ds');
        var keySel = el.parentNode.querySelector('[data-gov-add-key]');
        var key = keySel ? keySel.value : _dev.groupAdd.key;
        if (!key) { App.ui.activity.log({ severity: 'warning', message: 'Pick a key to override first.' }); return; }
        var decision = govDecision(el.parentNode.querySelectorAll('[data-gov-add-field-ctl]'));
        if (decision === null) { App.ui.activity.log({ severity: 'warning', message: 'Choose an override value first.' }); return; }
        var res = App.store.setGroupOverride(_dev.openGroupId, dsId, key, decision);
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Add group override');
        else _dev.groupAdd.key = '';
        ctx.refreshMain();
      });
      // Collapse/expand a device panel (review-5 #1) — re-render only the panels so
      // the search box keeps focus and the rest of the view is untouched.
      App.util.dom.on(ctx.root, 'click', '[data-panel-toggle]', function (e, el) {
        var dsId = el.getAttribute('data-panel-toggle');
        _dev.collapsed[dsId] = !_dev.collapsed[dsId];
        var host = document.getElementById('dev-panels');
        if (host && _dev.selectedId) host.innerHTML = renderPanels(App.store.getProject(), _dev.selectedId, _dev.detailSearch);
      });
      // Open the per-control "actions on this device" modal (review-5 #1).
      App.util.dom.on(ctx.root, 'click', '[data-control-open]', function (e, el) {
        _dev.openControlId = el.getAttribute('data-control-open'); ctx.refreshMain();
      });
      // review-12 #1: flip a control's Satisfied/Unsatisfied state for THIS device.
      // JUS-1: record the justification. `change` fires on blur, so it saves when you
      // move on — the modal never has to be dismissed with a "Save" button.
      App.util.dom.on(ctx.root, 'change', '[data-control-justification]', function (e, el) {
        var project = App.store.getProject();
        var dc = project.deviceConfigs.filter(function (c) { return c.id === _dev.selectedId; })[0];
        if (!dc) return;
        var id = el.getAttribute('data-control-justification');
        var res = App.store.setControlDeviceJustification(id, dc.baseId, el.value);
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Control justification');
      });
      App.util.dom.on(ctx.root, 'click', '[data-control-state-toggle]', function (e, el) {
        // Save any pending justification edit first — clicking the button blurs the
        // textarea, and the two must not race for the same commit.
        var box = ctx.root.querySelector('[data-control-justification]');
        var pendingId = box && box.getAttribute('data-control-justification');
        var pendingVal = box ? box.value : null;
        var project = App.store.getProject();
        var dc = project.deviceConfigs.filter(function (c) { return c.id === _dev.selectedId; })[0];
        if (!dc) return;
        var id = el.getAttribute('data-control-state-toggle'), state = el.getAttribute('data-state');
        if (box && pendingId === id) App.store.setControlDeviceJustification(id, dc.baseId, pendingVal);
        var res = App.store.setControlDeviceState(id, dc.baseId, state);
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Control state');
        else {
          var ctl = (project.controls || []).filter(function (c) { return c.id === id; })[0];
          App.ui.activity.log({ severity: 'info', message: 'Control "' + ((ctl && ctl.title) || id) + '" marked ' + App.projectIo.controlStateLabel(state).toLowerCase() + ' on ' + dc.name + '.' });
        }
        ctx.refreshMain();
      });
      App.util.dom.on(ctx.root, 'click', '[data-control-modal-close]', function () { _dev.openControlId = null; ctx.refreshMain(); });
      // Backdrop click closes (but a click inside the modal does not bubble to here as the overlay).
      App.util.dom.on(ctx.root, 'click', '[data-control-modal]', function (e, el) {
        if (e.target === el) { _dev.openControlId = null; ctx.refreshMain(); }
      });
      // Device-detail search: re-render ONLY the panels so the search box keeps focus.
      App.util.dom.on(ctx.root, 'input', '[data-dev-search]', function (e, el) {
        var val = el.value;
        if (_devSearchTimer) clearTimeout(_devSearchTimer);
        _devSearchTimer = setTimeout(function () {
          _dev.detailSearch = val;
          var host = document.getElementById('dev-panels');
          if (host && _dev.selectedId) host.innerHTML = renderPanels(App.store.getProject(), _dev.selectedId, val);
        }, 150);
      });
      // "Deviations first" pin toggle (OVR-5) — re-render only the panels.
      App.util.dom.on(ctx.root, 'change', '[data-dev-deviations-first]', function (e, el) {
        _dev.deviationsFirst = el.checked;
        var host = document.getElementById('dev-panels');
        if (host && _dev.selectedId) host.innerHTML = renderPanels(App.store.getProject(), _dev.selectedId, _dev.detailSearch);
      });
      // review-8 #3: drag-resize a device panel's columns (persist per dataset).
      App.util.dom.on(ctx.root, 'mousedown', '[data-dev-col-resize]', function (e, el) {
        e.preventDefault(); e.stopPropagation();
        var spec = el.getAttribute('data-dev-col-resize').split('|'), dsId = spec[0], col = spec[1];
        var th = el; while (th && th.tagName !== 'TH') th = th.parentNode;
        if (!th) return;
        var startX = e.clientX, startW = th.offsetWidth;
        function onMove(ev) { th.style.width = Math.max(60, startW + (ev.clientX - startX)) + 'px'; }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
          _dev.panelColWidths[dsId] = _dev.panelColWidths[dsId] || {};
          _dev.panelColWidths[dsId][col] = Math.max(60, startW + (ev.clientX - startX));
        }
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      });
      // review-7 #1: collapse/expand every panel. Full re-render so the button
      // label (Collapse all / Expand all) flips with the state.
      App.util.dom.on(ctx.root, 'click', '[data-dev-collapse-all]', function () {
        var project = App.store.getProject();
        var dsList = datasets(project);
        var allCollapsed = dsList.length > 0 && dsList.every(function (d) { return _dev.collapsed[d.id]; });
        dsList.forEach(function (d) { if (allCollapsed) delete _dev.collapsed[d.id]; else _dev.collapsed[d.id] = true; });
        ctx.refreshMain();
      });
      // Per-item DEVICE OVERRIDE edit (spec §19.5, OVR-8). Gather the row's override
      // controls into one decision and commit (no-op vs inherited clears it).
      App.util.dom.on(ctx.root, 'change', '[data-ov]', function (e, el) {
        var dsId = el.getAttribute('data-ov-ds'), key = el.getAttribute('data-ov-key');
        var cell = el; while (cell && cell.tagName !== 'TD') cell = cell.parentNode;
        if (!cell || !_dev.selectedId) return;
        var controls = cell.querySelectorAll('[data-ov]');
        var decision = {}, clear = false;
        Array.prototype.forEach.call(controls, function (c) {
          var field = c.getAttribute('data-ov-field'), kind = c.getAttribute('data-ov-kind');
          var fmtKind = c.getAttribute('data-fmt-kind');   // VF-8
          if (kind === 'bool') decision[field] = c.checked;
          else if (fmtKind && App.valueFormats) {
            // An emptied bool/number/options override means "no override" — revert to
            // inherited — which is exactly what clearDeviceOverride does.
            var r = App.valueFormats.parseInput({ kind: fmtKind }, c.value);
            if (r.undecided) clear = true; else decision[field] = r.ok ? r.value : c.value;
          }
          else if (kind === 'value-typed') decision[field] = coerceOv(c.value, c.getAttribute('data-vtype'));
          else if (kind === 'enum') { if (c.value === '') clear = true; else decision[field] = c.value; }
          else decision[field] = c.value;
        });
        var res = clear
          ? App.store.clearDeviceOverride(_dev.selectedId, dsId, key)
          : App.store.setDeviceOverride(_dev.selectedId, dsId, key, decision);
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Device override');
        // store.onChange triggers a full re-render of the detail view.
      });
      App.util.dom.on(ctx.root, 'click', '[data-ov-revert]', function (e, el) {
        var res = App.store.clearDeviceOverride(_dev.selectedId, el.getAttribute('data-ds'), el.getAttribute('data-key'));
        if (!res.ok) App.ui.activity.logIssues(res.issues, 'Revert override');
      });
      App.util.dom.on(ctx.root, 'change', '[data-assign-file]', function (e, el) {
        var dsId = el.getAttribute('data-assign-file'), file = el.files[0], deviceId = _dev.selectedId;
        if (!file || !deviceId) return;
        var project = App.store.getProject();
        var adapter = App.registry.getDataset(project.platformProfileId, dsId);
        App.util.dom.readFileText(file).then(function (text) {
          var parsed = adapter.parseAssignment(text);
          var res = App.store.applyDeviceAssignment(deviceId, dsId, parsed);
          _dev.assignResults[dsId] = res;
          App.ui.activity.logIssues(res.issues, res.ok ? null : 'Set-from-files (' + dsId + ')');
          ctx.refreshMain();
        }).catch(function (err) {
          _dev.assignResults[dsId] = { ok: false, issues: [{ severity: 'error', message: 'Read failed: ' + (err && err.message) }] };
          ctx.refreshMain();
        });
      });
    }

    App.ui = App.ui || {};
    App.ui.views = App.ui.views || {};
    App.ui.views.devices = { render: render, wire: wire, renderList: renderList, renderDetail: renderDetail, renderPanels: renderPanels, renderDeviceControls: renderDeviceControls, renderControlModal: renderControlModal, countControlItems: countControlItems, unsatisfiedControls: unsatisfiedControls, renderGroupModal: renderGroupModal, _dev: _dev,
      // NOTE-1: the notes page + its sanitiser, exposed so the allowlist is testable
      // without driving a contenteditable.
      renderNotes: renderNotes, scrubNotes: scrubNotes };
  })(App);
