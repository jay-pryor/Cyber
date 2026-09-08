    // ======================================================================
    // wiring
    // ======================================================================

    function wire(ctx) {
      _ctx = ctx;
      var dom = App.util.dom;
      var P = function () { return App.store.getProject(); };

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

      /* ---- inclusion + ordering ------------------------------------------
       *
       * OPT-2: all five of these are PROJECT writes now. Each hands the mutator what
       * "not stored" means for the thing being switched, so the file only ever records a
       * departure from the default and switching something back leaves no trace. */
      function include(map, key, subKey, on, dflt) {
        quietly(function () { logIssues(App.docStore.setReportInclude(map, key, subKey, on, dflt)); });
        dirty(); repaint();
      }
      dom.on(ctx.root, 'change', '[data-rd-inc]', function (e, el) {
        include('sections', el.getAttribute('data-rd-inc'), null, el.checked, true);
      });
      dom.on(ctx.root, 'change', '[data-rd-inc-ds]', function (e, el) {
        include('datasetSections', el.getAttribute('data-rd-inc-ds'), '_all', el.checked, true);
      });
      dom.on(ctx.root, 'change', '[data-rd-ds-all]', function (e, el) {
        var dsId = el.getAttribute('data-rd-ds-all'), p = P(); if (!p) return;
        // The groups come off the BLOCK, which is where the host already declared them
        // — asking the registry for the adapter meant knowing what a dataset was.
        var block = (outlineNow(p).blocks || []).filter(function (b) { return b.dsId === dsId; })[0];
        var groups = (block && block.groups) || [];
        quietly(function () {
          groups.forEach(function (g) {
            logIssues(App.docStore.setReportInclude('datasetSections', dsId, g.value, el.checked, true));
          });
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-dsmap]', function (e, el) {
        var map = el.getAttribute('data-rd-dsmap'), ds = el.getAttribute('data-rd-ds'), key = el.getAttribute('data-rd-key');
        // COL-3: a column's default is the column's to declare, so it is read off the
        // declaration rather than assumed to be "on".
        var dflt = true;
        if (map === 'columns') {
          var block = (outlineNow(P()).blocks || []).filter(function (b) { return (b.dsId || b.kind) === ds; })[0];
          var cols = block ? App.generate.hostColumns(H(), block, opts()) : null;
          var col = ((cols && cols.optional) || []).filter(function (c) { return c.id === key; })[0];
          dflt = !col || col.defaultOff !== true;
        }
        include(map, ds, key, el.checked, dflt);
      });
      // GEN-TAB: the filename and the placeholder values. Session state, like the
      // relevance filter beside them — a tag value is an answer for THIS run.
      dom.on(ctx.root, 'change', '[data-rd-filename]', function (e, el) {
        session().filename = el.value;
        repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-tag]', function (e, el) {
        var s = session();
        s.tags = s.tags || {};
        var k = el.getAttribute('data-rd-tag');
        if (String(el.value).trim()) s.tags[k] = el.value; else delete s.tags[k];
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-rel]', function (e, el) {
        var k = el.getAttribute('data-rd-rel');
        // RPT-2: IRRELEVANT is the one category that starts excluded, so it is the one
        // whose default is `false` — including it is the departure worth recording.
        var dflt = App.ui.views.generate.REPORT_RELEVANCE_DEFAULT[k] !== false;
        include('relevance', k, null, el.checked, dflt);
      });
      // CLS-1: the classification banner is a decision about the DOCUMENT, so it is
      // stored with the project — the same shape as the title block beside it, and the
      // reason `data-rd-flag` is no longer a session flag at all.
      dom.on(ctx.root, 'change', '[data-rd-classification]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setClassification(el.checked)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-up]', function (e, el) {
        var p = P(); if (!p) return;
        quietly(function () { moveSection(p, el.getAttribute('data-rd-up'), -1); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-down]', function (e, el) {
        var p = P(); if (!p) return;
        quietly(function () { moveSection(p, el.getAttribute('data-rd-down'), 1); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-reset-order]', function () {
        quietly(function () { App.store.setReportOrder([]); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-centre]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockCentre(el.getAttribute('data-rd-centre'), el.checked)); });
        dirty(); repaint();
      });
      // SEC-4: two more per-section placement switches, on the same shape as centring.
      dom.on(ctx.root, 'change', '[data-rd-pagebreak]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockFlag('pageBreak', el.getAttribute('data-rd-pagebreak'), el.checked)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-notoc]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockFlag('noToc', el.getAttribute('data-rd-notoc'), el.checked)); });
        dirty(); repaint();
      });
      // SPC-1: the three millimetre boxes — space above a section, a Space part's height,
      // and a table's extra row height. All three are the same gesture into a different
      // mutator, and all three sanitise in docStore rather than here.
      dom.on(ctx.root, 'change', '[data-rd-space-block]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockSpace(el.getAttribute('data-rd-space-block'), el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-space]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-space'), { height: el.value }));
        });
        dirty(); repaint();
      });
      // SPC-1: which rows take that height.
      dom.on(ctx.root, 'change', '[data-rd-tallrow]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.setRowTall(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-tallrow'),
            Number(el.getAttribute('data-rd-row')), el.checked));
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-rowheight]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-rowheight'), { rowHeight: el.value }));
        });
        dirty(); repaint();
      });
      // TBL-1: a generated table's title row, caption and column headings. One handler:
      // the three differ only in which docStore call they land in.
      dom.on(ctx.root, 'change', '[data-rd-tbl-block]', function (e, el) {
        var block = el.getAttribute('data-rd-tbl-block'), key = el.getAttribute('data-rd-tbl-key');
        var col = el.getAttribute('data-rd-tbl-col'), field = el.getAttribute('data-rd-tbl-field');
        // CAP-4: the one tick among the wording boxes, so it rides the same handler.
        var noCap = el.hasAttribute('data-rd-tbl-nocap');
        quietly(function () {
          logIssues(noCap
            ? App.docStore.setTableNoCaption(block, key, el.checked)
            : col
              ? App.docStore.setTableColumnLabel(block, key, col, el.value)
              : App.docStore.setTableText(block, key, field, el.value));
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-meta]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setMetaField(el.getAttribute('data-rd-meta'), el.checked)); });
        dirty(); repaint();
      });
      // NAM-1 / SEC-1 / TBS-1 — all three keyed by block id, so one handler each covers
      // a generated section and a hand-authored one alike.
      dom.on(ctx.root, 'change', '[data-rd-sec-name]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockName(el.getAttribute('data-rd-sec-name'), el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-sec-heading]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockHeading(el.getAttribute('data-rd-sec-heading'), el.value)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-intro-num]', function (e, el) {
        quietly(function () { logIssues(App.docStore.setBlockIntroNumbered(el.getAttribute('data-rd-intro-num'), el.checked)); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-tstyle]', function (e, el) {
        quietly(function () {
          logIssues(App.docStore.setBlockTableStyle(el.getAttribute('data-rd-block'), el.getAttribute('data-rd-tstyle'), el.checked));
        });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-level]', function (e, el) {
        var v = el.value === '' ? null : Number(el.value);
        quietly(function () { logIssues(App.docStore.setBlockLevel(el.getAttribute('data-rd-level'), v)); });
        dirty(); repaint();
      });

      // drag to reorder sections (`_dragId` rather than dataTransfer alone because
      // Firefox will not read dataTransfer during dragover, where the target is decided)
      dom.on(ctx.root, 'dragstart', '[data-rd-block]', function (e, el) {
        _dragId = el.getAttribute('data-rd-block');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', _dragId); } catch (err) {} }
        el.classList.add('dragging');
      });
      dom.on(ctx.root, 'dragend', '[data-rd-block]', function (e, el) { el.classList.remove('dragging'); _dragId = null; });
      dom.on(ctx.root, 'dragover', '[data-rd-block]', function (e, el) {
        if (!_dragId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-block]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-block]', function (e, el) {
        e.preventDefault();
        el.classList.remove('drop-target');
        var target = el.getAttribute('data-rd-block'), p = P();
        if (p && _dragId && _dragId !== target) {
          quietly(function () { moveSection(p, _dragId, 0, target); });
          dirty(); repaint();
        }
        _dragId = null;
      });

      // ---- custom sections ------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-add-section]', function () {
        var res = logIssues(App.docStore.addSection(''));
        if (res.id) { _rd.selected = res.id; _rd.pane = 'section'; }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-use-template]', function (e, el) {
        if (!el.value) return;
        var res = logIssues(App.docStore.useSectionTemplate(el.value));
        if (res.id) { _rd.selected = res.id; _rd.pane = 'section'; }
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-sec-title]', function (e, el) {
        quietly(function () { logIssues(App.docStore.updateSection(el.getAttribute('data-rd-sec-title'), { title: el.value })); });
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-del-section]', function (e, el) {
        var id = el.getAttribute('data-rd-del-section');
        if (!window.confirm('Delete this section and everything in it? Any cross-reference to it will read "[missing reference]".')) return;
        logIssues(App.docStore.removeSection(id));
        if (_rd.selected === id) _rd.selected = null;
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-save-template]', function (e, el) {
        var id = el.getAttribute('data-rd-save-template');
        var name = window.prompt('Name this section template:', '');
        if (name == null || !name.trim()) return;
        logIssues(App.docStore.saveSectionTemplate(id, name));
        App.ui.activity.log({ severity: 'success', message: 'Saved section template "' + name.trim() + '".' });
        repaint();
      });

      // ---- parts ------------------------------------------------------------
      dom.on(ctx.root, 'click', '[data-rd-addpart]', function (e, el) {
        logIssues(App.docStore.addPart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-addpart')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-part-del]', function (e, el) {
        logIssues(App.docStore.removePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part-del')));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-part-up]', function (e, el) {
        logIssues(App.docStore.movePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part-up'), -1));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-part-down]', function (e, el) {
        logIssues(App.docStore.movePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part-down'), 1));
        dirty(); repaint();
      });
      dom.on(ctx.root, 'change', '[data-rd-part-flag]', function (e, el) {
        var f = {}; f[el.getAttribute('data-rd-part-flag')] = el.checked;
        quietly(function () { logIssues(App.docStore.updatePart(el.getAttribute('data-rd-sec'), el.getAttribute('data-rd-part'), f)); });
        dirty(); repaint();
      });
      /* Keep the caret and the selection where the author put them.
       *
       * `mousedown` is the event that moves focus, so preventing its default is what
       * stops the textarea losing the selection the button is about to act on — and it
       * has to be on every one of them (bold, italic, code, line break, the Link button
       * and each target in the menu), because they all act on the same selection.
       */
      /* Keep the caret and the selection where the author put them.
       *
       * `mousedown` is the event that moves focus, so preventing its default is what
       * stops the box losing the selection the button is about to act on — and it has to
       * be on every one of them (bold, italic, code, line break, the Link button and each
       * target in the menu), because they all act on the same selection.
       *
       * The selection is recorded here too. It is live in the DOM at this moment and it
       * will not be after the reference menu has repainted, and recording it as TOKEN
       * offsets is what lets it survive that. A button pressed while the caret is
       * somewhere else entirely leaves the last recorded selection alone. */
      dom.on(ctx.root, 'mousedown', '[data-rd-wrap], [data-rd-ref-open], [data-rd-ref-pick]',
        function (e, el) {
          e.preventDefault();
          var live = liveBox(el);
          if (live) noteSelection(live);
        });

      dom.on(ctx.root, 'click', '[data-rd-wrap]', function (e, el) {
        wrapSelection(el, el.getAttribute('data-rd-wrap'));
      });
      dom.on(ctx.root, 'click', '[data-rd-ref-open]', function (e, el) {
        var id = el.getAttribute('data-rd-ref-open');
        _rd.refFor = _rd.refFor === id ? null : id;
        // The remembered selection is two offsets into the box's TOKENS (RTX-1), so it
        // survives the repaint that opens the menu — which is what lets picking a target
        // link the words that were highlighted when the button was pressed.
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-ref-pick]', function (e, el) {
        // REF-1: the reading (`ref` / `refn` / `reft`) rides on the button, so the same
        // menu serves a paragraph, a table cell and a section introduction.
        var tag = (el.getAttribute('data-rd-ref-tag') || 'ref') + ':' + el.getAttribute('data-rd-ref-pick');
        wrapSelection(el, tag);
        _rd.refFor = null;
        repaint();
      });

      /* RTX-1: the box commits on BLUR, like every text box in the tool — a commit per
       * keystroke would repaint the workspace and take the caret with it. The selection
       * is recorded on the way out too, so the toolbar and the reference menu know which
       * box was being written in and where in it. */
      dom.on(ctx.root, 'focusout', '[data-rd-rich]', function (e, el) {
        noteSelection(el);
        var save = boxSaver(el);
        var next = RT.fromNode(el);
        quietly(function () { logIssues(save(next)); });
        dirty();
        /* A CELL does not repaint, and the others do.
         *
         * Leaving a paragraph or an introduction means the workspace can catch up — the
         * escape hint under the box, the preview beside it. Leaving a cell usually means
         * the caret has gone to the NEXT cell, and rebuilding the table around it would
         * take the focus out of the row being filled in. */
        if (!el.hasAttribute('data-rd-cell')) repaint();
      });
      // While the caret is in the box, keep track of where it is: a toolbar button
      // prevents its own mousedown, so the selection is still live when it is pressed —
      // but only this knows which of a table's cells it belongs to.
      ['keyup', 'mouseup'].forEach(function (ev) {
        dom.on(ctx.root, ev, '[data-rd-rich]', function (e, el) { noteSelection(el); });
      });
      /* Enter is a LINE BREAK, not a block.
       *
       * Left to itself a contenteditable wraps what follows in a <div> or a <p> depending
       * on the browser, and the box has no blocks — its whole content is one paragraph of
       * token markup. The walker reads a stray block back as a break anyway, so this is
       * about producing the same DOM in every browser rather than about correctness.
       */
      dom.on(ctx.root, 'keydown', '[data-rd-rich]', function (e, el) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        insertToken(el, 'br');
      });
      /* Paste arrives as PLAIN TEXT.
       *
       * Pasting from a word processor brings a document's worth of markup with it —
       * fonts, colours, tables — none of which this box can store and all of which the
       * walker would have to be defensive about. The text is what was meant.
       */
      dom.on(ctx.root, 'paste', '[data-rd-rich]', function (e, el) {
        if (!e.clipboardData) return;
        e.preventDefault();
        var text = e.clipboardData.getData('text/plain') || '';
        var at = RT.selectionIn(el, window.getSelection()) || { start: 0, end: 0 };
        var cur = RT.fromNode(el);
        var next = cur.slice(0, at.start) + text + cur.slice(at.end);
        quietly(function () { logIssues(boxSaver(el)(next)); });
        dirty();
        el.innerHTML = boxHtml(next);
        RT.placeCaret(el, at.start + text.length, window);
      });

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

      // drag to reorder parts within the open section
      dom.on(ctx.root, 'dragstart', '[data-rd-partrow]', function (e, el) {
        _dragPart = el.getAttribute('data-rd-partrow');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', _dragPart); } catch (err) {} }
        el.classList.add('dragging');
        e.stopPropagation();
      });
      dom.on(ctx.root, 'dragend', '[data-rd-partrow]', function (e, el) { el.classList.remove('dragging'); _dragPart = null; });
      dom.on(ctx.root, 'dragover', '[data-rd-partrow]', function (e, el) {
        if (!_dragPart) return;
        e.preventDefault();
        el.classList.add('drop-target');
      });
      dom.on(ctx.root, 'dragleave', '[data-rd-partrow]', function (e, el) { el.classList.remove('drop-target'); });
      dom.on(ctx.root, 'drop', '[data-rd-partrow]', function (e, el) {
        e.preventDefault();
        el.classList.remove('drop-target');
        var target = el.getAttribute('data-rd-partrow');
        if (_dragPart && _dragPart !== target && _rd.selected) {
          App.docStore.movePart(_rd.selected, _dragPart, 0, target);
          dirty(); repaint();
        }
        _dragPart = null;
      });

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
        App.ui.activity.log({ severity: 'success', message: 'Saved report template "' + name.trim() + '".' });
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

