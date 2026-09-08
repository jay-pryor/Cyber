    /**
     * @param {string} md  a complete generated document
     * @returns {{html:string, outline:Array<{level:number,number:string,title:string,anchor:string}>}}
     */
    function toHtml(md, state, opts) {
      // The table counter is shared with a nested render (a centred block re-enters
      // here) so numbering runs through the document rather than restarting inside one.
      state = state || { tables: 0 };
      // SEC-4: which heading levels start a page — the profile's, passed in by the caller.
      if (opts && opts.breaks) state.breaks = opts.breaks;
      var split = splitFrontMatter(md);
      // The centred form is a pair of raw-LaTeX fences (see App.md.centred — a fenced
      // div does not survive to LaTeX). Fold them back into the div form so the block
      // walker below has one shape to handle rather than a cross-block state machine.
      var body = split.body
        .replace(/```\{=latex\}\n\\begin\{center\}\n```/g, '::: {.center}')
        .replace(/```\{=latex\}\n\\end\{center\}\n```/g, ':::');
      var lines = body.split('\n');
      var out = [], outline = [], i = 0;

      /* BR-1: what counts as a blank line, and why `.trim()` is the wrong test.
       *
       * A markdown blank line is a line of ASCII spaces and tabs. `String.trim()` also
       * strips every Unicode space separator — including U+00A0, which App.md emits as
       * the line a TRAILING line break lands on. Read as blank, that line was dropped
       * and the paragraph ended on the break's own backslash, which is the literal
       * backslash D-037 was about, back again in the preview alone. Pandoc's own
       * blank-line rule is spaces and tabs, so this is it. */
      function isBlank(l) { return !/[^ \t\r]/.test(l); }

      function paragraphAt() {
        var buf = [];
        while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) buf.push(lines[i++]);
        return buf.length ? '<p>' + inline(buf.join('\n')) + '</p>' : '';
      }
      function isBlockStart(l) {
        return /^#{1,6}\s/.test(l) || /^\|/.test(l) || /^\+[-=:+]/.test(l) ||
          /^(\* \* \*|:::|```)/.test(l) || /^:\s/.test(l);
      }

      // A bare `[]{#id}` line is a table's anchor, emitted just before it.
      var pendingAnchor = '';
      // TBS-1: set by the raw-LaTeX fence that opens a shaded-header group, consumed by
      // the next table, cleared by the fence that closes the group.
      var pendingShadeHead = false;
      // TW-3: the fraction of the page the next table occupies (1 = the full width).
      var pendingScale = 1;
      // CAP-3: the paragraph currently being read is a table caption.
      var inCaption = false;
      // TTL-3: set by \chTitleStyle, consumed by the heading it precedes — which is the
      // same span the two macros cover on the page.
      var pendingTitle = false;
      // CTR-1: set by the centring declaration, consumed by the heading it precedes.
      var pendingCentreHead = false;
      // TOC-1: where in `out` a contents list has to be dropped once the walk is done.
      var tocAt = [];
      while (i < lines.length) {
        var line = lines[i];
        if (isBlank(line)) { i++; continue; }
        var anch = /^\[\]\{#([A-Za-z0-9_-]+)\}\s*$/.exec(line);
        if (anch) { pendingAnchor = anch[1]; i++; continue; }

        // --- heading, with its pandoc {#anchor} attribute
        // The attribute block may carry classes as well as the id (TOC-1 marks the
        // contents heading `.unnumbered .unlisted`), so anything after the id is
        // consumed rather than left to be printed as part of the title.
        var h = /^(#{1,6})\s+(.*?)(?:\s*\{#([A-Za-z0-9_-]+)((?:\s+[^}]*)?)\})?\s*$/.exec(line);
        if (h) {
          var lvl = h[1].length, raw = h[2], anchor = h[3] || '';
          // SEC-4/TOC-1: `.unlisted` is what keeps a heading out of the contents list on
          // the page, so it is what keeps it out of the preview's list too.
          var unlisted = /\.unlisted\b/.test(h[4] || '');
          var num = (/^([\d.]+)\s+/.exec(raw) || [])[1] || '';
          // The outline is plain TEXT — it goes into the navigation rail, where it is
          // HTML-escaped and never parsed as markdown. So the markdown escaping has to
          // come off first, or a section called "Firmware & build" is listed as
          // "Firmware \& build". The heading itself still goes through inline().
          outline.push({ level: lvl, number: num, title: unescapeMd(raw.replace(/^[\d.]+\s+/, '')), anchor: anchor, unlisted: unlisted });
          // TTL-3: a title is an h1 wearing the profile's title styling rather than its
          // H1 styling — the same swap \chTitleStyle makes on the page.
          /* SEC-4: a heading whose LEVEL starts a page is marked as one.
           *
           * That break lives in the formatting profile and reaches the PDF as titlesec's
           * `\sectionbreak` — there is no `\newpage` in the markdown to find, so the
           * paged preview never broke at all and showed a document running on past the
           * bottom of every sheet. `state.breaks` carries the profile's answer in. */
          var breaks = (state.breaks || {})[pendingTitle ? 0 : lvl];
          var hcls = (pendingTitle ? 'prv-h prv-title' : 'prv-h prv-h' + lvl) +
            (pendingCentreHead ? ' prv-centre' : '') + (breaks ? ' prv-breakbefore' : '');
          pendingTitle = false;
          pendingCentreHead = false;
          out.push('<h' + lvl + (anchor ? ' id="' + esc(anchor) + '"' : '') + ' class="' + hcls + '">' + inline(raw) + '</h' + lvl + '>');
          i++; continue;
        }
        // --- raw-LaTeX page break
        if (/^```\{=latex\}/.test(line)) {
          var fence = [];
          i++;
          while (i < lines.length && !/^```\s*$/.test(lines[i])) fence.push(lines[i++]);
          i++;
          var raw = fence.join('\n');
          // TBS-1: the shading group is machinery, not content. Showing it as "Raw
          // LaTeX" would put a block in the preview that has no counterpart on the page.
          // TW-3/TBS-1: the table group carries the narrowing and the shading. Both are
          // machinery, not content — shown as "Raw LaTeX" they would put a block in the
          // preview with no counterpart on the page.
          var narrow = /\\setlength\{\\columnwidth\}\{([\d.]+)\\columnwidth\}/.exec(raw);
          if (narrow || /\\chTblHeadShade/.test(raw)) {
            pendingShadeHead = /\\chTblHeadShade/.test(raw);
            pendingScale = narrow ? Number(narrow[1]) : 1;
            continue;
          }
          if (/^\s*\\endgroup\s*$/.test(raw)) { pendingShadeHead = false; pendingScale = 1; continue; }
          // CAP-3: the caption is a paragraph between two macros. Both are machinery;
          // what they mark is that the paragraph between them is a caption, wherever it
          // sits — which is how the preview shows a caption above a table as readily as
          // one below, without knowing which the profile asked for.
          if (/^\s*\\chCaptionOpen\s*$/.test(raw)) { inCaption = true; continue; }
          if (/^\s*\\chCaptionClose\s*$/.test(raw)) { inCaption = false; continue; }
          // TTL-3: the pair around a title's heading. Machinery, like the two above —
          // what they carry is which styling the heading between them wears.
          if (/^\s*\\chTitleStyle(Centred)?\s*$/.test(raw)) {
            pendingTitle = true;
            // CTR-1: the centred face of the same declaration.
            if (/Centred/.test(raw)) pendingCentreHead = true;
            continue;
          }
          if (/^\s*\\chSectionStyle\s*$/.test(raw)) { pendingTitle = false; continue; }
          // CTR-1: a centred heading at an ordinary level — a pair of \titleformat
          // declarations either side of it, exactly as the title uses.
          if (/^\s*\\chCentre(One|Two|Three|Four)\s*$/.test(raw)) { pendingCentreHead = true; continue; }
          if (/^\s*\\chPlain(One|Two|Three|Four)\s*$/.test(raw)) { pendingCentreHead = false; continue; }
          // TOC-1: the contents list is filled in at the end, when every heading this
          // document contains has been seen — a list at the front cannot be written
          // until the back has been read.
          if (/^\s*\\chContents\s*$/.test(raw)) { tocAt.push(out.length); out.push(''); continue; }
          /* SPC-1: a measured gap is CONTENT of a sort — it is the thing the author put
           * there — so it is drawn at its size rather than announced as machinery. The
           * millimetres become pixels at 96dpi, which is the scale the paper itself is
           * drawn at (App.docFormat.textWidthPx), so a 40mm gap is 40mm of this page. */
          var gap = /^\s*(?:\\vspace\*?|\\chGap(?:Title|One|Two|Three|Four))\{([\d.]+)mm\}\s*$/.exec(raw);
          if (gap) {
            out.push('<div class="prv-space" style="height:' + App.docFormat.mmPx(gap[1]) + 'px"></div>');
            continue;
          }
          out.push('<div class="prv-pagebreak"><span>' + (/(\\newpage)/.test(raw) ? 'Page break' : 'Raw LaTeX') + '</span></div>');
          continue;
        }
        // --- centred div
        /* CTR-1: centred blocks NEST, and the walker has to count.
         *
         * A paragraph centred inside a section that is itself centred emits two `center`
         * environments, one inside the other — harmless on the page, and quietly
         * catastrophic here: the walker stopped at the first closing `:::`, which left
         * the OUTER close as a bare `:::` line. `/^:::/` matched it as an OPENING fence,
         * so it swallowed the entire rest of the document into a centred div — which is
         * what "centring my title page centres the whole document" was.
         *
         * It is also why the paged preview stopped after two sheets: with the document
         * folded into one enormous block, there was one thing to place and nothing to
         * break between.
         */
        if (/^:::\s*\{/.test(line)) {
          var inner = [], depth = 1;
          i++;
          while (i < lines.length) {
            if (/^:::\s*\{/.test(lines[i])) depth++;
            else if (/^:::\s*$/.test(lines[i])) { depth--; if (!depth) break; }
            inner.push(lines[i++]);
          }
          i++;
          var nested = toHtml(inner.join('\n'), state);
          // CTR-1: a centred block can now contain a HEADING (centring a section centres
          // its heading), and the nested render's outline was being thrown away — so a
          // centred section vanished from the navigation rail and from the contents list
          // while still printing on the page.
          nested.outline.forEach(function (o) { outline.push(o); });
          out.push('<div class="prv-centre">' + nested.html + '</div>');
          continue;
        }
        // A closing fence with nothing open is machinery left over from a block this
        // walker did not open. It is not content, and it must not be read as an opener.
        if (/^:::\s*$/.test(line)) { i++; continue; }
        // --- horizontal rule
        if (/^\* \* \*\s*$/.test(line)) { out.push('<hr class="prv-rule">'); i++; continue; }
        // --- pipe table
        if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
          var head = cells(line), rows = [];
          i += 2;
          while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
          out.push(tableWithCaption(head, rows, null));
          continue;
        }
        // --- grid table (the multi-line-cell form)
        // `+:` as well as `+-`: an aligned column carries its marker in the border, and
        // reading only the unaligned form left every aligned grid table shown as prose.
        if (/^\+[-=:+]/.test(line)) {
          var block = [];
          while (i < lines.length && (/^[+|]/.test(lines[i]))) block.push(lines[i++]);
          var g = parseGrid(block);
          out.push(tableWithCaption(g[0], g[1], g[2], g[3]));
          continue;
        }
        if (inCaption) {
          var capText = paragraphAt() || (i++, '');
          pendingAnchor = '';
          // "Table 3:" is emphasised the way LaTeX emphasises a caption label, and the
          // number comes from the text rather than from a counter kept here — the
          // document has already been numbered, and counting again could only disagree.
          out.push(capText ? '<div class="prv-caption">' +
            capText.replace(/^<p>(Table [\d.]+:)/, '<strong>$1</strong>').replace(/^<p>|<\/p>$/g, '') + '</div>' : '');
          continue;
        }
        /* REF-1: a `[]{#id}` line before a PARAGRAPH is that paragraph's anchor.
         *
         * It used to be read only as a table's anchor, so a paragraph anchor was held
         * and then silently attached to whatever table came next — the preview's links
         * landed somewhere the PDF's do not. Consumed here, it lands on the paragraph
         * exactly as pandoc's `\hypertarget` does. */
        var para = paragraphAt() || (i++, '');
        if (para && pendingAnchor) {
          para = para.replace(/^<p>/, '<p id="' + esc(pendingAnchor) + '">');
          pendingAnchor = '';
        }
        out.push(para);
      }

      // TOC-1: every heading is known now, so a contents list can be written wherever
      // the document asked for one.
      tocAt.forEach(function (at) { out[at] = tocHtml(outline); });

      /** A table may be followed by `: caption` — pandoc's caption syntax. The id, if
       *  any, came in on the `[]{#id}` line before the table. */
      function tableWithCaption(head, rows, widths, titleRow) {
        var cap = '', anchor = pendingAnchor;
        pendingAnchor = '';
        var j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        var m = j < lines.length ? /^:\s+(.*?)(?:\s*\{#([A-Za-z0-9_-]+)\})?\s*$/.exec(lines[j]) : null;
        if (m) { cap = m[1]; anchor = m[2] || anchor; i = j + 1; }
        // Only a CAPTIONED table is numbered — by LaTeX on the page, and here for the
        // same reason and in the same order (CAP-1).
        var n = cap ? ++state.tables : 0;
        return tableHtml(head, rows, { caption: cap, anchor: anchor, number: n, widths: widths,
          shadeHead: pendingShadeHead, scale: pendingScale, titleRow: titleRow || '' });
      }

      return { html: out.filter(Boolean).join('\n'), outline: outline };
    }

    /**
     * TOC-1: the contents list, from the headings the document turned out to have.
     *
     * The page numbers are LaTeX's and cannot be known here — a browser has no pages —
     * so the preview shows the entries and their nesting, which is the part a designer
     * is actually deciding when they move a section or change its level.
     */
    function tocHtml(all) {
      // SEC-4: a section marked `.unlisted` prints its heading and is not listed —
      // the preview's list and LaTeX's `.toc` file must agree about which those are.
      var outline = all.filter(function (o) { return !o.unlisted; });
      if (!outline.length) return '<div class="prv-toc prv-toc-empty"><em>No headings yet.</em></div>';
      return '<div class="prv-toc">' + outline.map(function (o) {
        return '<div class="prv-toc-e prv-toc-' + (o.level || 1) + '">' +
          (o.number ? '<span class="prv-toc-n">' + esc(o.number) + '</span> ' : '') +
          esc(o.title) + '</div>';
      }).join('') + '</div>';
    }

    /**
     * Read a grid table back into head + rows. Cell text that spanned several lines is
     * rejoined with a newline, which inline() then renders as a line break — so the
     * preview shows the same shape the PDF will.
     */
    function parseGrid(block) {
      var seps = [], rows = [], headRows = [], seenHead = false, cur = [];
      block.forEach(function (l) {
        if (/^\+/.test(l)) {
          if (cur.length) {
            var merged = cur[0].map(function (_, c) {
              // D-061: spaces and tabs are padding; a non-breaking space is content (see
              // padTrim), and it is what a trailing line break lands on.
              var lines = cur.map(function (r) { return padTrim(r[c] || ''); });
              // Only the TRAILING blanks are padding — a cell is as tall as the tallest
              // in its row. An INTERIOR blank is a paragraph break the author or the
              // value formatter put there, and dropping it ran a list of firewall rules
              // together into one paragraph.
              while (lines.length && !lines[lines.length - 1].length) lines.pop();
              return lines.join('\n');
            });
            // TBL-1: EVERY row above the `=` separator is a header row, not just the
            // last one — a table with a title row has two, and reading only the last
            // left the title standing in as the header and the headings as a body row.
            if (!seenHead) headRows.push(merged); else rows.push(merged);
            if (/^\+:?=/.test(l)) seenHead = true;
            cur = [];
          }
          seps.push(l);
          return;
        }
        cur.push(cells(l));
      });
      if (cur.length) rows.push(cur[0]);
      if (!headRows.length) headRows = [rows.shift() || []];
      /* The widths come from a border with all its joins in it. With a title row the
       * FIRST border spans the table and has none, so it would report one column.
       *
       * `> 3`, not `> 2`: the outer `+` at each end already contributes an empty string
       * either side, so a border with no INTERNAL join splits into three parts and was
       * being taken as the width row. `gridWidths` then found one segment, gave up and
       * returned null, and every table with a title row lost its column widths in the
       * preview while keeping them on the page. */
      var sep = seps.filter(function (x) { return x.split('+').length > 3; })[0] || seps[0];
      // A header row with fewer cells than the table has columns is the spanning one.
      var cols = headRows[headRows.length - 1].length;
      var title = (headRows.length > 1 && headRows[0].length === 1) ? headRows[0][0] : '';
      return [headRows[headRows.length - 1], rows, gridWidths(sep), title, cols];
    }

    /**
     * TW-1: the column fractions pandoc will read out of a border row, read out of it
     * here the same way — each segment's length over the whole line — so the preview's
     * columns and the PDF's are the same numbers rather than two guesses at them.
     * @returns {?number[]} null when the row is unreadable
     */
    function gridWidths(sep) {
      if (!sep || !/^\+/.test(sep)) return null;
      var segs = sep.slice(1, -1).split('+');
      if (segs.length < 2) return null;
      var total = sep.length, out = [], ok = true;
      segs.forEach(function (s) {
        if (!/^[-=:]+$/.test(s)) ok = false;
        out.push((s.length + 1) / total);
      });
      return ok ? out : null;
    }

    App.ui = App.ui || {};
    App.ui.mdPreview = { toHtml: toHtml, splitFrontMatter: splitFrontMatter, _inline: inline, _cells: cells,
      gridWidths: gridWidths, unescapeMd: unescapeMd, _cellHtml: cellHtml };
  })(App);
