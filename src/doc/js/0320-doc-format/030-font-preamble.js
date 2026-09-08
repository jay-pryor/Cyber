    function fontPreamble(f) {
      var t = f.tables || {};
      var body = ptNum(t.fontSize, 0), head = ptNum(t.headFontSize, 0);
      /* FNT-4: the row-font machinery now carries weight and slope as well as size, so
       * it is needed whenever any of those differ from the document's — and whenever the
       * DOCUMENT is bold or italic, because then a table has to say plainly that it is
       * not, or it would inherit the body's emphasis through \AtBeginDocument. */
      var emphasised = t.bold || t.italic || t.headBold || t.headItalic;
      if (!body && !head && !emphasised && !f.page.bold && !f.page.italic) return [];
      var base = ptNum(f.page.fontSize, 11);
      function sel(size, bold, italic) {
        var s = size || base;
        return '\\fontsize{' + s + 'pt}{' + (Math.round(s * 1.2 * 100) / 100) + 'pt}\\selectfont' + emph(bold, italic);
      }
      return [
        '\\newcommand{\\chTblHeadFont}{' + sel(head, t.headBold, t.headItalic) + '}',
        '\\newcommand{\\chTblBodyFont}{' + sel(body, t.bold, t.italic) + '}',
        '\\newcommand{\\chRowFont}{}',
        // DISTINCT names from the shading macro's `\chOldToprule`. That one re-lets its
        // saved rule per table, and if the two shared a name it would capture a macro
        // whose own body names it — an expansion that never terminates.
        '\\let\\chBaseRaggedright\\raggedright',
        '\\renewcommand{\\raggedright}{\\chBaseRaggedright\\chRowFont}',
        '\\let\\chBaseToprule\\toprule',
        '\\renewcommand{\\toprule}{\\chBaseToprule\\noalign{\\global\\let\\chRowFont\\chTblHeadFont}}',
        '\\let\\chBaseMidrule\\midrule',
        '\\renewcommand{\\midrule}{\\noalign{\\global\\let\\chRowFont\\chTblBodyFont}\\chBaseMidrule}'
      ];
    }

    /**
     * FMT-3: the whole LaTeX preamble a profile implies.
     * @param {Object} profile @param {{classification?:string}} [opts]
     */
    /* CODE-1: a shaded box behind a code span, without losing the ability to break one.
     *
     * A code span reaches LaTeX as `\texttt`, and the obvious way to shade it —
     * `\colorbox` — typesets its contents in an unbreakable hbox. Measured on
     * pandoc 3.1.11 + tectonic: a 64-character SHA-256 in a `\colorbox` runs 49pt past
     * the right margin, which is precisely the defect BRK-1 fixed by routing every
     * `\texttt` through `\seqsplit`. soul's `\hl` breaks only at spaces, which an
     * identifier has none of (37pt over), and `\hl` around `\seqsplit` is a hard error
     * ("Argument of \seqsplit has an extra }"). All three were built, not reasoned about.
     *
     * So the choice is made per span by the only thing in a position to judge it: the
     * typesetter, which knows how wide the run actually is. A span that fits takes the
     * shaded box; one that does not stays breakable and unshaded, because a background
     * painted across a line break reads worse than no background at all.
     */
    function codePreamble(f) {
      var shade = normaliseShade(f.page.codeShade);
      var plain = '\\renewcommand{\\texttt}[1]{\\chOriginalTexttt{\\seqsplit{#1}}}';
      if (!shade) return [plain];
      return [
        '\\definecolor{chCodeShade}{HTML}{' + shade.slice(1).toUpperCase() + '}',
        '\\newlength{\\chCodeWidth}',
        // \fboxsep is the box's padding. The default 3pt makes a shaded span in a table
        // cell sit visibly proud of the unshaded one above it.
        '\\newcommand{\\chCodeBox}[1]{{\\setlength{\\fboxsep}{1.5pt}\\colorbox{chCodeShade}{#1}}}',
        '\\renewcommand{\\texttt}[1]{%',
        '  \\settowidth{\\chCodeWidth}{\\chOriginalTexttt{#1}}%',
        '  \\ifdim\\chCodeWidth>' + CODE_SHADE_MAX + '\\linewidth',
        '    \\chOriginalTexttt{\\seqsplit{#1}}%',
        '  \\else',
        '    \\chCodeBox{\\chOriginalTexttt{#1}}%',
        '  \\fi}'
      ];
    }
    /* The test is against `\linewidth`, NOT `\columnwidth`, and the difference is the
     * whole of it: inside a table cell `\columnwidth` is still the width of the PAGE's
     * column, so measuring against it boxed `imsSettings.simSlot0.enabled` in a narrow
     * first column and ran it 38pt out of the cell (measured). `\linewidth` is the cell
     * inside a `p{}` column and the text block outside one, which is the question being
     * asked in both places: does this run fit where it is being set? */
    var CODE_SHADE_MAX = '0.95';

    /* CAP-3: the caption, as two macros the document wraps a paragraph in.
     *
     * Pandoc's own caption syntax puts the text INSIDE the longtable's first head —
     * verified by reading its LaTeX: `\caption{...}\tabularnewline` sits directly before
     * `\toprule`. That is why the caption printed above the table whichever side of the
     * table the markdown put it on, and no `\captionsetup` moves it, because its
     * position in the output is its position in the source. It also means LaTeX numbers
     * the table while this file numbers its own headings and cross-references: two
     * counters for one thing, kept in step only by both counting in the same order.
     *
     * So a caption stops being a pandoc caption and becomes an ordinary paragraph that
     * App.doc numbers, exactly as it numbers a heading. What is left for LaTeX is how it
     * LOOKS — the size, the alignment and the space on each side — which is these two
     * macros. The longtable skip on the side facing the caption is zeroed, or the gap a
     * reader sees is longtable's `\bigskipamount` plus ours rather than the one asked for.
     */
    var CAPTION_FAR_SKIP = 6;      // pt, on the side of the caption AWAY from the table
    function captionPreamble(f) {
      var t = f.tables || {};
      var below = t.captionPosition !== 'above';
      var skip = ptNum(t.captionSkip, 4);
      var near = skip + 'pt', far = CAPTION_FAR_SKIP + 'pt';
      /* FNT-4: a caption's own size, weight and slope.
       *
       * It is set inside \chCaptionOpen rather than in the preamble because a caption is
       * an ordinary paragraph (CAP-3) with nothing else marking it — there is no caption
       * environment left to restyle. Blank size means the document's, which is what the
       * caption was already coming out at, so a profile that says nothing here is
       * byte-identical to before.
       */
      var capSize = ptNum(t.captionFontSize, 0);
      var capFont = (capSize ? '\\fontsize{' + capSize + 'pt}{' + (Math.round(capSize * 1.2 * 100) / 100) + 'pt}\\selectfont' : '') +
        emph(t.captionBold, t.captionItalic);
      return [
        below ? '\\setlength{\\LTpost}{0pt}' : '\\setlength{\\LTpre}{0pt}',
        '\\newcommand{\\chCaptionOpen}{\\par\\addvspace{' + (below ? near : far) + '}\\begingroup' +
          capFont + (t.captionCentre ? '\\centering' : '\\raggedright') + '}',
        '\\newcommand{\\chCaptionClose}{\\par\\endgroup\\addvspace{' + (below ? far : near) + '}}'
      ];
    }

    /* TOC-1/TOC-2: the contents list, printed where the document says rather than where
     * pandoc's template would put it.
     *
     * `toc: true` in the YAML emits the list immediately after `\maketitle`, before any
     * content, with LaTeX's own "Contents" heading — which makes it the one part of the
     * document the section order could not move. `\@starttoc{toc}` prints the entries
     * and NOTHING else, so the heading above them is this file's, numbered (or not) and
     * ordered by the same machinery as every other section.
     *
     * The stretch is reset inside it because a contents list is not prose: at 1.15 the
     * gaps compound with the class's own inter-entry skip, which is what makes a
     * seven-section report take most of a page to list.
     */
    function tocPreamble(f) {
      var toc = f.toc || {};
      var gap = ptNum(toc.entrySpacing, 2);
      var depth = Number(toc.depth);
      if (!isFinite(depth) || depth < 1) depth = 3;
      return [
        '\\usepackage{tocloft}',
        '\\setlength{\\cftbeforesecskip}{' + gap + 'pt}',
        // Nested entries take half, as the class itself does.
        '\\setlength{\\cftbeforesubsecskip}{' + (Math.round(gap * 50) / 100) + 'pt}',
        '\\setlength{\\cftbeforesubsubsecskip}{' + (Math.round(gap * 50) / 100) + 'pt}',
        '\\setcounter{tocdepth}{' + Math.round(depth) + '}',
        // `@` must be a letter when the body is TOKENISED, not when it is called, so
        // \makeatletter has to sit outside \newcommand rather than inside it.
        '\\makeatletter',
        '\\newcommand{\\chContents}{\\begingroup\\setstretch{1}\\@starttoc{toc}\\endgroup}',
        '\\makeatother'
      ];
    }

    function preamble(profile, opts) {
      opts = opts || {};
      var f = normalise(profile);
      var lines = ['\\usepackage{titlesec}', '\\usepackage{fancyhdr}', '\\usepackage{setspace}',
        // A 64-character SHA-256 and a long package name are single unbreakable words
        // in a typewriter font, and LaTeX will happily run them 50mm past the right
        // margin rather than break them (verified: 146pt overfull on the provenance
        // block). seqsplit offers a breakpoint between every character, which TeX uses
        // only when it has to — so short identifiers are untouched and long ones wrap.
        '\\usepackage{seqsplit}',
        '\\let\\chOriginalTexttt\\texttt'];
      lines = lines.concat(codePreamble(f), captionPreamble(f), tocPreamble(f));

      if (f.page.lineSpacing && Number(f.page.lineSpacing) !== 1) {
        lines.push('\\setstretch{' + Number(f.page.lineSpacing) + '}');
      }
      // FNT-2: a sans package sets \sfdefault and stops there, so `fontfamily: tgheros`
      // on its own produces a document whose body is still Latin Modern Roman and whose
      // (unused) sans family is Helvetica — the setting appears to do nothing. header-includes
      // is read after the template has loaded the package, so this is where it can be said.
      if (font(f).sans) lines.push('\\renewcommand{\\familydefault}{\\sfdefault}');
      /* FNT-4: the body's own weight and slope.
       *
       * \AtBeginDocument rather than a preamble declaration, because the document's
       * default series is fixed when the body starts and a bare \bfseries in the
       * preamble is undone by it. Everything that sets its own — every heading level,
       * both table row fonts, the caption — states both halves in full (see emph), so
       * this reaches the prose and nothing that has an opinion of its own.
       */
      if (f.page.bold || f.page.italic) {
        lines.push('\\AtBeginDocument{' + emph(f.page.bold, f.page.italic) + '}');
      }
      lines = lines.concat(tablePreamble(f));
      f.levels.forEach(function (lv) { lines = lines.concat(levelPreamble(lv)); });

      return lines.concat(headerFooterPreamble(f, opts)).join('\n');
    }

    /**
     * HDR-1: the running header and footer, and the optional different first page.
     * @param {Object} f  a normalised profile
     * @param {{classification?:string}} opts
     */
    function headerFooterPreamble(f, opts) {
      var hf = f.headerFooter;
      /* The classification banner is a HEADER AND FOOTER, so it belongs here rather than
       * competing with them for the same slots. It is applied as a DEFAULT — filling the
       * centre slot only where the profile has left it empty — by resolveHeaderFooter,
       * which the PREVIEW also calls, so the two cannot disagree about where it lands.
       */
      var resolved = resolveHeaderFooter(f, opts);
      var sets = {};
      HF_SETS.forEach(function (k) {
        sets[k] = {};
        HF_SLOTS.forEach(function (s) { sets[k][s] = slotLatex(resolved[k][s]); });
      });
      // The banner is the one thing the profile did not write, so it is the one thing
      // this file styles rather than passing through as the operator typed it.
      if (opts.classification) {
        // Also the preamble, so also MD.latex — see slotLatex.
        var banner = '\\textbf{' + MD.latex(opts.classification) + '}';
        Object.keys(resolved.banner).forEach(function (k) { sets[k][resolved.banner[k]] = banner; });
      }
      function slots(set, head) {
        var cmd = head ? '\\fancyhead' : '\\fancyfoot';
        return HF_SLOTS.filter(function (s) { return sets[set][s]; })
          .map(function (s) { return cmd + '[' + HF_LETTER[s] + ']{' + sets[set][s] + '}'; });
      }
      var out = ['\\pagestyle{fancy}', '\\fancyhf{}', '\\renewcommand{\\headrulewidth}{0pt}'];
      // `lastpage` only when something asks for the total — an unused package is a
      // download and a risk on a machine building this offline.
      if (usesPages(hf)) out.unshift('\\usepackage{lastpage}');
      out = out.concat(slots('header', true), slots('footer', false));
      /* Pandoc puts the first page of each top-level section on `plain`, which would
       * otherwise lose the header and footer entirely. Redefining `plain` to be `fancy`
       * is what keeps them.
       *
       * The FIRST page is a style of its own, `chfirst`, and NOT a redefinition of
       * `plain` — which is what the first attempt did, on the assumption that page 1 is
       * a plain page. It is not: with the automatic title block off there is no
       * `\maketitle`, so page 1 is an ordinary `fancy` page and the first-page slots
       * never appeared. Measured in a built PDF, where page 1 carried the running
       * header. App.doc emits `\thispagestyle{chfirst}` as the document's first block,
       * which is the only thing that can reach page 1 specifically.
       */
      out.push('\\fancypagestyle{plain}{\\pagestyle{fancy}}');
      if (hf.firstDifferent) {
        /* No second `\renewcommand{\headrulewidth}{0pt}` here, and that is not tidiness.
         *
         * Pandoc's `latex_macros` extension READS a `\renewcommand` in the input and
         * APPLIES it to everything after it. The rule above therefore defines
         * `\headrulewidth` as the literal `0pt`, and a second copy of the same line came
         * out of pandoc as `\renewcommand{0pt}{0pt}` — renewing something that is not a
         * command at all, which errors and takes this whole page style down with it.
         * Found by building the PDF: page one was still wearing the running header.
         * The rule above is document-wide, so there is nothing to repeat.
         */
        out.push('\\fancypagestyle{chfirst}{\\fancyhf{}' +
          slots('firstHeader', true).join('') + slots('firstFooter', false).join('') + '}');
      }
      return out;
    }

    /**
     * HDR-1: the header and footer as the PREVIEW needs them — plain text, with the
     * classification banner folded into the same slots the preamble folds it into.
     *
     * The two must agree about which slot the banner lands in, and the only way to
     * guarantee that is for both to compute it the same way; so the preamble calls this
     * too, and differs from the preview only in what it does with the result.
     * `page` and `pages` are left as the words they are — the preview knows the page
     * number and substitutes them itself, since it is the only one that can.
     *
     * The banner takes the first slot that is FREE, preferring the centre: the shipped
     * profile puts the page number in the footer's centre, so insisting on the centre
     * would have left the footer with no banner at all. A set whose three slots are all
     * spoken for gets none — at that point the operator has said what they want on that
     * line, and overwriting one of their slots is not a decision this file should make.
     * `banner` records which slot each set gave up, so the caller can style it.
     * @returns {{firstDifferent:boolean, banner:Object, header:Object, footer:Object,
     *            firstHeader:Object, firstFooter:Object}}
     */
    function resolveHeaderFooter(profile, opts) {
      var hf = normalise(profile).headerFooter;
      var cls = (opts && opts.classification) ? String(opts.classification) : '';
      var out = { firstDifferent: hf.firstDifferent, banner: {} };
      HF_SETS.forEach(function (k) {
        out[k] = {};
        HF_SLOTS.forEach(function (s) { out[k][s] = String(hf[k][s] || '').trim(); });
      });
      if (cls) {
        var fill = ['header', 'footer'].concat(hf.firstDifferent ? ['firstHeader', 'firstFooter'] : []);
        fill.forEach(function (k) {
          var free = ['centre', 'left', 'right'].filter(function (s) { return !out[k][s]; })[0];
          if (free) { out[k][free] = cls; out.banner[k] = free; }
        });
      }
      return out;
    }

    /** HDR-1: does any slot ask for the page TOTAL? Decides whether lastpage is loaded. */
    function usesPages(hf) {
      return HF_SETS.some(function (k) {
        return HF_SLOTS.some(function (s) {
          return slotParts(hf[k][s]).some(function (p) { return p.token === 'pages'; });
        });
      });
    }

    /**
     * HDR-1: one slot's text as LaTeX — literals escaped once, markers as their macros.
     *
     * `MD.latex`, NOT `MD.text`: this lands in `header-includes`, which pandoc passes
     * through verbatim, so it is the one string in a generated document that LaTeX reads
     * without pandoc in between. Escaped for markdown it produced `\<` from a header
     * reading "<---- Security classification", which is not a command LaTeX has.
     *
     * GEN-TAB: a placeholder in a slot has already been filled in by the time this runs
     * (App.generate fills them on the RAW slot text before the profile is compiled), so
     * the value is escaped by this one call along with the words around it. The
     * document-wide pass escapes for markdown, which is right for the body and would be
     * exactly as wrong here as the `\<` above.
     */
    function slotLatex(text) {
      return slotParts(text).map(function (p) {
        return p.token ? HF_MACROS[p.token] : MD.latex(p.text);
      }).join('');
    }

    /**
     * FMT-3: the complete YAML metadata block that opens the generated file.
     * @param {Object} profile
     * @param {{title:string, subtitle?:string, date?:string, author?:string,
     *          classification?:string, extra?:Array<{key:string,value:*}>}} meta
     * @returns {string}
     */
    function frontMatter(profile, meta) {
      meta = meta || {};
      var f = normalise(profile);
      var geometry = [
        'top=' + len(f.page.marginTop, '25mm'),
        'bottom=' + len(f.page.marginBottom, '25mm'),
        'left=' + len(f.page.marginLeft, '25mm'),
        'right=' + len(f.page.marginRight, '25mm')
      ];
      var entries = [
        { key: 'title', value: meta.title || '' },
        { key: 'subtitle', value: meta.subtitle || '' },
        { key: 'author', value: meta.author || '' },
        { key: 'date', value: meta.date || '' },
        { key: 'papersize', value: f.page.paper },
        { key: 'fontsize', value: pt(f.page.fontSize, '11pt') },
        // FNT-2: a package name, which pandoc's template turns into \usepackage{…}
        // before header-includes is read. Blank is dropped by MD.yaml, which leaves
        // pandoc's own default font in place rather than naming it.
        { key: 'fontfamily', value: font(f).value },
        { key: 'geometry', value: geometry },
        // App.doc writes the numbers, so LaTeX must not (see levelPreamble).
        { key: 'numbersections', value: false },
        // TOC-1: `toc: true` prints the list straight after \maketitle, which is the
        // one position the section order cannot move it to or away from. A document
        // that carries a contents SECTION prints it there instead, and says so here by
        // asking for no automatic one. The other two documents have no such section and
        // keep the automatic list, so nothing they do changes.
        { key: 'toc', value: meta.tocSection ? false : !!(f.toc && f.toc.include) },
        { key: 'toc-depth', value: (!meta.tocSection && f.toc && f.toc.include) ? Number(f.toc.depth || 3) : null },
        { key: 'colorlinks', value: true },
        { key: 'linkcolor', value: 'black' },
        { key: 'header-includes', value: { block: preamble(f, { classification: meta.classification }) } }
      ].concat(meta.extra || []);
      return MD.yaml(entries.filter(function (e) { return e.value !== null; }));
    }

