    // ======================================================================
    // wiring: wireSections
    //
    // What the document contains and in what order: inclusion ticks, the ordering
    // buttons and the drag that does the same job, per-section placement and naming,
    // heading levels, the hand-authored sections and the parts inside them.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireSections(h) {
      var dom = h.dom, ctx = h.ctx;
      var P = h.P;

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
          var cols = block ? App.docGen.sectionColumns(H(), block, opts()) : null;
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
        // The category's own declared default, so a tick returned to it stores nothing.
        var cat = ((H().filter && H().filter.categories()) || []).filter(function (c) { return c.key === k; })[0];
        var dflt = !cat || cat.defaultOn !== false;
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
        quietly(function () { App.docStore.setReportOrder([]); });
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
        App.docHost.log({ severity: 'success', message: 'Saved section template "' + name.trim() + '".' });
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
    }
