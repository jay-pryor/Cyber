    /**
     * FMT-4: structural check for an imported profile. Additive and forgiving —
     * anything missing is filled from the baseline — so this reports only the errors
     * that would make a profile meaningless rather than merely incomplete.
     * @returns {{ok:boolean, issues:Issue[], profile:?Object}}
     */
    function validate(raw, loc) {
      var issues = [];
      function bad(msg) { issues.push({ category: 'validation', severity: 'error', message: msg, location: loc || 'format' }); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { bad('A formatting profile must be an object.'); return { ok: false, issues: issues, profile: null }; }
      if (!raw.id || typeof raw.id !== 'string') bad('A formatting profile needs a string id.');
      if (!raw.name || typeof raw.name !== 'string') bad('A formatting profile needs a name.');
      if (raw.levels !== undefined && !Array.isArray(raw.levels)) bad('levels must be an array.');
      if (issues.length) return { ok: false, issues: issues, profile: null };
      var p = normalise(raw);
      delete p.builtin;                       // an imported profile is never the built-in
      return { ok: true, issues: [], profile: p };
    }

    /* -------------------------------------------------------------------------
     * PRV-2: the profile, expressed as CSS, so a preview can look like the page.
     *
     * Everything a profile decides reaches the PDF through the YAML block and the LaTeX
     * preamble — which the markdown preview, quite reasonably, ignores. The result was
     * a preview that answered "what does the document SAY" and not "what does it LOOK
     * like": changing the paper, the margins, the heading sizes or the table shading
     * changed nothing on screen until the PDF was built.
     *
     * This compiles the same profile a second time, into CSS, for a page-shaped box.
     * It is an approximation and is meant to be — a browser is not TeX — but it is an
     * approximation of the RIGHT numbers, derived from the one profile rather than from
     * a set of hard-coded preview styles that could drift from it.
     *
     * Everything interpolated is sanitised on the way out: sizes through Number(),
     * colours through normaliseShade. A stylesheet built from user text is an injection
     * route otherwise, and the values here come from text boxes.
     * ---------------------------------------------------------------------- */

    // Paper widths in millimetres, and 96dpi for the conversion to CSS pixels.
    var PAPER_MM = { a4: 210, letter: 215.9, a5: 148, legal: 215.9 };
    var PX_PER_MM = 96 / 25.4;

    /** A length in millimetres; a bare number is read as mm, as `geometry` does. */
    function mm(v, dflt) {
      var m = /^\s*([\d.]+)\s*(mm|cm|in|pt)?\s*$/.exec(String(v == null ? '' : v));
      if (!m) return dflt;
      var n = Number(m[1]);
      if (!isFinite(n)) return dflt;
      var unit = m[2] || 'mm';
      return unit === 'cm' ? n * 10 : unit === 'in' ? n * 25.4 : unit === 'pt' ? n * 25.4 / 72 : n;
    }
    /** A point size as a number; `11pt` and `11` both give 11. */
    function ptNum(v, dflt) {
      var m = /^\s*([\d.]+)\s*(pt)?\s*$/.exec(String(v == null ? '' : v));
      var n = m ? Number(m[1]) : NaN;
      return isFinite(n) && n > 0 ? n : dflt;
    }
    /** The width of the text block, in millimetres — paper less both margins. */
    function textWidthMm(profile) {
      var f = normalise(profile);
      var paper = PAPER_MM[f.page.paper] || PAPER_MM.a4;
      return Math.max(40, paper - mm(f.page.marginLeft, 25) - mm(f.page.marginRight, 25));
    }

    /* PRV-4: the numbers a PAGED preview needs, which a continuous one never did.
     *
     * A preview that shows where the pages fall has to know how tall a page is, not just
     * how wide the text is — and it has to know the four margins, because a header sits
     * inside the top one and a footer inside the bottom one. All of it comes off the same
     * profile the PDF is built from, so the sheet on screen is the sheet on the desk at
     * whatever scale the pane can give it.
     */
    var PAPER_HEIGHT_MM = { a4: 297, letter: 279.4, a5: 210, legal: 355.6 };
    /**
     * @returns {{width:number, height:number, top:number, bottom:number, left:number,
     *            right:number}} all in CSS pixels at 96dpi
     */
    function pageMetrics(profile) {
      var f = normalise(profile);
      var px = function (v) { return Math.round(v * PX_PER_MM); };
      return {
        width: px(PAPER_MM[f.page.paper] || PAPER_MM.a4),
        height: px(PAPER_HEIGHT_MM[f.page.paper] || PAPER_HEIGHT_MM.a4),
        top: px(mm(f.page.marginTop, 25)), bottom: px(mm(f.page.marginBottom, 25)),
        left: px(mm(f.page.marginLeft, 25)), right: px(mm(f.page.marginRight, 25))
      };
    }
    /** SPC-1: a millimetre length in CSS pixels at 96dpi — the scale the paper is drawn at. */
    function mmPx(v) {
      var n = Number(v);
      return isFinite(n) && n > 0 ? Math.round(n * PX_PER_MM) : 0;
    }
    /** The same, in CSS pixels, clamped to something a pane can actually show. */
    function textWidthPx(profile) {
      return Math.max(280, Math.min(900, Math.round(textWidthMm(profile) * PX_PER_MM)));
    }

    /**
     * FNT-1: what App.md's width model needs to know about this profile — the page in
     * ems, and each table font size relative to the document's.
     *
     * Without it the model measures every table at the document size, and a header set
     * a point larger overflows by exactly the ratio it was enlarged by. Passed rather
     * than read, because App.md has no business knowing which profile is in force.
     * @returns {{pageEm:number, head:number, body:number, firstCol:number}}
     */
    function tableMetrics(profile) {
      var f = normalise(profile);
      var base = ptNum(f.page.fontSize, 11);
      var body = ptNum(f.tables.fontSize, base);
      return {
        pageEm: textWidthMm(f) / 25.4 * 72 / base,
        head: ptNum(f.tables.headFontSize, base) / base,
        body: body / base,
        // FNT-6: blank means the table body's size, which is what the empty macro does.
        firstCol: ptNum(f.tables.firstColFontSize, body) / base
      };
    }

    /**
     * PRV-2: the profile as a stylesheet, scoped to `.rd-paper`.
     * @param {Object} profile @returns {string} CSS
     */
    function previewCss(profile) {
      var f = normalise(profile);
      var base = ptNum(f.page.fontSize, 11);
      var spacing = Number(f.page.lineSpacing);
      if (!isFinite(spacing) || spacing <= 0) spacing = 1.15;
      // 1pt of a document at 96dpi, scaled so an 11pt page reads at a comfortable size
      // on screen rather than at its literal physical size.
      var px = function (pt) { return Math.round(pt * 96 / 72 * 100) / 100; };
      var out = [
        // FNT-2: the family is stated on the paper and inherited by everything on it —
        // headings, tables, captions — exactly as \familydefault is on the page. It is
        // safe to interpolate because normalise() has already reduced it to one of the
        // fixed FONTS rows; nothing a text box can produce reaches this string.
        '.rd-paper { width: ' + textWidthPx(f) + 'px; max-width: 100%; margin: 0 auto;' +
          ' background: #fff; color: #111; font-family: ' + font(f).css + ';' +
          ' font-size: ' + px(base) + 'px; line-height: ' + (Math.round(spacing * 100) / 100) + '; }',
        // FNT-4: the body's own weight and slope, on the paper — the counterpart of the
        // \AtBeginDocument in the preamble. Stated on the paragraph rather than on the
        // sheet so a heading, a table and a caption keep their own.
        '.rd-paper p, .rd-paper li { font-size: ' + px(base) + 'px; line-height: ' + (Math.round(spacing * 100) / 100) + ';' +
          ' font-weight: ' + (f.page.bold ? '700' : '400') + '; font-style: ' + (f.page.italic ? 'italic' : 'normal') + '; }',
        // FNT-1/FNT-4: four sizes now, and blank means "the document size" for the three
        // table ones — which is what LaTeX does with them, so the preview agrees by
        // construction. Weight and slope travel with each size, for the same reason.
        '.rd-paper .prv-table { font-size: ' + px(ptNum(f.tables.fontSize, base)) + 'px;' +
          ' font-weight: ' + (f.tables.bold ? '700' : '400') + '; font-style: ' + (f.tables.italic ? 'italic' : 'normal') + '; }',
        '.rd-paper .prv-table th { font-size: ' + px(ptNum(f.tables.headFontSize, base)) + 'px;' +
          ' font-weight: ' + (f.tables.headBold ? '700' : '400') + '; font-style: ' + (f.tables.headItalic ? 'italic' : 'normal') + '; }',
        // The page's own defaults, and they must be stated rather than inherited: the
        // app's table styling paints a header with `--c-surface-alt`, which in dark mode
        // is a near-black cell on a white sheet — and shows an UNSTYLED header as though
        // it were a shaded one. Emitted before the shade rules below, which override it.
        '.rd-paper .prv-table th, .rd-paper .prv-table td { border-color: #bbb; background: transparent; color: #111; }',
        /* `font-size: inherit` is the whole point of this rule.
         *
         * The app's own preview styling pins a code span to 12px, which is fine for a
         * themed panel and wrong for a page: it left every package name at one size
         * while the prose around it followed the profile, so setting a table size
         * appeared to skip the identifiers. On the page a code span is `\texttt`, which
         * changes the FAMILY and keeps the size — so the preview does the same, and a
         * code span takes the size of whatever it is sitting in: the table body, the
         * header row, or the document. */
        // CODE-1: the shade is the profile's, and blank means none — so a preview of a
        // profile with no code shading shows unshaded code, as the page will.
        '.rd-paper code { background: ' + (f.page.codeShade || 'transparent') + '; color: #111; font-size: inherit;' +
          ' padding: ' + (f.page.codeShade ? '0.1em 0.2em' : '0') + '; }',
        // The caption is emitted before the table's first rule, so the row-font machinery
        // has not started when it is set — it came out at the DOCUMENT size (measured:
        // 10.91pt in an 11pt document beside a 9pt table). FNT-4 gives it a size of its
        // own, and blank still means the document's, so that measurement still holds.
        '.rd-paper .prv-caption { color: #333; font-size: ' + px(ptNum(f.tables.captionFontSize, base)) + 'px;' +
          ' font-weight: ' + (f.tables.captionBold ? '700' : '400') + '; font-style: ' + (f.tables.captionItalic ? 'italic' : 'normal') + '; }'
      ];
      f.levels.forEach(function (lv) {
        var size = ptNum(lv.size, 12);
        var lead = ptNum(lv.leading, size + 3);
        var before = ptNum(lv.spaceBefore, 0);
        var after = ptNum(lv.spaceAfter, 0);
        // TTL-3: a title is an h1 element carrying its own class, because on the page it
        // is an H1 command carrying its own \titleformat. Same shape, both places.
        out.push('.rd-paper ' + (lv.level === TITLE_STYLE_LEVEL ? '.prv-title' : '.prv-h' + lv.level) + ' {' +
          ' font-size: ' + px(size) + 'px;' +
          ' line-height: ' + px(lead) + 'px;' +
          ' font-weight: ' + (lv.bold ? '700' : '400') + ';' +
          ' font-style: ' + (lv.italic ? 'italic' : 'normal') + ';' +
          ' margin: ' + px(before) + 'px 0 ' + px(after) + 'px; }');
      });
      // TBS-1: the profile's ACTUAL colours here, not a themed stand-in. The paper is a
      // page, so it is white whatever the app's theme is, and the colours read true.
      var t = f.tables;
      // FNT-4: opting a header row in buys the SHADE and nothing else now — its weight
      // and slope come from the Fonts table above and reach every table alike.
      if (t.head && t.head.shade) out.push('.rd-paper .prv-shade-head thead th { background: ' + t.head.shade + '; }');
      // FNT-5: opting the first column in buys the SHADE, on the same rule as the header
      // row. Its weight and slope are document-wide and travel as markdown emphasis, so
      // they are already in the HTML as <strong>/<em> — a CSS rule here would be a second
      // opinion about the same thing, and the one that disagreed with the page.
      if (t.firstColumn && t.firstColumn.shade) out.push('.rd-paper .prv-shade-col tbody td:first-child { background: ' + t.firstColumn.shade + '; }');
      /* FNT-6: its SIZE is not an opt-in — it reaches every table, as the header row's
       * does, so it is stated against every table's first column rather than against the
       * shaded ones. Emitted only when the profile sets one, so a document that leaves it
       * blank has exactly the stylesheet it had before. */
      if (ptNum(t.firstColFontSize, 0)) {
        out.push('.rd-paper .prv-table tbody td:first-child { font-size: ' + px(ptNum(t.firstColFontSize, base)) + 'px; }');
      }
      // CAP-2: the caption's own alignment, whatever the table does.
      out.push('.rd-paper .prv-caption { text-align: ' + (t.captionCentre ? 'center' : 'left') + '; }');
      return out.join('\n');
    }

    /**
     * TBS-1: the `style` App.md.table wants, for a table that has asked for one.
     *
     * The profile owns the LOOK; the table owns whether it wears it. Keeping the two
     * apart is what lets a house style be changed once and reach every table that opted
     * in — and what stops a table carrying a colour that a report template moved on
     * from. Absent flags mean an unstyled table, which is the default everywhere.
     *
     * @param {Object} profile @param {?{head?:boolean, firstColumn?:boolean}} flags
     * @returns {?{head?:Object, firstColumn?:Object}} null when nothing is styled
     */
    function tableStyle(profile, flags) {
      flags = flags || {};
      var t = normalise(profile).tables;
      var out = {};
      // FNT-4: the header row's WEIGHT is a document-wide setting now (tables.headBold),
      // applied to every table through \chTblHeadFont. What opting in still buys is the
      // shading, which is genuinely per-table — so this hands over the shade alone, and
      // App.md emits no markdown emphasis for a header row at all.
      if (flags.head) out.head = { shade: t.head.shade };
      /* FNT-5: the first column, on the same footing.
       *
       * Its weight and slope reach EVERY table, whether or not the section opted in —
       * they are a kind of text the document sets, like the header row's. A LaTeX macro
       * cannot carry them the way \chTblHeadFont carries the header's (nothing pandoc
       * writes marks a column), so they travel as markdown emphasis on the first cell of
       * each body row, which is where App.md was already putting them.
       *
       * Opting in adds the SHADE, and only the shade. So a profile that sets neither
       * hands over nothing and the table is left alone — which is what `null` means to
       * App.md.table, and why an unstyled document still emits exactly what it did.
       */
      var col = {};
      if (t.firstColBold) col.bold = true;
      if (t.firstColItalic) col.italic = true;
      // FNT-6: the size does reach every table through a macro, so unlike the weight it
      // is handed over as a flag — App.md emits the span, the preamble holds the number.
      if (ptNum(t.firstColFontSize, 0)) col.fontSize = ptNum(t.firstColFontSize, 0);
      if (flags.firstColumn && t.firstColumn.shade) col.shade = t.firstColumn.shade;
      if (Object.keys(col).length) out.firstColumn = col;
      return Object.keys(out).length ? out : null;
    }

    App.docFormat = {
      STANDARD: STANDARD, standard: standard, normalise: normalise,
      list: list, resolve: resolve, validate: validate,
      preamble: preamble, frontMatter: frontMatter, tablePreamble: tablePreamble,
      tableStyle: tableStyle, normaliseShade: normaliseShade,
      // PRV-2: the same profile, compiled for the on-screen preview instead of for TeX.
      previewCss: previewCss, textWidthMm: textWidthMm, textWidthPx: textWidthPx, mmPx: mmPx, tableMetrics: tableMetrics,
      // PRV-4: the sheet, for a preview that shows where the pages fall.
      pageMetrics: pageMetrics,
      // SEC-4: which heading levels already start a page of their own.
      levelBreaks: levelBreaks,
      PAPERS: PAPERS, NUMBER_POSITIONS: NUMBER_POSITIONS, LATEX_LEVELS: LATEX_LEVELS,
      // HDR-1: the header and footer, as four sets of three slots.
      HF_SETS: HF_SETS, HF_SLOTS: HF_SLOTS, HF_MACROS: HF_MACROS, slotParts: slotParts,
      headerFooter: resolveHeaderFooter,
      FONTS: FONTS, font: font
    };
  })(App);
