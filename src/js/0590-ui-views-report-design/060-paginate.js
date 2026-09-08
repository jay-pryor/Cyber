    /* PRV-4: cut the flow into sheets, once it has been laid out.
     *
     * This is the one thing in the workspace that cannot be done as a string: where a
     * page ends depends on how tall the content turned out to be, and nothing knows that
     * until the browser has laid it out. So the document is rendered as one flow and
     * then walked, block by block, moving each into the current sheet until the next one
     * would not fit.
     *
     * A TABLE is split across sheets rather than moved whole, because that is what a
     * longtable does on the page: the rows that fit stay, the rest continue overleaf
     * under a repeat of the header row. A table clipped at the page edge — which is what
     * moving it whole into a fixed-height sheet did — shows a document that is missing
     * most of its content, which is worse than a break in a slightly different place.
     *
     * Everything else is moved whole. A paragraph taller than a page gets a page of its
     * own and is allowed to overflow rather than being cut mid-line: LaTeX will break it
     * somewhere, and pretending to know where would be inventing a precise-looking
     * answer. A `\newpage` the document asked for (a page-break part, a section that
     * starts a page, a heading level that does) arrives as `.prv-pagebreak` and starts a
     * new sheet — those ARE exact.
     */
    function paginate() {
      var host = document.querySelector('[data-prv-pages]');
      if (!host) return;
      var flow = host.querySelector('.rd-pageflow');
      if (!flow) return;
      var num = function (k) { return Number(host.getAttribute('data-prv-' + k)) || 0; };
      var pw = num('pw'), ph = num('ph'), mt = num('mt'), mb = num('mb'), ml = num('ml'), mr = num('mr');
      var body = Math.max(80, ph - mt - mb);
      var hf;
      try { hf = JSON.parse(host.getAttribute('data-prv-hf') || '{}'); } catch (e) { hf = {}; }
      var firstDifferent = !!host.getAttribute('data-prv-first');

      /**
       * Take as many body rows off a table as will fit in `room`, in a clone of its
       * wrapper carrying the same header. Returns null when not even one row fits, so
       * the caller can start a fresh sheet and try again there.
       * @returns {?Element} the part that fits; the original keeps the remainder
       */
      function splitTable(el, room) {
        var table = el.querySelector('table');
        if (!table) return null;
        var tbody = table.querySelector('tbody');
        var rows = tbody ? Array.prototype.slice.call(tbody.rows) : [];
        if (rows.length < 2) return null;               // nothing to gain by splitting
        var head = table.tHead ? table.tHead.offsetHeight : 0;
        var used = head, take = 0;
        for (var i = 0; i < rows.length; i++) {
          var h = rows[i].offsetHeight || 0;
          // NOT "always take the first row": with no room left on the page, taking one
          // anyway put a header and a row past the bottom edge of a sheet that was
          // already full. Nothing fits means nothing fits, and the caller starts a
          // fresh sheet and asks again — where there is a whole page of room.
          if (used + h > room) break;
          used += h; take++;
        }
        // All of it fits, or none of it does — neither is a split.
        if (!take || take >= rows.length) return null;
        /* A DEEP clone, and the rows pruned from each half afterwards.
         *
         * The block being split is not always the table's own wrapper — a centred
         * section wraps it again, and a shallow clone of the outer div rebuilt the
         * table without whatever sat between the two, which lost the centring and the
         * column widths with it. Copying the whole subtree and then deleting rows keeps
         * every wrapper, the colgroup and the header exactly as they were.
         */
        var part = el.cloneNode(true);
        var partRows = part.querySelector('table tbody').rows;
        while (partRows.length > take) partRows[take].parentNode.removeChild(partRows[take]);
        for (var j = 0; j < take; j++) tbody.removeChild(tbody.rows[0]);
        // The caption belongs to the LAST part, where longtable prints it, so a caption
        // inside the wrapper is dropped from every part but the final one.
        var cap = part.querySelector('.prv-caption');
        if (cap) cap.parentNode.removeChild(cap);
        return part;
      }

      var blocks = Array.prototype.slice.call(flow.children);
      // jsdom has no layout, so every height reads 0 and one sheet holds everything.
      // That is the right degradation: the structure is still correct and testable, and
      // the measurement it cannot make is one only a real browser can.
      var sheets = [[]], used = 0;
      function newSheet() { sheets.push([]); used = 0; }
      function push(el, h) { sheets[sheets.length - 1].push(el); used += h; }
      function place(el) {
        var h = el.offsetHeight || 0;
        if (el.classList && el.classList.contains('prv-pagebreak')) {
          if (sheets[sheets.length - 1].length) newSheet();
          return;
        }
        // SEC-4: a heading whose level starts a page. The break belongs BEFORE it, and
        // only when there is already something on the sheet — a document that opens
        // with one should not begin with a blank page, which is what the PDF does too.
        if (el.classList && el.classList.contains('prv-breakbefore') && sheets[sheets.length - 1].length) {
          newSheet();
        }
        if (used + h <= body) { push(el, h); return; }
        // A table continues rather than being clipped: as much of it as fits goes here,
        // and what is left is placed again — on this sheet's successor, with a whole
        // page of room. Each pass takes at least one row, so this terminates.
        var part = splitTable(el, body - used);
        if (part) { push(part, body - used); newSheet(); place(el); return; }
        if (used) { newSheet(); place(el); return; }
        // Taller than a whole page and nothing to split: it gets a page of its own and
        // is allowed to run over rather than being cut at a line nobody chose.
        push(el, h);
      }
      blocks.forEach(place);

      var total = sheets.length;
      var frag = document.createDocumentFragment();
      sheets.forEach(function (list, i) {
        var n = i + 1;
        var first = firstDifferent && n === 1;
        var sheet = document.createElement('div');
        sheet.className = 'rd-sheet';
        sheet.setAttribute('data-prv-sheet', String(n));
        sheet.style.width = pw + 'px';
        sheet.style.height = ph + 'px';
        var head = runningSlots(hf[first ? 'firstHeader' : 'header'] || {}, n, total);
        var foot = runningSlots(hf[first ? 'firstFooter' : 'footer'] || {}, n, total);
        // The margins are the sheet's, so the header sits INSIDE the top margin and the
        // footer inside the bottom one, as they do on the page.
        var pad = ' style="padding:0 ' + mr + 'px 0 ' + ml + 'px;';
        sheet.innerHTML =
          '<div class="rd-sheet-hf rd-sheet-head"' + pad + 'height:' + mt + 'px">' + head + '</div>' +
          '<div class="rd-sheet-body rd-paper"' + pad + 'height:' + body + 'px">' + '</div>' +
          '<div class="rd-sheet-hf rd-sheet-foot"' + pad + 'height:' + mb + 'px">' + foot + '</div>' +
          '<div class="rd-sheet-n">' + n + ' / ' + total + '</div>';
        var target = sheet.querySelector('.rd-sheet-body');
        list.forEach(function (el) { target.appendChild(el); });
        frag.appendChild(sheet);
      });
      flow.parentNode.removeChild(flow);
      host.appendChild(frag);
    }

    function repaint() {
      if (!refresh() && _ctx) _ctx.refreshMain();
      // The workspace re-renders as a string; the sheets are built from what that string
      // became, so this runs after every repaint that could have drawn a paged preview.
      if (_rd.open && _rd.pane === 'preview' && _rd.pages) paginate();
    }
    function quietly(fn) { if (_ctx && _ctx.quietEdit) _ctx.quietEdit(fn); else fn(); }
    /** Any project write invalidates the cached preview — it is a render of the project. */
    function dirty() { _rd.preview = null; }

    /** RPT-3: persist a reorder — move one block id by a step, or before another. */
    function moveSection(project, platform, id, delta, beforeId) {
      var ids = App.generate.reportBlocks(project, platform, opts()).map(function (b) { return b.id; });
      var from = ids.indexOf(id);
      if (from === -1) return;
      var to;
      if (beforeId != null) {
        ids.splice(from, 1);
        var at = ids.indexOf(beforeId);
        to = at === -1 ? ids.length : at;
        ids.splice(to, 0, id);
      } else {
        to = from + delta;
        if (to < 0 || to >= ids.length) return;
        ids.splice(from, 1);
        ids.splice(to, 0, id);
      }
      App.store.setReportOrder(ids);
    }

    function logIssues(res) {
      ((res && res.issues) || []).forEach(function (i) { App.ui.activity.log(i); });
      return res;
    }

    // ---- import / export ------------------------------------------------------

    function doExport(kindKey) {
      var project = App.store.getProject(); if (!project) return;
      var f = App.docTemplates.exportFile(project, kindKey, null);
      if (!f.count) { App.ui.activity.log({ severity: 'warning', message: 'Nothing to export.' }); return; }
      App.util.dom.download(new Blob([f.text], { type: 'application/json' }), f.name);
      App.ui.activity.log({ severity: 'success', message: 'Exported ' + f.count + ' ' + App.docTemplates.KINDS[kindKey].label.toLowerCase() + ' to ' + f.name });
    }

    function doImport(kindKey, file) {
      App.util.dom.readFileText(file).then(function (text) {
        var parsed = App.docTemplates.parseImport(text, kindKey);
        parsed.issues.forEach(function (i) { App.ui.activity.log(i); });
        if (!parsed.ok) { repaint(); return; }
        var project = App.store.getProject();
        var plan = App.docTemplates.plan(project, kindKey, parsed.items);
        if (!plan.conflicts.length) {
          var res = App.docTemplates.apply(plan, {});
          dirty();
          App.ui.activity.log({ severity: 'success', message: 'Imported ' + res.added + ' ' + App.docTemplates.KINDS[kindKey].label.toLowerCase() + '.' });
          repaint();
          return;
        }
        // TPL-3: nothing is written until every collision has an answer.
        _rd.conflict = { kindKey: kindKey, plan: plan, decisions: {} };
        repaint();
      }).catch(function (e) {
        App.ui.activity.log({ severity: 'error', message: 'Could not read that file: ' + (e && e.message) });
      });
    }

    function applyConflict() {
      var c = _rd.conflict; if (!c) return;
      var res = App.docTemplates.apply(c.plan, c.decisions);
      dirty();
      App.ui.activity.log({
        severity: 'success',
        message: 'Imported ' + App.docTemplates.KINDS[c.kindKey].label.toLowerCase() + ': ' +
          res.added + ' added, ' + res.replaced + ' replaced, ' + res.kept + ' kept.'
      });
      _rd.conflict = null;
      repaint();
    }

    // ---- rich-text token insertion -------------------------------------------

    /* -------------------------------------------------------------------------
     * RTX-1: what a toolbar button acts on, now that the box is not a textarea.
     *
     * REF-1: a reference is the interesting case, because it has two shapes.
     *   * with a selection: `{{ref:ID}}the selected words{{/ref}}` — the words become
     *     the link text, which is what someone who highlighted them meant.
     *   * without one: `{{refn:ID}}` and friends, which render as the target's own
     *     number / title / full label at render time.
     * `br` is a marker and never wraps anything; bold/italic/code always wrap.
     *
     * The selection a button is about to act on used to be two character offsets into a
     * textarea's value. It is now two offsets into the box's TOKENS — computed by
     * App.ui.richText, which walks the DOM the box actually holds — and that is what
     * makes the rest of this work unchanged: a pair of numbers into a string survives
     * the workspace repainting, and the box being destroyed and rebuilt, which is
     * exactly what opening the reference menu does.
     *
     * `mousedown` on the buttons is still prevented, so focus never leaves the box.
     *
     * RTX-2: `_sel` also answers "WHICH box" — a table part has one per cell, and the
     * one row of buttons above them acts on whichever was last written in.
     * ---------------------------------------------------------------------- */
    var RT = App.ui.richText;
    var _sel = null;

    /** A selector that finds this box again after the workspace has repainted. */
    function boxKey(el) {
      if (!el || !el.getAttribute) return '';
      if (el.hasAttribute('data-rd-text')) return '[data-rd-text="' + el.getAttribute('data-rd-text') + '"]';
      if (el.hasAttribute('data-rd-intro')) return '[data-rd-intro="' + el.getAttribute('data-rd-intro') + '"]';
      if (el.hasAttribute('data-rd-cell')) {
        return '[data-rd-cell="' + el.getAttribute('data-rd-cell') + '"]' +
          '[data-rd-row="' + el.getAttribute('data-rd-row') + '"]' +
          '[data-rd-col="' + el.getAttribute('data-rd-col') + '"]';
      }
      return '';
    }

    /** Where writing in this box is saved. One place, so every surface commits alike. */
    function boxSaver(el) {
      var sec = el.getAttribute('data-rd-sec');
      if (el.hasAttribute('data-rd-text')) {
        var part = el.getAttribute('data-rd-text');
        return function (next) { return App.docStore.updatePart(sec, part, { text: next }); };
      }
      if (el.hasAttribute('data-rd-intro')) {
        var block = el.getAttribute('data-rd-intro');
        return function (next) { return App.docStore.setBlockIntro(block, next); };
      }
      if (el.hasAttribute('data-rd-cell')) {
        var tbl = el.getAttribute('data-rd-cell');
        var row = Number(el.getAttribute('data-rd-row')), col = Number(el.getAttribute('data-rd-col'));
        return function (next) { return App.docStore.setCell(sec, tbl, row, col, next); };
      }
      return function () { return { ok: true, issues: [] }; };
    }

    /** The document's reference resolver, for re-rendering a box after an edit. */
    function boxHtml(tokens) {
      var p = App.store.getProject();
      var pl = p ? App.registry.getPlatform(p.platformProfileId) : null;
      return RT.toHtml(tokens, { resolveRef: p && pl ? refResolver(p, pl) : null });
    }

    /** Remember where the caret is, in tokens, so a repaint cannot take it away. */
    function noteSelection(el) {
      var key = boxKey(el);
      if (!key) return;
      var at = RT.selectionIn(el, window.getSelection());
      _sel = { key: key, start: at ? at.start : 0, end: at ? at.end : 0 };
    }

    /** The box in this button's group that the caret is actually in, if any. */
    function liveBox(btn) {
      var host = btn && btn.closest ? btn.closest('.rd-part, .rd-fieldset') : null;
      var sel = window.getSelection();
      if (!host || !sel || !sel.rangeCount) return null;
      var n = sel.getRangeAt(0).startContainer;
      while (n && n !== host) {
        if (n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-rd-rich')) return host.contains(n) ? n : null;
        n = n.parentNode;
      }
      return null;
    }

    /** The box a toolbar button belongs to: the one last written in, else the first. */
    function boxFor(btn) {
      if (_sel) {
        var remembered = document.querySelector(_sel.key);
        if (remembered && btn && btn.closest && btn.closest('.rd-part, .rd-fieldset') &&
            btn.closest('.rd-part, .rd-fieldset').contains(remembered)) return remembered;
      }
      var host = btn && btn.closest ? btn.closest('.rd-part, .rd-fieldset') : null;
      return host ? host.querySelector('[data-rd-rich]') : null;
    }

    function insertToken(el, tag) {
      if (!el) return;
      var text = RT.fromNode(el);
      var s = 0, e = 0;
      var live = RT.selectionIn(el, window.getSelection());
      if (live) { s = live.start; e = live.end; }
      // The box may have been rebuilt since the selection was made (the reference menu
      // repaints), so the remembered offsets are the authority when they are for it.
      if (_sel && el.matches && el.matches(_sel.key) && (!live || _sel.end > _sel.start)) {
        s = _sel.start; e = _sel.end;
      }
      var res = RT.applyToken(text, s, e, tag);
      var save = boxSaver(el);
      quietly(function () { logIssues(save(res.text)); });
      dirty();
      // Re-rendered in place rather than by a repaint: a repaint would rebuild the whole
      // workspace and throw the caret away, which is the thing this is trying to keep.
      el.innerHTML = boxHtml(res.text);
      // The caret is remembered as well as placed, so a button pressed straight after —
      // Link, most often — acts where the last one left off rather than at the start.
      _sel = { key: boxKey(el), start: res.caret, end: res.caret };
      RT.placeCaret(el, res.caret, window);
    }

    /** RTX-1: one entry point for all three surfaces — the button says which box. */
    function wrapSelection(btn, tag) { insertToken(boxFor(btn), tag); }

