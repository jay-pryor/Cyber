    App.ui = App.ui || {};
    App.ui.views = App.ui.views || {};
    App.ui.views.reportDesign = {
      render: render, wire: wire, refresh: refresh,
      open: function () { _rd.open = true; _rd.preview = null; },
      close: function () { _rd.open = false; },
      isOpen: function () { return !!_rd.open; },
      select: function (id) { _rd.selected = id; _rd.pane = 'section'; },
      pane: function (id) { if (id) { _rd.pane = id; _rd.preview = null; } return _rd.pane; },
      buildPreview: buildPreview,
      PANES: PANES, _rd: _rd
    };
  })(App);
