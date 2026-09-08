  /* =============================================================================
   * MODULE: App.docFormat  — FMT-1..FMT-4: named formatting profiles
   * PURPOSE: Everything about how the finished document PRESENTS itself — heading
   *          styling per level, page size and margins, page numbers, table of
   *          contents — as a named, saveable, exportable profile. Emits the pandoc
   *          YAML metadata block (and the LaTeX preamble inside it) that carries
   *          those choices through to the PDF.
   * PURITY:  pure. Same profile in, same bytes out.
   * DEPENDS: App.md
   * INVARIANTS: the built-in profile is never mutated in place — editing it
   *             duplicates it first, so a project can always be read against a
   *             known-good baseline.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * Why the formatting lives in the .md at all.
     *
     * Markdown has no opinion about margins. Pandoc does: a YAML metadata block at
     * the top of the file sets document variables, and `header-includes` injects raw
     * LaTeX into the preamble. That is the only honest way to make "25mm margins,
     * numbered headings, page numbers bottom-centre" mean something once the file
     * leaves this tool — so a profile is compiled to exactly those two things and
     * nothing in the body is styled.
     *
     * Heading styling goes through `titlesec` because it is the one package that
     * restyles \section..\paragraph without redefining the class. Section NUMBERS
     * are supplied by App.doc, not by LaTeX (`numbersections` stays off), so that
     * what the preview shows, what the .md contains and what the PDF prints are the
     * same string — and so a cross-reference can name a number that actually exists.
     * ---------------------------------------------------------------------- */

    var PAPERS = ['a4', 'letter', 'a5', 'legal'];
    /* HDR-1: `page.numberPosition` is a MIGRATION path now, not a setting.
     *
     * It offered five fixed answers to "where does the page number go", and the header
     * and footer offer six slots you can put anything in — including the page number.
     * Two mechanisms competing for the same three positions is how a document ends up
     * with the number printed twice, so this one is read once, on load, into the slots
     * it corresponds to, and then dropped (see normalise).
     */
    var NUMBER_POSITIONS = [
      { value: 'none', label: 'No page numbers' },
      { value: 'footer-centre', label: 'Footer, centred' },
      { value: 'footer-right', label: 'Footer, right' },
      { value: 'footer-outer', label: 'Footer, outer edge (double-sided)' },
      { value: 'header-right', label: 'Header, right' }
    ];
    /** Which slot of which set an old `numberPosition` names. */
    var NUMBER_SLOTS = {
      'footer-centre': ['footer', 'centre'],
      'footer-right': ['footer', 'right'],
      // The outer edge alternates with the binding, which a three-slot model cannot
      // express — the right-hand page is the common case and is where it lands.
      'footer-outer': ['footer', 'right'],
      'header-right': ['header', 'right']
    };
    /* HDR-1: the header and footer, as four sets of three slots.
     *
     * `HF_SETS` is the running pair plus the optional first-page pair; `HF_SLOTS` is
     * fancyhdr's own three positions. Listed once and iterated everywhere — normalise,
     * the preamble, the preview and the designer all walk the same two arrays, so a slot
     * cannot exist in one of them and not the others.
     */
    var HF_SETS = ['header', 'footer', 'firstHeader', 'firstFooter'];
    var HF_SLOTS = ['left', 'centre', 'right'];
    /** The fancyhdr position letter for one slot. */
    var HF_LETTER = { left: 'L', centre: 'C', right: 'R' };
    /* HDR-1: what a slot may say beyond its own words.
     *
     * Two markers, and they carry a `#` for a reason that was found rather than
     * reasoned about: the first cut used the bare words `page` and `pages`, and a
     * first-page header reading "Title page" came out as "Title 1". A reserved word that
     * is also an ordinary English word will be typed as an ordinary English word.
     *
     * `#page` is not prose, and `\b` at the end keeps `#pages` from being read as `#page`
     * followed by an `s`. Substituted BEFORE escaping, since `#` is one of the characters
     * the escaper neutralises — see slotParts, which is the one place either happens.
     */
    /* Braced, because TeX eats the space after a control word.
     *
     * `Page #page of #pages` compiled to `Page \thepage of \pageref{LastPage}`, and the
     * space between `\thepage` and `of` is consumed as part of reading the control word
     * — so the footer printed "Page 1of 7". Measured in a built PDF, which is the only
     * place it shows. A closing brace is not a control word, so the space after `}`
     * survives.
     */
    var HF_MACROS = { page: '{\\thepage}', pages: '{\\pageref{LastPage}}' };
    var HF_TOKEN = /#(pages|page)\b/g;

    /**
     * HDR-1: one slot split into literal runs and markers, so each half can be treated
     * the way it needs to be — the literals escaped, the markers replaced.
     * @returns {Array<{text:string}|{token:string}>}
     */
    function slotParts(text) {
      var s = String(text == null ? '' : text).trim();
      var out = [], last = 0, m;
      if (!s) return out;
      HF_TOKEN.lastIndex = 0;
      while ((m = HF_TOKEN.exec(s)) !== null) {
        if (m.index > last) out.push({ text: s.slice(last, m.index) });
        out.push({ token: m[1] });
        last = m.index + m[0].length;
      }
      if (last < s.length) out.push({ text: s.slice(last) });
      return out;
    }
    // LaTeX sectioning commands, in the order App.doc's levels 1..4 map onto them.
    var LATEX_LEVELS = ['section', 'subsection', 'subsubsection', 'paragraph'];
    /* TTL-3: the styling row for App.doc's TITLE level. Stated here rather than read
     * from App.doc.TITLE_LEVEL because this module loads BEFORE that one (spec §14) —
     * the two must agree, and the self-test that asserts they do is the lock. */
    var TITLE_STYLE_LEVEL = 0;

    /* FNT-2: the body font, named as a LaTeX font PACKAGE rather than as a system font.
     *
     * Pandoc offers two ways to set a font and they are not interchangeable. `mainfont:`
     * takes the name of a font installed on the machine building the PDF, and only
     * XeTeX and LuaTeX understand it — a document carrying one fails, or silently
     * substitutes something else, anywhere that font is missing. This .md is meant to
     * travel. `fontfamily:` names a package from the TeX distribution itself, which
     * every engine can load and which tectonic fetches on demand, so the file carries
     * its own font wherever it goes.
     *
     * Hence a FIXED LIST: the value reaches LaTeX as a package name, and a package that
     * does not exist is a hard compile failure with an unhelpful error, so a profile
     * naming anything not in this table falls back to the default (see normalise).
     * That is also what keeps the value safe to interpolate into the preview CSS.
     *
     * `sans: true` marks the sans-serif packages. Loading one of those sets \sfdefault
     * and nothing else — the body text would stay in the roman default — so the
     * preamble switches \familydefault as well. See preamble().
     *
     * `css` is the nearest browser stack, for the preview. Substituting a screen font
     * for a metal one is an approximation and is meant to be; what it gets right is the
     * shape class — serif against sans, wide against narrow — which is the question the
     * preview is actually being asked.
     */
    var FONTS = [
      { value: '', label: 'Default (Latin Modern)',
        css: '"Latin Modern Roman", "CMU Serif", Cambria, Georgia, "Times New Roman", serif' },
      { value: 'tgtermes', label: 'Times (TeX Gyre Termes)',
        css: '"Nimbus Roman", "Times New Roman", Times, serif' },
      { value: 'tgpagella', label: 'Palatino (TeX Gyre Pagella)',
        css: '"Palatino Linotype", Palatino, "URW Palladio L", "Book Antiqua", Georgia, serif' },
      { value: 'tgschola', label: 'Century Schoolbook (TeX Gyre Schola)',
        css: '"Century Schoolbook", "New Century Schoolbook", "URW Schoolbook L", Georgia, serif' },
      { value: 'tgbonum', label: 'Bookman (TeX Gyre Bonum)',
        css: '"Bookman Old Style", "URW Bookman L", Bookman, Georgia, serif' },
      { value: 'charter', label: 'Charter',
        css: 'Charter, "Bitstream Charter", XCharter, Georgia, serif' },
      { value: 'libertine', label: 'Linux Libertine',
        css: '"Linux Libertine O", "Linux Libertine", "Libertinus Serif", Georgia, serif' },
      { value: 'tgheros', label: 'Helvetica (TeX Gyre Heros)', sans: true,
        css: 'Helvetica, "Nimbus Sans", "Helvetica Neue", Arial, sans-serif' },
      { value: 'tgadventor', label: 'Avant Garde (TeX Gyre Adventor)', sans: true,
        css: '"Century Gothic", "URW Gothic", "Avant Garde", "Trebuchet MS", sans-serif' },
      { value: 'sourcesanspro', label: 'Source Sans Pro', sans: true,
        css: '"Source Sans Pro", "Source Sans 3", "Segoe UI", Helvetica, sans-serif' }
    ];

    /**
     * SEC-4: the heading levels whose own styling starts a new page.
     *
     * The profile says this per LEVEL — a house rule, "every H1 starts a page" — and it
     * reaches the PDF as titlesec's `\sectionbreak`, which is LaTeX's hook and invisible
     * to everything else. Three places need to know about it and could not: App.doc,
     * which must not emit a second break for a section whose level already breaks; the
     * preview, which paginates and would otherwise never break at all; and the designer,
     * which should not offer a per-section switch for something already switched on.
     * @returns {Object<number,boolean>} keyed by App.doc's level number
     */
    function levelBreaks(profile) {
      var out = {};
      normalise(profile).levels.forEach(function (lv) {
        if (lv.pageBreakBefore) out[lv.level] = true;
      });
      return out;
    }

    /** The FONTS row a profile has chosen; the default row for anything unrecognised. */
    function font(profile) {
      var want = String((profile && profile.page && profile.page.fontFamily) || '');
      return FONTS.filter(function (f) { return f.value === want; })[0] || FONTS[0];
    }

    /** FMT-1: the shipped baseline. Deliberately plain, and sized for a report that
     *  will be read on paper as often as on screen. */
    var STANDARD = {
      id: 'standard',
      name: 'Standard',
      builtin: true,
      page: {
        paper: 'a4', marginTop: '25mm', marginBottom: '25mm',
        marginLeft: '25mm', marginRight: '25mm',
        fontSize: '11pt', lineSpacing: 1.15,
        // FNT-2: blank is the default font, not a missing setting — the shipped profile
        // adds no `fontfamily` to the YAML at all, so pandoc's own default stands.
        fontFamily: '',
        // FNT-4: the body text's own weight and slope. A heading sets its own (see
        // levelFont) and a table sets its own (see fontPreamble), so these are exactly
        // "the prose", which is what the Fonts table calls Regular.
        bold: false, italic: false,
        // CODE-1: the background a code span wears. Blank is no shading at all.
        codeShade: '#f2f2f2'
      },
      headings: { numbered: true, clampSkips: true },
      /* TTL-3: the TITLE has a row of its own, and it is the first one.
       *
       * A title (App.doc's `T` level) prints at the top level and takes no number. Until
       * now it also took H1's styling, because both emit a `#` and titlesec styles the
       * COMMAND — so a title page and a first section could not be set differently even
       * though nobody wants them the same.
       *
       * It ships identical to H1, so no existing document moves until the row is edited,
       * and normalise() falls back POSITIONALLY for a profile written before this row
       * existed — which lands a saved profile's own H1 styling on its title, i.e. exactly
       * what that profile was already producing.
       */
      levels: [
        { level: 0, size: 18, leading: 22, bold: true, italic: false, pageBreakBefore: true, spaceBefore: 0, spaceAfter: 10 },
        { level: 1, size: 18, leading: 22, bold: true, italic: false, pageBreakBefore: true, spaceBefore: 0, spaceAfter: 10 },
        { level: 2, size: 14, leading: 17, bold: true, italic: false, pageBreakBefore: false, spaceBefore: 14, spaceAfter: 6 },
        { level: 3, size: 12, leading: 15, bold: true, italic: false, pageBreakBefore: false, spaceBefore: 12, spaceAfter: 5 },
        { level: 4, size: 11, leading: 14, bold: true, italic: true, pageBreakBefore: false, spaceBefore: 10, spaceAfter: 4 }
      ],
      /* HDR-1: the running header and footer, each configured on its own.
       *
       * Three slots a side, because that is what fancyhdr offers and what a document
       * actually needs — a classification centred, a document title left, a page number
       * right. `page` in any slot is replaced by the page number, so the old
       * `numberPosition` picker becomes one of the things you can type rather than a
       * separate mechanism competing for the same slots (see headerFooterPreamble).
       *
       * `firstDifferent` gives page 1 its own set. A title page usually wants no running
       * header at all, and until now the only way to get one was to have none anywhere.
       */
      headerFooter: {
        firstDifferent: false,
        header: { left: '', centre: '', right: '' },
        footer: { left: '', centre: '#page', right: '' },
        firstHeader: { left: '', centre: '', right: '' },
        firstFooter: { left: '', centre: '', right: '' }
      },
      // TOC-2: `entrySpacing` is the gap between one contents line and the next, in
      // points. LaTeX's own is 1em plus stretch between top-level entries, which on a
      // report whose sections are mostly one line each reads as a gappy, half-empty
      // page. Nested entries take half of it, as they do in the class.
      toc: { include: true, depth: 3, entrySpacing: 2 },
      // TBS-1: what a styled header row / first column LOOKS like is a house decision,
      // so it belongs to the profile. WHICH tables wear it is a per-table decision and
      // lives with the table (report.tableStyles / a table part's own flags).
      tables: {
        centre: false,
        // CAP-2: the caption's own alignment, independent of the table's. A caption
        // shorter than the table is centred by LaTeX anyway; one that wraps is not, and
        // that inconsistency is what this switch settles.
        captionCentre: false,
        // CAP-3: where the caption sits, and how far it sits from the table. Below is
        // the default because it is where the preview has always drawn it, and because
        // a caption under the thing it names is what a reader scanning a page expects.
        captionPosition: 'below', captionSkip: 4,
        // FNT-1: a table usually wants to be set smaller than the prose around it, and
        // its header row bigger than its body. Blank means "the document size", so the
        // shipped profile still sets everything at one size until told otherwise.
        // FNT-4: a caption is a third size, for the same reason the other two are —
        // it is a distinct kind of text and was the only one with no row of its own.
        fontSize: '', headFontSize: '', captionFontSize: '',
        /* FNT-4: weight and slope for the three kinds of table text, document-wide.
         *
         * These are DIFFERENT in kind from `head.bold` below, which is why they are not
         * there. `head`/`firstColumn` are the look a table OPTS IN to, per section; these
         * are what every table is set in, like a font size. Since a header row is bold in
         * essentially every house style, `headBold` ships on — and `tableStyle()` no
         * longer hands emphasis to the opt-in, so ticking "style the header row" adds the
         * shading and nothing else. One switch per question.
         */
        bold: false, italic: false,
        headBold: true, headItalic: false,
        captionBold: false, captionItalic: false,
        /* FNT-5: the first column's weight and slope, on the same footing as the header
         * row's — a kind of text the document sets, not a thing a section opts into.
         *
         * They lived on `firstColumn` below, which meant they only reached the sections
         * that had ticked "style the first column", and the shade they arrived with was
         * #F2F2F2 — a 5% grey nobody can see on a printed page. Between the two, opting a
         * section in appeared to do nothing at all. The weight is document-wide now (one
         * switch per question, as FNT-4 settled for the header row) and what opting in
         * buys is the SHADE, which is genuinely a per-section decision.
         *
         * Shipped OFF, unlike `headBold`: a bold header row is every house style, a bold
         * first column in every table is a choice, and the shipped profile had never
         * actually delivered one outside the sections that opted in. A profile saved
         * before this that DID ask for one keeps it — see normalise. */
        firstColBold: false, firstColItalic: false,
        /* FNT-6: and its SIZE, which it had none of until now.
         *
         * Blank means the table body's size, on the same rule the other three sizes
         * follow. It reaches the page as a macro called at the head of each first-column
         * body cell (see App.md's COL_FONT), because markdown emphasis — which is how
         * the weight above travels — cannot carry a size. */
        firstColFontSize: '',
        head: { shade: '#D9E2F3' },
        // A shade a reader can actually see. #F2F2F2 measured under 5% away from white,
        // which on paper is nothing at all.
        firstColumn: { shade: '#E7E6E6' }
      }
    };

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    /** A fresh copy of the baseline — the starting point for any new profile. */
    function standard() { return clone(STANDARD); }

