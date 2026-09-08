    /* -------------------------------------------------------------------------
     * TBL-2: a grid table is measured against pandoc's `--columns`, not against itself.
     *
     * A pipe table narrower than `--columns` (72 by default) is handed to LaTeX with no
     * widths at all — `@{}lll@{}` — and LaTeX sizes each column to its content, which is
     * what a small table should look like. A GRID table is never handed over that way:
     * pandoc always writes explicit `p{}` fractions for one, and it divides the segment
     * lengths by **max(line length, --columns)** rather than by the line length. So a
     * 32-character grid table came out as three columns of 0.1389 + 0.1250 + 0.1667 —
     * a table 43% of the width of the page, with every column squeezed to match.
     * Measured on pandoc 3.1.11, not read.
     *
     * That is invisible until something forces a small table into the grid form, and
     * TBL-1's title row is exactly such a thing: adding a title to a table that fitted
     * on a line shrank it to under half the page and re-proportioned its columns. The
     * columns were not the fault — the table's SOURCE WIDTH was.
     *
     * So an automatic grid table is drawn to the same source budget an explicit one is.
     * The ratios between the columns are untouched (this is a uniform scale, the same
     * trade holdWhole and layout's toChars already make); what changes is that the
     * fractions now add up to the page, so a grid table fills the text block the way its
     * pipe-form twin does. Only widths BELOW the budget are scaled: a table already wider
     * than it has been laid out by autoWidths and is not second-guessed here.
     * ---------------------------------------------------------------------- */
    function fillLine(widths, n) {
      var total = widths.reduce(function (a, w) { return a + (w > 0 ? w : 0); }, 0);
      if (!(total > 0) || total >= WIDTH_BUDGET) return widths;
      var scale = WIDTH_BUDGET / total;
      return widths.map(function (w) { return Math.max(MIN_COL, Math.round(w * scale)); });
    }

    /**
     * A grid table — the only markdown table that can hold a multi-line cell, which
     * is what a hand-authored table in a custom section needs.
     *
     * Without `opts.widths` nothing is wrapped and each column is made as wide as its
     * widest line, exactly as before: guessing a wrap width would only fight the LaTeX
     * layout that actually decides the final line breaks. With widths, the columns are
     * the ones asked for and the content is wrapped into them (see TW-1 above).
     *
     * @param {{align?:string[], widths?:number[], cellPrefix?:string[], rowAnchors?:string[]}} [opts]
     *        cellPrefix is a per-column raw-LaTeX span placed on its OWN first line of
     *        every body cell (TBS-1 shading). Its own line so that it costs the column
     *        no width: pandoc folds a cell's consecutive lines into one paragraph.
     *        rowAnchors is the same idea per ROW rather than per column — one anchor
     *        span at the head of each body row's first cell (REF-2), so a link can land
     *        on a particular row of a table rather than on the table.
     */
    function gridTable(headers, rows, opts) {
      opts = opts || {};
      var align = opts.align || [];
      var pre = opts.cellPrefix || [];
      /* SPC-1: the row-height strut, at the END of the first cell rather than the head of
       * it — see rowStrut. One per row is enough: a row is as tall as its tallest cell.
       *
       * `suffixRows` says WHICH rows take it: an array of booleans, one per row, or null
       * for all of them. Null rather than an array of trues, because "every row" is the
       * ordinary case and an absent list is how the rest of this file writes a default. */
      var suf = opts.cellSuffix || '';
      var sufRows = Array.isArray(opts.suffixRows) ? opts.suffixRows : null;
      function wantsSuffix(i) { return !!suf && (!sufRows || sufRows[i] !== false); }
      var anchors = opts.rowAnchors || [];
      var headPre = opts.headPrefix || '';
      var n = headers.length;
      var explicit = !!(opts.widths && opts.widths.length === n);
      var widths = explicit ? widthsFor(opts.widths, n) : fillLine(autoWidths([headers].concat(rows), n, opts.metrics), n);
      // A prefix is literal source text, so a column carrying one can never be
      // narrower than it — otherwise the raw-LaTeX span would be wrapped and broken.
      // A row anchor is the same kind of claim on the FIRST column: it is emitted whole,
      // on its own line, and a column too narrow to hold it would break it in half.
      /* What each column must be able to hold WHOLE, on its own line: a shading prefix,
       * a row anchor, and any run in its cells that cannot be broken.
       *
       * Widened by SCALING THE TABLE, never by widening the one column. Pandoc reads a
       * column's share of the page off its share of the border row, so making column 0
       * bigger to fit a 19-character anchor takes that width from every other column —
       * and the anchor costs nothing on the page (`\hypertarget` is zero-width), so the
       * page was being re-proportioned to make room for something that is not there.
       * Measured: it put a 10pt overfull box in the Control coverage table. Scaling
       * uniformly leaves every proportion exactly as it was and only widens the .md.
       */
      var widest = anchors.reduce(function (a, s) { return Math.max(a, String(s || '').length); }, 0);
      widths = holdWhole(widths, [headers].concat(rows), widths.map(function (_, i) {
        // SPC-1: the strut is the same kind of claim on column 0 as the anchor above —
        // emitted whole on a line of its own, costing the page nothing (it is zero-width)
        // but costing the SOURCE the characters it is written in.
        return Math.max(pre[i] ? pre[i].length : 0, headPre.length,
          i === 0 ? Math.max(widest, rows.some(function (_, ri) { return wantsSuffix(ri); }) ? suf.length : 0) : 0);
      }));
      /* A HAND-SET width must still hold what cannot be broken.
       *
       * The automatic path has honoured this since D-021 (see layout/toChars): a column
       * is never narrower than its longest unbreakable run, and the whole table is
       * scaled up until that fits, because only the RATIOS reach the PDF. The explicit
       * path had no such floor at all — it wrapped to whatever was dragged — so a
       * narrow column cut a package name in half, or a cross-reference through its own
       * destination (`](#ctl-ahg- 001)`), which stops being a link.
       *
       * The same answer, applied to the same numbers: find the ratio by which the
       * tightest column falls short, scale every column by it, and the .md gets wider
       * while the fractions the operator dragged are preserved exactly.
       */

      function padTo(s, w) { return s + new Array(Math.max(0, w - s.length) + 1).join(' '); }
      /* TBL-1: the width INSIDE the outer borders — what a spanning row has to fill.
       * Every column plus its two padding spaces, plus the internal `+` each join costs. */
      var spanWidth = widths.reduce(function (a, w) { return a + w + 2; }, 0) + (n - 1);
      function border(ch) {
        return '+' + widths.map(function (w, i) {
          var bar = new Array(w + 3).join(ch);
          // Alignment is carried by the `:` markers on the HEADER separator, and only
          // there. Putting them on the `-` borders too made pandoc 3.1.11 silently drop
          // every body row — the table compiled to a header and nothing else, which is
          // worse than a broken table because it looks deliberate. Measured, not read:
          // the same table with colons on the header row alone reads all its rows.
          if (ch === '=') {
            if (align[i] === 'c') return ':' + bar.slice(1, -1) + ':';
            if (align[i] === 'r') return bar.slice(0, -1) + ':';
            if (align[i] === 'l') return ':' + bar.slice(1);
          }
          return bar;
        }).join('+') + '+';
      }
      // Wrapping is unconditional: against a natural width it is a no-op (a line that
      // already fits comes back unchanged), and against a narrowed one it is the whole
      // point. One path rather than two means the auto and explicit cases cannot drift.
      function linesFor(c, i, isHeader, anchor, tall) {
        var out = [];
        splitCell(c).forEach(function (l) {
          wrapLine(l, widths[i]).forEach(function (x) { out.push(x); });
        });
        if (!isHeader && i === 0 && anchor) out.unshift(anchor);
        if (!isHeader && pre[i]) out.unshift(pre[i]);
        // SPC-1: last, and in the first column only — pandoc folds a cell's consecutive
        // lines into one paragraph, so this lands at the end of that paragraph, which is
        // the line whose depth decides where the bottom of the row falls.
        if (!isHeader && i === 0 && tall) out.push(suf);
        // TBL-1: on its own line, so it costs the column no width — pandoc folds a
        // cell's consecutive lines into one paragraph.
        if (isHeader && headPre) out.unshift(headPre);
        return out;
      }
      function rowBlock(r, isHeader, anchor, tall) {
        var cellLines = widths.map(function (_, j) { return linesFor(r && r[j], j, isHeader, anchor, tall); });
        var h = cellLines.reduce(function (a, c) { return Math.max(a, c.length); }, 1);
        var out = [];
        for (var i = 0; i < h; i++) {
          out.push('| ' + widths.map(function (w, j) { return padTo(cellLines[j][i] || '', w); }).join(' | ') + ' |');
        }
        return out.join('\n');
      }
      /* TBL-1: a title row is a REAL merged row, and pandoc does support one.
       *
       * A grid table's header is every row above the `=` separator, and a row whose
       * internal `|` are omitted is read as a cell spanning those columns — verified on
       * pandoc 3.1.11, which emits it as `\multicolumn{3}{…}`. So the title is the first
       * of two header rows rather than a paragraph balanced on top of the table, which
       * is what it was and what could never be the right width: a paragraph has to be
       * given one, and a table's width is not known until it is typeset.
       */
      var parts = [];
      if (opts.titleRow) {
        parts.push('+' + new Array(spanWidth + 1).join('-') + '+');
        wrapLine(String(opts.titleRow), spanWidth - 2).forEach(function (l) {
          parts.push('| ' + padTo(l, spanWidth - 2) + ' |');
        });
      }
      parts.push(border('-'), rowBlock(headers, true), border('='));
      rows.forEach(function (r, i) { parts.push(rowBlock(r, false, anchors[i], wantsSuffix(i)), border('-')); });
      if (!rows.length) parts.push(border('-'));
      return parts.join('\n');
    }

    /* -------------------------------------------------------------------------
     * TBS-1: a styled header row / first column.
     *
     * Bold and italic are markdown and cost nothing. SHADING is not expressible in
     * markdown at all, so it travels the same way the page break and the centring
     * already do — as raw `{=latex}` fences pandoc passes through verbatim:
     *
     *   * the header row, by locally redefining `\toprule` (which pandoc emits
     *     immediately before the header of every longtable) to also emit `\rowcolor`.
     *     Wrapped in `\begingroup`/`\endgroup`, so the redefinition reaches exactly
     *     this table and nothing after it.
     *   * the first column, by a `\cellcolor` at the head of each body cell —
     *     `\columncolor` would have to be in the column spec, which pandoc writes and
     *     we do not. `\rowcolor` cannot do a column.
     *
     * Both were verified against pandoc 3.1.11 + tectonic 0.15, not assumed: pandoc's
     * LaTeX writer honours neither a fenced div nor a cell attribute here.
     * The macros themselves are defined by App.docFormat's preamble.
     * ---------------------------------------------------------------------- */

    var HEAD_SHADE_OPEN = '```{=latex}\n\\begingroup\\chTblHeadShade\n```';
    var HEAD_SHADE_CLOSE = '```{=latex}\n\\endgroup\n```';
    var COL_SHADE = '`\\chTblColShade`{=latex}';
    /* FNT-6: the first column's SIZE, by the same route as its shade.
     *
     * Weight and slope travel as markdown emphasis on the cell, and markdown has no way
     * to say "and set this column two points smaller" — which is why the first column
     * was the one kind of text in the document with no size of its own. A size is
     * expressible the way the shade already is: a raw-LaTeX span at the head of each
     * body cell, calling a macro the profile defines. `\raggedright` (which is where the
     * row-font machinery lives, see App.docFormat) runs from the column spec, before the
     * cell's content, so a `\selectfont` inside the cell is the later word and wins.
     *
     * The macro is named rather than expanded here: what size it is remains a formatting
     * question, and App.md has no business knowing which profile is in force. */
    var COL_FONT = '`\\chTblColFont`{=latex}';
    // TBL-1: the same, for a header cell — needed only when a title row has taken the
    // one `\rowcolor` that `\toprule` can carry. See App.docFormat's tablePreamble.
    var HEAD_CELL_SHADE = '`\\chTblHeadCell`{=latex}';
    var GROUP_CLOSE = '```{=latex}\n\\endgroup\n```';

    /* -------------------------------------------------------------------------
     * TW-3: a table narrower than the page.
     *
     * Three columns at 20% each should make a table 60% of the text width, not three
     * equal columns filling it. Markdown cannot say that: pandoc derives a column's
     * width from its share of the BORDER ROW, so the shares it reads always add up to
     * the whole line however the table is drawn. The total is simply not expressible
     * there.
     *
     * What is expressible is the thing the widths are measured against. Pandoc emits
     * every column as `p{(\columnwidth - N\tabcolsep) * \real{f}}`, so shrinking
     * `\columnwidth` for the duration of one table scales all of them together and the
     * table comes out that fraction of the page — centred, which is what longtable does
     * with a table narrower than the text block. Verified on pandoc 3.1.11 + tectonic.
     *
     * Over 100% is clamped rather than honoured: a table wider than the page is not a
     * layout, it is an overflow, and the designer is told in red instead.
     * ---------------------------------------------------------------------- */
    function narrowOpen(scale) {
      return '```{=latex}\n\\begingroup\\setlength{\\columnwidth}{' + scale.toFixed(4) + '\\columnwidth}\n```';
    }

    /** Wrap already-escaped cell text in emphasis, per line, leaving blanks alone. */
    function emphasise(c, style) {
      if (!style || (!style.bold && !style.italic)) return c;
      var mark = (style.bold ? '**' : '') + (style.italic ? '*' : '');
      if (!mark) return c;
      return splitCell(c).map(function (seg) {
        return seg.trim() ? mark + seg + mark.split('').reverse().join('') : seg;
      }).join(CELL_BREAK);
    }

    /**
     * Emit a table, choosing the representation from the content: a grid table when
     * any cell is multi-line, when widths are set, or when a shaded first column needs
     * a prefix line; a pipe table otherwise. Callers do not have to know which — they
     * hand over cell()-escaped strings and get a table that holds.
     *
     * @param {{align?:string[], widths?:number[],
     *          style?:{head?:Object, firstColumn?:Object},
     *          caption?:{id:string, text:string}}} [opts]
     */
    function table(headers, rows, opts) {
      opts = opts || {};
      var st = opts.style || {};
      var head = st.head ? headers.map(function (c) { return emphasise(c, st.head); }) : headers;
      var body = st.firstColumn
        ? rows.map(function (r) { return (r || []).map(function (c, i) { return i === 0 ? emphasise(c, st.firstColumn) : c; }); })
        : rows;

      var pre = [];
      var shadeCol = !!(st.firstColumn && st.firstColumn.shade);
      // FNT-6: `fontSize` is a FLAG here, not a number — the size itself is in the macro.
      var fontCol = !!(st.firstColumn && st.firstColumn.fontSize);
      if (shadeCol || fontCol) pre[0] = (shadeCol ? COL_SHADE : '') + (fontCol ? COL_FONT : '');

      /* Which form, and why it is not just about newlines.
       *
       * A pipe table becomes a LaTeX `tabular` of `l` columns, which do not wrap: a long
       * justification or description runs straight off the right of the page. A grid
       * table becomes `p{}` columns, which do. So the deciding question is not "does a
       * cell contain a line break" but "will this fit on a line" — a table wider than
       * the budget goes to the grid form so its content can wrap, whatever its cells
       * look like. That is what was mashing the control-coverage table: four columns of
       * one-line prose, no wrapping available to any of them.
       */
      var multi = false, natural = headers.length + 1;
      [head].concat(body).forEach(function (r) {
        (r || []).forEach(function (c) { if (String(c == null ? '' : c).indexOf(CELL_BREAK) !== -1) multi = true; });
      });
      headers.forEach(function (_, i) {
        var w = 0;
        [head].concat(body).forEach(function (r) {
          splitCell(r && r[i]).forEach(function (l) { w = Math.max(w, l.length); });
        });
        natural += w + 3;
      });
      var widthed = !!(opts.widths && opts.widths.length === headers.length);
      // REF-2: one anchor span per body row. A pipe table cannot carry one — the span
      // has to sit on a line of its own so it costs the column no width — so a table
      // with row anchors takes the grid form whatever else it looks like.
      var anchored = !!(opts.rowAnchors && opts.rowAnchors.length);
      // TBL-1: a spanning row needs the grid form too — a pipe table has no way to say
      // that a cell covers more than one column.
      var titled = !!opts.titleRow;
      /* TBL-1: with a title row, the one `\rowcolor` that `\toprule` can carry goes to
       * the TITLE — so the column headings need their shade cell by cell, or the row
       * comes out white under a shaded title. Without a title row nothing changes: the
       * row colour reaches the headings as it always has. */
      var headCells = !!(opts.titleRow && st.head && st.head.shade);
      /* SPC-1: extra height on the body rows that asked for it, for a table that is a
       * form to write on rather than a table of readings.
       *
       * `tallRows` is per row, and ABSENT means all of them — which is what a height with
       * no rows named meant before the ticks existed, and what a project written then
       * still says. A list of the wrong length is ignored for the same reason a width
       * array of the wrong length is: it cannot be applied to anything. */
      var strut = rowStrut(opts.rowHeight);
      var tallRows = (Array.isArray(opts.tallRows) && opts.tallRows.length === rows.length)
        ? opts.tallRows.map(function (v) { return v !== false; }) : null;
      var anyTall = !!strut && (!tallRows || tallRows.some(Boolean));
      var sub = { align: opts.align || [], cellPrefix: pre, metrics: opts.metrics,
        rowAnchors: opts.rowAnchors || [], titleRow: opts.titleRow || '',
        cellSuffix: strut, suffixRows: tallRows,
        headPrefix: headCells ? HEAD_CELL_SHADE : '' };
      if (widthed) sub.widths = opts.widths;
      // A prefix cannot live on its own line in a pipe table, so a shaded first column
      // is one more reason the grid form is the only one that can carry it.
      /* PIPE_MAX is pandoc's `--columns` default, and it is the real limit on the pipe
       * form — not the page budget. Up to it, pandoc leaves a pipe table's columns to
       * LaTeX, which sizes them to their content. Past it, pandoc invents widths from
       * the SEPARATOR row, and `| --- | --- |` gives every column an equal share
       * regardless of what is in it — seven equal columns with a heading in each that
       * does not fit. Measured on 3.1.11, not read: an 83-character pipe table comes out
       * as seven `\real{0.1429}` columns. So a table that would cross that line takes
       * the grid form instead, where the widths are ours to decide. */
      // SPC-1: a strut has to sit on a line of its own so it costs the column no width,
      // and a pipe table has no lines inside a cell — so a sized row takes the grid form
      // whatever else the table looks like, exactly as a shaded first column does.
      var grid = multi || widthed || shadeCol || fontCol || anchored || titled || anyTall || natural > PIPE_MAX;
      var out = (grid ? gridTable : pipeTable)(head, body, sub);

      // The caption must sit directly under the table for pandoc to attach it, so every
      // group closes AFTER it. The anchor goes before the whole thing: pandoc does not
      // read `{#id}` on a caption as an identifier (it printed literally), and an empty
      // span becomes \phantomsection\label{…}, which \hyperref can reach.
      if (opts.caption) out = out + '\n\n: ' + text(opts.caption.text || '');

      // One group carries both the shading and the narrowing rather than two nested
      // ones — same effect, half the raw-LaTeX noise in a file people read.
      var scale = 1;
      if (widthed) {
        var sum = opts.widths.reduce(function (a, w) { return a + (Number(w) > 0 ? Number(w) : 0); }, 0);
        if (isFinite(sum) && sum > 0 && sum < 0.995) scale = sum;
      }
      var prologue = [];
      if (scale < 1) prologue.push('\\setlength{\\columnwidth}{' + scale.toFixed(4) + '\\columnwidth}');
      if (st.head && st.head.shade) prologue.push('\\chTblHeadShade');
      if (prologue.length) {
        out = '```{=latex}\n\\begingroup' + prologue.join('') + '\n```\n\n' + out + '\n\n' + GROUP_CLOSE;
      }
      if (opts.caption && opts.caption.id) out = '[]{#' + anchor('tbl-' + opts.caption.id) + '}\n\n' + out;
      return out;
    }

    /* -------------------------------------------------------------------------
     * HUM-1: a captured value is data, not a JSON document.
     *
     * A decision value is whatever the device reported — a boolean, a number, a string,
     * a whitelist, or a list of firewall-rule records. Through the canonical
     * stringifier it reaches the PDF as JSON: braces, quotes and commas spread down a
     * dozen lines of a table cell. That is the right form for the artifact a device
     * consumes and the wrong one for a document a person signs off.
     *
     * human() is the READING, and deliberately not reversible — nothing parses it back,
     * so it is free to drop the punctuation only a machine needs. The generated
     * `tactical.json` and the verification script still carry the canonical form; this
     * is used where a person is the reader.
     *
     * Entries are separated by a BLANK line rather than a newline, because that is what
     * survives to the page: a grid-table cell folds consecutive lines into one
     * paragraph, so only a blank line keeps a list looking like a list.
     * ---------------------------------------------------------------------- */

    var HUMAN_EMPTY = '(none)';

