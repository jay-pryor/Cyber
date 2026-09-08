  /* =============================================================================
   * MODULE: App.docBlocks — how a block is ordered, and how its table is worded
   * PURPOSE: Four helpers that decide the ORDER blocks are emitted in and the
   *          WORDING a generated table carries — its column headings, its title row
   *          and its caption. Nothing here knows what a device or a control is.
   * PURITY:  pure. No DOM, no I/O, no clock, no host state.
   * DEPENDS: App.md
   * INVARIANTS: an order naming a block that no longer exists is IGNORED, never
   *             fatal — deleting a dataset must not invalidate an arrangement.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /**
     * Blocks in the operator's chosen order: those named first, in the order named;
     * everything else after, in declaration order. Ids that no longer exist are
     * simply ignored (same rule as procedure.order).
     */
    function applySectionOrder(list, order) {
      var pos = {}, n = (order || []).length;
      (order || []).forEach(function (id, i) { if (pos[id] === undefined) pos[id] = i; });
      return list.map(function (x, i) { return { x: x, k: pos[x.id] === undefined ? n + i : pos[x.id], i: i }; })
        .sort(function (a, b) { return (a.k - b.k) || (a.i - b.i); })
        .map(function (e) { return e.x; });
    }

    /** The operator's wording for one of a block's tables, or nothing. */
    function tableWording(b, key) { return ((b && b.tables) || {})[key] || {}; }

    /** Column headings after the operator's own wording is applied. */
    function headingsFor(ids, labels, custom) {
      return labels.map(function (l, i) {
        var own = String((custom || {})[ids[i]] || '').trim();
        return own || l;
      });
    }

    /** The title-row and caption half of the same, folded into a table's options. */
    function withWording(tblOpts, text, dfltCaption) {
      var title = String(text.title || '').trim();
      var out = Object.assign({}, tblOpts, {
        titleRow: title ? MD.text(title) : '',
        captionText: String(text.caption || '').trim() || title || dfltCaption
      });
      // CAP-4: no caption means no caption LINE, which is what leaves the table out of
      // the numbering — App.doc counts the markers rather than the tables.
      if (text.noCaption === true) out.captionId = '';
      return out;
    }

    App.docBlocks = {
      applySectionOrder: applySectionOrder,
      tableWording: tableWording,
      headingsFor: headingsFor,
      withWording: withWording
    };
  }(App));
