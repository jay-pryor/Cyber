    /** The connect / reconnect / recovery / divergence / rollback surfaces. */
    function bannerHtml() {
      var out = '';

      if (st.recovery) {
        out += banner('Project recovery', 'bad',
          '<div><strong>The project in this folder could not be read.</strong> ' +
          esc(st.recovery.issues.length + ' issue(s).') +
          ' Nothing has been changed or deleted.</div>' +
          '<div class="folder-actions">' +
          '<button data-action="folder-snapshots">Restore a snapshot</button>' +
          '<button data-action="folder-retry">Try again</button>' +
          '<button data-action="folder-quarantine">Start fresh (move it aside)</button>' +
          '</div>');
      }

      if (st.diverged !== null) {
        out += banner('Folder divergence', 'warn',
          '<div><strong>project.json changed in the folder</strong> since this tool last wrote it — ' +
          'another machine, another tab, or a synced edit. Nothing was overwritten.</div>' +
          '<div class="folder-actions">' +
          '<button data-action="folder-keep-mine">Keep mine</button>' +
          '<button data-action="folder-take-theirs">Take theirs</button>' +
          '<button data-action="folder-save-copy">Save mine separately</button>' +
          '</div>');
      }

      if (st.status === S.STATUS.NEEDS_PERMISSION) {
        out += banner('Reconnect to folder', 'warn',
          '<div>Reconnect to <strong>' + esc(st.label || 'the project folder') + '</strong> to carry on. ' +
          'Browsers drop folder permission when they restart; this is normal.</div>' +
          '<div class="folder-actions">' +
          '<button data-action="folder-reconnect">Reconnect</button>' +
          '<button data-action="folder-connect">Choose a different folder</button>' +
          '</div>');
      }

      if (st.status === S.STATUS.ERROR) {
        // D-065: a folder that is GONE reads differently from one that merely failed —
        // it names the likely cause and the fact that nothing was lost.
        out += banner('Folder error', 'bad',
          (st.stale
            ? '<div><strong>The connected folder could no longer be found.</strong> ' +
              'It may have been moved, renamed, or re-synced by OneDrive. Nothing has been lost — ' +
              'your work is still open here, and <strong>Save project</strong> will download it. ' +
              'Choose the folder again to carry on.</div>'
            : '<div><strong>The folder could not be reached.</strong> ' + esc(st.error ? st.error.message : '') + '</div>') +
          '<div class="folder-actions">' +
          '<button data-action="folder-connect">Choose a folder</button>' +
          '<button data-action="folder-disconnect">Work without a folder</button>' +
          '</div>');
      }

      if (st.status === S.STATUS.IDLE) {
        out += banner('Connect a folder', 'info',
          '<div>Connect this project to a folder and it saves itself — with rollback, ' +
          'and version history from OneDrive. Manual Save keeps working either way.</div>' +
          '<div class="folder-actions"><button data-action="folder-connect">Connect a folder</button></div>');
      }

      // §5.5: the folder controls are reachable AT ANY TIME, not only from a connect or
      // reconnect screen. Without this, a connected session had no way to re-pick or
      // disconnect at all — the only way out of a bad handle was clearing browser
      // storage by hand, which is not a thing to ask of anyone (D-065).
      if (st.panel) {
        out += banner('Folder', 'info',
          '<div><strong>Project folder:</strong> ' + (st.label ? esc(st.label) : '<em>not connected</em>') + '</div>' +
          '<div class="folder-actions">' +
          '<button data-action="folder-connect">' + (st.label ? 'Change folder' : 'Connect a folder') + '</button>' +
          (st.label ? '<button data-action="folder-disconnect">Disconnect</button>' : '') +
          '<button data-action="folder-panel-close">Close</button>' +
          '</div>');
      }

      if (st.snapshots) out += snapshotsHtml();
      return out;
    }

    function snapshotsHtml() {
      var rows = st.snapshots.map(function (n) {
        var iso = App.storage.folder.stampToIso(App.storage.folder.stampOf(n));
        return '<li><span class="snap-when">' + esc(iso ? App.util.clock.toAest(iso) : n) + '</span>' +
          '<button data-action="folder-restore" data-snapshot="' + esc(n) + '">Restore</button></li>';
      }).join('');
      return banner('Rollback', 'info',
        '<div><strong>Roll back</strong> — the state being replaced is snapshotted first, so this is undoable.</div>' +
        (rows ? '<ul class="snap-list">' + rows + '</ul>' : '<div class="muted">No snapshots yet.</div>') +
        '<div class="folder-actions"><button data-action="folder-snapshots-close">Close</button></div>');
    }

    /** Delegated handlers. Wired once; they survive re-renders. */
    function wire(root, extra) {
      var on = App.util.dom.on;
      on(root, 'click', '[data-action="folder-save-now"]', function () { saveNow(); });
      on(root, 'click', '[data-action="folder-panel"]', function () { st.panel = !st.panel; refresh(); });
      on(root, 'click', '[data-action="folder-panel-close"]', function () { st.panel = false; refresh(); });
      on(root, 'click', '[data-action="folder-connect"]', function () { st.panel = false; connect(); });
      on(root, 'click', '[data-action="folder-reconnect"]', function () { reconnect(); });
      on(root, 'click', '[data-action="folder-disconnect"]', function () { disconnect(); });
      on(root, 'click', '[data-action="folder-keep-mine"]', function () { keepMine(); });
      on(root, 'click', '[data-action="folder-take-theirs"]', function () { takeTheirs(); });
      on(root, 'click', '[data-action="folder-save-copy"]', function () {
        if (extra && extra.saveCopy) extra.saveCopy();
        st.diverged = null; refresh();
      });
      on(root, 'click', '[data-action="folder-quarantine"]', function () { quarantine(); });
      on(root, 'click', '[data-action="folder-retry"]', function () { st.recovery = null; load().then(refresh, note); });
      on(root, 'click', '[data-action="folder-snapshots"]', function () { openSnapshots(); });
      on(root, 'click', '[data-action="folder-snapshots-close"]', function () { closeSnapshots(); });
      on(root, 'click', '[data-action="folder-restore"]', function (e, el) {
        restoreSnapshot(el.getAttribute('data-snapshot'));
      });
    }

    App.ui = App.ui || {};
    App.ui.folder = {
      init: init, wire: wire, schedule: schedule, flush: flush, saveNow: saveNow,
      connect: connect, reconnect: reconnect, disconnect: disconnect,
      keepMine: keepMine, takeTheirs: takeTheirs, quarantine: quarantine,
      openSnapshots: openSnapshots, closeSnapshots: closeSnapshots, restoreSnapshot: restoreSnapshot,
      writeOutputs: writeOutputs, load: load,
      canWrite: canWrite, locked: locked, status: function () { return st.status; },
      chipHtml: chipHtml, bannerHtml: bannerHtml,
      _st: st,
      _folder: function () { return _folder; },
      _reset: function () {
        _folder = null; _writer = null; _hooks = null;
        st.status = S.STATUS.IDLE; st.save = 'saved'; st.label = '';
        st.error = null; st.diverged = null; st.recovery = null; st.snapshots = null; st.conflicts = [];
        st.panel = false; st.stale = false; _forceSnapshot = false;
      }
    };
  })(App);
