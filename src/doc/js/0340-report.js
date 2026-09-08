  /* =============================================================================
   * MODULE: App.report
   * PURPOSE: Platform-agnostic MARKDOWN section builders (spec §10.3, DOD-8). Turns
   *          an adapter's DECLARED report columns into a markdown table, and the
   *          device metadata into the block that opens every document. Produces
   *          BODIES only — headings, numbering and anchors belong to App.doc, which
   *          is the one place that knows where a block sits in the outline.
   * PURITY:  pure (data -> string)
   * DEPENDS: App.md
   * INVARIANTS: ALL dynamic text passes through App.md.text/cell/code. The key column
   *             of every table is emitted as a CODE SPAN, because a key is an
   *             identifier — verbatim in markdown, \texttt{} in LaTeX, and immune to
   *             the underscores and dollars that fill a captured register.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * v2.2: this module used to emit a Word-targeted HTML document — an inline
     * stylesheet tuned to what Word's HTML importer honours, page-break divs, fixed
     * colgroup widths. All three document outputs are markdown now, converted to PDF
     * through pandoc and LaTeX, so none of that survives: LaTeX does its own layout,
     * and a fixed column width expressed in a colgroup means nothing to it.
     *
     * What is left is the part that was always the real content — the mapping from an
     * adapter's declared columns to a table — plus the escaping discipline, which
     * matters more now than it did in HTML. An unescaped `&` in HTML was a cosmetic
     * bug; in LaTeX it is a compile error.
     * ---------------------------------------------------------------------- */

    /* CAP-1/TBS-1: every generated table takes a caption and, when the section asked
     * for one, a header/first-column style. Both arrive as one `opts` object rather
     * than as new positional arguments, so an adapter that never heard of either keeps
     * working unchanged (DOD-11). The caption id is DERIVED from the block, never
     * minted, which is what keeps the .md byte-stable across runs (DOD-7). */
    /* -------------------------------------------------------------------------
     * COL-3: an optional column's own default, and why "missing means included" was
     * not enough.
     *
     * The include-map is the generator's standard shape — a MISSING key means the thing
     * is in (§20.6) — which works when everything declared is wanted by default. It is
     * not true of every column: Rationale and Rollback are working notes rather than
     * things a signed report leads with, and turning them off in every section on every
     * project was a chore the tool was creating for itself.
     *
     * So a column may declare `defaultOff`, and a missing key means THAT column's
     * default rather than a blanket yes. An explicit key still wins in both directions,
     * so an operator who wants Rationale ticks it once and it travels with the project.
     * Declared by the adapter (DOD-11), never listed here.
     *
     * One function, used by the section builder, by the control-coverage builder and by
     * the designer's column list, so the three cannot disagree about what is showing.
     */
    function columnOn(col, colOpts) {
      if (!col || !col.optional) return true;
      var v = (colOpts || {})[col.id];
      return v === undefined ? col.defaultOff !== true : v !== false;
    }

    function tableOpts(opts, extra) {
      opts = opts || {};
      var out = Object.assign({}, extra || {});
      if (opts.style) out.style = opts.style;
      if (opts.widths && opts.widths.length) out.widths = opts.widths;
      if (opts.metrics) out.metrics = opts.metrics;
      // REF-2: control ids never reach a table by accident, so an absent list is absent
      // rather than empty — App.md decides the table's FORM partly on this.
      if (opts.rowAnchors && opts.rowAnchors.length) out.rowAnchors = opts.rowAnchors;
      // TBL-1: the operator's own title row, already escaped by the caller.
      if (opts.titleRow) out.titleRow = opts.titleRow;
      if (opts.captionId) out.caption = { id: opts.captionId, text: opts.captionText || '' };
      return out;
    }

    /** The "Device Config Information" block (spec §20.4), as a markdown table.
     *  TBL-1: `opts.headings` reworks the two column headings; absent, they are the
     *  wording this block has always used. */
    function metaTable(meta, opts) {
      var headings = ((opts || {}).headings || ['Field', 'Value']);
      return MD.table(
        headings.map(MD.cell),
        (meta || []).map(function (m) {
          // Hashes, ids and firmware strings are identifiers; the label is prose.
          return [MD.cell(m.label), m.code === false ? MD.cell(m.value) : MD.code(m.value)];
        }),
        tableOpts(opts)
      );
    }

    /**
     * A titled table as a standalone block body.
     * @param {Array<string|{label:string}>} headerCells
     * @param {Array<Array<string>>} rows  RAW strings — escaped here, once
     * @param {{align?:string[], empty?:string, style?:Object,
     *          captionId?:string, captionText?:string}} [opts]
     */
    function renderTable(headerCells, rows, opts) {
      opts = opts || {};
      var cells = (headerCells || []).map(function (h) { return typeof h === 'string' ? h : h.label; });
      var body = (rows || []).map(function (r) { return r.map(MD.cell); });
      if (!body.length) {
        // GEN-5: one canonical empty row, so "nothing to report" is stated rather
        // than left as a bare header the reader has to interpret.
        var first = [MD.cell(opts.empty || 'None.')];
        for (var i = 1; i < cells.length; i++) first.push('');
        body = [first];
      }
      return MD.table(cells.map(MD.cell), body, tableOpts(opts, { align: opts.align || [] }));
    }

    /**
     * Build one dataset report section from the adapter's DECLARED columns (spec
     * §20.3) — column- and group-aware, and with no knowledge of any particular
     * dataset (DOD-11).
     *
     * A grouped dataset returns CHILDREN rather than one body: one table per group,
     * each with its own caption and anchor so it can be cross-referenced.
     *
     * TBL-1: a child is no longer a SUB-SECTION. It used to carry the group's declared
     * name — "Removed", "Disabled", "Kept" — as a numbered heading above its table and
     * again as a "— Removed" suffix on the caption, which put the same word on the page
     * three times and put a heading between a section's introduction and the tables it
     * introduces. The tables now sit directly under the section, and what distinguishes
     * them is the TITLE ROW, which the operator writes (see App.md's title fences).
     *
     * @returns {{body:string, children:Array<{id:string,label:string,body:string}>}}
     */
    /**
     * TBL-1: the per-table wording for one of a section's tables.
     *
     * A section can produce several tables (a grouped register produces one per group),
     * and each of them wants its own title row, its own caption and — since the columns
     * carry different content in each — its own column headings. Keyed by the group
     * value, or `_all` for a section that produces one table, so the shape is the same
     * either way and nothing has to special-case "ungrouped".
     */
    var ONE_TABLE = '_all';
    function tableText(opts, key) { return ((opts.tables || {})[key] || {}); }
    /** The heading a column prints: what the operator typed, or what the adapter declares. */
    function headerFor(col, custom) {
      var own = String((custom || {})[col.id] || '').trim();
      return own || col.label;
    }

    function buildSection(sectionLabel, keyCol, columns, items, opts, ctx, groups) {
      opts = opts || {};
      var colOpts = opts.columns || {};
      var visible = (columns || []).filter(function (c) { return columnOn(c, colOpts); });
      // TBL-1: the key column is addressable like any other, so its heading can be
      // reworded too. `_key` is the id App.generate.sectionColumns already gives it.
      var cols = [Object.assign({ id: '_key' }, keyCol)].concat(visible);

      function rowsFor(list) {
        return list.slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
          .map(function (it) {
            return cols.map(function (c, i) {
              var v = c.get(it, ctx);
              v = (v == null) ? '' : String(v);
              // Column 0 is the register key: an identifier, so a code span.
              // REF-2: everything else is prose, and a control named in it — in the
              // Control column, or in passing in a Rationale — links to its coverage row.
              return i === 0 ? MD.code(v) : MD.autoLink(MD.cell(v), opts.linkTerms);
            });
          });
      }
      /**
       * @param {string} key  the group value, or `_all` for a single-table section
       * @param {string} dfltCaption  what the caption reads as when nobody has said
       */
      function tableFor(list, key, capId, dfltCaption) {
        var text = tableText(opts, key);
        var headers = cols.map(function (c) { return headerFor(c, text.columns); });
        var rows = rowsFor(list);
        if (!rows.length) {
          var empty = [MD.cell('None.')];
          for (var i = 1; i < headers.length; i++) empty.push('');
          rows = [empty];
        }
        /* TBL-1: a caption follows the title row when there is one.
         *
         * With the group sub-headings gone, three tables in one section would otherwise
         * all be captioned with the section's heading — "Table 4: Packages, Table 5:
         * Packages" — which is exactly the thing that makes a cross-reference useless.
         * The title row is already the operator's name for THIS table, so it is the
         * right default, and an explicit caption still overrides it.
         */
        var title = String(text.title || '').trim();
        return MD.table(headers.map(MD.cell), rows, tableOpts({
          style: opts.style, widths: opts.widths, metrics: opts.metrics,
          titleRow: title ? MD.text(title) : '',
          // CAP-4: a table the operator asked to leave uncaptioned emits no caption line
          // and no anchor, which is also what keeps it out of the numbering — App.doc
          // reads the numbers back off the caption markers this writes.
          captionId: text.noCaption === true ? '' : capId,
          captionText: String(text.caption || '').trim() || title || dfltCaption
        }));
      }

      var capBase = opts.captionId || '';
      var capName = opts.captionText || sectionLabel;
      if (groups && groups.field) {
        var groupOpts = opts.groups || {};
        return {
          body: '',
          children: groups.options.filter(function (g) { return groupOpts[g.value] !== false; }).map(function (g) {
            return {
              id: g.value,
              label: g.label,
              // TBL-1: the caption is the SECTION's name, not "Packages — Removed". The
              // group's declared label has stopped appearing on the page at all; what
              // names one of a section's tables is the title row the operator writes.
              body: tableFor(items.filter(function (it) { return it.decision && it.decision[groups.field] === g.value; }),
                g.value, capBase ? capBase + '-' + g.value : '', capName)
            };
          })
        };
      }
      return { body: tableFor(items, ONE_TABLE, capBase, capName), children: [] };
    }

    App.report = { renderTable: renderTable, buildSection: buildSection, metaTable: metaTable, tableOpts: tableOpts,
      // COL-3: the one answer to "is this optional column showing?".
      columnOn: columnOn };
  })(App);
