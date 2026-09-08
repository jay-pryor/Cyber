  /* =============================================================================
   * MODULE: App.ui.app
   * PURPOSE: The UI shell + controller (spec §11.1). Builds the top bar, the
   *          data-driven tab nav (one tab per active-platform dataset + Devices/
   *          Onboard/Generate), the main view, and the Activity drawer. Manages UI
   *          state, wires events, and re-renders on store/activity changes.
   * PURITY:  UI/DOM (the only place, with util.dom, that touches the DOM).
   * DEPENDS: App.registry, App.store, App.projectIo, App.util.*, App.ui.*
   * INVARIANTS: search input is never re-rendered on keystroke; only #table-host is.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var dom = App.util.dom, esc = App.util.html.esc;

    var TOOL_VERSION = '1.0';
    var _root = null;
    var _state = { activeTab: null, ui: {}, drawerCollapsed: false, draftDismissed: false, saveModal: false, saveName: 'ch-project', draft: null };
    var DRAFT_KEY = 'ch-config-draft-v1';
    var THEME_KEY = 'ch-config-theme';
    var _draftTimer = null;

    // ---- Dark-mode theme (spec §18.1). UI-only: sets a data-theme attribute on
    // <html>; the palette swap is pure CSS. Never read by engine/generators. ----
    /** @param {string} cur @returns {'light'|'dark'} the opposite theme */
    function nextTheme(cur) { return cur === 'dark' ? 'light' : 'dark'; }
    function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    function applyTheme(t) { document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); }
    function loadThemePref() { try { return window.localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
    function saveThemePref(t) { try { window.localStorage.setItem(THEME_KEY, t); } catch (e) {} }
    function initialTheme() {
      var stored = loadThemePref();
      if (stored === 'dark' || stored === 'light') return stored;
      try { if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'; } catch (e) {}
      return 'light';
    }
    function toggleTheme() { var t = nextTheme(currentTheme()); applyTheme(t); saveThemePref(t); updateThemeButton(); }
    function updateThemeButton() {
      var btn = _root && _root.querySelector('[data-action="toggle-theme"]');
      if (!btn) return;
      var dark = currentTheme() === 'dark';
      btn.setAttribute('aria-pressed', String(dark));
      btn.textContent = dark ? '☀ Light' : '🌙 Dark';
    }
    var _searchTimer = null;
    var _editIssues = {}; // transient decision-validation issues, keyed "dsId|key"
    var _suppressRender = false; // review-7 #2: skip the full re-render during bulk control-apply clicks
    var _colResizing = false;     // true mid-drag, to suppress the trailing sort click
    var MIN_COL_WIDTH_PX = 60;    // minimum column width (review-2 #4)

    function activeDatasets() {
      var p = App.registry.getActivePlatform();
      return p ? p.datasets : [];
    }
    function uiFor(dsId) {
      if (!_state.ui[dsId]) _state.ui[dsId] = { search: '', sortKey: 'key', sortDir: 'asc', incompleteOnly: false, deleteMode: false, deleteSel: {}, includeRelevance: [],
        // BULK-4: the two "set a value on many rows" modes and their picked value.
        relevanceMode: false, relevanceValue: null, decisionMode: false, decisionValue: null,
        // CTLSORT-1: how the rail's control list is ordered, and which tag narrows it.
        railSort: 'az', railTag: '',
        // COL-2: Security Relevance and Diverges start hidden — occasional columns that
        // cost width on every row. One tick in the Columns bar brings either back.
        hiddenCols: App.ui.tables.defaultHiddenCols() };
      return _state.ui[dsId];
    }

    // ---- UNDO-1 (was review-12 #2 / review-13 #2,#3): undo + redo for a data tab ----
    // Every edit a data tab can make is undoable, not just the two bulk modes. Undo used
    // to cover Delete Mode and Apply Control Mode only, which made it a specialist tool:
    // set a decision to `remove` by hand — the commonest edit in the tool — and there was
    // nothing to press. So each mutating handler now runs inside withUndo(), which takes
    // a pre-change dataset snapshot. Stacks are per dataset (the buttons live in that
    // dataset's toolbar) and session-only: nothing is written to the project file, so
    // both buttons start greyed out on every launch.
    //
    // A snapshot is of the WHOLE dataset, so "one action" is whatever the handler chose
    // to wrap, however many items it touched: applying a control to ten shown rows is one
    // entry, and one Undo takes all ten back.
    //
    // review-13 #2: an Apply-Control-Mode RUN is ONE undoable action. Ticking three rows
    // is one user action in three clicks, so consecutive ticks fold into a single OPEN
    // entry (its snapshot is still the state before the first tick). The run is closed
    // by anything that ends it: leaving the mode, changing the selected control, an
    // apply-to-action command, any other edit, an undo/redo, a tab switch, or a load.
    var _undo = {};      // dsId -> [{label, snap, count}]  (most recent last)
    var _redo = {};      // dsId -> [{label, snap}]         (cleared by any new action)
    var _openRun = null; // {dsId, runKey, entry} — the tick run currently being folded
                         // (DEV-1: runKey identifies WHAT is being ticked — 'ctl:<id>' for
                         // an Apply Control run, 'dev:<id>' for an Assign to Device run —
                         // so ticks fold only into a run of the same thing.)
    var UNDO_LIMIT = 20; // bound the memory held by snapshots of large item arrays

    /** Snapshot dsId BEFORE a change. @param {string} label human description */
    function pushUndo(dsId, label) {
      var snap = App.store.datasetSnapshot(dsId);
      if (!snap) return null;
      var stack = (_undo[dsId] = _undo[dsId] || []);
      var entry = { label: label, snap: snap, count: 1 };
      stack.push(entry);
      if (stack.length > UNDO_LIMIT) stack.shift();
      _redo[dsId] = []; // a new action invalidates the redo branch (standard undo model)
      return entry;
    }
    /** Drop the most recent entry (used when the change it guarded did not happen). */
    function dropUndo(dsId) { if (_undo[dsId]) _undo[dsId].pop(); }
    /** Discard every snapshot — MUST be called whenever the loaded project is replaced. */
    function resetUndo() { _undo = {}; _redo = {}; _openRun = null; }
    /** End the current apply-run so the next tick starts a new undo entry. */
    function closeRun() { _openRun = null; }

    /**
     * Fold one Apply-Control-Mode tick into the current run (review-13 #2), starting a
     * new run when there is none for this dataset+control.
     * @returns {void}
     */
    function noteApplyTick(dsId, controlId, controlTitle) {
      noteTickRun(dsId, 'ctl:' + controlId, function (n) {
        return 'application of control "' + controlTitle + '" to ' + n + ' item' + (n === 1 ? '' : 's');
      });
    }
    /**
     * DEV-1: the same folding for a run of device-assignment ticks. Ticking six rows onto
     * one device is one user action in six clicks, so it is one Undo — and switching to a
     * different device (a different runKey) starts a new one.
     */
    function noteDeviceTick(dsId, deviceId, deviceName) {
      noteTickRun(dsId, 'dev:' + deviceId, function (n) {
        return 'device assignment of ' + n + ' item' + (n === 1 ? '' : 's') + ' to "' + deviceName + '"';
      });
    }
    /** Fold one tick into the open run for `runKey`, or start a new run. */
    function noteTickRun(dsId, runKey, label) {
      if (_openRun && _openRun.dsId === dsId && _openRun.runKey === runKey) {
        _openRun.entry.count++;
        _openRun.entry.label = label(_openRun.entry.count);
        return;
      }
      var entry = pushUndo(dsId, label(1));
      _openRun = entry ? { dsId: dsId, runKey: runKey, entry: entry, label: label } : null;
    }
    /**
     * Take back the tick just noted, because the change it was guarding did not happen.
     * A folded tick is decremented rather than dropped — dropping would discard the whole
     * run, which is somebody else's five successful ticks.
     */
    function unnoteTickRun() {
      if (!_openRun) return;
      var run = _openRun;
      if (run.entry.count > 1) {
        run.entry.count--;
        run.entry.label = run.label(run.entry.count);
      } else {
        dropUndo(run.dsId);
        _openRun = null;
      }
    }

    /**
     * UNDO-1: run one mutating table action as a single undoable step.
     *
     * The snapshot is taken before `fn` runs and thrown away again if `fn` left the
     * dataset byte-identical — a rejected rename, a re-picked enum, a blur that committed
     * the value already there. An Undo click that visibly does nothing is worse than a
     * greyed-out button, so those never reach the stack. Dropping also restores the redo
     * branch that pushUndo cleared, since a no-op is not a new action.
     *
     * COST: two dataset clones + two stringifies per edit — measured at ~6ms on top of an
     * ~8ms commit for a 1500-package dataset, and ~6MB for a full 20-deep history. Both
     * are well inside what a click can absorb, which is why the check is unconditional.
     * @param {string} dsId
     * @param {string} label noun phrase for the tooltip/log, e.g. 'decision change on "x"'
     * @param {Function} fn performs the mutation
     * @returns {*} whatever fn returned
     */
    function withUndo(dsId, label, fn) {
      closeRun();                     // an explicit edit ends any open Apply-Control run
      var redoWas = (_redo[dsId] || []).slice();
      var entry = pushUndo(dsId, label);
      var before = entry ? JSON.stringify(entry.snap) : null;
      try {
        return fn();
      } finally {
        if (entry && JSON.stringify(App.store.datasetSnapshot(dsId)) === before) {
          dropUndo(dsId);
          _redo[dsId] = redoWas;
        }
      }
    }
    /** Label fragment naming the row an action touched. */
    function onRow(key) { return ' on "' + key + '"'; }
    /** `divergenceNarrative` -> `divergence narrative`, for readable undo labels. */
    function fieldLabel(f) { return String(f).replace(/([A-Z])/g, ' $1').toLowerCase(); }

    /** @returns {{canUndo:boolean, label:string, canRedo:boolean, redoLabel:string}} */
    function undoInfo(dsId) {
      var u = _undo[dsId] || [], r = _redo[dsId] || [];
      return {
        canUndo: u.length > 0, label: u.length ? u[u.length - 1].label : '',
        canRedo: r.length > 0, redoLabel: r.length ? r[r.length - 1].label : ''
      };
    }
    // Tooltip text is owned by App.ui.tables (which renders the buttons).
    function undoTitle(label) { return App.ui.tables.undoTitle(label); }
    function redoTitle(label) { return App.ui.tables.redoTitle(label); }

    /** Re-sync the Undo/Redo buttons in place (no full re-render, so scroll is kept). */
    function refreshUndoButton(dsId) {
      var info = undoInfo(dsId);
      function sync(sel, on, title, offTitle) {
        var btn = _root && _root.querySelector(sel);
        if (!btn) return;
        if (on) { btn.removeAttribute('disabled'); btn.setAttribute('title', title); }
        else { btn.setAttribute('disabled', 'disabled'); btn.setAttribute('title', offTitle); }
      }
      sync('[data-undo="' + dsId + '"]', info.canUndo, undoTitle(info.label), App.ui.tables.UNDO_OFF_TITLE);
      sync('[data-redo="' + dsId + '"]', info.canRedo, redoTitle(info.redoLabel), App.ui.tables.REDO_OFF_TITLE);
    }

    /**
     * BULK-3: re-sync the ✓ Apply heading in place. A row tick suppresses the full
     * re-render (that is what keeps the page still), but the heading counts exactly what
     * those ticks change — leave it alone and it goes on offering "✓ Apply all 3" after
     * you have ticked all three by hand, while the click would actually REMOVE.
     * Only the one <th> is replaced, so nothing above the pointer moves.
     */
    function refreshApplyHead(dsId) {
      var host = document.getElementById('table-host');
      var th = host && host.querySelector('th.apply-col');
      if (!th) return;
      var project = App.store.getProject(); if (!project) return;
      var adapter = App.registry.getDataset(project.platformProfileId, dsId); if (!adapter) return;
      var ui = uiFor(dsId);
      var shown = App.ui.model.filterSortRows(project, dsId, adapter, ui).length;
      th.innerHTML = App.ui.tables.applyHeadButton(project, dsId, ui, shown);
    }

    /** DEV-1: the device column's heading, re-synced in place for the same reason. */
    function refreshAssignHead(dsId) {
      var host = document.getElementById('table-host');
      var th = host && host.querySelector('th.dev-col');
      if (!th) return;
      var project = App.store.getProject(); if (!project) return;
      var adapter = App.registry.getDataset(project.platformProfileId, dsId); if (!adapter) return;
      var ui = uiFor(dsId);
      var shown = App.ui.model.filterSortRows(project, dsId, adapter, ui).length;
      th.innerHTML = App.ui.tables.assignHeadButton(project, dsId, ui, shown);
    }

    /**
     * DEV-1: repaint the "Applies to" cells after a device assignment. That column is the
     * readable form of exactly what the tick just changed, and the tick suppresses the
     * full re-render to keep the page still (STAB-3) — so without this the box says one
     * thing and the cell beside it says another.
     * @param {string} dsId @param {string[]} [keys] rows to repaint (default: all shown)
     */
    function refreshAppliesCells(dsId, keys) {
      var host = document.getElementById('table-host'); if (!host) return;
      if (!host.querySelector('[data-applies-cell]')) return;   // the column is hidden
      var project = App.store.getProject(); if (!project) return;
      var map = App.ui.model.computeAppliesTo(project, dsId);
      var wanted = keys && keys.length ? keys : null;
      var cells = host.querySelectorAll('[data-applies-cell]');
      for (var i = 0; i < cells.length; i++) {
        var key = cells[i].getAttribute('data-applies-cell');
        if (wanted && wanted.indexOf(key) === -1) continue;
        var text = (map[key] || []).join(', ');
        // Rebuilt through the same clamped-span markup the renderer uses, so the row
        // height stays put (STAB-1) and the hover text still carries the full list.
        var span = cells[i].firstChild;
        if (span && span.className === 'cell-clamp') {
          span.textContent = text;
          if (text) span.setAttribute('title', text); else span.removeAttribute('title');
        }
      }
    }

    /**
     * COL-1: hide one column — and drop any filter it was carrying. FIL-1's promise is
     * that the table is never mysteriously short: a filter whose dropdown has just been
     * hidden is exactly that, since the only remaining way to see it is the toolbar's
     * count. Hiding the column therefore un-filters it rather than leaving a filter
     * running behind a column you can no longer look at.
     * @param {Object} ui per-dataset UI state @param {string} col
     */
    function hideColumn(ui, col) {
      ui.hiddenCols = ui.hiddenCols || {};
      ui.hiddenCols[col] = true;
      if (ui.colFilters && ui.colFilters[col]) delete ui.colFilters[col];
    }

    /** COL-1: re-sync "N of M shown" in the column bar, without rebuilding the bar. */
    function refreshColumnCount(dsId) {
      var el = _root && _root.querySelector('.col-visbar .col-vis-count');
      if (!el) return;
      var project = App.store.getProject(); if (!project) return;
      var adapter = App.registry.getDataset(project.platformProfileId, dsId); if (!adapter) return;
      var all = App.ui.tables.allColumns(adapter).length;
      var shown = App.ui.tables.visibleColumns(adapter, uiFor(dsId)).length;
      el.textContent = shown + ' of ' + all + ' shown — hiding a column also clears its filter.';
    }

    /**
     * DIV-3: repaint one row's OPEN expander in place. Ticking the Diverges column has to
     * make the Divergence Narrative box appear (or go), and re-rendering the table to do
     * it would replace the checkbox under the pointer — the exact failure STAB-3 exists to
     * avoid. If the row is not expanded there is nothing on screen to change.
     * @param {string} dsId @param {string} key
     */
    function refreshDetailRow(dsId, key) {
      var host = document.getElementById('table-host'); if (!host) return;
      var project = App.store.getProject(); if (!project) return;
      var rows = host.querySelectorAll('tr.detail-row'), row = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-detail-key') === key) { row = rows[i]; break; }
      }
      if (!row) return; // the row is collapsed — nothing is showing
      var html = App.ui.tables.detailRowHtml(project, dsId, key, uiFor(dsId), { issues: _editIssues });
      if (!html) return;
      var holder = document.createElement('tbody');
      holder.innerHTML = html;
      if (holder.firstChild) row.parentNode.replaceChild(holder.firstChild, row);
    }

    /**
     * Move the top entry from one stack to the other, swapping in the current state so
     * the move is reversible (undo ⇄ redo). @returns {boolean} whether it happened
     */
    function stepHistory(dsId, from, to, verb) {
      var stack = from[dsId] || [];
      if (!stack.length) return false;
      var entry = stack[stack.length - 1];
      var current = App.store.datasetSnapshot(dsId);
      var res = App.store.restoreDatasetSnapshot(entry.snap);
      if (!res.ok) { App.ui.activity.logIssues(res.issues, verb); return false; }
      stack.pop();
      (to[dsId] = to[dsId] || []).push({ label: entry.label, snap: current, count: entry.count });
      closeRun(); // history moved: the next tick must start its own entry
      App.ui.activity.log({ severity: 'success', message: verb + ' the ' + entry.label + '.' });
      return true;
    }
    function defaultTab() {
      var ds = activeDatasets();
      return ds.length ? ds[0].id : 'devices';
    }

    // ---- scroll preservation (SP-4) --------------------------------------------
    // Now that `.main` is the scroll region rather than the page, replacing its
    // innerHTML resets scrollTop to 0. Several everyday actions re-render (picking a
    // control in the rail, ticking an Apply checkbox, editing a decision), and a jump
    // to row 1 on each of those would be exactly the problem the rail exists to solve.
    // So snapshot the scroll offsets of the containers that survive a render — the main
    // area and the rail's own control list — and restore them afterwards.
    var SCROLL_KEEP = ['.ctl-cards', '.fmt-list', '.ctl-opts'];

    /**
     * STAB-2: a re-queryable selector for the element the user is interacting with, built
     * from its own data-* attributes. Used as a SCROLL ANCHOR: restoring `scrollTop`
     * alone is not enough, because a render can legitimately change the height of content
     * ABOVE the viewport (ticking a box adds a name to a neighbouring cell, that cell
     * wraps, its row grows). The scroll offset is then still "correct" while everything
     * on screen has slid — which reads as the page jumping under you.
     * @param {Element} el @returns {string|null}
     */
    function anchorSelector(el) {
      if (!el || el.nodeType !== 1 || !el.attributes) return null;
      var parts = [], tag = el.tagName ? el.tagName.toLowerCase() : '';
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (a.name.indexOf('data-') !== 0) continue;
        // Skip volatile attributes; keep the identifying ones (ds/key/id/baseid/field…).
        if (a.value === '') { parts.push('[' + a.name + ']'); continue; }
        parts.push('[' + a.name + '="' + String(a.value).replace(/"/g, '\\"') + '"]');
      }
      return parts.length ? tag + parts.join('') : null;
    }

