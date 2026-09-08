  /* =============================================================================
   * MODULE: App.ui.richText  — RTX-1: the box shows what it holds
   * PURPOSE: Turn the {{...}} token markup App.md.rich reads into HTML a
   *          contenteditable box can be edited in, and turn the edited box back into
   *          tokens. Bold reads as bold, a code span as code, a line break as a line
   *          break, and a cross-reference as the SECTION OR TABLE IT NAMES rather than
   *          as `{{ref:ds:android.packages}}`.
   * PURITY:  the two string functions are pure; the three DOM ones read and write a
   *          node the caller owns. No store access, no rendering of its own.
   * DEPENDS: App.util.html (esc), App.md (TOKEN, REF_TAG)
   * INVARIANTS: toHtml escapes everything data-derived — the box is a live DOM, so an
   *             unescaped captured string here would be an injection route. fromNode is
   *             its exact inverse for everything toHtml emits, so a box that is opened
   *             and closed without being typed in leaves the project byte-identical.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * Why the storage stays tokens.
     *
     * The obvious move is to store HTML and be done with it. It is the wrong one: the
     * document is markdown on its way to LaTeX, and HTML would need a second writer, a
     * second escaping discipline and a second set of things that can go wrong on the way
     * to a PDF — for a box that is only ever used to write four kinds of emphasis.
     *
     * So the TOKENS remain the truth, exactly as they were, and this module is a lens
     * over them. Everything that reads the project — the generator, the preview, the
     * templates, the round-trip test — is untouched, and a project written before this
     * opens in it unchanged.
     *
     * The lens has to be exact in one direction: whatever toHtml emits, fromNode must
     * read back to the same tokens. Anything the box acquires that toHtml did not put
     * there — a pasted <span style>, a browser's <div> on Enter — is read for its TEXT
     * and its line breaks and nothing else, which is the safe direction to fail in.
     * ---------------------------------------------------------------------- */

    var CHIP = 'rd-chip';        // a reference that prints the target's own words
    var REFLINK = 'rd-reflink';  // a reference over words the author wrote

    /** What a resolved reference reads as, per token — the same three App.md uses. */
    var REF_READING = { ref: 'label', refn: 'numberLabel', reft: 'titleLabel' };

    /**
     * RTX-1: tokens -> the HTML the box is edited in.
     *
     * @param {string} tokens
     * @param {{resolveRef?:function(string):?Object}} [opts]
     * @returns {string}
     */
    function toHtml(tokens, opts) {
      opts = opts || {};
      var s = String(tokens == null ? '' : tokens);
      var out = '', last = 0, m;
      // Emphasis is BALANCED here for the same reason App.md balances it: a lone `{{b}}`
      // would otherwise open a <strong> that never closes and swallow the rest of the
      // box — and unlike a paragraph of markdown, this one is live DOM.
      var open = { b: false, i: false };
      var TAGS = { b: 'strong', i: 'em' };
      function lit(t) { return esc(t).split('\n').join('<br>'); }
      MD.TOKEN.lastIndex = 0;
      while ((m = MD.TOKEN.exec(s)) !== null) {
        out += lit(s.slice(last, m.index));
        var close = m[1] === '/', tag = m[2];
        last = m.index + m[0].length;
        if (tag === 'c' && !close) {
          // Taken whole, like App.md takes it: nothing inside a code span is a token.
          var at = s.indexOf('{{/c}}', MD.TOKEN.lastIndex);
          var inner = at === -1 ? s.slice(MD.TOKEN.lastIndex) : s.slice(MD.TOKEN.lastIndex, at);
          out += '<code>' + esc(inner) + '</code>';
          last = at === -1 ? s.length : at + 6;
          MD.TOKEN.lastIndex = last;
          continue;
        }
        if (TAGS[tag]) {
          if (close === open[tag]) { open[tag] = !close; out += (close ? '</' : '<') + TAGS[tag] + '>'; }
          continue;
        }
        if (tag === 'br') { out += '<br>'; continue; }
        if (MD.REF_TAG.test(tag) && !close) {
          var bits = MD.REF_TAG.exec(tag);
          var r = opts.resolveRef ? opts.resolveRef(bits[2]) : null;
          var ref = s.indexOf('{{/ref}}', MD.TOKEN.lastIndex);
          var wrapped = ref === -1 ? null : s.slice(MD.TOKEN.lastIndex, ref);
          if (wrapped !== null) { last = ref + 8; MD.TOKEN.lastIndex = last; }
          var attrs = ' data-rd-tok="' + esc(tag) + '" title="' +
            esc(r ? 'Links to ' + r.label : 'This link points at something that is no longer in the document') + '"';
          if (wrapped !== null) {
            // The author's own words are the link text, so they stay EDITABLE — the
            // marker is the underline, not a lump you cannot type inside.
            out += '<span class="' + REFLINK + (r ? '' : ' rd-broken') + '"' + attrs + '>' + lit(wrapped) + '</span>';
          } else {
            /* RTX-1: the whole point of this module, in one line.
             *
             * A reference that carries no words of its own prints the TARGET's — "Table
             * 4: Packages removed" — and the box now shows that rather than the token
             * that will become it. It is one uneditable chip, because what it says is
             * derived: typing into half of "Table 4" would mean nothing, and deleting it
             * has to take the whole reference or leave a broken one behind. */
            var shown = r ? String(r[REF_READING[bits[1]]] || r.label || '') : '[missing reference]';
            out += '<span class="' + CHIP + (r ? '' : ' rd-broken') + '" contenteditable="false"' + attrs + '>' +
              esc(shown) + '</span>';
          }
          continue;
        }
        // An unknown or unmatched token is literal text, exactly as App.md reads it.
        out += lit(m[0]);
      }
      out += lit(s.slice(last));
      ['i', 'b'].forEach(function (t) { if (open[t]) out += '</' + TAGS[t] + '>'; });
      return out;
    }

    /* -------------------------------------------------------------------------
     * The walk, shared by all three DOM functions.
     *
     * Every one of them is the same traversal asking a different question: what tokens
     * does this box hold, where in those tokens is the caret, and where in the box is a
     * given token offset. Written once, so the three cannot disagree — which they would,
     * eventually, and the symptom would be a caret that jumps somewhere else after every
     * button press.
     *
     * `emit` is called with ('text', string, node) for editable content and
     * ('markup', string) for the tokens the markup itself stands for. The token offset
     * of anything is the sum of both, in order.
     * ---------------------------------------------------------------------- */
    var BLOCKISH = { DIV: 1, P: 1, LI: 1, TR: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };

    /**
     * Walk the CONTENTS of the box. `st.len` is how much has been emitted so far, which
     * is what a block element needs to know: a `<div>` is a line break BETWEEN things,
     * and one at the very start of the box would be a break before anything.
     */
    function run(node, emit, mark) {
      var st = { len: 0 };
      function E(kind, s, n) { emit(kind, s, n); st.len += s.length; }
      children(node, E, mark, st);
    }

    function walk(node, emit, mark, st) {
      if (!node) return;
      if (node.nodeType === 3) { emit('text', node.nodeValue || '', node); return; }
      if (node.nodeType !== 1) return;
      var name = node.nodeName;
      if (name === 'BR') { emit('markup', '\n'); return; }
      var tok = node.getAttribute && node.getAttribute('data-rd-tok');
      var cls = node.className || '';
      if (tok && String(cls).indexOf(CHIP) !== -1) { emit('markup', '{{' + tok + '}}'); return; }
      if (tok && String(cls).indexOf(REFLINK) !== -1) {
        emit('markup', '{{' + tok + '}}');
        children(node, emit, mark, st);
        emit('markup', '{{/ref}}');
        return;
      }
      if (name === 'CODE') {
        // Verbatim: a code span's content is not tokenised, here or in App.md.
        emit('markup', '{{c}}');
        children(node, emit, mark, st);
        emit('markup', '{{/c}}');
        return;
      }
      if (name === 'STRONG' || name === 'B') { pair(node, 'b', emit, mark, st); return; }
      if (name === 'EM' || name === 'I') { pair(node, 'i', emit, mark, st); return; }
      if (BLOCKISH[name]) {
        // A browser's own block on Enter, or a pasted one. It is a line break and
        // nothing else — the box has no blocks of its own.
        if (st.len) emit('markup', '\n');
        children(node, emit, mark, st);
        return;
      }
      children(node, emit, mark, st);
    }
    function pair(node, tag, emit, mark, st) {
      emit('markup', '{{' + tag + '}}');
      children(node, emit, mark, st);
      emit('markup', '{{/' + tag + '}}');
    }
    function children(node, emit, mark, st) {
      var ns = node.childNodes;
      for (var i = 0; i < ns.length; i++) { if (mark) mark(node, i); walk(ns[i], emit, mark, st); }
      if (mark) mark(node, ns.length);
    }

    /** RTX-1: the box -> the tokens it stands for. @param {Node} node @returns {string} */
    function fromNode(node) {
      var out = '';
      run(node, function (kind, s) { out += s; });
      // A contenteditable renders a trailing space as U+00A0; it is a space to the
      // author, so it is stored as one rather than as a character App.md would have to
      // decide about.
      return out.replace(/ /g, ' ');
    }

    /**
     * The token offset of a DOM position inside the box.
     * @param {Node} node the box @param {Node} container @param {number} offset
     * @returns {number} clamped into the box's own text
     */
    function offsetOf(node, container, offset) {
      var len = 0, found = -1;
      run(node, function (kind, s, n) {
        if (kind === 'text' && n === container && found === -1) found = len + Math.min(offset, s.length);
        len += s.length;
      }, function (parent, i) {
        if (parent === container && i === offset && found === -1) found = len;
      });
      return found === -1 ? len : found;
    }

    /**
     * RTX-1: the selection inside a box, as offsets into its tokens.
     * @returns {?{start:number, end:number}} null when the selection is not in this box
     */
    function selectionIn(node, sel) {
      if (!node || !sel || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0);
      if (!node.contains || !node.contains(r.startContainer) || !node.contains(r.endContainer)) return null;
      var a = offsetOf(node, r.startContainer, r.startOffset);
      var b = offsetOf(node, r.endContainer, r.endOffset);
      return { start: Math.min(a, b), end: Math.max(a, b) };
    }

    /** Put the caret at a token offset. Silent when the box cannot take it. */
    function placeCaret(node, at, win) {
      var w = win || (node && node.ownerDocument && node.ownerDocument.defaultView);
      if (!w || !w.getSelection || !node) return;
      var len = 0, hit = null;
      run(node, function (kind, s, n) {
        if (hit) return;
        /* `Math.max(0, …)` is the whole of the markup case.
         *
         * A token offset can land INSIDE markup — the caret after a wrap is at the end
         * of `{{/b}}`, which is not a position in the DOM at all. The nearest one that
         * is, is the start of the next run of text, which is where a reader would say
         * the caret is. Without the clamp the offset came out negative and the range
         * threw, so the caret silently stayed where it was and the next button acted at
         * the beginning of the box. */
        if (kind === 'text' && len + s.length >= at) { hit = { node: n, offset: Math.max(0, at - len) }; return; }
        len += s.length;
      });
      try {
        /* FOCUS FIRST, then the range.
         *
         * Focusing an editable element puts the caret at the start of it — that is what
         * focusing an editable element means — so a `focus()` after the range silently
         * throws the range away and the caret lands at the beginning of the box. The
         * symptom was one button press acting where the last one had, and the next one
         * acting at the start of the paragraph. Measured in jsdom, and the same order is
         * what every browser wants for the same reason.
         */
        if (node.focus) node.focus();
        var r = node.ownerDocument.createRange();
        if (hit) { r.setStart(hit.node, hit.offset); r.setEnd(hit.node, hit.offset); }
        else { r.selectNodeContents(node); r.collapse(false); }
        var sel = w.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      } catch (e) { /* a detached box, or an engine that will not have it */ }
    }

    /**
     * RTX-1: what a toolbar button does, expressed on the TOKENS rather than on the DOM.
     *
     * Doing it on the string is what makes the box's behaviour testable without a
     * browser, and what lets a repaint happen in the middle of it: the selection is two
     * numbers into a string, so it survives the box being destroyed and rebuilt, which
     * is exactly what opening the reference menu does.
     *
     * @param {string} text @param {number} start @param {number} end @param {string} tag
     * @returns {{text:string, caret:number}}
     */
    function applyToken(text, start, end, tag) {
      var v = String(text == null ? '' : text);
      var s = Math.max(0, Math.min(v.length, start | 0));
      var e = Math.max(s, Math.min(v.length, end | 0));
      var sel = v.slice(s, e);
      /* A line break is written as a NEWLINE, not as `{{br}}`.
       *
       * The two mean the same thing to App.md and always have, and a newline is what
       * fromNode reads a `<br>` back as — so writing `{{br}}` here would mean the stored
       * text flipped between the two spellings depending on whether the author typed
       * anything after pressing Enter. `{{br}}` is still understood everywhere it
       * appears; nothing new writes one. */
      if (tag === 'br') return { text: v.slice(0, s) + '\n' + v.slice(e), caret: s + 1 };
      var isRef = MD.REF_TAG.test(tag);
      var open = '{{' + tag + '}}', close;
      if (isRef) close = sel ? '{{/ref}}' : '';
      else close = '{{/' + tag + '}}';
      // With a closing token the selection is kept BETWEEN the two; without one the
      // token is a marker and simply lands at the caret, leaving the text either side.
      var body = close ? sel : '';
      return { text: v.slice(0, s) + open + body + close + v.slice(e),
        caret: s + open.length + body.length + close.length };
    }

    App.ui = App.ui || {};
    App.ui.richText = {
      toHtml: toHtml, fromNode: fromNode, selectionIn: selectionIn, offsetOf: offsetOf,
      placeCaret: placeCaret, applyToken: applyToken, CHIP: CHIP, REFLINK: REFLINK
    };
  })(App);
