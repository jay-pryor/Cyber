    // ======================================================================
    // wiring: wireShell
    //
    // The workspace itself: opening and closing it, which pane is showing, which
    // section is selected — plus the two things that are ways of LOOKING at the
    // document rather than changes to it, the preview controls and the import
    // conflict dialogue.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireShell(h) {
      var dom = h.dom, ctx = h.ctx;

      dom.on(ctx.root, 'click', '[data-rd-open]', function () {
        _rd.open = true; dirty(); ctx.refreshMain();
        if (_rd.pane === 'preview' && _rd.pages) paginate();
      });
      dom.on(ctx.root, 'click', '[data-rd-close]', function () { _rd.open = false; ctx.refreshMain(); });
      dom.on(ctx.root, 'click', '[data-rd-modal]', function (e, el) {
        if (e.target === el) { _rd.open = false; ctx.refreshMain(); }
      });
      dom.on(ctx.root, 'click', '[data-rd-pane]', function (e, el) {
        _rd.pane = el.getAttribute('data-rd-pane');
        if (_rd.pane === 'preview') dirty();
        repaint();
      });
      /* Selecting a section does NOT change which pane is showing.
       *
       * It used to jump to the Section pane, which made the Preview unusable for the
       * thing it is best at: clicking down the list and watching the document change.
       * Every trip cost two more clicks to get back. The row still shows as selected,
       * and the Section pane still follows the selection when it is the one on screen. */
      dom.on(ctx.root, 'click', '[data-rd-optmenu]', function (e, el) {
        var id = el.getAttribute('data-rd-optmenu');
        _rd.optMenu = _rd.optMenu === id ? null : id;
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-select]', function (e, el) {
        _rd.selected = el.getAttribute('data-rd-select');
        repaint();
      });
      // ---- conflict resolution ---------------------------------------------
      dom.on(ctx.root, 'change', '[data-rd-cf]', function (e, el) {
        if (!_rd.conflict) return;
        _rd.conflict.decisions[el.getAttribute('data-rd-cf')] = el.value;
      });
      dom.on(ctx.root, 'click', '[data-rd-cf-all]', function (e, el) {
        if (!_rd.conflict) return;
        var v = el.getAttribute('data-rd-cf-all');
        _rd.conflict.plan.conflicts.forEach(function (c) {
          _rd.conflict.decisions[App.docTemplates._norm(c.incoming.name)] = v;
        });
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-cf-cancel]', function () { _rd.conflict = null; repaint(); });
      dom.on(ctx.root, 'click', '[data-rd-cf-apply]', function () { applyConflict(); });
      // ---- preview ----------------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-refresh-preview]', function () { dirty(); repaint(); });
      // PRV-4: page view is a way of LOOKING at the document, not a change to it, so it
      // does not invalidate the rendered markdown — only how it is laid out.
      dom.on(ctx.root, 'change', '[data-rd-pageview]', function (e, el) { _rd.pages = el.checked; repaint(); });
      dom.on(ctx.root, 'click', '[data-prv-jump]', function (e, el) {
        e.preventDefault();
        var target = document.getElementById(el.getAttribute('data-prv-jump'));
        var doc = document.getElementById('rd-preview-doc');
        if (!target || !doc) return;
        /* PRV-4: measured, not accumulated.
         *
         * `offsetTop` is relative to the nearest positioned ancestor, and in page view
         * that is the SHEET rather than the scrolling article — so every link jumped to
         * the target's offset within its own page, which for anything past page one is
         * the wrong place entirely and for page one looked like nothing happening.
         * Two rectangles and the current scroll position work in both views.
         */
        doc.scrollTop += target.getBoundingClientRect().top - doc.getBoundingClientRect().top;
      });
    }
