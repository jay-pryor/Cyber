    // ======================================================================
    // wiring: wireFormatting
    //
    // Formatting profiles, the title block, the header and footer slots, and the
    // template catalogues with their export and import.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireFormatting(h) {
      var dom = h.dom, ctx = h.ctx;

      // ---- formatting -------------------------------------------------------
      dom.on(ctx.root, 'change', '[data-rd-fmt-active]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setFormatId(el.value)); });
        _rd.fmtId = el.value; dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt-edit]', function (e, el) { _rd.fmtId = el.value; repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-fmt-new]', function () {
        var project = P(); if (!project) return;
        var from = App.docFormat.list(project).filter(function (x) { return x.id === (_rd.fmtId || App.docFormat.resolve(project).id); })[0];
        var name = window.prompt('Name for the new profile:', (from ? from.name : 'Standard') + ' copy');
        if (name == null || !name.trim()) return;
        var res = logIssues(App.docStore.addFormat(name, from));
        if (res.id) { _rd.fmtId = res.id; App.docStore.setFormatId(res.id); }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-fmt-del]', function () {
        if (!_rd.fmtId || _rd.fmtId === 'standard') return;
        if (!window.confirm('Delete this formatting profile? Any document using it falls back to Standard.')) return;
        logIssues(App.docStore.removeFormat(_rd.fmtId));
        _rd.fmtId = null; dirty(); repaint();
      });
      function fmtPatch(key, value) {
        var project = P(); if (!project) return;
        var id = _rd.fmtId || App.docFormat.resolve(project).id;
        var cur = App.docFormat.list(project).filter(function (x) { return x.id === id; })[0];
        if (!cur || cur.builtin) return;
        // Dotted paths ('page.marginTop', 'levels.2.size') are patched into a copy so
        // the store only ever sees a whole, valid profile.
        var patch = JSON.parse(JSON.stringify(cur));
        var parts = key.split('.'), o = patch;
        for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
        o[parts[parts.length - 1]] = value;
        quietly(function () { logIssues(App.docStore.updateFormat(id, patch)); });
        dirty(); repaint();
      }
      dom.on(ctx.root, 'change', '[data-rd-titleblock]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setTitleBlock(el.checked)); });
        dirty(); repaint();
      });
      // HDR-1: a slot writes through the same dotted-path patcher every other profile
      // field uses, so nothing new has to know how a profile is saved.
      dom.on(ctx.root, 'change', '[data-rd-hf-set]', function (e, el) {
        fmtPatch('headerFooter.' + el.getAttribute('data-rd-hf-set') + '.' + el.getAttribute('data-rd-hf-slot'), el.value);
      });
      dom.on(ctx.root, 'change', '[data-rd-hf-first]', function (e, el) {
        fmtPatch('headerFooter.firstDifferent', el.checked);
      });
      dom.on(ctx.root, 'change', '[data-rd-fmt]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt'), el.value); });
      dom.on(ctx.root, 'change', '[data-rd-fmt-bool]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt-bool'), el.checked); });
      // TBS-1: a colour picker has no "none" — white is a colour, and a white shade over
      // a white page is not the same thing as no shade at all in the emitted LaTeX.
      dom.on(ctx.root, 'click', '[data-rd-fmt-clear]', function (e, el) { fmtPatch(el.getAttribute('data-rd-fmt-clear'), ''); });

      // ---- templates --------------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-tpl-use]', function (e, el) {
        var res = logIssues(App.docStore.useSectionTemplate(el.getAttribute('data-rd-tpl-use')));
        if (res.id) { _rd.selected = res.id; _rd.pane = 'section'; }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-tpl-del]', function (e, el) {
        var kind = el.getAttribute('data-rd-tpl-del'), id = el.getAttribute('data-rd-tpl-id');
        if (!window.confirm('Delete this template?')) return;
        logIssues(kind === 'sections' ? App.docStore.removeSectionTemplate(id) : App.docStore.removeReportTemplate(id));
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-rpt-save]', function () {
        var name = window.prompt('Name this report template:', '');
        if (name == null || !name.trim()) return;
        logIssues(App.docStore.saveReportTemplate(name));
        App.docHost.log({ severity: 'success', message: 'Saved report template "' + name.trim() + '".' });
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-rpt-use]', function (e, el) {
        if (!window.confirm('Apply this template? It replaces the current section order, heading levels and custom sections.')) return;
        logIssues(App.docStore.useReportTemplate(el.getAttribute('data-rd-rpt-use')));
        _rd.selected = null; _rd.fmtId = null; dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-export]', function (e, el) { doExport(el.getAttribute('data-rd-export')); });
      dom.on(ctx.root, 'change', '[data-rd-import]', function (e, el) {
        var f = el.files && el.files[0];
        if (f) doImport(el.getAttribute('data-rd-import'), f);
        el.value = '';                    // so re-picking the same file fires again
      });
    }
