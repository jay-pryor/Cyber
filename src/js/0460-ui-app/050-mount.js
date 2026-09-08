    function mount(root) {
      _root = root;
      applyTheme(initialTheme()); // honour stored/OS preference before first paint (§18.1)
      _state.activeTab = App.store.getProject() ? defaultTab() : 'onboard';
      render();
      wire();
      // Wire view modules ONCE (their handlers are delegated on _root, so they
      // survive re-renders). Adding a view = drop a module with render()/wire().
      var ctx = buildCtx();
      if (App.ui.views) Object.keys(App.ui.views).forEach(function (k) {
        if (App.ui.views[k].wire) App.ui.views[k].wire(ctx);
      });
      App.store.onChange(function () {
        if (!_suppressRender) render();
        if (App.store.isDirty()) { scheduleDraftSave(); App.ui.folder.schedule(); }
      });
      App.ui.activity.onChange(function () { renderDrawer(); });

      // TF.6/TF.8: the folder. Wired once; its handlers are delegated on _root like
      // every other view's, so they survive re-renders.
      App.ui.folder.wire(_root, { saveCopy: function () { saveProject(_state.saveName); } });
      App.ui.folder.init({
        refresh: function () { render(); },
        adopt: function (project) {
          if (App.registry.hasPlatform(project.platformProfileId)) App.registry.setActivePlatform(project.platformProfileId);
          App.store.init(project);
          resetUndo();               // snapshots belong to the PREVIOUS project
          _state.activeTab = defaultTab();
        },
        currentText: function () {
          var p = App.store.getProject();
          return p ? App.projectIo.serializeProject(p) : null;
        }
      });

      // TF.8 flush hooks. visibilitychange is the reliable one — beforeunload is
      // best-effort on mobile and increasingly on desktop. Keep both.
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') App.ui.folder.flush();
      });
      // Dirty guard (spec §6.6): warn before leaving with unsaved changes. The folder
      // flush is best-effort here by design; the ~5s draft is what actually covers a
      // hard close, and visibilitychange above has usually already fired.
      window.addEventListener('beforeunload', function (e) {
        App.ui.folder.flush();
        if (App.store.isDirty() && !App.ui.folder.canWrite()) { e.preventDefault(); e.returnValue = ''; return ''; }
      });

      App.ui.activity.log({ severity: 'info', message: 'CH Config Tool ' + TOOL_VERSION + ' ready.' });
      readDraft().then(function (d) {
        if (!d) return;
        _state.draft = d;
        App.ui.activity.log({ severity: 'info', message: 'A local draft autosave was found — see the banner to restore or discard it.' });
        render();
      });
    }

    App.ui = App.ui || {};
    App.ui.app = {
      mount: mount, TOOL_VERSION: TOOL_VERSION, _state: _state, nextTheme: nextTheme, toAest: toAest,
      applyToTogglePlan: applyToTogglePlan,
      // review-16 #1: exposed so the "empty box = blank value, not undecided" rule can
      // be tested without synthesising a table cell.
      _decisionFromRaw: decisionFromRaw,
      // review-17 #1/#3: the tab strip and the Status-badge flip, exposed so the tab
      // ORDER and the flip rules are testable without driving a live browser.
      _renderShell: renderShell,
      _toggleStatus: toggleStatus,
      // STAB-3: the no-re-render edit the checkbox handlers depend on.
      _quietEdit: quietEdit,
      // COL-1: exposed so "hiding a column also clears its filter" is testable without
      // synthesising a click on the picker.
      _hideColumn: hideColumn,
      // SP-7: exposed so "a re-render puts the view back exactly where it was" is a
      // real DOM test rather than a promise in a comment.
      _captureScroll: captureScroll, _restoreScroll: restoreScroll,
      // review-13 #2/#3: the undo/redo history, exposed so the grouping rules are
      // testable without synthesising DOM clicks.
      _history: {
        pushUndo: pushUndo, withUndo: withUndo, noteApplyTick: noteApplyTick, closeRun: closeRun,
        noteDeviceTick: noteDeviceTick, unnoteTickRun: unnoteTickRun,   // DEV-1
        reset: resetUndo, limit: UNDO_LIMIT,
        info: undoInfo, undo: function (dsId) { return stepHistory(dsId, _undo, _redo, 'Undid'); },
        redo: function (dsId) { return stepHistory(dsId, _redo, _undo, 'Redid'); }
      }
    };
  })(App);
