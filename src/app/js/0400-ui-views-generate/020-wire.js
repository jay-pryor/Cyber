    function wire(ctx) {
      _ctx = ctx;
      var dom = App.util.dom;
      // v2.2: the Report Design workspace RENDERS inside this tab but is wired by the
      // shell's view loop like every other view module — wiring it here as well would
      // register its delegated handlers twice, and every click would fire twice.
      dom.on(ctx.root, 'change', '[data-generate-device]', function (e, el) { _gen.deviceId = el.value; ctx.refreshMain(); });
      dom.on(ctx.root, 'change', '[data-generate-txt]', function (e, el) { _gen.scriptsAsTxt = el.checked; });
      dom.on(ctx.root, 'click', '[data-generate-action]', function (e, el) { doGenerate(el.getAttribute('data-generate-action')); });
      // v1.3 options (§20.8) — collapse toggle + option checkboxes (session-only, no project write).
      dom.on(ctx.root, 'click', '[data-gen-options-toggle]', function (e, el) {
        var id = el.getAttribute('data-gen-options-toggle');
        _gen.openOptions[id] = !_gen.openOptions[id]; ctx.refreshMain();
      });
      dom.on(ctx.root, 'change', '[data-gen-flag]', function (e, el) {
        var block = el.getAttribute('data-gen-block'), field = el.getAttribute('data-gen-flag');
        var obj = _gen[block], parts = field.split('.');
        for (var i = 0; i < parts.length - 1; i++) { obj[parts[i]] = obj[parts[i]] || {}; obj = obj[parts[i]]; }
        obj[parts[parts.length - 1]] = el.checked;
        // RPT-4: while the workspace is open, only the workspace changed.
        if (!App.ui.views.reportDesign.refresh()) ctx.refreshMain();
      });

      // ---- PRO-2: the running-order editor -------------------------------------
      // PRO-3: every one of these repaints the LIST, never the tab — the editor sits low
      // on a long page, and a full re-render put the view back at the top on every move.
      dom.on(ctx.root, 'click', '[data-proc-up]', function (e, el) {
        var p = App.store.getProject(); if (!p) return;
        quietly(function () { moveStep(p, el.getAttribute('data-proc-up'), -1); });
        refreshProcedureOrder();
      });
      dom.on(ctx.root, 'click', '[data-proc-down]', function (e, el) {
        var p = App.store.getProject(); if (!p) return;
        quietly(function () { moveStep(p, el.getAttribute('data-proc-down'), 1); });
        refreshProcedureOrder();
      });
      dom.on(ctx.root, 'change', '[data-proc-include]', function (e, el) {
        var id = el.getAttribute('data-proc-include');
        if (el.checked) delete _gen.procedure.exclude[id]; else _gen.procedure.exclude[id] = true;
        refreshProcedureOrder();   // the numbering counts only what is in, so it is redrawn
      });
      // The step note saves on blur (`change`), like every other prose box in the tool.
      // Quiet as well: the box already shows what was typed, so a re-render would only
      // move the page (PRO-3).
      dom.on(ctx.root, 'change', '[data-proc-note]', function (e, el) {
        var id = el.getAttribute('data-proc-note'), val = el.value;
        quietly(function () { App.store.setProcedureNote(id, val); });
      });
      // Drag to reorder. `_dragId` rather than dataTransfer alone because Firefox will
      // not read dataTransfer during dragover, which is where the drop target is decided.
      dom.on(ctx.root, 'dragstart', '[data-proc-step]', function (e, el) {
        _dragId = el.getAttribute('data-proc-step');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', _dragId); } catch (err) {} }
        el.classList.add('dragging');
      });
      dom.on(ctx.root, 'dragend', '[data-proc-step]', function (e, el) { el.classList.remove('dragging'); _dragId = null; });
      dom.on(ctx.root, 'dragover', '[data-proc-step]', function (e, el) {
        if (!_dragId) return;
        e.preventDefault();                        // without this the drop never fires
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-proc-step]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-proc-step]', function (e, el) {
        e.preventDefault();
        el.classList.remove('drop-target');
        var target = el.getAttribute('data-proc-step');
        var p = App.store.getProject();
        if (p && _dragId && _dragId !== target) {
          quietly(function () { moveStep(p, _dragId, 0, target); });
          refreshProcedureOrder();
        }
        _dragId = null;
      });
      dom.on(ctx.root, 'change', '[data-gen-map]', function (e, el) {
        var block = el.getAttribute('data-gen-block'), map = el.getAttribute('data-gen-map'), ds = el.getAttribute('data-gen-ds'), key = el.getAttribute('data-gen-key');
        var m = _gen[block]; m[map] = m[map] || {};
        if (key != null) { m[map][ds] = m[map][ds] || {}; m[map][ds][key] = el.checked; }
        else { m[map][ds] = el.checked; }
        if (!App.ui.views.reportDesign.refresh()) ctx.refreshMain();
      });
    }

    App.ui = App.ui || {};
    App.ui.views = App.ui.views || {};
    App.ui.views.generate = {
      render: render, wire: wire, _gen: _gen,
      // OPT-2: the assembled report options — project decisions plus this run's answers.
      reportOptions: reportOptions, REPORT_RELEVANCE_DEFAULT: REPORT_RELEVANCE_DEFAULT,
      // RPT-4: the workspace, addressable from tests and from anywhere that wants to
      // drop the operator straight into the report's composition.
      // v2.2: the workspace lives in its own module now; these stay as the addressable
      // way in, so anything that wants to drop the operator straight into the report's
      // composition still has one call to make.
      openReportOptions: function () { App.ui.views.reportDesign.open(); },
      closeReportOptions: function () { App.ui.views.reportDesign.close(); },
      reportOptionsOpen: function () { return App.ui.views.reportDesign.isOpen(); },
      _reportModal: function (p, pl) { return App.ui.views.reportDesign.render(p, pl); }
    };
  })(App);
