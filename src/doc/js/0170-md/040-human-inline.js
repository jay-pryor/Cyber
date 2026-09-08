    /** One value on ONE line — the form used for a nested value inside a list entry. */
    function humanInline(v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'number') return isFinite(v) ? String(v) : '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.length ? v.map(humanInline).join(', ') : HUMAN_EMPTY;
      if (typeof v !== 'object') return '';
      var keys = Object.keys(v).sort();
      return keys.length ? keys.map(function (k) { return k + ': ' + humanInline(v[k]); }).join('; ') : HUMAN_EMPTY;
    }

    /**
     * The reading of a whole value, over as many lines as it needs.
     * @param {*} v @returns {string} plain text — NOT escaped; pass it through cell()
     */
    function human(v) {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) {
        if (!v.length) return HUMAN_EMPTY;
        var records = v.some(function (x) { return x && typeof x === 'object'; });
        // A list of records is numbered: without an ordinal, two adjacent firewall
        // rules carrying the same fields are indistinguishable once printed.
        return records
          ? v.map(function (x, i) { return (i + 1) + '. ' + humanInline(x); }).join('\n\n')
          : v.map(humanInline).join('\n\n');
      }
      if (typeof v === 'object') {
        var keys = Object.keys(v).sort();
        if (!keys.length) return HUMAN_EMPTY;
        return keys.map(function (k) { return k + ': ' + humanInline(v[k]); }).join('\n\n');
      }
      return humanInline(v);
    }

    // ---- rich text -----------------------------------------------------------

    /* The designer's paragraph boxes accept a token markup rather than raw markdown,
     * for one reason: raw markdown cannot coexist with the escaping above. If the
     * user typed `**bold**` the asterisks would be escaped and they would see literal
     * asterisks in the PDF; if the asterisks were left unescaped, a package name
     * containing one would silently start emphasis.
     *
     * So inline formatting travels as {{...}} tokens, which the editor's toolbar
     * inserts around the selection. Tokens are extracted BEFORE escaping and the
     * surrounding literal text is escaped after, so anything that is NOT one of the
     * known tokens — `{{zzz}}`, a stray brace — escapes to literal characters
     * and can never restructure the document. The set is deliberately small: bold,
     * italic, code, line break, and a cross-reference.
     *
     * REF-1: the id charset carries a DOT.
     *
     * It did not, and a block id is `ds:android.packages` — so the one reference a
     * designer is most likely to insert, a link to a register section, did not match
     * this pattern at all. It was therefore never recognised as a token, fell through
     * to text() with everything else, and printed in the PDF as the literal string
     * `{{ref:ds:android.packages}}`. Every reference to a hand-authored section (`sec1`)
     * worked, which is what made it read as "references are broken sometimes".
     *
     * REF-1: three reference tokens rather than one, because a reference has three
     * useful readings and the designer picks between them when inserting it:
     *
     *   {{ref:ID}}   the full label   — "Table 4: Packages removed"
     *   {{refn:ID}}  the number alone — "Table 4"
     *   {{reft:ID}}  the title alone  — "Packages removed"
     *
     * and a fourth form, `{{ref:ID}}…{{/ref}}`, which links whatever text is between
     * the two — for when the sentence already reads "see the packages table".
     *
     * All four store nothing but the target's ID, so every visible part of the link is
     * derived at render time and a renumber or a rename is picked up for free. */
    var TOKEN = /\{\{(\/?)(b|i|c|br|(?:ref|refn|reft):[A-Za-z0-9:._-]+|ref)\}\}/g;
    var REF_TAG = /^(ref|refn|reft):(.+)$/;
    var MARK = { b: '**', i: '*', c: '`' };
    /** What a resolved reference reads as, per token. */
    var REF_READING = { ref: 'label', refn: 'numberLabel', reft: 'titleLabel' };

    /* REF-2: a term that links itself wherever it is written.
     *
     * A control is named in prose ("AHG-001 is met by …"), in a Rationale cell and in
     * the Control column of every register table. Asking the author to insert a
     * cross-reference at each of those is asking them not to bother, so the mentions
     * are found rather than marked: a caller hands over the terms it knows about and
     * every occurrence becomes a link to that term's anchor.
     *
     * Applied to ALREADY-ESCAPED markdown, and that is deliberate. The link text has to
     * be the escaped form (a control called `AHG_001` must still print an underscore),
     * and matching on the escaped string is also what keeps this out of the way of the
     * escaper — one pass, one place, no second escaping route to get wrong.
     *
     * Terms are matched longest-first so `ISM-1416` is not eaten by a control called
     * `ISM-141`, and a match must not sit inside a longer word, or `AHG-0011` would be
     * linked as `AHG-001` with a stray `1` after it.
     */
    var WORDY = /[A-Za-z0-9]/;
    function autoLink(escaped, terms) {
      var s = String(escaped == null ? '' : escaped);
      if (!s || !terms || !terms.length) return s;
      var sorted = terms.slice().sort(function (a, b) { return String(b.text).length - String(a.text).length; });
      var out = '', i = 0;
      outer: while (i < s.length) {
        for (var t = 0; t < sorted.length; t++) {
          var term = String(sorted[t].text);
          if (!term) continue;
          if (s.substr(i, term.length) !== term) continue;
          var before = i > 0 ? s.charAt(i - 1) : '';
          var after = s.charAt(i + term.length) || '';
          // Not mid-word, and not already inside a link's label or destination.
          if (WORDY.test(before) || WORDY.test(after)) continue;
          if (before === '[' || before === '#' || after === ']') continue;
          out += '[' + term + '](#' + sorted[t].anchor + ')';
          i += term.length;
          continue outer;
        }
        out += s.charAt(i);
        i++;
      }
      return out;
    }

    /**
     * One paragraph of rich text -> markdown.
     *
     * Emphasis is BALANCED here, per paragraph. A hand-typed or half-deleted `{{b}}`
     * with no closing partner would otherwise emit a lone `**`, which pandoc reads as
     * emphasis running to the end of the block — one damaged token silently bolding
     * the rest of the document. So an unmatched close is dropped, a redundant re-open
     * is dropped, and anything still open at the end of the paragraph is closed. The
     * worst a broken token can do is affect the paragraph it sits in.
     */
    function richPara(p, opts) {
      var out = '', last = 0, m;
      var open = { b: false, i: false, c: false };
      // REF-2: literal prose is the only place a control mention can be found — never
      // inside a code span (taken whole below) and never inside a reference's own label.
      /* RTX-2: the same writer serves a paragraph and a TABLE CELL.
       *
       * The two differ in exactly two places and in nothing else: what escaping the
       * literal text takes (a cell marks long identifiers so they can wrap — BRK-1), and
       * what a line break is written as (a cell's lines are separated by CELL_BREAK, a
       * paragraph's by a newline). Everything between — the emphasis balancing, the code
       * spans, the references, the trailing-break rule — is the same question with the
       * same answer, so it is answered once. */
      var escape = opts.cell ? cellText : text;
      var lit = function (s) { return autoLink(escape(s), opts.linkTerms); };
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(p)) !== null) {
        out += lit(p.slice(last, m.index));
        var close = m[1] === '/', tag = m[2];
        if (tag === 'c' && !close) {
          // A code span is taken WHOLE rather than as an open/close pair, because the
          // text inside it must not be escaped — emitting `` `a\_b` `` puts a visible
          // backslash in the PDF (\texttt{a\textbackslash{}\_b}). Taking the run in one
          // piece also lets code() size the fence against any backticks inside it.
          var at = p.indexOf('{{/c}}', TOKEN.lastIndex);
          var inner = at === -1 ? p.slice(TOKEN.lastIndex) : p.slice(TOKEN.lastIndex, at);
          out += code(inner);
          last = at === -1 ? p.length : at + 6;
          TOKEN.lastIndex = last;
          continue;
        }
        if (MARK[tag] && tag !== 'c') {
          // `close === open[tag]` is the balanced case in both directions: closing
          // something open, or opening something closed. Anything else is noise.
          if (close === open[tag]) { open[tag] = !close; out += MARK[tag]; }
        } else if (tag === 'br') {
          // Emitted as a bare newline and turned into a hard break by the pass below,
          // so there is exactly one place that decides what a line break looks like.
          out += '\n';
        } else if (REF_TAG.test(tag) && !close) {
          var bits = REF_TAG.exec(tag);
          var r = opts.resolveRef ? opts.resolveRef(bits[2]) : null;
          /* REF-1: a reference may carry its own words.
           *
           * `{{ref:ID}}see the packages table{{/ref}}` links what is between the two,
           * which is what the designer gets when text was selected before the button was
           * pressed. The inner run is taken WHOLE, like a code span, because it is the
           * link's label — an emphasis token inside it would have to be balanced against
           * a closing brace that belongs to the reference, and a half-formatted label is
           * not worth the machinery. */
          var at = p.indexOf('{{/ref}}', TOKEN.lastIndex);
          var wrapped = at === -1 ? null : p.slice(TOKEN.lastIndex, at);
          if (wrapped !== null) { last = at + 8; TOKEN.lastIndex = last; }
          // An unresolvable reference is STATED, never dropped: a dangling link in a
          // report is a finding, and a silently empty one is a worse finding.
          if (!r) {
            out += wrapped !== null ? lit(wrapped) + ' **\\[missing reference\\]**' : '**\\[missing reference\\]**';
          } else {
            var shown = wrapped !== null ? wrapped : String(r[REF_READING[bits[1]]] || r.label || '');
            out += '[' + escape(shown) + '](#' + r.anchor + ')';
          }
          if (wrapped !== null) continue;
        }
        last = m.index + m[0].length;
      }
      out += lit(p.slice(last));
      /* A single newline inside a paragraph is a deliberate line break — the box is a
       * plain textarea, so it is the only way to ask for one. Trailing backslash is
       * pandoc's hard break; a blank line already split the paragraph above.
       *
       * BR-1: a trailing break is a break like any other, and it needs a line to start.
       *
       * D-037 dropped them, because `\` with nothing after it is not a hard break to
       * pandoc — it reads the backslash as a literal and prints one. Dropping the break
       * also threw away the blank line the writer had asked for, which is why a spacer
       * at the foot of a title page did nothing. So the break is KEPT and given an empty
       * line to land on: one non-breaking space, which pandoc writes as `~` and which
       * occupies a line without putting a mark on the page. The lone backslash D-037 was
       * about never appears, because the last line is now the spacer rather than a break.
       *
       * Emphasis is closed BEFORE the trailing run rather than after it, or the closing
       * `**` would land on a line of its own below the break it was meant to close.
       */
      var tail = (/\n+$/.exec(out) || [''])[0];
      if (tail) out = out.slice(0, out.length - tail.length);
      ['i', 'b'].forEach(function (t) { if (open[t]) out += MARK[t]; });
      if (tail) out += tail + BLANK_LINE;
      /* RTX-2: a hard break is a trailing backslash in BOTH forms. What differs is the
       * separator that follows it — a newline in a paragraph, a CELL_BREAK in a cell,
       * which gridTable turns into a line of its own inside the cell. Without the
       * backslash pandoc folds a cell's consecutive lines into one paragraph, which is
       * why a line break typed into a cell used to do nothing at all on the page. */
      return out.split('\n').join('\\' + (opts.cell ? CELL_BREAK : '\n'));
    }

    /* BR-1: what a trailing line break lands on — a line that exists and prints nothing.
     * U+00A0 rather than a space, because a line of ordinary whitespace is stripped by
     * every markdown reader there is; a non-breaking space is CONTENT, and pandoc writes
     * it as `~`. */
    var BLANK_LINE = String.fromCharCode(0xA0);

    /**
     * Render rich text to markdown.
     * @param {string} s  the stored token text
     * @param {{resolveRef?:(id:string)=>?{label:string,numberLabel:string,titleLabel:string,anchor:string},
     *          linkTerms?:Array<{text:string,anchor:string}>}} [opts]
     * @returns {string}
     */
    function rich(s, opts) {
      opts = opts || {};
      return String(s == null ? '' : s).split(/\n{2,}/)
        .map(function (p) { return richPara(p, opts); })
        .filter(function (p) { return p.length; })
        .join('\n\n');
    }

    /**
     * RTX-2: the same rich text, written into a TABLE CELL.
     *
     * A hand-authored table's cells hold the same token markup a paragraph does, so bold,
     * italic, code, line breaks and cross-references work in a cell exactly as they do
     * above it. What a cell cannot have is markdown BLOCKS, so a blank line — a paragraph
     * in a paragraph box — is written as the blank line inside a cell that gridTable and
     * pandoc both already understand: two CELL_BREAKs.
     *
     * @param {string} s @param {Object} [opts] as rich(), minus the paragraph structure
     */
    function richCell(s, opts) {
      var o = {};
      Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
      o.cell = true;
      return String(s == null ? '' : s).split(/\n{2,}/)
        .map(function (p) { return richPara(p, o); })
        .filter(function (p) { return p.length; })
        .join(CELL_BREAK + CELL_BREAK);
    }

    /** The plain-text reading of a token string — for previews, summaries and titles. */
    function plain(s) {
      return String(s == null ? '' : s).replace(TOKEN, function (m0, close, tag) {
        return (!close && REF_TAG.test(tag)) ? '→' : tag === 'br' ? ' ' : '';
      });
    }

    // ---- document assembly ---------------------------------------------------

    /** Join blocks with exactly one blank line, dropping empties. Deterministic. */
    function join(blocks) {
      return (blocks || []).filter(function (b) { return b != null && String(b).length; })
        .map(function (b) { return String(b).replace(/\s+$/, ''); }).join('\n\n');
    }

    /**
     * A YAML metadata block for pandoc. Values are emitted as double-quoted scalars
     * with only `\` and `"` escaped, which is the whole of YAML's double-quoted
     * escaping rule — the markdown escaping above must NOT be applied here, because
     * this text is consumed by the YAML parser and never by the markdown reader.
     * @param {Array<{key:string,value:*}>} entries  ordered; arrays emit as lists,
     *        a value of `{block:string}` emits as a literal block scalar
     */
    function yaml(entries) {
      function scalar(v) { return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
      var lines = ['---'];
      (entries || []).forEach(function (e) {
        if (e.value == null || e.value === '') return;
        if (Array.isArray(e.value)) {
          if (!e.value.length) return;
          lines.push(e.key + ':');
          e.value.forEach(function (v) { lines.push('  - ' + scalar(v)); });
        } else if (e.value && e.value.block != null) {
          if (!String(e.value.block).trim()) return;
          lines.push(e.key + ': |');
          String(e.value.block).split('\n').forEach(function (l) { lines.push('  ' + l); });
        } else if (typeof e.value === 'boolean' || typeof e.value === 'number') {
          lines.push(e.key + ': ' + e.value);
        } else {
          lines.push(e.key + ': ' + scalar(e.value));
        }
      });
      lines.push('---');
      return lines.join('\n');
    }

    /**
     * Slugify to a pandoc-legal anchor. Anchors are DERIVED FROM IDS, never from
     * titles — that is what lets a cross-reference survive a rename (see App.doc).
     */
    function anchor(id) {
      return String(id == null ? '' : id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
    }

    /**
     * Which characters in a string WOULD be escaped — what the designer shows under a
     * paragraph box so the author can see the transformation rather than be surprised
     * by it in the PDF.
     * @returns {string[]} the distinct hostile characters present, in first-seen order
     */
    function hostileChars(s) {
      var seen = {}, out = [];
      String(s == null ? '' : s).replace(TOKEN, '').replace(HOSTILE, function (ch) {
        if (!seen[ch]) { seen[ch] = 1; out.push(ch); }
        return ch;
      });
      return out;
    }

    App.md = {
      text: text, latex: latex, code: code, cell: cell, CELL_BREAK: CELL_BREAK,
      // BRK-1: which space-free runs get marked so they can break on the page.
      isLongIdentifier: isLongIdentifier, IDENT_MIN: IDENT_MIN,
      heading: heading, para: para, rule: rule, pageBreak: pageBreak, rawLatex: rawLatex, centred: centred,
      // SPC-1: vertical space as a length — between blocks, and inside a table row.
      vspace: vspace, rowStrut: rowStrut, mmLen: mmLen, MAX_MM: MAX_MM,
      table: table, pipeTable: pipeTable, gridTable: gridTable,
      // TW-1 (column widths) / TBS-1 (header + first-column styling) / HUM-1 (values)
      widthsFor: widthsFor, autoWidths: autoWidths, wrapLine: wrapLine, WIDTH_BUDGET: WIDTH_BUDGET,
      HEAD_SHADE_OPEN: HEAD_SHADE_OPEN, HEAD_SHADE_CLOSE: HEAD_SHADE_CLOSE, COL_SHADE: COL_SHADE,
      HEAD_CELL_SHADE: HEAD_CELL_SHADE,
      human: human, humanInline: humanInline, HUMAN_EMPTY: HUMAN_EMPTY,
      rich: rich, richCell: richCell, cellText: cellText, plain: plain, TOKEN: TOKEN, REF_TAG: REF_TAG,
      // D-036: exposed so a test can assert where a wrap is allowed to land.
      _safeCut: safeCut,
      // REF-2: turn every mention of a known term into a link to it.
      autoLink: autoLink,
      join: join, yaml: yaml, anchor: anchor, hostileChars: hostileChars
    };
  })(App);
