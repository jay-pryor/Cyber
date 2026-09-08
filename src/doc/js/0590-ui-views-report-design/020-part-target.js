    /* -------------------------------------------------------------------------
     * TW-1/TW-2: one column-width editor, two places it appears.
     *
     * A hand-authored table has a real table to drag on, so its grips sit on the header
     * cells. A GENERATED table has no editable table in the pane at all — its content
     * comes from the register — so the same grips sit on a strip of labelled segments
     * that stands in for it. Both write through the same two docStore calls and both
     * read their totals from the same `widthTotal`, so the two editors cannot end up
     * disagreeing about what a width is.
     *
     * `data-rd-wt` is the target: `p|<sectionId>|<partId>` for a part, `b|<blockId>|<n>`
     * for a block. One string means one drag handler and one typed-value handler rather
     * than two of each.
     * ---------------------------------------------------------------------- */

    function partTarget(secId, partId) { return 'p|' + secId + '|' + partId; }
    function blockTarget(blockId, count) { return 'b|' + blockId + '|' + count; }

    /** The percentage chip: reads as text, and edits as a number on double-click. */
    function pctChip(target, col, pct, auto) {
      return '<span class="rd-colpct' + (auto ? ' auto' : '') + '" data-rd-pct="' + esc(target) + '" data-rd-col="' + col + '"' +
        ' tabindex="0" role="button"' +
        ' title="' + (auto
          ? 'Automatic — as wide as the content. Drag an edge, or double-click here to type a width.'
          : 'This column’s share of the table. Double-click to type one.') + '">' + pct + '%</span>';
    }

    /** The resize grip. The LAST column has none: its edge is the page's, not the table's. */
    function grip(target, col, last) {
      if (last) return '';
      return '<span class="rd-colresize" data-rd-colresize data-rd-wt="' + esc(target) + '" data-rd-col="' + col + '"' +
        ' title="Drag to set this column’s share of the table"></span>';
    }

    /** TW-1/TW-3: the line under a width editor — what the shares add up to, and what
     *  that means for the table. */
    function widthNote(widths, auto, resetAttr) {
      var reset = '<button type="button" ' + resetAttr + (auto ? ' disabled' : '') +
        ' title="Hand the columns back to automatic widths">Reset widths</button>';
      if (auto) {
        return '<div class="rd-tablebtns">' + reset +
          '<span class="muted rd-part-note">Automatic widths — drag a column edge, or double-click a percentage to type one.</span></div>';
      }
      var t = App.docStore.widthTotal(widths);
      var msg = t.ok
        ? '<span class="muted rd-part-note">Columns total ' + t.total + '% — the table fills the page width.</span>'
        : t.over
          // Asked for more page than there is. Said in red, because the table WILL be
          // rendered — capped at the full width, with the columns scaled to fit — and a
          // silently different table is worse than a stated one.
          ? '<span class="rd-wflag">⚠ Columns total ' + t.total + '% — more than the page has. The table will be capped at full width and the columns scaled to fit, so none will be the width you typed.</span>'
          // Under is not a fault. It is how you make a table narrower than the page.
          : '<span class="rd-wnote">Columns total ' + t.total + '% — the table will be ' + t.total + '% of the page width, centred.</span>';
      return '<div class="rd-tablebtns">' + reset + msg + '</div>';
    }

    /**
     * TW-2: the stand-in strip for a generated section's table.
     * @param {Array<{id:string,label:string}>} columns @param {?number[]} widths
     */
    function widthStrip(project, blockId, columns, widths) {
      var n = columns.length;
      var auto = !(widths && widths.length === n);
      var shown = auto ? App.docStore.evenWidths(n) : widths;
      var target = blockTarget(blockId, n);
      var px = textWidthPx(App.docFormat.resolve(project));
      // Drawn TO SCALE against the page: each segment is its own share of the strip, so
      // a set totalling 60% visibly leaves 40% of the strip empty — which is the whole
      // point of allowing it. It also makes the drag arithmetic honest, since a pointer
      // position over the strip is directly a share of the page.
      var segs = columns.map(function (c, i) {
        var pct = Math.round(shown[i] * 1000) / 10;
        return '<span class="rd-wseg" style="width:' + Math.min(100, shown[i] * 100) + '%">' +
          '<span class="rd-wlabel" title="' + esc(c.label) + '">' + esc(c.label) + '</span>' +
          pctChip(target, i, pct, auto) + grip(target, i, i === n - 1) + '</span>';
      }).join('');
      return '<div class="rd-fieldset"><strong>Column widths</strong>' +
        '<p class="muted">These are the columns this section’s table will have. Drag an edge to change the split, or double-click a percentage to type one. ' +
        'The strip is the page’s text width, so a set that does not fill it makes a table narrower than the page.</p>' +
        (n < 2
          ? '<p class="muted">A one-column table has no width to set.</p>'
          : '<div class="rd-widthbar" style="width:' + px + 'px">' + segs + '</div>' +
            widthNote(auto ? null : widths, auto, 'data-rd-block-autowidth="' + esc(blockId) + '"')) +
        '</div>';
    }

    function tableEditor(project, sec, part, i, n) {
      var head = part.header || [], rows = part.rows || [], align = part.align || [];
      var widths = (part.widths && part.widths.length === head.length) ? part.widths : null;
      var auto = !widths;
      var px = textWidthPx(App.docFormat.resolve(project));
      // TW-3: the table is drawn at its share of the page, inside a full-width box. So a
      // set totalling 60% shows a 60% table, and the drag — measured against the BOX,
      // not the table — still reads as a share of the page.
      var sum = widths ? Math.min(1, widths.reduce(function (a, w) { return a + w; }, 0)) : 1;
      var tablePx = Math.max(180, Math.round(px * (sum > 0 ? sum : 1)));
      // SPC-1: with a height set, each row says whether it takes it — see the tick below.
      var rowMm = App.docStore.mmValue(part.rowHeight);
      var group = '<colgroup>' + head.map(function (_, c) {
        return '<col style="width:' + (widths ? (widths[c] / sum * 100) : (100 / head.length)) + '%">';
      }).join('') + '<col style="width:' + (rowMm ? 58 : 34) + 'px"></colgroup>';

      var target = partTarget(sec.id, part.id);
      var ths = head.map(function (h, c) {
        var pct = widths ? Math.round(widths[c] * 1000) / 10 : Math.round(1000 / head.length) / 10;
        // RTX-2: a heading is prose like any other cell, so it takes the same box.
        return '<th>' + richBox(project,
            'data-rd-cell="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-row="-1" data-rd-col="' + c + '"' +
            ' aria-label="Column ' + (c + 1) + ' heading"', h, 'rd-cellbox') +
          '<span class="rd-colbar">' +
            '<select data-rd-align="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-col="' + c + '" aria-label="Column ' + (c + 1) + ' alignment" title="Column alignment">' +
              ['l', 'c', 'r'].map(function (a) { return '<option value="' + a + '"' + ((align[c] || 'l') === a ? ' selected' : '') + '>' + (a === 'l' ? '⇤' : a === 'c' ? '↔' : '⇥') + '</option>'; }).join('') +
            '</select>' +
            pctChip(target, c, pct, auto) +
            '<button type="button" class="danger" data-rd-delcol="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-col="' + c + '"' + (head.length <= 1 ? ' disabled' : '') + ' title="Delete this column">✕</button>' +
          '</span>' + grip(target, c, c === head.length - 1) + '</th>';
      }).join('');
      /* SPC-1: the tick only appears once there is a height to apply — a column of ticks
       * that do nothing is worse than no column at all. */
      var trs = rows.map(function (r, ri) {
        var tall = App.docStore.rowTall(part, ri);
        return '<tr>' + head.map(function (_, c) {
          return '<td>' + richBox(project,
            'data-rd-cell="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-row="' + ri + '" data-rd-col="' + c + '"' +
            ' aria-label="Row ' + (ri + 1) + ' column ' + (c + 1) + '"', r[c], 'rd-cellbox') + '</td>';
        }).join('') + '<td class="rd-rowdel">' +
          (rowMm
            ? '<input type="checkbox" class="rd-tallbox" data-rd-tallrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) +
              '" data-rd-row="' + ri + '"' + (tall ? ' checked' : '') +
              ' title="' + (tall ? 'This row is ' + esc(String(rowMm)) + 'mm taller — untick to leave it at its content'
                                 : 'Tick to make this row ' + esc(String(rowMm)) + 'mm taller') + '"' +
              ' aria-label="Extra height on row ' + (ri + 1) + '">'
            : '') +
          '<button type="button" class="danger" data-rd-delrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" data-rd-row="' + ri + '" title="Delete this row">✕</button></td></tr>';
      }).join('');
      var host = 'data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"';
      return '<div class="rd-part" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Table</span>' +
          /* RTX-2: the same toolbar a paragraph has, acting on whichever CELL was last
           * written in. A cell holds the same token markup a paragraph does, so there is
           * no reason for it to be the one place bold and a cross-reference are missing —
           * and every reason for it not to be, since a table is where the prose that
           * needs a reference usually ends up. */
          '<span class="rd-tbs">' + toolbar(host) +
            '<button type="button" class="rd-tb" data-rd-ref-open="' + esc(part.id) + '" title="Insert a cross-reference into the cell you were writing in">🔗 Link</button>' +
          '</span>' +
          cb('data-rd-part-flag="centre" ' + host, 'Centre', part.centre === true) +
          // TBS-1: this table opts in; the Formatting pane decides what opting in looks like.
          cb('data-rd-part-flag="styleHead" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'Style header row', part.styleHead === true) +
          cb('data-rd-part-flag="styleFirstColumn" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'Style first column', part.styleFirstColumn === true) +
          // CAP-4: a table that names itself in its own title row, or one that is simply
          // a layout, does not want "Table 7:" underneath it.
          cb('data-rd-part-flag="noCaption" data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"', 'No caption', part.noCaption === true) +
          partControls(sec, part, i, n) + '</div>' +
        refMenu(project, sec, part) +
        (part.noCaption === true
          ? '<p class="muted rd-part-note">Uncaptioned, so this table takes no number and cannot be cross-referenced.</p>'
          : '<input class="rd-cap" value="' + esc(part.caption || '') + '" data-rd-caption="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" placeholder="Table caption — left blank, the section’s heading is used" aria-label="Table caption">') +
        '<div class="rd-tablewrap"><div class="rd-tablescale" style="width:' + px + 'px">' +
          '<table class="rd-table rd-table-fixed" style="width:' + tablePx + 'px">' + group +
          '<thead><tr>' + ths + '<th class="rd-rowdel' + (rowMm ? ' rd-rowdel-wide' : '') + '"' +
            (rowMm ? ' title="Which rows take the extra height">↕' : '>') + '</th></tr></thead><tbody>' + trs + '</tbody></table></div></div>' +
        '<div class="rd-tablebtns">' +
          '<button type="button" data-rd-addrow="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '">+ Row</button>' +
          '<button type="button" data-rd-addcol="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '">+ Column</button>' +
          /* SPC-1: the table as a FORM. A signature block is a table whose cells are
           * mostly empty and need to be big enough to write in, and nothing in a
           * markdown table can say how tall a row is — so it is said here, in the same
           * millimetres the Space part uses. */
          '<label class="rd-mmlab rd-rowh">Extra row height' +
            '<input class="rd-mm" type="number" min="0" max="' + App.docStore.MAX_SPACE_MM + '" step="1"' +
              ' value="' + esc(String(App.docStore.mmValue(part.rowHeight) || '')) + '"' +
              ' data-rd-rowheight="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' +
              ' placeholder="0" aria-label="Extra height for every row of this table, in millimetres"> mm' +
          '</label>' +
        '</div>' +
        (rowMm ? rowHeightNote(part, rows.length, rowMm) : '') +
        widthNote(widths, auto, 'data-rd-autowidth="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"') +
        '</div>';
    }

    /**
     * SPC-1: what the extra row height is currently doing, in a sentence.
     *
     * It says WHICH rows because the answer is not visible from the number: a table with
     * two of five rows ticked and a table with all five look the same in the editor until
     * you count the ticks.
     */
    function rowHeightNote(part, n, mm) {
      var tall = 0;
      for (var i = 0; i < n; i++) if (App.docStore.rowTall(part, i)) tall++;
      var which = tall === n
        ? 'Every body row is'
        : tall === 0
          ? 'No row is currently ticked, so nothing is'
          : tall + ' of the ' + n + ' body rows are';
      return '<p class="muted rd-part-note">' + which + ' <strong>' + esc(String(mm)) +
        'mm</strong> taller than its content, with the content at the top — space to sign or write in. ' +
        'The ticks in the last column choose which.</p>';
    }

    function simplePart(sec, part, i, n, label, note) {
      return '<div class="rd-part rd-part-simple" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">' + esc(label) + '</span>' +
          '<span class="muted rd-part-note">' + esc(note) + '</span>' + partControls(sec, part, i, n) + '</div></div>';
    }

    /**
     * SPC-1: the Space part — a gap with a size, placed and moved like any other part.
     *
     * It shows the measurement AND draws it, because a number of millimetres means very
     * little until you have seen one: the strip under the box is the gap, at the scale
     * the paper beside it is drawn at.
     */
    function spaceEditor(sec, part, i, n) {
      var mm = App.docStore.mmValue(part.height);
      return '<div class="rd-part rd-part-simple" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Space</span>' +
          '<label class="rd-mmlab">' +
            '<input class="rd-mm" type="number" min="0" max="' + App.docStore.MAX_SPACE_MM + '" step="1"' +
              ' value="' + esc(String(mm || '')) + '" data-rd-space="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' +
              ' aria-label="Height of this space in millimetres"> mm' +
          '</label>' +
          '<span class="muted rd-part-note">Empty space down the page. Survives a page break, so a section pushed to the middle of its own page stays there.</span>' +
          partControls(sec, part, i, n) + '</div>' +
        (mm ? '<div class="rd-mmshow" style="height:' + App.docFormat.mmPx(mm) + 'px"></div>' : '') +
        '</div>';
    }

    /**
     * RD-8: the selected section, rendered on its own.
     *
     * Built from `App.docGen.sectionContent` — the same call the host's own generator makes for
     * that block — then through the same markdown renderer as the full preview. So
     * what a section's tab shows and what the section looks like in the finished
     * document come from one code path and cannot drift.
     */
    /**
     * RD-9: a hand-authored section previewed on its own tab, exactly as a generated one
     * already was.
     *
     * It renders through App.doc.renderParts with the SAME ctx the whole document builds
     * with — the real table index, the real reference resolver, the real width and style
     * resolver — so a cross-reference reads its true number here, a captioned table its
     * true one, and a styled table shows its styling. Anything less would be a second
     * renderer, and a second renderer is a second answer.
     */
    function customPreview(project, block) {
      try {
        // Filled, so a reference to a register table resolves here exactly as it will
        // in the document rather than reading "[missing reference]".
        var view = filledView(project);
        var resolved = view.resolved.filter(function (r) { return r.id === block.id; })[0];
        var ctx = docCtx(project, view);
        // `centred` so a part inside a centred section is not wrapped twice — the same
        // ctx App.doc.render builds, so the preview and the document agree.
        var body = App.doc.renderParts(block.parts || [],
          block.centre ? Object.assign({}, ctx, { centred: true }) : ctx);
        if (block.centre && body) body = MD.centred(body);
        var md = MD.join([resolved ? App.doc.headingFor(resolved) : '', body]);
        if (!String(md).trim()) return '<p class="muted">Nothing in this section yet.</p>';
        return '<div class="rd-preview-doc rd-secprev">' + paper(project, App.ui.mdPreview.toHtml(withTags(md)).html) + '</div>';
      } catch (e) {
        return '<p class="rd-err">Preview failed: ' + esc(e && e.message) + '</p>';
      }
    }

    /**
     * REF-1: the outline with every generated section's body FILLED IN.
     *
     * `outlineNow` gives the blocks and their numbers, and that is all a section list
     * needs. A reference does need more: a generated table exists only inside the
     * markdown its register produced, and `App.doc.tableIndex` reads the tables back out
     * of that markdown. Outlining the empty blocks therefore found the hand-authored
     * tables and none of the generated ones — so the link menu offered a document's
     * worth of sections and not one of its register tables.
     *
     * The same call `buildReport` makes, so what the menu offers is exactly what the
     * document will contain. Only built when something asks for it (the link menu, a
     * section preview), because filling every section is the expensive half of
     * generating.
     */
    function filledView(project) {
      var view = outlineNow(project);
      var selId = selectedDeviceId(project);
      if (!selId) return view;
      try {
        var generatedUtc = H().clock.nowIso();
        var ctx = H().subject.context(selId, generatedUtc);
        var metaRows = H().subject.chosenMeta(selId, generatedUtc);
        var o = Object.assign({}, opts(), { deviceId: selId });
        o.linkTerms = H().linkTerms ? H().linkTerms(view.blocks) : null;
        o.providers = runSections(selId);
        var filled = view.blocks.map(function (b) {
          return App.docGen.sectionContent(H(), b, o, ctx, metaRows);
        });
        return Object.assign({}, view, { resolved: App.doc.outline(filled, {
          baseLevel: 1,
          clampSkips: view.profile.headings.clampSkips !== false,
          numbered: view.profile.headings.numbered !== false
        }) });
      } catch (e) {
        return view;                       // a broken section must not empty the menu
      }
    }

    /**
     * REF-1: the ctx App.doc renders a document with — the real reference resolver, the
     * real table index, the real control link terms. Built once here so a per-section
     * preview and the whole-document preview cannot answer differently.
     */
    function docCtx(project, view) {
      var tables = App.doc.tableIndex(view.resolved);
      return {
        resolveRef: App.doc.refResolver(view.resolved, tables),
        tables: tables,
        linkTerms: H().linkTerms ? H().linkTerms(view.blocks) : null,
        metrics: App.docFormat.tableMetrics(view.profile),
        styleFor: function (part) {
          return App.docFormat.tableStyle(view.profile, { head: part.styleHead === true, firstColumn: part.styleFirstColumn === true });
        }
      };
    }

    /**
     * GEN-TAB: a preview shows the placeholders as they have been filled in.
     *
     * The whole-document preview gets this for free — it goes through `buildReport`,
     * which substitutes on its way out. The per-section previews do not: they assemble
     * markdown themselves and never reach `emitDocument`, so a section whose heading is
     * "Packages as at /[Date]" previewed with the raw tag while the document it is a
     * preview OF said the date. One line, and the two agree again.
     */
    function withTags(md) { return App.docGen.applyTags(md, opts().tags); }

    /** SEC-1/REF-1: a generated section's introduction, numbered and reference-resolved. */
    function introMd(project, block, resolved) {
      if (!String(block.intro || '').trim()) return '';
      var body = MD.rich(block.intro, docCtx(project, filledView(project)));
      if (!body) return '';
      return (resolved && resolved.introNumber) ? MD.text(resolved.introNumber) + ' ' + body : body;
    }

    function sectionPreview(project, block) {
      if (block && block.kind === 'custom') return customPreview(project, block);
      var selId = selectedDeviceId(project);
      if (!selId) return '<p class="muted">No device selected — nothing to preview.</p>';
      try {
        var generatedUtc = H().clock.nowIso();
        var ctx = H().subject.context(selId, generatedUtc);
        var filled = App.docGen.sectionContent(H(), block,
          Object.assign({}, opts(), { deviceId: selId, providers: runSections(selId) }), ctx,
          H().subject.chosenMeta(selId, generatedUtc));
        // Numbered as it will actually be numbered, so the preview reads as the page.
        var resolved = outlineNow(project).resolved.filter(function (r) { return r.id === block.id; })[0];
        var md = App.md.join([
          // The HEADING, not the name (NAM-1): `resolved` already carries the heading as
          // `title`, and forcing the label in here was showing the section list's
          // shorthand in a preview of the page, where the page will print the heading.
          resolved ? App.doc.headingFor(resolved) : '',
          // SEC-1/SEC-2: the introduction, with the number it will actually carry. The
          // number comes from `resolved`, which is the same outline the document uses,
          // so the preview cannot show a different one. REF-1: rendered through the real
          // document ctx, so a cross-reference in an introduction reads here exactly as
          // it will on the page rather than as "[missing reference]".
          introMd(project, block, resolved),
          filled.body || '',
          (filled.children || []).map(function (c) {
            var lvl = Math.min((resolved ? resolved.level : 1) + 1, 4);
            return App.md.join([App.md.heading(lvl, App.md.text(c.label)), c.body]);
          }).join('\n\n')
        ]);
        if (!String(md).trim()) return '<p class="muted">This section is empty for the selected device.</p>';
        return '<div class="rd-preview-doc rd-secprev">' + paper(project, App.ui.mdPreview.toHtml(withTags(md)).html) + '</div>';
      } catch (e) {
        return '<p class="rd-err">Preview failed: ' + esc(e && e.message) + '</p>';
      }
    }

