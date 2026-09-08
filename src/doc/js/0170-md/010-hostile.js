  /* =============================================================================
   * MODULE: App.md  — MD-1: LaTeX-safe markdown primitives
   * PURPOSE: The single choke point through which every data-derived string passes
   *          on its way into a generated document, exactly as App.util.html.esc is
   *          for the HTML outputs. Emits pandoc-flavoured markdown that survives
   *          conversion to LaTeX source without hand-repair.
   * PURITY:  pure (string -> string). No DOM, no I/O, no clock.
   * DEPENDS: (none)
   * INVARIANTS: ALL data-derived text reaches a document through text(), code() or
   *             rich() — never by concatenation. Escaping happens ON THE WAY OUT;
   *             the register keeps whatever the device actually reported.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* -------------------------------------------------------------------------
     * Why escape at all, and why here.
     *
     * The captured registers are full of characters that are load-bearing in LaTeX:
     * a settings key is `wifi_sleep_policy`, a package is `com.samsung.android.app_x`,
     * a captured value can hold `$HOME`, `50%` or `a & b`. Emitted raw into markdown
     * those break twice over — markdown may read `_..._` as emphasis and eat the
     * underscores, and once the text reaches LaTeX `%` comments out the rest of the
     * line, `&` is a column separator, `$` opens math mode and `_` is a subscript.
     * The failure is silent in the first case and a compile error in the second.
     *
     * The fix belongs in the writer, not in the data. Stripping these characters at
     * input would mean the register no longer matches the device, and the
     * implementation script generated from that register would name a package that
     * does not exist. So the bytes are kept intact and escaped at the last moment.
     *
     * Two escape strategies, chosen by what the string IS:
     *   text()  backslash-escapes. For prose and free-text values.
     *   code()  wraps in a code span. For identifiers — package names, settings
     *           keys, paths, commands. Everything inside a code span is literal by
     *           definition, it survives to LaTeX as \texttt{}, and monospace is the
     *           correct typography for an identifier in a configuration report.
     * ---------------------------------------------------------------------- */

    // The user-named LaTeX-hostile set (\ { } $ & # ^ _ ~ %) UNION the characters
    // that are structural in markdown and would otherwise silently restructure the
    // document (` * [ ] | < >). Backslash is first in the class and handled first by
    // the replace, so an escaped backslash is never re-escaped.
    var HOSTILE = /[\\`*_{}\[\]<>#|$&^~%]/g;

    // Line-start-only troublemakers: these are ordinary punctuation mid-line but
    // start a list, a block quote or a setext heading in column 1.
    var LINE_START = /^(\s*)([-+=])/;
    var LINE_START_NUM = /^(\s*)(\d+)([.)])/;

    /**
     * Escape a data-derived string for use as markdown TEXT.
     *
     * Safe to hand any string, including one already containing backslashes — the
     * character class puts `\` first and the single pass never revisits its own
     * output, so text(text(s)) is double-escaped (as it should be) rather than
     * corrupt. Callers must escape exactly once.
     *
     * @param {*} s  coerced; null/undefined become ''
     * @returns {string} markdown-safe, pandoc-safe, LaTeX-safe
     */
    function text(s) {
      var str = String(s == null ? '' : s);
      if (!str) return '';
      var out = str.replace(HOSTILE, function (ch) { return '\\' + ch; });
      // Now neutralise the column-1 constructs, line by line. `#`, `>` and `|` are
      // already gone via HOSTILE; what is left is `- + =` and an ordered-list marker.
      out = out.split('\n').map(function (line) {
        return line.replace(LINE_START, '$1\\$2').replace(LINE_START_NUM, '$1$2\\$3');
      }).join('\n');
      return out;
    }

    /* -------------------------------------------------------------------------
     * The OTHER escaper, and why there has to be one.
     *
     * text() above escapes for MARKDOWN, and everything in a generated document goes
     * through it because everything in a generated document is markdown — pandoc reads
     * it and produces the LaTeX. The two escapes overlap enough to be mistaken for each
     * other (`\%`, `\&`, `\#`, `\$`, `\_` are correct in both) and they are not the same
     * escape: `\<`, `\>`, `\[`, `\|`, `\+` are ordinary markdown and are not commands
     * that LaTeX has, and `\~`, `\^`, `\.`, `\=` are accents rather than characters.
     *
     * One thing in this file does not travel as markdown: the header and footer, which
     * reach the page as `\fancyhead[C]{…}` inside `header-includes`. Pandoc passes that
     * block through VERBATIM, so nothing downstream is going to fix an escape — and a
     * header reading `<---- Security classification` compiled to `\<` and stopped the
     * build with "Undefined control sequence". Reported, and reproduced in four lines.
     *
     * So text destined for a raw-LaTeX context is escaped here instead. ONE pass, from a
     * table: several of the replacements contain braces of their own, and a second pass
     * over the output would escape those and leave `\textbackslash\{\}` on the page.
     * ---------------------------------------------------------------------- */
    var LATEX_MAP = {
      '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
      '<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}',
      '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}'
    };
    var LATEX_HOSTILE = /[\\~^<>|&%$#_{}]/g;

    /**
     * Escape a string for a place where LaTeX reads it directly — never for markdown.
     * @param {*} s @returns {string}
     */
    function latex(s) {
      return String(s == null ? '' : s).replace(LATEX_HOSTILE, function (ch) { return LATEX_MAP[ch]; });
    }

    /**
     * Wrap a string as a markdown code span — the right emission for an identifier.
     *
     * Content is NOT escaped: inside a code span markdown does no interpretation, so
     * escaping would put visible backslashes in the output. What the fence has to
     * survive instead is backticks in the content, which is what CommonMark's
     * variable-length fence rule is for: pick a fence longer than the longest run
     * inside, and pad with a space when the content itself starts or ends with a
     * backtick (otherwise the pad is consumed as part of the fence).
     *
     * @param {*} s @returns {string} '' for empty input (an empty code span renders as ``)
     */
    function code(s) {
      var str = String(s == null ? '' : s);
      if (!str) return '';
      // A code span cannot carry a newline; a multi-line identifier is not an
      // identifier, so fall back to escaped text rather than emit a broken span.
      if (str.indexOf('\n') !== -1) return text(str);
      var longest = 0;
      (str.match(/`+/g) || []).forEach(function (run) { longest = Math.max(longest, run.length); });
      var fence = new Array(longest + 2).join('`');
      var pad = (str.charAt(0) === '`' || str.charAt(str.length - 1) === '`') ? ' ' : '';
      return fence + pad + str + pad + fence;
    }

    /**
     * A table CELL. Same escaping as text(), but a pipe table cell cannot hold a
     * newline — the row would terminate early and the table would lose its shape.
     * Multi-line content is joined with a hard line break token the grid-table
     * writer understands; pipeTable() collapses it, gridTable() honours it.
     */
    // A sentinel standing in for "line break inside a cell" while a row is still a
    // flat string. U+0001 cannot occur in captured device output or be typed into the
    // designer, so it can never collide with real content.
    var CELL_BREAK = '\u0001';

    /* -------------------------------------------------------------------------
     * BRK-1: a long run with no space in it has to be MARKED, or it cannot wrap.
     *
     * `io.sdsasolutions.tacticalsettings` in a table cell is one word as far as the
     * typesetter is concerned, and there is no way to break it that does not have to be
     * asked for. TeX hyphenates letter sequences and a package name is not one; a
     * zero-width space is NOT a break opportunity in XeTeX (measured — a `\parbox` with
     * one and one without overflow identically); and `\raggedright` puts a word that
     * does not fit on the line anyway, out past the column edge and into its neighbour.
     *
     * So the only question is which mark, and one already in this file works: a CODE
     * SPAN reaches LaTeX as `\texttt`, and the formatting profile routes every `\texttt`
     * through `\seqsplit`, which offers a breakpoint between every character. It is
     * markdown-native, it needs no second escaping path (a code span is verbatim by
     * definition, so nothing inside it can be mis-escaped), and the width model already
     * knows a code span can break — so marking these also stops them demanding a column
     * wide enough to hold them whole, which was the other half of the problem.
     *
     * The cost is that such a run is set in monospace. For a package name, a path or a
     * settings key that is the right typography anyway, and it is what the register's
     * key column has always done.
     *
     * Deliberately narrow: 18 characters or more AND shaped like an identifier — a
     * `. _ - /` or a camelCase hump. Ordinary prose wraps at its spaces and needs no help.
     * ---------------------------------------------------------------------- */
    var IDENT_MIN = 18;
    var IDENT_RUN = /\S{18,}/g;
    var IDENT_SHAPE = /[._\/-]|[a-z][A-Z]/;

    /** Is this space-free run one that must be marked before it can break? */
    function isLongIdentifier(run) {
      return String(run).length >= IDENT_MIN && IDENT_SHAPE.test(run);
    }

    /** cell() without the line-separator conversion — the escaping half on its own, so
     *  the rich-text writer can decide for itself what a line break looks like. */
    function cellText(s) {
      var str = String(s == null ? '' : s);
      var out = '', last = 0, m;
      IDENT_RUN.lastIndex = 0;
      while ((m = IDENT_RUN.exec(str)) !== null) {
        if (!isLongIdentifier(m[0])) continue;
        // Escaped text either side, the run itself verbatim. `code()` sizes its own
        // fence, so a backtick inside the run cannot break out of it.
        out += text(str.slice(last, m.index)) + code(m[0]);
        last = m.index + m[0].length;
      }
      return out + text(str.slice(last));
    }

    function cell(s) {
      return cellText(s).split('\n').join(CELL_BREAK);
    }

    // ---- block builders ------------------------------------------------------

    /** ATX heading. `attrs` becomes a pandoc header-attribute block: `# Title {#id}`. */
    function heading(level, body, id, classes) {
      var n = Math.max(1, Math.min(6, level | 0));
      var cls = (classes || []).map(function (c) { return ' .' + c; }).join('');
      var attrs = (id ? '#' + id : '') + cls;
      return new Array(n + 1).join('#') + ' ' + body + (attrs ? ' {' + attrs.trim() + '}' : '');
    }

    /** A paragraph. Blank-line separation is the caller's job (see join()). */
    function para(body) { return String(body == null ? '' : body); }

    /**
     * A horizontal rule. Pandoc turns `* * *` into a LaTeX rule; the spaced form is
     * used rather than `---` because three bare hyphens under a paragraph is a setext
     * heading, and the designer lets a rule sit anywhere.
     */
    function rule() { return '* * *'; }

    /**
     * A hard page break that survives to LaTeX. `\newpage` in a raw-LaTeX block is
     * the only construct pandoc passes through verbatim to a PDF writer; a markdown
     * form for this does not exist.
     */
    function pageBreak() { return rawLatex('\\newpage'); }

    /* -------------------------------------------------------------------------
     * SPC-1: whitespace as a MEASUREMENT.
     *
     * Markdown has exactly one way to make vertical space — end a paragraph — and it
     * has no size. Repeating it does nothing either: consecutive blank lines are one
     * paragraph break however many you write, and LaTeX's `\parskip` is the same
     * whether one or six were asked for. So "leave 40mm here for a signature" was not
     * expressible at all, and the attempt (a run of line breaks) came out as the single
     * blank line it always was.
     *
     * A length is expressible, in the same raw-LaTeX fences the page break and the
     * centring already travel in. Two shapes, because vertical space between blocks and
     * vertical space inside a table row are different constructs on the page:
     *
     *   * `\vspace*` — a gap between blocks. STARRED, so it is not discarded at a page
     *     break: a section pushed 60mm down its own page has to survive being the first
     *     thing on that page, which is the whole point of asking.
     *   * `\rule[-h]{0pt}{0pt}` — a strut with depth and no height or width, at the end
     *     of a row's first cell. Depth rather than height: a strut with height pushes
     *     the cell's own text DOWN to sit on the bottom of the box, and a signature line
     *     wants its label at the top and the empty space beneath it.
     *
     * The number is interpolated into LaTeX, which is the one place this file's escaping
     * does not reach — so it is a NUMBER, clamped and rounded here, never a string that
     * came from a text box. (Same rule, and the same precedent, as narrowOpen's scale.)
     * ---------------------------------------------------------------------- */
    var MAX_MM = 500;   // two A4 pages of gap; past this it is a mistake, not a layout

    /** A sanitised millimetre length, or '' for "no space asked for". */
    function mmLen(v) {
      var n = Number(v);
      if (!isFinite(n) || n <= 0) return '';
      return (Math.round(Math.min(n, MAX_MM) * 100) / 100) + 'mm';
    }

    /** SPC-1: a vertical gap of `v` millimetres between blocks. '' when none. */
    function vspace(v) {
      var len = mmLen(v);
      return len ? rawLatex('\\vspace*{' + len + '}') : '';
    }

    /** SPC-1: the strut that makes a table row `v` millimetres taller. '' when none. */
    function rowStrut(v) {
      var len = mmLen(v);
      return len ? '`\\rule[-' + len + ']{0pt}{0pt}`{=latex}' : '';
    }

    /**
     * A raw-LaTeX block, passed through verbatim by pandoc's LaTeX writer and shown as
     * machinery (never as content) by the preview.
     *
     * Callers pass a MACRO NAME, not a body of LaTeX built from data: everything
     * data-derived in this file goes through text()/cell(), and a raw block is the one
     * place that escaping does not reach. The macros themselves are defined once, in
     * App.docFormat's preamble, which is also what keeps their behaviour a formatting
     * decision rather than something smeared through the document.
     */
    function rawLatex(s) { return '```{=latex}\n' + String(s == null ? '' : s) + '\n```'; }

    /**
     * Centre a block of already-emitted markdown.
     *
     * A fenced div (`::: {.center}`) is the tidy-looking way to write this and it does
     * NOT work: pandoc's LaTeX writer drops the div and emits the contents unchanged,
     * so the centring silently did nothing in the PDF. (The `data-latex` attribute is a
     * convention of the pandoc-latex-environment FILTER, not native pandoc — and a
     * filter is a dependency this pipeline should not need.) Raw `{=latex}` fences
     * around the block are passed through verbatim, and the markdown between them is
     * still parsed as markdown, which is what a centred TABLE needs.
     */
    function centred(body) {
      return '```{=latex}\n\\begin{center}\n```\n\n' + body + '\n\n```{=latex}\n\\end{center}\n```';
    }

    /**
     * A pipe table. Cells must be single-line — any CELL_BREAK is collapsed to a
     * space, because a pipe table physically cannot represent one.
     * @param {string[]} headers  already cell()-escaped
     * @param {string[][]} rows   already cell()-escaped
     * @param {{align?:string[]}} [opts]  'l'|'c'|'r' per column
     */
    function pipeTable(headers, rows, opts) {
      opts = opts || {};
      var align = opts.align || [];
      // A run of breaks (HUM-1 puts a blank line between list entries) collapses to one
      // space — two would show as a gap the grid form does not have.
      function flat(c) { return String(c == null ? '' : c).split(CELL_BREAK).filter(function (x, i) { return x.length || i === 0; }).join(' ').replace(/\s+/g, ' '); }
      var head = '| ' + headers.map(flat).join(' | ') + ' |';
      var sep = '| ' + headers.map(function (h, i) {
        return align[i] === 'c' ? ':---:' : align[i] === 'r' ? '---:' : '---';
      }).join(' | ') + ' |';
      var body = rows.map(function (r) { return '| ' + r.map(flat).join(' | ') + ' |'; }).join('\n');
      return head + '\n' + sep + (body ? '\n' + body : '');
    }

    /* -------------------------------------------------------------------------
     * TW-1: how a column width reaches the PDF.
     *
     * Markdown has one place to put a column width and it is not an attribute: pandoc
     * derives each column's RELATIVE width from the dash count on a grid table's
     * border row. A pipe table carries no widths at all. So a table with widths must
     * always be drawn as a grid table, and every cell must be wrapped to fit its
     * column — a line that overruns its border does not make a wide column, it stops
     * the block being read as a table.
     *
     * Measured against the pandoc in use (3.1.11): column i arrives in the LaTeX
     * writer as (dashes_i + 1) / lineLength, where dashes_i is the field width plus
     * the two padding spaces and lineLength is the whole border row. Solving that for
     * the field width is what widthsFor does, so the fraction the operator dragged is
     * the fraction `\real{…}` carries into the longtable column spec.
     * ---------------------------------------------------------------------- */

    // The source width a width-bearing table is drawn to. Only the FRACTIONS reach the
    // PDF, so this number decides nothing but how legible the .md is to a human.
    var WIDTH_BUDGET = 96;
    var MIN_COL = 3;
    // Pandoc's `--columns` default. Past it, a pipe table's widths stop being LaTeX's
    // business and become pandoc's, which reads them off the separator row (see table()).
    var PIPE_MAX = 72;

    /** Field widths for `n` columns from fractions summing to ~1. */
    function widthsFor(fracs, n) {
      var total = WIDTH_BUDGET + 3 * n + 1;
      // The stored widths are relative SHARES, not a partition: typing 60% into one
      // column and 50% into another is a thing the designer can do, and it means "give
      // the first six-elevenths of whatever there is". Normalising here is what makes
      // an over- or under-committed set render as something rather than as nothing.
      var sum = 0, i;
      for (i = 0; i < n; i++) {
        var v = Number((fracs || [])[i]);
        if (isFinite(v) && v > 0) sum += v;
      }
      var out = [];
      for (i = 0; i < n; i++) {
        var f = Number((fracs || [])[i]);
        if (!isFinite(f) || f <= 0) f = sum > 0 ? 0 : 1 / n;
        else if (sum > 0) f = f / sum;
        out.push(Math.max(MIN_COL, Math.round(f * total) - 3));
      }
      return out;
    }

