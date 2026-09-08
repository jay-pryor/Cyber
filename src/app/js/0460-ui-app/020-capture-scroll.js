    function captureScroll() {
      var snap = { main: 0, mainLeft: 0, inner: [], anchor: null, anchorTop: 0, anchorLeft: 0 };
      var main = document.getElementById('main');
      // SP-7: BOTH offsets. .main scrolls sideways as well as down — the tools rail
      // narrows the room a wide register has, so reaching the right-hand columns (Status,
      // and the ✓ Apply tick column itself) means scrolling right. Restoring only the
      // vertical offset snapped the view back to the left-hand edge on every edit, which
      // is exactly the "it took me back to where I was not" complaint: you scroll right
      // to set an action, and the act of setting it throws the column away.
      if (main) { snap.main = main.scrollTop; snap.mainLeft = main.scrollLeft; }
      if (_root) SCROLL_KEEP.forEach(function (sel) {
        var el = _root.querySelector(sel);
        if (el && el.scrollTop) snap.inner.push([sel, el.scrollTop]);
      });
      // Anchor on whatever currently has focus inside the scroll region — for a click on
      // a checkbox (or its label) that is the checkbox itself.
      try {
        var act = document.activeElement;
        if (main && act && act !== document.body && main.contains(act)) {
          var sel2 = anchorSelector(act);
          if (sel2 && main.querySelectorAll(sel2).length === 1) {
            var r0 = act.getBoundingClientRect();
            snap.anchor = sel2;
            snap.anchorTop = r0.top;
            snap.anchorLeft = r0.left;
          }
        }
      } catch (e) { /* anchoring is best-effort; never let it break a render */ }
      return snap;
    }

    function restoreScroll(snap) {
      if (!snap) return;
      var main = document.getElementById('main');
      if (main && (snap.main || snap.mainLeft)) {
        // Measure before writing. After a full render() this #main is a brand-new element
        // whose content has not been laid out yet, and an offset written to a scroller
        // that does not yet know how big its content is can be clamped away. The read
        // costs one layout — which the anchor step below forces anyway.
        void main.scrollHeight;
        if (snap.main) main.scrollTop = snap.main;
        if (snap.mainLeft) main.scrollLeft = snap.mainLeft;   // SP-7
      }
      if (_root) snap.inner.forEach(function (pair) {
        var el = _root.querySelector(pair[0]);
        if (el) el.scrollTop = pair[1];
      });
      // STAB-2: if the anchor moved, the content around it grew or shrank — shift the
      // scroll by the same amount so the thing under the cursor stays under the cursor.
      if (main && snap.anchor) {
        try {
          var again = main.querySelector(snap.anchor);
          if (again) {
            var r1 = again.getBoundingClientRect();
            var delta = r1.top - snap.anchorTop;
            if (delta) main.scrollTop = main.scrollTop + delta;
            // SP-7: the same correction sideways — a column that changes width (the tick
            // column's heading grows a count) would otherwise slide the row under you.
            var dx = r1.left - snap.anchorLeft;
            if (dx) main.scrollLeft = main.scrollLeft + dx;
          }
        } catch (e) { /* best-effort */ }
      }
    }

    // ---- top-level render ----
    function render() {
      if (!_root) return;
      var scroll = captureScroll();
      _root.innerHTML = renderShell() + renderSaveModal() + (App.ui.views.formats ? App.ui.views.formats.render() : '');
      renderMain(scroll);
      renderDrawer();
      updateThemeButton(); // reflect current theme on the freshly-rendered toggle
      if (_state.saveModal) { var n = _root.querySelector('[data-save-name]'); if (n) { n.focus(); n.select(); } }
    }

    /** review-9 #5: a small modal to name the project file before it downloads. */
    function renderSaveModal() {
      if (!_state.saveModal) return '';
      return '<div class="modal-overlay" data-save-modal>' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Save project" style="max-width:440px">' +
          '<div class="modal-head"><h3>Save project</h3><button type="button" class="modal-close" data-save-cancel aria-label="Close">×</button></div>' +
          '<div class="modal-body">' +
            '<label style="display:block;font-size:13px;margin-bottom:6px" for="">File name</label>' +
            '<div style="display:flex;gap:6px;align-items:center">' +
              '<input type="text" data-save-name value="' + esc(_state.saveName || 'ch-project') + '" class="save-name-input" aria-label="Project file name">' +
              '<span class="muted">.json</span>' +
            '</div>' +
            '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
              '<button data-save-cancel>Cancel</button>' +
              '<button class="primary" data-save-confirm>Confirm &amp; save</button>' +
            '</div>' +
          '</div>' +
        '</div></div>';
    }

    function renderShell() {
      var project = App.store.getProject();
      var platforms = App.registry.listPlatforms();
      var dirty = App.store.isDirty();
      var projName = project ? (project.platformProfileId + ' project') : 'No project';

      var platformOpts = platforms.map(function (pl) {
        return '<option value="' + esc(pl.id) + '"' + (App.registry.getActivePlatform() && App.registry.getActivePlatform().id === pl.id ? ' selected' : '') + '>' + esc(pl.label) + '</option>';
      }).join('');

      function tabBtn(id, label, badge) {
        var active = _state.activeTab === id;
        return '<button role="tab" aria-selected="' + active + '" data-tab="' + esc(id) + '"' + (active ? ' class="active"' : '') + '>' +
          esc(label) + (badge ? '<span class="count-badge">' + badge + '</span>' : '') + '</button>';
      }
      // review-17 #1: tab order follows the workflow — capture (Onboard), decide
      // (the data tabs, in dataset order), then review/emit (Devices, Control
      // Manager, Generate), with Help last.
      var tabs = tabBtn('onboard', 'Onboard');
      if (project) {
        activeDatasets().forEach(function (ds) { tabs += tabBtn(ds.id, ds.label, App.ui.model.countIncomplete(project, ds.id)); });
        tabs += tabBtn('devices', 'Devices');
        tabs += tabBtn('controls', 'Control Manager');
        tabs += tabBtn('generate', 'Generate');
      }
      tabs += tabBtn('help', 'Help');

      // TF.6: the gate. IDLE/UNSUPPORTED deliberately do NOT lock — the tool has always
      // worked standalone. See App.ui.folder's INVARIANTS.
      var locked = App.ui.folder && App.ui.folder.locked();
      var shellCls = (dirty ? 'dirty' : '') + (locked ? ' folder-locked' : '');

      return '' +
        '<div id="app-root" class="' + shellCls.trim() + '">' +
        '<header class="topbar">' +
          '<span class="brand-logo" role="img" aria-label="HighCom logo"></span>' +
          '<span class="title">CH Config Tool</span>' +
          '<span class="dirty-dot" title="Unsaved changes" aria-hidden="true"></span>' +
          '<span class="muted">' + esc(projName) + (dirty ? ' — unsaved' : '') + '</span>' +
          (App.ui.folder ? App.ui.folder.chipHtml() : '') +
          '<span class="spacer"></span>' +
          '<button data-action="folder-save-now"' + (App.ui.folder && App.ui.folder.canWrite() ? '' : ' disabled') +
            ' title="Write to the connected folder now, and restart the save timer">Save to folder</button>' +
          '<button data-action="folder-snapshots"' + (App.ui.folder && App.ui.folder.canWrite() ? '' : ' disabled') + '>Roll back</button>' +
          '<button data-action="load">Load project</button>' +
          '<button data-action="save"' + (project ? '' : ' disabled') +
            ' title="Download a copy of the project as a .json file">Save project</button>' +
          '<button data-action="export-csv"' + (project ? '' : ' disabled') + '>Export CSV</button>' +
          '<label class="platform">Platform <select data-action="platform" aria-label="Active platform">' + platformOpts + '</select></label>' +
          '<button data-action="toggle-theme" aria-pressed="false" title="Toggle dark mode">🌙 Dark</button>' +
          '<a href="#selftest" target="_blank" rel="noopener">Self-tests</a>' +
          '<input type="file" id="file-load" class="visually-hidden" aria-hidden="true">' +
        '</header>' +
        '<nav class="tabnav" role="tablist" aria-label="Primary">' + tabs + '</nav>' +
        (App.ui.folder ? App.ui.folder.bannerHtml() : '') +
        renderRestoreBanner() +
        '<main class="main" id="main" role="main" tabindex="-1"></main>' +
        renderDrawerShell() +
        '</div>';
    }

    /** Offer to restore a local draft autosave if one exists and hasn't been dismissed. */
    /** Format a UTC ISO timestamp as AEST for display (review-2 #1) — delegates to the
     *  pure util.clock.toAest (review-9 #3 unified the two copies). */
    function toAest(iso) { return App.util.clock.toAest(iso); }

    /**
     * Decide the Apply-to-action toggle (review-9 #1): the items whose decision has the
     * chosen action, and whether we should REMOVE the control (all of them already have
     * it) or ADD it (to those still missing it).
     * @returns {{matching:RegisterItem[], removing:boolean}}
     */
    function applyToTogglePlan(items, field, action, controlId) {
      var matching = items.filter(function (it) { return it.decision && it.decision[field] === action; });
      var have = matching.filter(function (it) { return (it.controlRefs || []).indexOf(controlId) !== -1; }).length;
      return { matching: matching, removing: matching.length > 0 && have === matching.length };
    }

    function renderRestoreBanner() {
      if (_state.draftDismissed) return '';
      var d = loadDraft();
      if (!d) return '';
      return '<div class="restore-banner" role="region" aria-label="Draft autosave">' +
        '<span>A local <strong>draft autosave</strong> from ' + esc(toAest(d.savedUtc)) + ' was found (non-canonical crash insurance).</span>' +
        '<span class="spacer"></span>' +
        '<button data-action="restore-draft">Restore draft</button>' +
        '<button data-action="discard-draft">Discard</button>' +
        '</div>';
    }

    function renderDrawerShell() {
      return '' +
        '<div class="drawer ' + (_state.drawerCollapsed ? 'collapsed' : '') + '" id="drawer">' +
        '<div class="drawer-head">' +
          '<span class="title">Activity / Errors</span>' +
          '<button data-action="toggle-drawer">' + (_state.drawerCollapsed ? 'Show' : 'Hide') + '</button>' +
          '<button data-action="clear-drawer">Clear</button>' +
        '</div>' +
        '<div class="log" id="drawer-log"></div>' +
        '</div>';
    }

    var _lastRenderedTab = null;
    /** @param {Object} [scroll] a captureScroll() snapshot to restore after rendering. */
    function renderMain(scroll) {
      var main = document.getElementById('main');
      if (!main) return;
      // Called directly (not via render()) for most in-tab updates, so it takes its own
      // snapshot unless the caller already has one.
      var snap = scroll || captureScroll();
      var before = _lastRenderedTab;
      try { return renderMainInner(main); }
      finally {
        // Preserve the scroll offset only WITHIN a tab. Changing tab should land you at
        // the top of the new one, not at whatever row number you happened to be on.
        if (_lastRenderedTab === before) restoreScroll(snap);
        else if (main) main.scrollTop = 0;
      }
    }
    function renderMainInner(main) {
      var project = App.store.getProject();
      if (!_state.activeTab) _state.activeTab = project ? defaultTab() : 'onboard';
      var tab = _state.activeTab;
      _lastRenderedTab = tab;

      // View tabs (onboard/devices/generate) render with OR without a project.
      if (App.ui.views && App.ui.views[tab]) {
        main.innerHTML = App.ui.views[tab].render(project);
        if (App.ui.views[tab].afterRender) App.ui.views[tab].afterRender(project);
        return;
      }
      if (!project) {
        main.innerHTML = '<div class="empty-state"><h2>No project loaded</h2>' +
          '<p>Load a project file, or go to <strong>Onboard</strong> to create a device configuration.</p></div>';
        return;
      }
      var ds = activeDatasets().filter(function (d) { return d.id === tab; })[0];
      if (ds) {
        var ui = uiFor(tab);
        var total = (project.items[tab] || []).length;
        var shown = App.ui.model.filterSortRows(project, tab, ds, ui).length;
        // COL-1: the adapter goes in so the toolbar can render the column picker — the
        // columns are the dataset's, so the picker cannot be built without it.
        // DEV-1: the project goes in as well, so the rail can list the devices an item
        // may be assigned to (and say which of them carry this register at all).
        main.innerHTML = App.ui.tables.renderToolbar(tab, ui, total, shown, project.controls, undoInfo(tab), ds, project);
        renderTableHost();
      } else {
        main.innerHTML = '<div class="empty-state">The <strong>' + esc(tab) + '</strong> view is not available yet.</div>';
      }
    }

    function renderTableHost() {
      var host = document.getElementById('table-host');
      if (!host) return;
      var project = App.store.getProject();
      host.innerHTML = App.ui.tables.renderTableHtml(project, _state.activeTab, uiFor(_state.activeTab), { issues: _editIssues });
    }

    function renderDrawer() {
      var logEl = document.getElementById('drawer-log');
      if (!logEl) return;
      var entries = App.ui.activity.list();
      logEl.innerHTML = entries.map(function (e) {
        // Show the time portion in AEST (review-2 #1, extended to the drawer).
        return '<div class="entry ' + esc(e.severity) + '">' + esc(toAest(e.ts).slice(11, 19)) + '  ' + esc(e.message) + '</div>';
      }).join('') || '<div class="muted">No activity yet.</div>';
      logEl.scrollTop = logEl.scrollHeight;
    }

