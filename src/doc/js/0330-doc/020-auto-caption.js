    /**
     * CAP-1: the caption a hand-authored table carries. An author who typed one gets
     * theirs; one who did not still gets a caption, because an uncaptioned table would
     * desynchronise the numbering (above) — and because a numbered, named table is what
     * makes "see Table 4" possible at all.
     */
    function autoCaption(block, part) {
      var own = MD.plain(part.caption || '').trim();
      if (own) return own;
      var sec = String(block.title == null ? block.label : block.title).trim() || String(block.label || '').trim();
      return sec || 'Table';
    }

    /* -------------------------------------------------------------------------
     * DOC-4: rendering a hand-authored section.
     *
     * A custom section is an ordered list of PARTS, because "a heading, then some
     * paragraphs, then a table, then another paragraph" is the actual shape of the
     * writing people do — a fixed header/body/table skeleton would force the author
     * to fight it. Four part kinds cover it: paragraph, table, rule, page break.
     * ---------------------------------------------------------------------- */

    /** One part -> markdown. @param {Object} part @param {Object} ctx {resolveRef, tables} */
    function renderPart(part, ctx) {
      if (!part) return '';
      if (part.kind === 'rule') return MD.rule();
      if (part.kind === 'pagebreak') return MD.pageBreak();
      // SPC-1: a measured gap. A part rather than a property of the part above it,
      // because it is placed and moved like anything else in the section — the space
      // under a paragraph and the space above the signature block are the same object.
      if (part.kind === 'space') return MD.vspace(part.height);
      if (part.kind === 'para') {
        var body = MD.rich(part.text, { resolveRef: ctx.resolveRef, linkTerms: ctx.linkTerms });
        if (!body) return '';
        // A part inside an already-centred section is not centred a second time: two
        // nested `center` environments contribute their vertical space twice, which on a
        // title page — the thing people centre — is a visible gap nobody asked for.
        if (part.centre && !ctx.centred) body = MD.centred(body);
        // REF-1: an empty span before the paragraph, so a reference can land on this
        // paragraph rather than on the section it happens to sit in. Pandoc turns it
        // into `\hypertarget{…}{}`, which is exactly what a heading's own id becomes.
        // A part with no id is not addressable and gets no anchor — every part the
        // designer creates has one, but App.doc is also called with hand-built shapes.
        return part.id ? '[]{#' + MD.anchor('par-' + part.id) + '}\n\n' + body : body;
      }
      if (part.kind === 'table') {
        /* RTX-2: a cell holds the same rich text a paragraph does.
         *
         * It used to be handed straight to MD.cell, which escapes and marks long
         * identifiers and does nothing else — so a cell was the one place in a
         * hand-authored section where bold, a code span, a line break or a
         * cross-reference could not be written. Same tokens, same writer, same
         * resolver; only the line-separator differs, and richCell owns that.
         */
        var cellOpts = { resolveRef: ctx.resolveRef, linkTerms: ctx.linkTerms };
        var head = (part.header || []).map(function (h) { return MD.richCell(h, cellOpts); });
        var rows = (part.rows || []).map(function (r) {
          // Ragged rows are padded, never dropped: a half-filled table is a table the
          // author is still writing, and losing the row they just added is worse than
          // an empty cell.
          var out = [];
          for (var i = 0; i < head.length; i++) out.push(MD.richCell(r && r[i] != null ? r[i] : '', cellOpts));
          return out;
        });
        if (!head.length) return '';
        var meta = (ctx.tables || []).filter(function (t) { return t.id === part.id; })[0];
        var tbl = MD.table(head, rows, {
          align: part.align || [],
          // TW-1: widths are per-column fractions the author dragged; absent means the
          // old behaviour (each column as wide as its content).
          widths: (part.widths && part.widths.length === head.length) ? part.widths : null,
          // SPC-1: extra millimetres under the body rows that were ticked — a table used
          // as a form. No ticks recorded means every row, which is what it meant before
          // there were ticks.
          rowHeight: part.rowHeight,
          tallRows: (part.tallRows && part.tallRows.length === (part.rows || []).length) ? part.tallRows : null,
          // TBS-1: the table says whether it is styled; the profile says how.
          style: ctx.styleFor ? ctx.styleFor(part) : null,
          metrics: ctx.metrics || null,
          caption: meta ? { id: part.id, text: meta.caption } : null
        });
        return (part.centre && !ctx.centred) ? MD.centred(tbl) : tbl;
      }
      return '';
    }

    /** A whole custom section's body (its parts, in order) -> markdown. */
    function renderParts(parts, ctx) {
      return MD.join((parts || []).map(function (p) { return renderPart(p, ctx); }));
    }

    /**
     * Emit one block's heading line. Level 5 emits nothing — that is what "normal
     * text" means — and the block's body simply continues under whatever heading
     * preceded it.
     */
    /**
     * @param {Object} b  the block
     * @param {string} [gap]  SPC-1: the space-above macro call, which has to sit BETWEEN
     *        the styling declarations and the heading itself — the title's `\chTitleStyle`
     *        sets `\sectionbreak`, and a gap emitted ahead of it would have its one-shot
     *        overwritten before titlesec ever called it.
     */
    function headingFor(b, gap) {
      gap = gap ? gap + '\n\n' : '';
      if (b.level === BODY_LEVEL) return '';
      var title = String(b.title == null ? b.label : b.title).trim();
      if (!title) return '';
      // TTL-1: a title prints at the top level and carries no number. It is the same
      // `#` an H1 emits — what separates them is the numbering, and (TTL-3) the styling
      // the two macros below switch between.
      var lvl = b.level === TITLE_LEVEL ? 1 : b.level;
      /* TOC-1: a contents list does not list itself. Its heading is a heading like any
       * other and would otherwise land in the .toc file with the rest — pandoc's
       * `.unnumbered .unlisted` pair emits `\section*` with no `\addcontentsline`,
       * which is the one thing that keeps it out (verified against pandoc 3.1.11).
       *
       * SEC-4: any section can now ask for the same treatment. A title block, a
       * colophon or a signature page prints a heading and has no business in the
       * contents list, and until now the only way to keep one out was to give it no
       * heading at all — which also took away its anchor, and with it every
       * cross-reference to it.
       *
       * D-063: it has to be the PAIR, and `.unlisted` on its own did nothing at all.
       *
       * Pandoc's `unlisted` is only read alongside `unnumbered` — measured on 3.1.11, not
       * inferred: `# X {.unlisted}` comes out as a plain `\section{X}`, and `\section`
       * puts itself in the .toc whatever the class said. So the switch worked in the
       * preview (which builds its own contents list from the outline) and did nothing in
       * the PDF, which is the only place it matters.
       *
       * The pair was avoided because "unnumbered" sounds like it takes the number away.
       * It does not, here: `numbersections` is false for the whole document — App.doc
       * writes every number into the heading TEXT, because LaTeX cannot produce the
       * numbering this document uses — so `.unnumbered` changes exactly one thing,
       * `\section` to `\section*`, and that is what stops the `\addcontentsline`. The
       * heading still reads "3 Approval", titlesec still styles it, `\sectionbreak` still
       * fires for it (all three measured on a built page), and the `\label` is still
       * emitted, so every cross-reference to it still lands. */
      var classes = (b.kind === 'toc' || b.noToc) ? ['unnumbered', 'unlisted'] : null;
      var head = MD.heading(lvl, (b.number ? b.number + ' ' : '') + MD.text(title), b.anchor, classes);
      /* TTL-3: a title's own styling, switched on for this heading and off again after.
       *
       * Both levels emit `\section`, so the profile's title row cannot reach the page as
       * a second `\titleformat` in the preamble — the later one would simply win for
       * both. It reaches it as a pair of declarations around the one heading instead.
       * See App.docFormat.styleMacro for why this is not a `\begingroup`.
       *
       * CTR-1: centring is another face of the same declaration, so it is chosen here
       * rather than wrapped around the heading. A `center` environment around a heading
       * left it justified (titlesec sets the text in a box `\centering` does not reach)
       * and put a blank page in front of it (the environment's glue fires before
       * `\sectionbreak`) — both measured, both gone with the environment.
       */
      if (b.level === TITLE_LEVEL) {
        return MD.rawLatex(b.centre ? '\\chTitleStyleCentred' : '\\chTitleStyle') +
          '\n\n' + gap + head + '\n\n' + MD.rawLatex('\\chSectionStyle');
      }
      if (b.centre) {
        var word = CENTRE_WORDS[lvl - 1];
        if (word) return MD.rawLatex('\\chCentre' + word) + '\n\n' + gap + head + '\n\n' + MD.rawLatex('\\chPlain' + word);
      }
      return gap + head;
    }

    /* SPC-1: the macro call that puts a section further down its page.
     *
     * Named by level rather than written as a `\vspace`, because whether the gap has to
     * clear the page first is the PROFILE's answer (App.docFormat.gapMacro) — the same
     * division of labour as \chCentreOne above. A section with no heading has no break
     * hook to work through and takes the plain skip.
     */
    var GAP_NAMES = ['One', 'Two', 'Three', 'Four'];
    function gapFor(b) {
      if (!(Number(b.spaceBefore) > 0)) return '';
      var title = String(b.title == null ? b.label : b.title).trim();
      if (b.level === BODY_LEVEL || !title) return MD.vspace(b.spaceBefore);
      var name = b.level === TITLE_LEVEL ? 'Title' : GAP_NAMES[b.level - 1];
      if (!name) return MD.vspace(b.spaceBefore);
      var len = MD.mmLen(b.spaceBefore);
      return len ? MD.rawLatex('\\chGap' + name + '{' + len + '}') : '';
    }

    /* CAP-3: the caption a reader sees, written by this module rather than by LaTeX.
     *
     * App.md emits a table as an anchor line, the table, and a `: caption` marker —
     * pandoc's own caption syntax, which put the text inside the longtable's first head
     * and therefore always ABOVE the table, and which numbered it with LaTeX's counter
     * rather than the one every cross-reference in this document is written against.
     *
     * Rewriting the marker here settles both at once: the number is the number
     * tableIndex already assigned (so "see Table 4" and the caption on that table are
     * the same string by construction, not by two counters agreeing), and the caption
     * is an ordinary paragraph, which can therefore sit on either side of the table.
     * The two macros around it carry the look, and live in the formatting profile.
     *
     * The number is prefixed as plain text and needs no escaping: it is digits, dots
     * and a colon, and the line begins with the word "Table", so nothing in it can be
     * read as a list marker or any other markdown construct.
     */
    function captionBlock(number, text) {
      return MD.rawLatex('\\chCaptionOpen') + '\n\n' +
        'Table ' + number + ': ' + text + '\n\n' +
        MD.rawLatex('\\chCaptionClose');
    }

    /**
     * Replace every `: caption` marker in one body with its numbered caption.
     * @param {string} md
     * @param {function():string} nextNumber  consumed in emitted order, as tableIndex assigned them
     * @param {boolean} above  put the caption before the table rather than after it
     */
    function captionise(md, nextNumber, above) {
      if (!md || md.indexOf('[]{#tbl-') === -1) return md;
      var lines = String(md).split('\n'), out = [], anchorAt = -1, open = false;
      for (var i = 0; i < lines.length; i++) {
        if (TBL_ANCHOR.test(lines[i])) { open = true; anchorAt = out.length; out.push(lines[i]); continue; }
        var c = open ? TBL_CAPTION.exec(lines[i]) : null;
        if (!c) { out.push(lines[i]); continue; }
        var block = captionBlock(nextNumber(), c[1].trim());
        // Above, the caption goes OUTSIDE the group the table may be wrapped in (the
        // anchor is the first line of that unit); below, it stays where the marker was.
        if (above) out.splice(anchorAt, 0, block, '');
        else out.push(block);
        open = false;
      }
      return out.join('\n');
    }

    /**
     * DOC-2: assemble the finished document.
     *
     * @param {{title:string, frontMatter?:Array, blocks:Array}} spec
     *        Each block is an outline() result plus a `body` string of ready markdown
     *        (already escaped by its producer) and/or `parts` for a custom section.
     * @returns {string} the complete .md file
     */
    function render(spec) {
      spec = spec || {};
      var resolved = spec.blocks || [];
      var tables = tableIndex(resolved);
      var ctx = { resolveRef: refResolver(resolved, tables), tables: tables, styleFor: spec.styleFor || null,
        metrics: spec.metrics || null, linkTerms: spec.linkTerms || null };
      // CAP-3: the numbers, in emitted order — the same order tableIndex assigned them
      // and the same order render walks, so the two cannot drift apart.
      var queue = tables.map(function (t) { return t.number; }), qi = 0;
      var nextNumber = function () { return queue[qi++] || String(qi); };
      var above = spec.captionPosition === 'above';
      var out = [];
      /* HDR-1: a raw block that has to be the FIRST thing in the body.
       *
       * `\thispagestyle` applies to the page it is issued on, so a different first page
       * can only be asked for from inside the document — the preamble has no way to
       * name page 1. Kept as a spec field rather than built here, because which style
       * (if any) page 1 wears is a formatting decision and App.doc has no profile.
       */
      if (spec.prologue) out.push(MD.rawLatex(spec.prologue));
      resolved.forEach(function (b) {
        // SPC-1: the gap belongs to the heading, not to the vertical list before it —
        // see gapFor. A section with no heading gets it as a plain skip instead.
        var gap = gapFor(b);
        var h = headingFor(b, gap);
        if (!h && gap) out.push(gap);
        var centred = b.centre && b.kind === 'custom';
        var body = b.kind === 'custom'
          ? renderParts(b.parts, centred ? Object.assign({}, ctx, { centred: true }) : ctx)
          : (b.body || '');
        /* CTR-1: a HAND-AUTHORED section's centring, which never reached the document.
         *
         * A generated section is centred by App.docGen.sectionContent, which is where
         * its body is built. A custom section's body is built HERE, from its parts, and
         * nothing centred it — so the switch worked in the per-section preview (which
         * centres it itself) and did nothing in the .md. Exactly the sections people
         * centre, too: a title page is always hand-authored.
         */
        if (centred && body) body = MD.centred(body);
        /* TBL-1: a grouped register's tables, under the section rather than under
         * sub-headings of their own. They used to be flattened into the block list by
         * outline() and emitted as blocks; now they are simply the rest of this
         * section's body, in declaration order — which is the order tableIndex counts
         * them in, so the captions and the cross-references still agree. */
        (b.children || []).forEach(function (c) { if (c && c.body) body = MD.join([body, c.body]); });
        body = captionise(body, nextNumber, above);
        // SEC-1/SEC-2: the introduction sits between the heading and whatever the
        // register produced, and carries its number when it has one. The number is
        // escaped because `4.1` in column 1 is an ordered-list marker in markdown.
        //
        // REF-1: rendered HERE rather than by the generator, which is the whole of the
        // fix for "links only work in custom sections". The generator fills a section's
        // body before the outline exists, so it had no reference resolver to hand and
        // called `MD.rich(intro, {})` — every {{ref:…}} in an introduction resolved to
        // nothing. By the time render() walks the blocks the outline and the table index
        // are both built, so an introduction gets exactly the ctx a custom paragraph does.
        var intro = b.introBody != null ? String(b.introBody)
          : (String(b.intro || '').trim() ? MD.rich(b.intro, ctx) : '');
        if (intro && b.introNumber) intro = MD.text(b.introNumber) + ' ' + intro;
        /* SEC-4: the section's own page break, and only when its LEVEL is not already
         * making one.
         *
         * The formatting profile's per-level `pageBreakBefore` reaches the page as
         * `\sectionbreak` — LaTeX's own hook, invisible to this module. Emitting a
         * `\newpage` here as well gave two breaks and therefore a blank page between
         * them, which is exactly the fault D-038 was about. `levelBreaks` says which
         * levels already break, so the two can never both fire.
         */
        var levelBreaks = spec.levelBreaks || {};
        if (b.pageBreakBefore && !levelBreaks[b.level]) out.push(MD.pageBreak());
        if (h) out.push(h);
        if (intro) out.push(intro);
        if (body) out.push(body);
      });
      var doc = MD.join(out);
      return spec.frontMatter ? spec.frontMatter + '\n\n' + doc + '\n' : doc + '\n';
    }

    App.doc = {
      LEVELS: LEVELS, BODY_LEVEL: BODY_LEVEL, TITLE_LEVEL: TITLE_LEVEL, levelLabel: levelLabel,
      outline: outline, refResolver: refResolver, refTargets: refTargets,
      tableIndex: tableIndex, scanTables: scanTables, autoCaption: autoCaption,
      renderPart: renderPart, renderParts: renderParts,
      headingFor: headingFor, gapFor: gapFor, render: render
    };
  })(App);
