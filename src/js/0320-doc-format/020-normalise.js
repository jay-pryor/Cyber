    /**
     * Fill a partial profile out against the baseline, so a profile written by an
     * older version of the tool (or hand-edited in an exported file) is usable rather
     * than a load failure. Unknown keys are dropped, not carried.
     * @param {Object} p @returns {Object} a complete profile
     */
    function normalise(p) {
      var base = standard();
      p = p || {};
      var out = {
        id: String(p.id || 'standard'),
        name: String(p.name || base.name),
        page: Object.assign({}, base.page, p.page || {}),
        headings: Object.assign({}, base.headings, p.headings || {}),
        levels: base.levels.map(function (lv, i) {
          var got = (p.levels || []).filter(function (x) { return x && x.level === lv.level; })[0] || (p.levels || [])[i];
          return Object.assign({}, lv, got || {}, { level: lv.level });
        }),
        toc: Object.assign({}, base.toc, p.toc || {}),
        tables: Object.assign({}, base.tables, p.tables || {}),
        headerFooter: Object.assign({}, base.headerFooter, p.headerFooter || {})
      };
      // HDR-1: the four slot sets merge field by field, on the same rule as the table
      // styles — a profile that pins only the footer's centre keeps the rest.
      HF_SETS.forEach(function (k) {
        out.headerFooter[k] = Object.assign({}, base.headerFooter[k], (p.headerFooter || {})[k] || {});
        HF_SLOTS.forEach(function (s) { out.headerFooter[k][s] = String(out.headerFooter[k][s] == null ? '' : out.headerFooter[k][s]); });
      });
      out.headerFooter.firstDifferent = out.headerFooter.firstDifferent === true;
      /* HDR-1: an older profile's page-number position, read into the slots.
       *
       * Only when the profile carries no header/footer of its own — a profile saved
       * since has already said where everything goes, and letting a leftover field
       * overwrite that would move the number back to where it used to be. The default
       * footer-centre lands exactly where the shipped profile already puts `page`, so
       * an untouched profile is unchanged by this.
       */
      if (!p.headerFooter && p.page && p.page.numberPosition !== undefined) {
        HF_SETS.forEach(function (k) { HF_SLOTS.forEach(function (s) { out.headerFooter[k][s] = ''; }); });
        var slot = NUMBER_SLOTS[p.page.numberPosition];
        if (slot) out.headerFooter[slot[0]][slot[1]] = '#page';
      }
      delete out.page.numberPosition;
      if (p.builtin) out.builtin = true;
      if (PAPERS.indexOf(out.page.paper) === -1) out.page.paper = base.page.paper;
      // FNT-2: the font is a LaTeX package name on its way to the preamble and a CSS
      // family on its way to the preview. Both are places where an unchecked string
      // does damage, so an unrecognised one becomes the default here, once, rather
      // than being guarded at each of the three places that read it.
      out.page.fontFamily = font(out).value;
      // CODE-1: a colour on its way to both \definecolor and a stylesheet, on the same
      // rule as the table shades — malformed means none rather than a compile error.
      out.page.codeShade = normaliseShade(out.page.codeShade);
      // CAP-3: anything but 'above' is 'below', which is the default and the safe read.
      out.tables.captionPosition = out.tables.captionPosition === 'above' ? 'above' : 'below';
      // TBS-1: the two table styles merge FIELD BY FIELD. A profile that pins only
      // `firstColumn.bold` must keep the baseline's shade rather than lose it to a
      // shallow overwrite — the same rule the levels above already follow.
      ['head', 'firstColumn'].forEach(function (k) {
        out.tables[k] = Object.assign({}, base.tables[k], (p.tables && p.tables[k]) || {});
        out.tables[k].shade = normaliseShade(out.tables[k].shade);
      });
      /* FNT-4: a profile written before the header row's weight moved out of the opt-in.
       *
       * `tables.head.bold` used to be BOTH "what a styled header looks like" and the only
       * way a header row could be bold at all. It is now a document-wide setting
       * (`tables.headBold`), so a saved profile that pinned the old field keeps the
       * appearance it already had rather than silently losing its bold. Read only when
       * the new field is absent, so a profile that has been edited since is not overruled
       * by a leftover.
       */
      var oldHead = (p.tables && p.tables.head) || {};
      if ((!p.tables || p.tables.headBold === undefined) && oldHead.bold !== undefined) out.tables.headBold = !!oldHead.bold;
      if ((!p.tables || p.tables.headItalic === undefined) && oldHead.italic !== undefined) out.tables.headItalic = !!oldHead.italic;
      delete out.tables.head.bold;
      delete out.tables.head.italic;
      /* FNT-5: the same move, one round later, for the first column.
       *
       * A profile saved before this carries `tables.firstColumn.bold` and no
       * `firstColBold`, and it must keep the appearance it already had rather than
       * silently losing it. Read only when the new field is absent, so a profile edited
       * since is not overruled by a leftover — exactly the rule above.
       */
      var oldCol = (p.tables && p.tables.firstColumn) || {};
      if ((!p.tables || p.tables.firstColBold === undefined) && oldCol.bold !== undefined) out.tables.firstColBold = !!oldCol.bold;
      if ((!p.tables || p.tables.firstColItalic === undefined) && oldCol.italic !== undefined) out.tables.firstColItalic = !!oldCol.italic;
      delete out.tables.firstColumn.bold;
      delete out.tables.firstColumn.italic;
      return out;
    }

    /** A shade is `#rrggbb` or nothing. Anything else is dropped rather than passed to
     *  LaTeX, where a malformed colour is a compile error rather than a wrong colour. */
    function normaliseShade(v) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return '';
      if (s.charAt(0) !== '#') s = '#' + s;
      return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : '';
    }

    /** Every profile available to a project: the built-in first, then the saved ones. */
    function list(project) {
      var saved = ((project && project.report && project.report.formats) || []).map(normalise);
      return [standard()].concat(saved.filter(function (f) { return f.id !== 'standard'; }));
    }

    /** FMT-2: the profile the project is currently set to use. Falls back to the
     *  built-in when the saved id no longer resolves — a deleted profile must never
     *  block generation. */
    function resolve(project) {
      var want = (project && project.report && project.report.formatId) || 'standard';
      var found = list(project).filter(function (f) { return f.id === want; })[0];
      return found || standard();
    }

    // ---- compilation to pandoc -----------------------------------------------

    /** `12` -> `12pt`; passes an already-suffixed string through untouched. */
    function pt(v, dflt) {
      if (v == null || v === '') return dflt;
      var s = String(v).trim();
      return /^[\d.]+$/.test(s) ? s + 'pt' : s;
    }
    /** A length for `geometry`; bare numbers are read as millimetres. */
    function len(v, dflt) {
      if (v == null || v === '') return dflt;
      var s = String(v).trim();
      return /^[\d.]+$/.test(s) ? s + 'mm' : s;
    }

    /** The font selection one level's styling implies. */
    function levelFont(lv) {
      return '\\normalfont\\fontsize{' + pt(lv.size, '12pt') + '}{' + pt(lv.leading || (Number(lv.size) + 3), '15pt') + '}\\selectfont' +
        (lv.bold ? '\\bfseries' : '\\mdseries') + (lv.italic ? '\\itshape' : '\\upshape');
    }

    /**
     * TTL-3: one level's styling as a MACRO the body can call, rather than as a
     * preamble declaration.
     *
     * A title and an H1 are the same LaTeX command — both are `\section`, because both
     * are a `#` — so titlesec cannot tell them apart and a single `\titleformat` has to
     * serve both. The way out is to restyle `\section` in the document: App.doc emits
     * `\chTitleStyle` before a title's heading and `\chSectionStyle` after it, so the
     * one command wears two looks.
     *
     * Deliberately NOT wrapped in `\begingroup`/`\endgroup`, which would be the obvious
     * way to scope it: `\section` ends by putting the indent suppression for the
     * paragraph after it into `\everypar`, which is a LOCAL assignment — closing a group
     * straight after the heading throws it away, and the first paragraph under a title
     * would then be indented where the same paragraph under an H1 is not. Two plain
     * declarations either side leave the heading itself at the outer level, exactly as
     * an ordinary heading is.
     */
    function styleMacro(name, lv, centred) {
      return '\\newcommand{\\' + name + '}{' +
        '\\titleformat{\\section}{' + levelFont(lv) + (centred ? '\\centering' : '') + '}{}{0pt}{}' +
        '\\titlespacing*{\\section}{0pt}{' + pt(lv.spaceBefore, '0pt') + '}{' + pt(lv.spaceAfter, '0pt') + '}' +
        // \def rather than \newcommand: this runs in the body, where \sectionbreak may
        // already carry whichever of the two set it last.
        '\\def\\sectionbreak{' + (lv.pageBreakBefore ? '\\clearpage' : '') + '}}';
    }

    /* CTR-1: a centred heading is a `\titleformat` with `\centering` in it, NOT a
     * heading inside a `center` environment.
     *
     * The environment was the obvious way and it was wrong twice over, both measurable
     * on the page:
     *
     *   * titlesec typesets a heading's text in a box of its own, and `\centering` set
     *     outside that box does not reach inside it — so the heading came out
     *     JUSTIFIED across the full measure rather than centred, which is what a
     *     centred title page actually looked like;
     *   * `\begin{center}` contributes its `\topsep` glue BEFORE `\section` runs, and
     *     `\section` is where `\sectionbreak` fires. With the Title level asking for a
     *     page break (the shipped profile does), that glue landed on a page of its own
     *     and `\clearpage` then ended it — an entirely blank page ahead of the section.
     *
     * Putting `\centering` in the format argument is where titlesec expects alignment,
     * and it leaves the break machinery exactly where it was. One macro per level, named
     * by ordinal rather than by LaTeX command so App.doc does not have to know the
     * mapping (it already emits \chTitleStyle by name, on the same reasoning).
     */
    var LEVEL_WORDS = ['One', 'Two', 'Three', 'Four'];
    function centreMacros(lv) {
      var cmd = LATEX_LEVELS[lv.level - 1], word = LEVEL_WORDS[lv.level - 1];
      if (!cmd || !word) return [];
      function fmt(centred) {
        return '\\titleformat{\\' + cmd + '}{' + levelFont(lv) + (centred ? '\\centering' : '') + '}{}{0pt}{}';
      }
      return ['\\newcommand{\\chCentre' + word + '}{' + fmt(true) + '}',
        '\\newcommand{\\chPlain' + word + '}{' + fmt(false) + '}'];
    }

    /* SPC-1: space above a HEADING, which is not the same problem as space between two
     * paragraphs.
     *
     * A `\vspace*` written before the heading is contributed to the page the heading is
     * leaving, not the one it is arriving on — and when the level starts a new page
     * (`\sectionbreak` is `\clearpage`, fired BY the heading, after our glue) the gap was
     * simply spent at the foot of the previous page and the heading came out flush with
     * the top margin. Which is exactly the case worth asking for: a signature page whose
     * heading sits two thirds of the way down.
     *
     * The same trap the CTR-1 comment above records, from the other side. The way out is
     * the same one this file uses everywhere: the document calls a macro by name and the
     * PROFILE decides what it means. A level that breaks does its own `\clearpage` first
     * and then eats the one titlesec is about to fire; a level that does not simply
     * leaves the glue.
     *
     * `\gdef\HOOK{\gdef\HOOK{...}}` is a one-shot: called once by this heading, it puts
     * the level's real break straight back for the next one. No group is opened, because
     * a group closed around a heading throws away the `\everypar` it set (see styleMacro).
     * `\titlespacing`'s own beforeskip cannot be used for this: LaTeX discards vertical
     * glue at the top of a page, which is the only place it would ever matter.
     */
    function gapMacro(name, hook, breaks) {
      return '\\newcommand{\\' + name + '}[1]{' + (breaks
        ? '\\clearpage\\vspace*{#1}\\gdef\\' + hook + '{\\gdef\\' + hook + '{\\clearpage}}'
        : '\\vspace*{#1}') + '}';
    }

    /** The `titlesec` block for one heading level. */
    function levelPreamble(lv) {
      // TTL-3: the title is not a sectioning command of its own — it is a `\section`
      // wearing another face, so it compiles to a macro rather than to a declaration.
      if (lv.level === TITLE_STYLE_LEVEL) {
        // CTR-1: a title gets a centred face too — a title page is the commonest thing
        // anybody centres, and it is the level they will have picked for it.
        // SPC-1: a title is a `\section`, so its break hook is `\sectionbreak` — but
        // whether it breaks is the TITLE level's own answer, not H1's.
        return [styleMacro('chTitleStyle', lv), styleMacro('chTitleStyleCentred', lv, true),
          gapMacro('chGapTitle', 'sectionbreak', !!lv.pageBreakBefore)];
      }
      var cmd = LATEX_LEVELS[lv.level - 1];
      if (!cmd) return [];
      var out = [
        // The empty {}{0pt}{} is deliberate: App.doc has already written the number
        // into the heading text, so LaTeX must not add a second one.
        '\\titleformat{\\' + cmd + '}{' + levelFont(lv) + '}{}{0pt}{}',
        '\\titlespacing*{\\' + cmd + '}{0pt}{' + pt(lv.spaceBefore, '0pt') + '}{' + pt(lv.spaceAfter, '0pt') + '}'
      ];
      if (lv.pageBreakBefore) out.push('\\newcommand{\\' + cmd + 'break}{\\clearpage}');
      // SPC-1: this level's "start further down the page", which has to know whether the
      // level breaks — see gapMacro.
      out.push(gapMacro('chGap' + LEVEL_WORDS[lv.level - 1], cmd + 'break', !!lv.pageBreakBefore));
      // The counterpart to \chTitleStyle: what a heading goes back to afterwards.
      if (lv.level === 1) out.push(styleMacro('chSectionStyle', lv));
      // CTR-1: the centred face for this level, and the plain one to go back to.
      return out.concat(centreMacros(lv));
    }

    /**
     * TBS-1: the two macros App.md's shading fences call, plus the colours behind them.
     *
     * `colortbl` rather than `\usepackage[table]{xcolor}` because pandoc's default
     * template has already loaded xcolor by the time `header-includes` is read, and a
     * second load with an option is an "Option clash" — a hard failure, measured on
     * pandoc 3.1.11 + tectonic, not guessed.
     *
     * `\chTblHeadShade` redefines `\toprule`, which is what pandoc emits immediately
     * before the header row of every longtable, so `\rowcolor` lands where colortbl
     * needs it — at the start of a row. It is only ever called inside a `\begingroup`
     * around one table (see App.md), so the redefinition cannot leak into the next one.
     *
     * Both macros are defined whatever the profile says, so a table that asks for
     * shading always compiles. A profile with no shade colour simply defines them as
     * no-ops rather than leaving the document referring to a macro that is not there.
     */
    function tablePreamble(f) {
      var t = (f && f.tables) || {};
      var headShade = (t.head && t.head.shade) || '';
      var colShade = (t.firstColumn && t.firstColumn.shade) || '';
      var out = ['\\usepackage{colortbl}'];
      if (headShade) out.push('\\definecolor{chTblHeadColour}{HTML}{' + headShade.slice(1).toUpperCase() + '}');
      if (colShade) out.push('\\definecolor{chTblColColour}{HTML}{' + colShade.slice(1).toUpperCase() + '}');
      // Opting in switches BOTH on: the `\toprule` redefinition, which colours the first
      // header row, and `\chTblHeadRow`, which a filter can put on the rest of them.
      out.push(headShade
        ? '\\newcommand{\\chTblHeadShade}{\\let\\chOldToprule\\toprule' +
          '\\renewcommand{\\toprule}{\\chOldToprule\\rowcolor{chTblHeadColour}}' +
          '\\renewcommand{\\chTblHeadRow}{\\rowcolor{chTblHeadColour}}}'
        : '\\newcommand{\\chTblHeadShade}{}');
      out.push(colShade
        ? '\\newcommand{\\chTblColShade}{\\cellcolor{chTblColColour}}'
        : '\\newcommand{\\chTblColShade}{}');
      /* FNT-6: the first column's own size, as the macro App.md's span calls.
       *
       * Defined whatever the profile says, for the reason the shading macros are: a
       * document that names a macro the preamble does not define is a compile error, and
       * an empty macro is a size that changes nothing. The leading is the same 1.2x the
       * row-font machinery uses, so a first column set smaller sets its wrapped lines
       * closer together as well, which is what a smaller size means.
       */
      var colSize = ptNum(t.firstColFontSize, 0);
      out.push(colSize
        ? '\\newcommand{\\chTblColFont}{\\fontsize{' + colSize + 'pt}{' +
          (Math.round(colSize * 1.2 * 100) / 100) + 'pt}\\selectfont}'
        : '\\newcommand{\\chTblColFont}{}');
      /* TBL-1: the header row's shade as a CELL colour as well as a row colour.
       *
       * `\chTblHeadShade` works by redefining `\toprule`, which pandoc emits once,
       * before the FIRST header row — so with a title row above the column headings it
       * coloured the title and left the headings white. `\rowcolor` cannot be reached
       * for the second row: it has to sit immediately after the `\\` that starts the
       * row, and everything this file can put there is inside a cell.
       *
       * `\cellcolor` can be inside a cell, and — measured, because it is the whole
       * question — it works from inside the `minipage` pandoc wraps a grid table's
       * header cells in. So the headings row is coloured cell by cell, which is the same
       * mechanism the first column has used since TBS-1.
       */
      out.push(headShade
        ? '\\newcommand{\\chTblHeadCell}{\\cellcolor{chTblHeadColour}}'
        : '\\newcommand{\\chTblHeadCell}{}');
      /* `\chTblHeadRow` is the same colour as a ROW rather than as cells, for a writer
       * that can put something at the start of a row — which markdown cannot, but a
       * pandoc filter that assembles the longtable itself can.
       *
       * It exists because `\cellcolor` takes no overhang (only `\columncolor` does), so
       * a cell-coloured row stops about 4.8pt short of the table's right rule — measured
       * at 300dpi on a built page. A `\rowcolor` covers the row edge to edge. Defined
       * unconditionally and empty by default, so a filter can emit it on every header
       * row without knowing whether this table asked for shading; `\chTblHeadShade`,
       * which is what a table opts in with, is what turns it on.
       */
      out.push('\\newcommand{\\chTblHeadRow}{}');
      // CAP-2 used to need `\usepackage{caption}` and `singlelinecheck=false` here, to
      // stop LaTeX centring a one-line caption and justifying a wrapped one. A caption
      // is an ordinary paragraph now (CAP-3), so its alignment is simply the alignment
      // of that paragraph and there is nothing to correct — see captionPreamble.
      return out.concat(fontPreamble(f));
    }

    /* FNT-1: a table's own font sizes, and why they are a preamble matter.
     *
     * `\fontsize` cannot be made global from inside a `\noalign` — it uses
     * `\afterassignment`, and `\global\fontsize` is an error (measured). What CAN be
     * flipped between rows is a MACRO, so the size travels as one: `\chRowFont` is
     * applied by every cell (pandoc writes `>{\raggedright\arraybackslash}` into every
     * column spec, so redefining `\raggedright` reaches every cell of every table), and
     * `\toprule` and `\midrule` — the rules pandoc puts either side of a header row —
     * flip which size it names.
     *
     * Document-wide rather than per-table because the sizes are a house decision, and
     * because doing it in the preamble means no flag has to be threaded through three
     * modules to reach App.md. `\midrule` appears only in tables and `\raggedright` only
     * in their cells, so nothing else is touched; with neither size set the macro is
     * empty and the preamble is unchanged.
     */
    /** FNT-4: the series/shape a weight-and-slope pair implies, always stated in full
     *  so a macro cannot inherit half its typography from wherever it is called. */
    function emph(bold, italic) {
      return (bold ? '\\bfseries' : '\\mdseries') + (italic ? '\\itshape' : '\\upshape');
    }

