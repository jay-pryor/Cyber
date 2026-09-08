    /**
     * CUS-2: commit the add bar. A new action lands UNDECIDED with its row expanded, so
     * the next thing on screen is the boxes that still have to be filled in — creating
     * the row is the start of the job, not the end of it.
     * @param {string} dsId
     */
    function addItemFromBar(dsId) {
      var ui = uiFor(dsId);
      var res = withUndo(dsId, 'addition of "' + (ui.addKey || '') + '"', function () {
        return App.store.addItem(dsId, ui.addKey || '');
      });
      if (!res.ok) {
        ui.addError = (res.issues[0] && res.issues[0].message) || 'Could not add the item.';
        App.ui.activity.logIssues(res.issues, 'Add item');
        renderMain();
        return;
      }
      ui.addKey = ''; ui.addError = null;
      ui.expanded = ui.expanded || {};
      ui.expanded[res.key] = true;
      // REL-8: nothing to stand down here any more. The relevance toggles only ADD parked
      // categories to the view, so a freshly created (untagged) row can no longer be
      // filed out of sight by one the instant it is created.
      App.ui.activity.logIssues(res.issues);
      renderMain();
      var box = _root && _root.querySelector('[data-add-item-key="' + dsId + '"]');
      if (box) box.focus();
    }

    function updateShownCount() {
      var project = App.store.getProject(); if (!project) return;
      var ds = activeDatasets().filter(function (d) { return d.id === _state.activeTab; })[0];
      if (!ds) return;
      var shownEl = _root.querySelector('.toolbar .muted');
      if (shownEl) {
        var total = (project.items[_state.activeTab] || []).length;
        var shown = App.ui.model.filterSortRows(project, _state.activeTab, ds, uiFor(_state.activeTab)).length;
        shownEl.textContent = shown + ' of ' + total + ' shown';
      }
    }

    /** Coerce an editor string to a typed JS value (for value-typed decisions). */
    function coerce(str, type) {
      if (type === 'bool') { var l = String(str).trim().toLowerCase(); if (l === 'true' || l === '1') return true; if (l === 'false' || l === '0') return false; return str; }
      if (type === 'int') { var n = parseInt(str, 10); return isNaN(n) ? str : n; }
      if (type === 'float') { var f = parseFloat(str); return isNaN(f) ? str : f; }
      if (type === 'json' || type === 'array') { try { return JSON.parse(str); } catch (e) { return str; } }
      if (type === 'null') { return String(str).trim() === 'null' ? null : String(str); }
      return String(str); // 'string'
    }

    /**
     * Assemble a decision object from a cell's raw control readings, or null for
     * "undecided". Split out of commitDecisionFromCell so the empty-value rule below
     * is directly testable (App.ui.app._decisionFromRaw).
     * @param {Object} adapter
     * @param {Object<string,{v:*,kind:string,vtype?:string}>} raw  Keyed by field name.
     * @returns {Object|null}
     */
    function decisionFromRaw(adapter, raw) {
      // An empty ENUM primary => undecided (that is what its "—" option means).
      // review-16 #1: a TEXT primary (e.g. a tactical leaf) no longer does this.
      // Emptying the box is a real decision — "set this key to blank", e.g. clearing a
      // comma-separated list — and used to bounce straight back to the captured value
      // because the commit was read as "undecided". The cell's "clear" button is now the
      // only way to return a text-valued item to undecided.
      var primary = adapter.decisionSchema[0].name, pr = raw[primary];
      if (pr && pr.kind === 'enum' && pr.v === '') return null;
      // VF-8: when the editor carries a format kind, the value is read back through
      // App.valueFormats.parseInput — the exact inverse of what rendered it. That is
      // also where "what does an empty box mean?" is answered per kind: '' for text
      // (review-16 #1), [] for a string list, and UNDECIDED for bool/number/options,
      // which have nothing sensible for empty to mean.
      if (pr && pr.fmtKind && App.valueFormats) {
        var pfmt = { kind: pr.fmtKind };
        var parsed = App.valueFormats.parseInput(pfmt, pr.v);
        if (parsed.undecided) return null;
      }
      var decision = {};
      Object.keys(raw).forEach(function (f) {
        var c = raw[f];
        if (c.kind === 'enum') { if (c.v !== '') decision[f] = c.v; }
        else if (c.kind === 'bool') decision[f] = !!c.v;
        else if (c.fmtKind && App.valueFormats) {
          // Format-driven read-back. An unparseable value (e.g. "abc" in a number box)
          // is still stored verbatim so the operator sees what they typed and gets a
          // located reason, rather than having their keystrokes silently discarded.
          var r = App.valueFormats.parseInput({ kind: c.fmtKind }, c.v);
          decision[f] = r.ok ? r.value : c.v;
        }
        else if (c.kind === 'string') decision[f] = c.v;
        // value-typed with no format hint: coerce by the captured leaf type — review-3 #2.
        else if (c.kind === 'value-typed') decision[f] = coerce(c.v, c.vtype || 'string');
      });
      return decision;
    }

    /**
     * Read every decision control in a cell, assemble the decision object and commit it.
     */
    function commitDecisionFromCell(cell) {
      var project = App.store.getProject(); if (!project) return;
      var dsId = cell.getAttribute('data-ds'), key = cell.getAttribute('data-key');
      var adapter = App.registry.getDataset(project.platformProfileId, dsId);
      var controls = cell.querySelectorAll('[data-decision]');
      var raw = {};
      Array.prototype.forEach.call(controls, function (c) {
        raw[c.getAttribute('data-field')] = {
          v: (c.type === 'checkbox' ? c.checked : c.value),
          kind: c.getAttribute('data-kind'),
          vtype: c.getAttribute('data-vtype'),
          fmtKind: c.getAttribute('data-fmt-kind')   // VF-8
        };
      });
      var decision = decisionFromRaw(adapter, raw);
      // UNDO-1: one committed cell is one undoable step, whether it recorded a value or
      // took the row back to undecided.
      var res = withUndo(dsId, 'decision change' + onRow(key), function () {
        return App.store.setDecision(dsId, key, decision);
      });
      _editIssues[dsId + '|' + key] = (decision === null) ? [] : (res.issues || []);
      // Reflect inline validation issues (store.onChange already re-rendered the shell),
      // then re-sync Undo — renderTableHost() does not rebuild the toolbar it lives in.
      renderTableHost(); refreshUndoButton(dsId);
    }

    /**
     * review-17 #3, amended by HELD-1: flip one item's decided/undecided state from its
     * Status badge — WITHOUT destroying the value.
     *  - decided -> undecided: **hold** the item. The recorded value stays exactly where
     *    it is; the item simply stops counting as complete, so it reads as undecided and
     *    keeps the device un-ready until it is reviewed. This is the whole point: you can
     *    record an answer and still be forced back to it. (Previously this cleared the
     *    decision, which threw the answer away — use the cell's "clear" button for that.)
     *  - held -> decided: release the hold. The value was never touched, so it is simply
     *    in force again.
     *  - never-decided -> decided: adopt what the row's value editor already shows. For
     *    a text primary (Tactical) that is the CAPTURED value (the box is prefilled with
     *    it), so one click means "the captured value is my decision". For an enum primary
     *    with no selection (Packages) there is nothing to adopt, so the FIRST schema
     *    option is used — for packages that is `keep`, the no-change action.
     * @param {Element} el the badge that was activated
     */
    function toggleStatus(el) {
      var project = App.store.getProject(); if (!project) return;
      var dsId = el.getAttribute('data-ds'), key = el.getAttribute('data-key');
      var item = (project.items[dsId] || []).filter(function (it) { return it.key === key; })[0];
      if (!item) return;
      if (item.held) {                       // held -> decided: just release it
        withUndo(dsId, 'release of the review hold' + onRow(key), function () {
          App.store.setHeld(dsId, key, false);
        });
        renderTableHost(); refreshUndoButton(dsId);
        return;
      }
      if (item.status === 'decided') {       // decided -> held (value retained)
        var res0 = withUndo(dsId, 'review hold' + onRow(key), function () {
          return App.store.setHeld(dsId, key, true);
        });
        if (!res0.ok) App.ui.activity.logIssues(res0.issues, 'Review flag');
        renderTableHost(); refreshUndoButton(dsId);
        return;
      }
      var row = el; while (row && row.tagName !== 'TR') row = row.parentNode;
      var cell = row ? row.querySelector('td.dcell') : null;
      if (!cell) return;
      var adapter = App.registry.getDataset(project.platformProfileId, dsId);
      var raw = {};
      Array.prototype.forEach.call(cell.querySelectorAll('[data-decision]'), function (c) {
        var field = c.getAttribute('data-field'), kind = c.getAttribute('data-kind');
        var fmtKind = c.getAttribute('data-fmt-kind');
        var v = (c.type === 'checkbox' ? c.checked : c.value);
        if (kind === 'enum' && v === '') {
          var f = adapter.decisionSchema.filter(function (x) { return x.name === field; })[0];
          if (f && f.options && f.options.length) v = f.options[0];
        }
        raw[field] = { v: v, kind: kind, vtype: c.getAttribute('data-vtype'), fmtKind: fmtKind };
      });
      var decision = decisionFromRaw(adapter, raw);
      if (decision === null) return; // nothing to adopt — leave it undecided
      var res = withUndo(dsId, 'status change to decided' + onRow(key), function () {
        return App.store.setDecision(dsId, key, decision);
      });
      _editIssues[dsId + '|' + key] = res.issues || [];
      renderTableHost(); refreshUndoButton(dsId);
    }

    // ---- project I/O wiring ----
    function loadProjectFile(file) {
      if (!file) return;
      dom.readFileText(file).then(function (text) {
        var res = App.projectIo.parseProject(text);
        if (!res.ok) {
          App.ui.activity.logIssues(res.issues, 'Load failed');
          App.ui.activity.log({ severity: 'error', message: 'Project not loaded (' + res.issues.length + ' issue(s)).' });
          renderDrawer();
          return;
        }
        // Align the active platform with the loaded project so tabs/views match (D-008).
        if (App.registry.hasPlatform(res.value.platformProfileId)) App.registry.setActivePlatform(res.value.platformProfileId);
        App.store.init(res.value);
        resetUndo(); // snapshots belong to the PREVIOUS project — never replay them here
        App.ui.activity.logIssues(res.issues);
        App.ui.activity.log({ severity: 'success', message: 'Loaded project: ' + res.value.deviceConfigs.length + ' device(s).' });
        _state.activeTab = defaultTab();
        render();
      }).catch(function (err) { logErr(err); });
    }

    function saveProject(name) {
      var project = App.store.getProject();
      if (!project) return;
      var text = App.projectIo.serializeProject(project);
      var blob = new Blob([text], { type: 'application/json' });
      var fname = (name && String(name).trim()) ? String(name).trim() : 'ch-project';
      if (!/\.json$/i.test(fname)) fname += '.json';
      dom.download(blob, fname);
      App.store.markSaved();
      clearDraft(); // the downloaded file is now canonical; drop the crash-insurance draft
      App.ui.activity.log({ severity: 'success', message: 'Saved project as ' + fname + ' (' + text.length + ' bytes).' });
    }

    // ---- TF.7 DRAFT autosave: non-canonical crash insurance only (spec §6.6, C-4).
    // Moved from localStorage to IndexedDB when the folder landed — same role, same
    // ~5s cadence, but it no longer competes with the canonical write and it never
    // touches the sync client, so it can afford to be eager. The FOLDER is canonical;
    // this is only what stands between a crash and the last few seconds of work.
    // ALL access degrades silently: a failure here must never affect canonical state.
    // The draft is read ONCE at mount into _state.draft, because renderShell is
    // synchronous and IndexedDB is not. ----
    var DRAFT_MS = 5000;
    function saveDraft() {
      var project = App.store.getProject(); if (!project) return Promise.resolve();
      var d = { savedUtc: App.util.clock.nowIso(), project: App.projectIo.serializeProject(project) };
      return App.util.idbKv.set(DRAFT_KEY, d);
    }
    function loadDraft() { return _state.draft; }
    function readDraft() {
      return App.util.idbKv.get(DRAFT_KEY).then(function (d) {
        return (d && d.project && d.savedUtc) ? d : null;
      });
    }
    function clearDraft() { _state.draft = null; return App.util.idbKv.del(DRAFT_KEY); }
    function scheduleDraftSave() {
      if (_draftTimer) clearTimeout(_draftTimer);
      _draftTimer = setTimeout(saveDraft, DRAFT_MS); // debounce
    }
    function restoreDraft() {
      var d = loadDraft(); if (!d) return;
      var res = App.projectIo.parseProject(d.project);
      if (!res.ok) { App.ui.activity.logIssues(res.issues, 'Draft restore failed'); _state.draftDismissed = true; render(); return; }
      if (App.registry.hasPlatform(res.value.platformProfileId)) App.registry.setActivePlatform(res.value.platformProfileId);
      App.store.init(res.value);
      resetUndo();                     // snapshots belong to the pre-restore project
      App.store.markDirty();           // restored draft is NOT a saved file → unsaved
      _state.draftDismissed = true; _state.activeTab = defaultTab();
      App.ui.activity.log({ severity: 'success', message: 'Restored draft autosave from ' + toAest(d.savedUtc) + ' — Save to make it canonical.' });
      render();
    }

    function exportCsv() {
      var project = App.store.getProject(); if (!project) return;
      var dsId = _state.activeTab;
      var adapter = App.registry.getDataset(project.platformProfileId, dsId);
      if (!adapter) { App.ui.activity.log({ severity: 'warning', message: 'Switch to a data tab to export its CSV.' }); return; }
      var ui = uiFor(dsId);
      var rows = App.ui.model.filterSortRows(project, dsId, adapter, ui);
      // COL-1: the export shows what the TABLE shows, so a hidden column is not exported
      // either — the same promise the filters and the sort order already keep.
      // DIV-1/DIV-2 are deliberately NOT exported yet: the divergence flag and its
      // narrative are recorded in the project only, pending a decision about how they
      // should read in the generated documents.
      var cols = App.ui.tables.visibleColumns(adapter, ui).filter(function (c) { return c.key !== 'diverges'; });
      var flat = rows.map(function (r) {
        var o = {};
        cols.forEach(function (c) {
          o[c.key] = c.key === 'relevance' ? (r.item.relevance || '')   // review-12 #3
            : c.key === 'appliesTo' ? r.appliesTo.join('; ')
            : c.key === 'status' ? r.status
            : r.cells[c.key];
        });
        return o;
      });
      var csv = App.util.csv.toCsv(flat, cols);
      dom.download(new Blob([csv], { type: 'text/csv' }), dsId + '.csv');
      App.ui.activity.log({ severity: 'success', message: 'Exported ' + flat.length + ' rows from ' + dsId + '.' });
    }

    function logErr(err) {
      App.ui.activity.log({ severity: 'error', message: 'Unexpected error: ' + (err && err.message ? err.message : String(err)) });
      renderDrawer();
    }

    /**
     * Mount the app into a root element.
     * @param {Element} root
     */
    /**
     * STAB-3: run a store edit WITHOUT the full re-render store.onChange normally
     * triggers, for the one shape of interaction where re-rendering is the bug: ticking
     * a checkbox. The click already put the box in its new state, so a render can only
     * take things away — the page visibly jumps (scroll offsets are restored afterwards,
     * but not before the browser has painted the rebuilt shell at the top), and any
     * checkbox the pointer is over has been replaced by a different element. The caller
     * is then responsible for refreshing the few cells its edit actually changed.
     * Everything else store.onChange does — the draft autosave, the dirty flag — still
     * happens; only the repaint is skipped, so the chrome is nudged by hand here.
     * @param {()=>void} fn
     */
    function quietEdit(fn) {
      _suppressRender = true;
      try { fn(); } finally { _suppressRender = false; }
      if (!App.store.isDirty()) return;
      var shell = document.getElementById('app-root');
      if (shell && shell.className.indexOf('dirty') === -1) {
        // The unsaved marker is part of the shell we just declined to re-render.
        shell.className = 'dirty';
        var lbl = _root && _root.querySelector('.topbar .muted');
        var project = App.store.getProject();
        if (lbl && project) lbl.textContent = project.platformProfileId + ' project — unsaved';
      }
    }

    /** Build the controller context handed to view modules (spec §11). */
    function buildCtx() {
      return {
        root: _root,
        refresh: render,
        refreshMain: renderMain,
        quietEdit: quietEdit,
        switchTab: function (t) { _state.activeTab = t; render(); },
        uiFor: uiFor
      };
    }

