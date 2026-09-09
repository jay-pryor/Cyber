    // ======================================================================
    // wiring: wireTables
    //
    // Tables: cells, rows and columns, and the two ways a column width is set — dragged
    // on an edge (TW-1/TW-2) or typed into the percentage chip.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireTables(h) {
      var dom = h.dom, ctx = h.ctx;

      // ---- table editing ----------------------------------------------------
      // RTX-2: a cell is a rich box like any other, so it commits through the same
      // focusout handler above — and, like the others, without a repaint: the box
      // already shows what was typed, and a repaint mid-table would move focus out of
      // the row being filled in.
      dom.on(ctx.root, 'change', '[data-rd-caption]', function (e, el) {
        quietly(function () { App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-caption'), { caption: el.value }); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-align]', function (e, el) {
        quietly(function () { App.docStore.setAlign(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-align'), Number(el.getAttribute('data-rd-col')), el.value); });
        dirty();
      });
      dom.on(ctx.root, 'click', '[data-rd-addrow]', function (e, el) {
        App.docStore.addRow(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-addrow'));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-addcol]', function (e, el) {
        App.docStore.addColumn(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-addcol'));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-delrow]', function (e, el) {
        App.docStore.removeRow(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-delrow'), Number(el.getAttribute('data-rd-row')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-delcol]', function (e, el) {
        App.docStore.removeColumn(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-delcol'), Number(el.getAttribute('data-rd-col')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-autowidth]', function (e, el) {
        quietly(function () { logIssues(App.docStore.clearWidths(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-autowidth'))); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-block-autowidth]', function (e, el) {
        quietly(function () { logIssues(App.docStore.clearBlockWidths(el.getAttribute('data-rd-block-autowidth'))); });
        dirty(); repaint();
      });

      /** One place that turns a `data-rd-wt` target into the right docStore call. */
      function writeWidth(target, col, fraction, exact) {
        var bits = String(target || '').split('|');
        if (bits[0] === 'p') return App.docStore.setWidth(bits[1], bits[2], col, fraction, exact);
        if (bits[0] === 'b') return App.docStore.setBlockWidth(bits[1], Number(bits[2]), col, fraction, exact);
        return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'Unknown width target.' }] };
      }

      /* TW-1/TW-2: drag an edge to set that column's share.
       *
       * Modelled on the data-table handle in App.ui.app, with one deliberate difference:
       * that one writes a pixel width into UI state, and this one writes a FRACTION into
       * the project. A width that only existed in the session would be gone by the next
       * generate, and localStorage is never canonical here — so the drag ends in
       * docStore, and the .md is what proves it landed.
       *
       * The pixel-to-fraction conversion is against the container's own width, which is
       * the profile's text width in both editors, so what is dragged is the shape the
       * page gets. The repaint is held until mouseup: repainting per mousemove would
       * rebuild the very element being dragged.
       */
      dom.on(ctx.root, 'mousedown', '[data-rd-colresize]', function (e, el) {
        e.preventDefault(); e.stopPropagation();
        var target = el.getAttribute('data-rd-wt');
        var col = Number(el.getAttribute('data-rd-col'));
        // A header cell in the table editor, or a segment in the width strip.
        var cell = el.parentNode;
        while (cell && cell.tagName !== 'TH' && !(cell.classList && cell.classList.contains('rd-wseg'))) cell = cell.parentNode;
        // The measuring box is the PAGE-width container in both editors — the strip
        // itself, or the box the (possibly narrower) table sits in — so a pointer
        // position is directly a share of the page (TW-3).
        var box = cell && cell.parentNode;
        while (box && !(box.classList && (box.classList.contains('rd-widthbar') || box.classList.contains('rd-tablescale')))) box = box.parentNode;
        var table = cell;
        while (table && table.tagName !== 'TABLE') table = table.parentNode;
        if (!cell || !box) return;
        var total = box.offsetWidth || 1;
        var startX = e.clientX, startW = cell.offsetWidth;
        // The table editor is `table-layout: fixed` with a colgroup, so live feedback
        // there has to move the <col>; the strip moves the segment itself.
        var cols = table ? table.querySelectorAll('col') : null;
        function width(ev) { return Math.max(16, startW + (ev.clientX - startX)); }
        function onMove(ev) {
          // A colgroup percentage is relative to the TABLE, the strip's to the box —
          // the two differ whenever the table is narrower than the page.
          if (cols && cols[col]) cols[col].style.width = (width(ev) / (table.offsetWidth || total) * 100) + '%';
          else cell.style.width = (width(ev) / total * 100) + '%';
        }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          quietly(function () { logIssues(writeWidth(target, col, width(ev) / total, false)); });
          dirty(); repaint();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      /* TW-1: double-click a percentage to type one.
       *
       * A drag is good for "a bit wider" and useless for "exactly 60". Typed values also
       * behave differently on purpose — they set ONE column and leave the rest alone,
       * which is how a set can end up totalling more than 100% and earning the red flag
       * under the editor. Dragging redistributes; typing does not.
       *
       * The chip swaps to an input in place rather than repainting, because a repaint
       * would take the element out from under the double-click that asked for it.
       */
      function editPct(el) {
        if (el.querySelector('input')) return;
        var target = el.getAttribute('data-rd-pct'), col = Number(el.getAttribute('data-rd-col'));
        var cur = parseFloat(el.textContent) || 0;
        el.innerHTML = '<input class="rd-pctbox" type="number" min="5" max="100" step="1" value="' + Math.round(cur) + '" aria-label="Column width, percent">';
        var box = el.querySelector('input');
        box.focus(); box.select();
        var done = false;
        /* Tab walks to the next column's box, Shift+Tab to the previous — because
         * setting a row of widths is one job, and doing it a double-click at a time is
         * three gestures per column. The repaint has already rebuilt the chips by the
         * time we look for the next one, so it is found by its target and column rather
         * than held onto across the rebuild. */
        function move(by) {
          var chips = Array.prototype.slice.call(document.querySelectorAll('[data-rd-pct="' + target + '"]'));
          var next = chips.filter(function (c) { return Number(c.getAttribute('data-rd-col')) === col + by; })[0];
          if (next) editPct(next);
        }
        function commit(keep, by) {
          if (done) return;
          done = true;
          var v = keep ? Number(box.value) : NaN;
          if (isFinite(v) && v > 0) {
            quietly(function () { logIssues(writeWidth(target, col, v / 100, true)); });
            dirty();
          }
          repaint();
          if (by) move(by);
        }
        box.addEventListener('blur', function () { commit(true); });
        box.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
          else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
          else if (ev.key === 'Tab') { ev.preventDefault(); commit(true, ev.shiftKey ? -1 : 1); }
        });
      }
      dom.on(ctx.root, 'dblclick', '[data-rd-pct]', function (e, el) { e.preventDefault(); editPct(el); });
      // Keyboard parity: the chip is focusable, so Enter must open it too.
      dom.on(ctx.root, 'keydown', '[data-rd-pct]', function (e, el) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editPct(el); }
      });
    }
