    // ======================================================================
    // wiring: wireText
    //
    // The rich-text boxes (RTX-1/RTX-2). Every one of these handlers exists to keep a
    // caret and a selection where the author put them across a repaint, which is why
    // they are gathered here rather than filed under whatever they are editing.
    //
    // Called by wire(ctx) in 070-wire.js with the shared helper bag. Split out of
    // that one function so no file in this block sits over the 500-line cap; the
    // handlers themselves are unchanged.
    // ======================================================================

    function wireText(h) {
      var dom = h.dom, ctx = h.ctx;

      /* Keep the caret and the selection where the author put them.
       *
       * `mousedown` is the event that moves focus, so preventing its default is what
       * stops the textarea losing the selection the button is about to act on — and it
       * has to be on every one of them (bold, italic, code, line break, the Link button
       * and each target in the menu), because they all act on the same selection.
       */
      /* Keep the caret and the selection where the author put them.
       *
       * `mousedown` is the event that moves focus, so preventing its default is what
       * stops the box losing the selection the button is about to act on — and it has to
       * be on every one of them (bold, italic, code, line break, the Link button and each
       * target in the menu), because they all act on the same selection.
       *
       * The selection is recorded here too. It is live in the DOM at this moment and it
       * will not be after the reference menu has repainted, and recording it as TOKEN
       * offsets is what lets it survive that. A button pressed while the caret is
       * somewhere else entirely leaves the last recorded selection alone. */
      dom.on(ctx.root, 'mousedown', '[data-rd-wrap], [data-rd-ref-open], [data-rd-ref-pick]',
        function (e, el) {
          e.preventDefault();
          var live = liveBox(el);
          if (live) noteSelection(live);
        });

      dom.on(ctx.root, 'click', '[data-rd-wrap]', function (e, el) {
        wrapSelection(el, el.getAttribute('data-rd-wrap'));
      });
      dom.on(ctx.root, 'click', '[data-rd-ref-open]', function (e, el) {
        var id = el.getAttribute('data-rd-ref-open');
        _rd.refFor = _rd.refFor === id ? null : id;
        // The remembered selection is two offsets into the box's TOKENS (RTX-1), so it
        // survives the repaint that opens the menu — which is what lets picking a target
        // link the words that were highlighted when the button was pressed.
        repaint();
      });
      dom.on(ctx.root, 'click', '[data-rd-ref-pick]', function (e, el) {
        // REF-1: the reading (`ref` / `refn` / `reft`) rides on the button, so the same
        // menu serves a paragraph, a table cell and a section introduction.
        var tag = (el.getAttribute('data-rd-ref-tag') || 'ref') + ':' + el.getAttribute('data-rd-ref-pick');
        wrapSelection(el, tag);
        _rd.refFor = null;
        repaint();
      });

      /* RTX-1: the box commits on BLUR, like every text box in the tool — a commit per
       * keystroke would repaint the workspace and take the caret with it. The selection
       * is recorded on the way out too, so the toolbar and the reference menu know which
       * box was being written in and where in it. */
      dom.on(ctx.root, 'focusout', '[data-rd-rich]', function (e, el) {
        noteSelection(el);
        var save = boxSaver(el);
        var next = RT.fromNode(el);
        quietly(function () { logIssues(save(next)); });
        dirty();
        /* A CELL does not repaint, and the others do.
         *
         * Leaving a paragraph or an introduction means the workspace can catch up — the
         * escape hint under the box, the preview beside it. Leaving a cell usually means
         * the caret has gone to the NEXT cell, and rebuilding the table around it would
         * take the focus out of the row being filled in. */
        if (!el.hasAttribute('data-rd-cell')) repaint();
      });
      // While the caret is in the box, keep track of where it is: a toolbar button
      // prevents its own mousedown, so the selection is still live when it is pressed —
      // but only this knows which of a table's cells it belongs to.
      ['keyup', 'mouseup'].forEach(function (ev) {
        dom.on(ctx.root, ev, '[data-rd-rich]', function (e, el) { noteSelection(el); });
      });
      /* Enter is a LINE BREAK, not a block.
       *
       * Left to itself a contenteditable wraps what follows in a <div> or a <p> depending
       * on the browser, and the box has no blocks — its whole content is one paragraph of
       * token markup. The walker reads a stray block back as a break anyway, so this is
       * about producing the same DOM in every browser rather than about correctness.
       */
      dom.on(ctx.root, 'keydown', '[data-rd-rich]', function (e, el) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        insertToken(el, 'br');
      });
      /* Paste arrives as PLAIN TEXT.
       *
       * Pasting from a word processor brings a document's worth of markup with it —
       * fonts, colours, tables — none of which this box can store and all of which the
       * walker would have to be defensive about. The text is what was meant.
       */
      dom.on(ctx.root, 'paste', '[data-rd-rich]', function (e, el) {
        if (!e.clipboardData) return;
        e.preventDefault();
        var text = e.clipboardData.getData('text/plain') || '';
        var at = RT.selectionIn(el, window.getSelection()) || { start: 0, end: 0 };
        var cur = RT.fromNode(el);
        var next = cur.slice(0, at.start) + text + cur.slice(at.end);
        quietly(function () { logIssues(boxSaver(el)(next)); });
        dirty();
        el.innerHTML = boxHtml(next);
        RT.placeCaret(el, at.start + text.length, window);
      });
    }
