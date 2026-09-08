    /* -------------------------------------------------------------------------
     * AUTO-1: what "automatic" width means when the content will not fit.
     *
     * Sizing every column to its widest line is right while the table is narrow enough
     * to hold them all, and badly wrong once it is not — because pandoc reads the
     * source widths as PROPORTIONS. One column of long prose (the control-coverage
     * "Items" cell, which lists every package satisfying a control) then claims almost
     * the whole page and squeezes "Control", "Status" and "Justification" into a few
     * characters each. That is the mashed-up table: not a rendering fault, a
     * measurement one.
     *
     * So a table that does not fit is laid out the way any table layout does it: every
     * column first gets the width it CANNOT go below — its longest unbreakable word,
     * since wrapping cannot break one — and only the slack above that is shared out, in
     * proportion to how much each column actually wants. A heading is never squeezed
     * below itself, and the long column takes the surplus instead of taking everything.
     *
     * A table that DOES fit is untouched, byte for byte, which is most of them.
     * ---------------------------------------------------------------------- */

    /**
     * The longest run in a cell with no space in it — what a wrap cannot break without
     * breaking the content itself.
     *
     * Measured on the SOURCE, markup and all, because that is what the wrapper has to
     * fit. It is tempting to discount a code span, on the grounds that `\seqsplit` will
     * break the identifier on the page anyway — but the break here happens in the
     * MARKDOWN, and a fence cut in half stops being a fence: `` `appInstall `` on one
     * line and `` Whitelist` `` on the next is rejoined by pandoc as one span with a
     * space through the middle of the package name, and the emphasis markers around it
     * come out as literal asterisks. So the floor is the whole token. It costs source
     * width, which is cosmetic, and it buys the guarantee that the auto path never cuts
     * a token in half.
     */
    function longestWord(s) {
      var w = 0;
      String(s == null ? '' : s).split(CELL_BREAK).forEach(function (line) {
        line.split(/\s+/).forEach(function (t) { w = Math.max(w, t.length); });
      });
      return w;
    }

    /* -------------------------------------------------------------------------
     * AUTO-2: the columns are measured in EMS, not in characters.
     *
     * Counting characters is the wrong currency, and it fails in one specific,
     * visible way: a column gets a share of the page proportional to its character
     * count, but spends that share in POINTS, and a character does not cost a fixed
     * number of points. `i` is a third of the width of `m`; a monospace package name
     * costs 0.6em a character while prose averages half that; bold costs another few
     * per cent. In a register table — one monospace key column beside four of prose —
     * the rate that falls out is well under what prose actually needs, so everything is
     * squeezed. Prose absorbs it by wrapping. A single unbreakable word cannot, and
     * pushes past its column into the next one, which is exactly the symptom.
     *
     * So each column is measured in ems: what it WANTS (its widest line) and what it
     * cannot go below (its longest unbreakable run). The budget is the page in ems, less
     * what pandoc spends on inter-column padding — it writes the fractions against
     * `(\columnwidth - 2(n-1)\tabcolsep)`, so that padding is not the columns' to share
     * and counting it would over-promise every one of them.
     *
     * The result is converted back to source characters at the end, because that is what
     * a grid table is drawn in. The conversion is uniform, so it cannot reintroduce the
     * bias — and the character floor is applied on top of the em floor, so a run of
     * narrow letters is still never cut in half.
     * ---------------------------------------------------------------------- */

    /* Advance widths in ems, MEASURED from Latin Modern at 11pt rather than guessed —
     * `\savebox`/`\the\wd` over representative strings, which is the only way to get
     * these right and cheap to redo if the shipped font ever changes:
     *
     *   a-z 12.70em/26 = 0.489    A-Z 18.54em/26 = 0.713    0-9 4.98em/10 = 0.498
     *   i 0.277   m 0.829   e 0.442   . 0.277   space 0.331   ttfamily 0.523
     *   bold/regular over the whole lowercase alphabet = 1.151
     *
     * The first guess at these had bold at 1.06 and monospace at 0.6, and it put
     * "Description" 8pt past its column — which is how the numbers came to be measured.
     */
    var EM_NARROW = 'iljtfrI().,;:\'"!|[]-';
    var EM_WIDE = 'mwMW@%';
    var EM_UPPER = 'ABCDEFGHJKLNOPQRSTUVXYZ';
    var EM_MONO = 0.53;         // \texttt advance, fixed by definition
    var EM_BOLD = 1.15;         // bold over regular, across the lowercase alphabet
    var EM_PER_CHAR = 0.5;      // the rate used to turn ems back into source characters
    // The measurements are within about 6% either way on a short word, and being short
    // is the direction that shows: a floor a little too generous costs a wrappable
    // column a few points, one a little too mean puts a heading through its border.
    var FLOOR_SAFETY = 1.08;
    // Pandoc writes the column fractions against `\columnwidth - 2(n-1)\tabcolsep`, and
    // \tabcolsep is 6pt against an 11pt em — that padding is not the columns' to share.
    var EM_GUTTER = 2 * 6 / 11;
    // The text block of the shipped profile — A4 less 25mm each side — in ems at 11pt.
    var PAGE_EM = 160 / 25.4 * 72 / 11;

    function charEm(c) {
      if (EM_NARROW.indexOf(c) !== -1) return 0.3;
      if (EM_WIDE.indexOf(c) !== -1) return 0.85;
      if (EM_UPPER.indexOf(c) !== -1) return 0.66;
      return 0.5;
    }

    /**
     * The typeset width of one already-escaped source line, in ems.
     *
     * Walks it rather than measuring it flat, because the markup is not printed and the
     * characters inside it are not all charged at the same rate: a backslash escape
     * costs only the character it escapes, a code fence costs nothing and puts what it
     * contains on the monospace rate, and `**` costs nothing but makes what it contains
     * bold.
     */
    /* REF-2: a link is measured by what it PRINTS, not by what it is written as.
     *
     * `[AHG-001](#ctl-ahg-001)` is 23 characters of source and seven of page. Measuring
     * the source charged the column three times what the link costs, which moved the
     * proportions of every table carrying a control mention — measured in a built PDF as
     * a 3pt overfull box that was not there before the mentions became links.
     *
     * The SOURCE width is a separate question and is still counted in full (a link cut
     * in half stops being one, D-036); that is what `atomicRun` is for. This is the
     * page, and on the page the destination is not set.
     */
    var LINK_TEXT = /\[([^\]\n]*)\]\([^)\s\n]*\)/g;
    function printed(s) { return String(s == null ? '' : s).replace(LINK_TEXT, '$1'); }

    function lineEm(s) {
      var str = printed(s), out = 0, mono = false, bold = false;
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i);
        if (c === '\\' && i + 1 < str.length) { out += charEm(str.charAt(++i)); continue; }
        if (c === '`') { mono = !mono; continue; }
        if (c === '*' && !mono) {
          if (str.charAt(i + 1) === '*') { i++; bold = !bold; } // ** toggles bold
          continue;                                             // a single * is emphasis
        }
        out += mono ? EM_MONO : charEm(c) * (bold ? EM_BOLD : 1);
      }
      return out;
    }

    /**
     * The widest run with no space in it, in ems — what the PAGE cannot go below.
     *
     * A code span is skipped, and this is the one place that distinction belongs: the
     * formatting profile routes every `\texttt` through `\seqsplit`, so a 40-character
     * package name has a breakpoint between every character once it reaches the page and
     * is not a floor at all. In the SOURCE it still is one (a cut fence stops being a
     * fence — D-021), which is why that floor is counted separately, in characters.
     * Charging the page for both is what made the floors exceed the page and left every
     * column, including the prose ones that genuinely could not wrap, below its need.
     */
    function longestWordEm(s, includeCode) {
      var w = 0;
      // REF-2: the destination is not set on the page, so it is not a run on the page.
      printed(s).split(CELL_BREAK).forEach(function (line) {
        var text = includeCode ? line : line.replace(/`+[^`]*`+/g, ' ');
        text.split(/\s+/).forEach(function (t) { w = Math.max(w, lineEm(t)); });
      });
      return w;
    }

    /**
     * Auto widths for `n` columns of `all` rows: natural where they fit, shared out
     * against the page where they do not. Returned in SOURCE CHARACTERS.
     *
     * @param {{pageEm?:number, head?:number, body?:number, firstCol?:number}} [metrics]
     *        The page in ems and each table font size relative to the document's.
     *        They have to be passed in because a table set at 12pt in an 11pt document
     *        needs a ninth more room than the same table set at 11pt, and this module
     *        has no business knowing which profile is in force. Absent, everything is
     *        the shipped profile at one size — which is what it was before FNT-1.
     *        FNT-6: `firstCol` is the first column's own size, on the same rule — a key
     *        column set smaller needs less room than the body, and one set larger needs
     *        more, which is exactly the arithmetic D-027 was about.
     */
    function autoWidths(all, n, metrics) {
      metrics = metrics || {};
      var pageEm = metrics.pageEm > 0 ? metrics.pageEm : PAGE_EM;
      var headScale = metrics.head > 0 ? metrics.head : 1;
      var bodyScale = metrics.body > 0 ? metrics.body : 1;
      var colScale = metrics.firstCol > 0 ? metrics.firstCol : bodyScale;
      return layout(all, n, pageEm, headScale, bodyScale, colScale);
    }

    function layout(all, n, PAGE_EM, headScale, bodyScale, colScale) {
      if (!(colScale > 0)) colScale = bodyScale;
      var wantEm = [], floorEm = [], softEm = [], floorChars = [], natural = [], i;
      for (i = 0; i < n; i++) {
        var line = 0, word = 0, soft = 0, chars = MIN_COL, cols = MIN_COL;
        all.forEach(function (r, ri) {
          // Row 0 is the header, which may be set at its own size (FNT-1); column 0's
          // body cells may be set at theirs (FNT-6).
          var k = ri === 0 ? headScale : (i === 0 ? colScale : bodyScale);
          splitCell(r && r[i]).forEach(function (l) { line = Math.max(line, lineEm(l) * k); cols = Math.max(cols, l.length); });
          word = Math.max(word, longestWordEm(r && r[i], false) * k);
          soft = Math.max(soft, longestWordEm(r && r[i], true) * k);
          chars = Math.max(chars, longestWord(r && r[i]));
        });
        natural.push(cols);
        wantEm.push(Math.max(line, soft, MIN_COL * EM_PER_CHAR));
        // The safety margin is about FLOORS — the widths below which something visibly
        // breaks — not about how wide a column would like to be.
        word = word * FLOOR_SAFETY;
        soft = soft * FLOOR_SAFETY;
        floorEm.push(Math.max(word, MIN_COL * EM_PER_CHAR));
        /* The SOFT floor is what an identifier would like: a code span can be broken on
         * the page (`\seqsplit`), so it is not a floor — but broken every six characters
         * it stops being readable, and "it can be broken" is not the same as "break it
         * as far as you like". So it is asked for after the hard floors are met and
         * before anything is spent on the columns that merely want to be wider. */
        softEm.push(Math.max(soft, floorEm[i]));
        // The em floors govern the PAGE; this one governs the SOURCE, and both have to
        // hold or a narrow-lettered token would still be cut in half (D-021).
        floorChars.push(chars);
      }

      /* Ems decide the PROPORTIONS; characters only decide how the .md is drawn.
       *
       * Both floors have to hold at once and they pull opposite ways: the source floor
       * includes code spans (a cut fence corrupts the identifier — D-021) while the page
       * floor excludes them (`\seqsplit` breaks them on the page). Taking the larger of
       * the two per column would let the source floor set the FRACTION, which is what
       * gave the key column a third of the page and squeezed the prose headings through
       * their borders.
       *
       * Since only ratios reach the PDF, the whole table can be scaled up instead —
       * uniformly, by just enough that the widest source floor fits. Every fraction is
       * preserved exactly and every token stays whole. The cost is a wide .md, which is
       * cosmetic.
       */
      function toChars(ems) {
        var scale = 1;
        ems.forEach(function (em, j) {
          if (em > 0) scale = Math.max(scale, floorChars[j] * EM_PER_CHAR / em);
        });
        return ems.map(function (em, j) {
          return Math.max(MIN_COL, floorChars[j], Math.round(em * scale / EM_PER_CHAR));
        });
      }

      var wantTotal = wantEm.reduce(function (a, w) { return a + w; }, 0);
      var budget = PAGE_EM - EM_GUTTER * (n - 1);
      // It fits: every column takes its widest line and there is nothing to decide. The
      // measured widths are the natural ones, in characters — the em model exists to
      // settle a competition, and there is no competition here. It also keeps a small
      // table's markdown exactly as tidy as it always was.
      if (wantTotal <= budget) return natural;

      /* Three claims on the page, settled in order of how badly they fail:
       *   1. the HARD floors — a word with nothing to break it, which overflows into the
       *      next column if it is short-changed. Met first, always.
       *   2. the SOFT floors — an identifier that can be broken but should not be minced.
       *   3. APPETITE — a column that would simply rather be wider, and wraps if it is not.
       * Anything left after the hard floors goes to 2, then to 3. */
      var floorTotal = floorEm.reduce(function (a, w) { return a + w; }, 0);
      // Even the unbreakable words do not fit. Nothing can be honoured, so they share
      // the page in proportion and something will overflow — there is no layout that
      // avoids it, and pretending otherwise would only hide which one.
      if (floorTotal >= budget) {
        return toChars(floorEm.map(function (w) { return w / floorTotal * budget; }));
      }
      var out = floorEm.slice();
      var room = budget - floorTotal;

      function share(need) {
        var total = need.reduce(function (a, w) { return a + w; }, 0);
        if (total <= 0 || room <= 0) return;
        var spend = Math.min(room, total);
        need.forEach(function (w, j) { out[j] += w / total * spend; });
        room -= spend;
      }
      share(softEm.map(function (w, j) { return Math.max(0, w - floorEm[j]); }));
      share(wantEm.map(function (w, j) { return Math.max(0, w - out[j]); }));
      return toChars(out);
    }

    /**
     * Where a cut at `at` would land inside a backslash escape, step back off it.
     * The text being wrapped has already been through text(), so `\_` is one unit; a
     * break between the two halves would free the `_` to start emphasis on the next
     * line. Counts the run because `\\` is an escaped backslash, not an escaper.
     */
    /* REF-2: the spans a cut must not land inside, as [start, end) pairs.
     *
     * A markdown link is the case that matters: pandoc rejoins a cell's lines with a
     * SPACE, so a break anywhere inside `[AHG-001](#ctl-ahg-001)` produces
     * `](#ctl-ahg- 001)` — a destination with a space in it, which is not a link at all.
     * The reader gets the raw brackets printed at them and no link in the PDF. Exactly
     * the shape of D-021, which was the same rejoin breaking a `**` pair.
     */
    var LINK_SPAN = /\[[^\]\n]*\]\([^)\s\n]*\)/g;
    function noCutZones(s) {
      var out = [], m;
      LINK_SPAN.lastIndex = 0;
      while ((m = LINK_SPAN.exec(s)) !== null) out.push([m.index, m.index + m[0].length]);
      return out;
    }

    function safeCut(s, at) {
      var zones = noCutZones(s);
      var i = at;
      while (i > 0) {
        var run = 0, j = i - 1;
        while (j >= 0 && s.charAt(j) === '\\') { run++; j--; }
        // A cut between the two asterisks of `**` leaves a lone `*` on each line, which
        // is not emphasis at all. Never land inside a marker run.
        var inMarker = s.charAt(i - 1) === '*' && s.charAt(i) === '*';
        var inLink = zones.some(function (z) { return i > z[0] && i < z[1]; });
        if (run % 2 === 0 && !inMarker && !inLink) return i;
        i--;
      }
      return at;
    }

    /**
     * The longest run in a cell that must survive whole — a link, or any space-free
     * token (a code fence cut in half corrupts the identifier inside it, D-021).
     */
    function atomicRun(cell) {
      var w = 0;
      splitCell(cell).forEach(function (line) {
        noCutZones(line).forEach(function (z) { w = Math.max(w, z[1] - z[0]); });
        line.split(/\s+/).forEach(function (t) { w = Math.max(w, t.length); });
      });
      return w;
    }

    /**
     * Scale a set of widths up until every column can hold what must survive whole.
     *
     * Uniform, so the proportions are untouched — the .md simply gets wider. That is the
     * same trade `layout`'s toChars makes, and for the same reason: only the RATIOS
     * reach the PDF, so source width is free and re-proportioning is not.
     *
     * @param {number[]} widths field widths in characters
     * @param {Array} rows all rows, header included
     * @param {number[]} [claims] extra per-column runs that must fit (a shading prefix,
     *        a row anchor) — source text that is emitted on a line of its own
     */
    function holdWhole(widths, rows, claims) {
      var need = widths.map(function (_, i) {
        var w = (claims && claims[i]) || 0;
        rows.forEach(function (r) { w = Math.max(w, atomicRun(r && r[i])); });
        return w;
      });
      var scale = 1;
      widths.forEach(function (w, i) { if (w > 0 && need[i] > w) scale = Math.max(scale, need[i] / w); });
      if (scale === 1) return widths;
      return widths.map(function (w, i) { return Math.max(MIN_COL, need[i], Math.round(w * scale)); });
    }

    /**
     * Hard-wrap one line to a character width. Breaks at spaces; a single run longer
     * than the column is broken mid-run, because a column that grew to fit it would
     * silently be a different width from the one that was asked for.
     * @returns {string[]} at least one line
     */
    function wrapLine(s, width) {
      var w = Math.max(1, width | 0);
      var str = String(s == null ? '' : s);
      if (str.length <= w) return [str];
      var out = [], rest = str;
      while (rest.length > w) {
        var at = rest.lastIndexOf(' ', w);
        // No space to break at (or one only at the very start) — break the run itself.
        if (at <= 0) at = safeCut(rest, w);
        out.push(rest.slice(0, at).replace(/\s+$/, ''));
        rest = rest.slice(at).replace(/^\s+/, '');
        if (!rest.length) break;
      }
      if (rest.length) out.push(rest);
      return out.length ? out : [''];
    }

    function splitCell(c) { return String(c == null ? '' : c).split(CELL_BREAK); }

