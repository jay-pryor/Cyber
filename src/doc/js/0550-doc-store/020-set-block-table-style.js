    /**
     * TBS-1: whether a GENERATED section's tables wear the profile's header-row /
     * first-column styling. The look itself is the formatting profile's; this only
     * records that this section opted in, which is why it is a boolean and not a colour.
     * @param {string} blockId @param {'head'|'firstColumn'} which @param {boolean} on
     */
    function setBlockTableStyle(blockId, which, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      if (which !== 'head' && which !== 'firstColumn') return err('Table styling is either "head" or "firstColumn".');
      App.store._commit(function (p) {
        var b = bag(p);
        b.tableStyles = b.tableStyles || {};
        var e = b.tableStyles[blockId] = b.tableStyles[blockId] || {};
        if (on) e[which] = true; else delete e[which];
        if (!Object.keys(e).length) delete b.tableStyles[blockId];
        if (!Object.keys(b.tableStyles).length) delete b.tableStyles;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * META-1: include or exclude one row of the Device Config Information block.
     *
     * Stored in the PROJECT rather than in the session options, unlike the dataset
     * column ticks. Which provenance a report carries — hashes or no hashes — is a
     * house decision that belongs with the heading levels and the section order, and a
     * report template that did not carry it would only be half a template.
     * Included is the absent state, so the default costs nothing in the file.
     */
    function setMetaField(fieldId, on) {
      if (!P()) return errNoProject();
      if (!fieldId) return err('A field is required.');
      App.store._commit(function (p) {
        var b = bag(p);
        b.meta = b.meta || {};
        if (on) delete b.meta[fieldId]; else b.meta[fieldId] = false;
        if (!Object.keys(b.meta).length) delete b.meta;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    // ---- DS-3: custom sections and their parts -------------------------------

    /** @returns {{ok:boolean, id?:string, issues:Issue[]}} */
    function addSection(title, opts) {
      if (!P()) return errNoProject();
      opts = opts || {};
      var id = null;
      App.store._commit(function (p) {
        var b = bag(p);
        b.sections = b.sections || [];
        id = nextId('sec', b.sections);
        b.sections.push({ id: id, title: String(title == null ? '' : title), parts: opts.parts ? JSON.parse(JSON.stringify(opts.parts)) : [] });
        // A new section lands at the END of the document, so it has to be named in
        // the order explicitly — an order that does not mention it would float it to
        // the end anyway, but only until something else is reordered.
        if (Array.isArray(b.order) && b.order.length && b.order.indexOf(id) === -1) b.order.push(id);
      });
      return { ok: true, id: id, issues: [] };
    }

    function updateSection(id, fields) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), id);
      if (!s0) return err('Unknown section.', id);
      App.store._commit(function (p) {
        var s = findSection(p, id);
        if (fields.title !== undefined) s.title = String(fields.title == null ? '' : fields.title);
      });
      return ok();
    }

    function removeSection(id) {
      if (!P()) return errNoProject();
      App.store._commit(function (p) {
        var b = bag(p);
        b.sections = (b.sections || []).filter(function (s) { return s.id !== id; });
        if (!b.sections.length) delete b.sections;
        // Everything keyed by block id goes with the block, or a deleted section would
        // leave a name and an introduction behind for an id nothing can reach.
        ['levels', 'centred', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
          'tables', 'pageBreak', 'noToc', 'space'].forEach(function (k) {
          if (!b[k]) return;
          delete b[k][id];
          if (!Object.keys(b[k]).length) delete b[k];
        });
        if (Array.isArray(b.order)) b.order = b.order.filter(function (x) { return x !== id; });
        if (Array.isArray(b.order) && !b.order.length) delete b.order;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /** A new part of the given kind, with the empty shape that kind needs. */
    function blankPart(kind, id) {
      if (kind === 'table') {
        return { id: id, kind: 'table', caption: '', centre: false, align: ['l', 'l'], header: ['Column 1', 'Column 2'], rows: [['', '']] };
      }
      if (kind === 'rule') return { id: id, kind: 'rule' };
      if (kind === 'pagebreak') return { id: id, kind: 'pagebreak' };
      // SPC-1: 10mm is about four blank lines at 11pt — visibly a gap, and small enough
      // that a part added by accident does not throw the page out.
      if (kind === 'space') return { id: id, kind: 'space', height: DEFAULT_SPACE_MM };
      return { id: id, kind: 'para', text: '', centre: false };
    }

    /** SPC-1: the gap a new Space part starts at, in millimetres. */
    var DEFAULT_SPACE_MM = 10;
    /** SPC-1: the largest gap that is a layout rather than a mistake (App.md clamps too). */
    var MAX_SPACE_MM = 500;

    /**
     * SPC-1: a millimetre figure on its way into the project.
     *
     * The editors are text boxes, so what arrives is a string — and it ends up inside a
     * LaTeX length, which is past the last of this file's escaping. Everything that is
     * not a number in range becomes 0, and 0 is stored as absence.
     * @returns {number} 0 when there is no usable measurement
     */
    function mmValue(v) {
      var n = Number(String(v == null ? '' : v).replace(/\s|mm$/gi, ''));
      if (!isFinite(n) || n <= 0) return 0;
      return Math.round(Math.min(n, MAX_SPACE_MM) * 100) / 100;
    }

    /**
     * @param {string} sectionId @param {'para'|'table'|'rule'|'pagebreak'|'space'} kind
     * @param {number} [at]  insert position; appended when omitted
     */
    function addPart(sectionId, kind, at) {
      if (!P()) return errNoProject();
      if (!findSection(P(), sectionId)) return err('Unknown section.', sectionId);
      if (['para', 'table', 'rule', 'pagebreak', 'space'].indexOf(kind) === -1) return err('Unknown part type "' + kind + '".');
      var id = null;
      App.store._commit(function (p) {
        var s = findSection(p, sectionId);
        s.parts = s.parts || [];
        id = nextId('part', allParts(p));
        var part = blankPart(kind, id);
        if (at === undefined || at === null || at < 0 || at > s.parts.length) s.parts.push(part);
        else s.parts.splice(at, 0, part);
      });
      return { ok: true, id: id, issues: [] };
    }

    function updatePart(sectionId, partId, fields) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), sectionId);
      if (!s0) return err('Unknown section.', sectionId);
      if (!(s0.parts || []).some(function (x) { return x.id === partId; })) return err('Unknown part.', partId);
      App.store._commit(function (p) {
        var part = findSection(p, sectionId).parts.filter(function (x) { return x.id === partId; })[0];
        Object.keys(fields || {}).forEach(function (k) {
          if (k === 'id' || k === 'kind') return;             // identity is not editable
          // SPC-1: the two measurements are sanitised HERE rather than at the point of
          // use, because this is where a text box's contents enter the project — and
          // they leave it as a LaTeX length. Zero is no measurement, so it is absence.
          if (k === 'height' || k === 'rowHeight') {
            var mm = mmValue(fields[k]);
            if (mm > 0) part[k] = mm; else delete part[k];
            return;
          }
          part[k] = fields[k];
        });
      });
      return ok();
    }

    function removePart(sectionId, partId) {
      if (!P()) return errNoProject();
      if (!findSection(P(), sectionId)) return err('Unknown section.', sectionId);
      App.store._commit(function (p) {
        var s = findSection(p, sectionId);
        s.parts = (s.parts || []).filter(function (x) { return x.id !== partId; });
      });
      return ok();
    }

    /**
     * Reorder parts within a section: by one step, or before a named part (drag).
     * @param {number} delta  -1 / +1, ignored when beforeId is given
     */
    function movePart(sectionId, partId, delta, beforeId) {
      if (!P()) return errNoProject();
      var s0 = findSection(P(), sectionId);
      if (!s0) return err('Unknown section.', sectionId);
      App.store._commit(function (p) {
        var s = findSection(p, sectionId), parts = s.parts || [];
        var from = parts.map(function (x) { return x.id; }).indexOf(partId);
        if (from === -1) return;
        var moved = parts.splice(from, 1)[0], to;
        if (beforeId != null) {
          var at = parts.map(function (x) { return x.id; }).indexOf(beforeId);
          to = at === -1 ? parts.length : at;
        } else {
          to = from + delta;
          if (to < 0) to = 0;
          if (to > parts.length) to = parts.length;
        }
        parts.splice(to, 0, moved);
      });
      return ok();
    }

    // ---- DS-4: table editing -------------------------------------------------

    /** Read a part out of the live project (helper for the table ops below). */
    function part(p, sectionId, partId) {
      var s = findSection(p, sectionId);
      return s ? (s.parts || []).filter(function (x) { return x.id === partId; })[0] : null;
    }

    /** Set one cell. `row === -1` addresses the header. */
    function setCell(sectionId, partId, row, col, value) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.store._commit(function (p) {
        var t = part(p, sectionId, partId);
        var v = String(value == null ? '' : value);
        if (row === -1) { t.header[col] = v; return; }
        while (t.rows.length <= row) t.rows.push(t.header.map(function () { return ''; }));
        while (t.rows[row].length < t.header.length) t.rows[row].push('');
        t.rows[row][col] = v;
      });
      return ok();
    }

    function addRow(sectionId, partId, at) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.store._commit(function (p) {
        var t = part(p, sectionId, partId);
        var blank = t.header.map(function () { return ''; });
        var i = (at === undefined || at === null || at < 0 || at > t.rows.length) ? t.rows.length : at;
        t.rows.splice(i, 0, blank);
        // SPC-1: the tick list travels WITH the rows, for the same reason the widths
        // travel with the columns — a list that is not one-per-row is meaningless, and
        // the schema rejects it. A new row is tall, because a table that asked for the
        // height asked for it as its shape.
        if (Array.isArray(t.tallRows)) t.tallRows.splice(i, 0, true);
      });
      return ok();
    }
    function removeRow(sectionId, partId, at) {
      if (!P()) return errNoProject();
      App.store._commit(function (p) {
        var t = part(p, sectionId, partId);
        if (t && t.rows && at >= 0 && at < t.rows.length) {
          t.rows.splice(at, 1);
          if (Array.isArray(t.tallRows)) t.tallRows.splice(at, 1);   // SPC-1
        }
      });
      return ok();
    }

    /**
     * SPC-1: whether ONE row takes the table's extra height.
     *
     * Stored as the deviation: no list at all means every row, which is what a height on
     * its own has always meant and what a project written before the ticks says. The list
     * appears the moment a row is unticked and disappears again when they are all back
     * on, so a table fiddled with and put back serialises as one that never was (DOD-7).
     */
    function setRowTall(sectionId, partId, at, on) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      if (!(at >= 0 && at < (t0.rows || []).length)) return err('Unknown row.', String(at));
      App.store._commit(function (p) {
        var t = part(p, sectionId, partId);
        var list = (Array.isArray(t.tallRows) && t.tallRows.length === t.rows.length)
          ? t.tallRows.map(function (v) { return v !== false; })
          : t.rows.map(function () { return true; });
        list[at] = !!on;
        if (list.every(Boolean)) delete t.tallRows; else t.tallRows = list;
      });
      return ok();
    }

    /** SPC-1: does this row take the extra height? Absent list ⇒ yes, as for every row. */
    function rowTall(table, at) {
      if (!table || !Array.isArray(table.tallRows) || table.tallRows.length !== (table.rows || []).length) return true;
      return table.tallRows[at] !== false;
    }
    /* TW-1: widths travel WITH the columns.
     *
     * A widths array that is not exactly one-per-column is meaningless, and the schema
     * rejects it — so adding or removing a column has to keep the array in step in the
     * same commit, exactly as `align` already does. On removal the freed share is given
     * back to the survivors in proportion, which is the only redistribution that leaves
     * a table looking like the one the author laid out. A table that never had widths
     * stays without them: auto is a real state, not a missing one. */

    /* TW-1/TW-3: a width is a share OF THE PAGE, and the shares need not fill it.
     *
     * Three columns at 20% each is a table 60% of the text width, not three equal
     * columns stretched across it. So the total is meaningful in its own right, and the
     * two ways of setting a width differ in exactly what they do to it:
     *
     *   DRAG moves a boundary. The columns either side share a fixed total, so one
     *   growing means the others giving way — the table stays the width it was, which
     *   is the only thing a boundary you moved with a mouse can mean.
     *
     *   TYPING sets one column outright and leaves the others alone, so it is what
     *   changes the total: three columns typed to 20% make the table narrower, and a
     *   60% beside a 50% asks for more page than there is and is flagged in red.
     *
     * A column is never below MIN_WIDTH: at zero it is not a column, and there is no
     * edge left to drag it back by.
     */
    var MIN_WIDTH = 0.05;

    /** Rescale so the array sums to 1. `[]` in, `[]` out. */
    function renormalise(ws) {
      var sum = ws.reduce(function (a, w) { return a + (w > 0 ? w : 0); }, 0);
      if (!ws.length) return ws;
      if (sum <= 0) return ws.map(function () { return 1 / ws.length; });
      return ws.map(function (w) { return (w > 0 ? w : 0) / sum; });
    }

    /** An even set, the starting point for a table that has no widths yet. */
    function evenWidths(n) {
      var out = [];
      for (var i = 0; i < n; i++) out.push(1 / n);
      return out;
    }

    /**
     * The new width array after setting column `col`.
     * @param {number[]} cur  the current widths (already one-per-column)
     * @param {number} col @param {number} f  the wanted share
     * @param {boolean} exact  true = typed (others untouched); false = dragged
     */
    function applyWidth(cur, col, f, exact) {
      var n = cur.length;
      if (exact) {
        var out = cur.slice();
        // A typed value is capped at the whole table: "120%" is not a share of anything.
        out[col] = Math.max(MIN_WIDTH, Math.min(1, f));
        return out;
      }
      // `f` is a share of the PAGE, because that is what both editors are drawn at —
      // which is what lets the strip show a 60% table as filling 60% of its width and
      // still have the drag land where the pointer did.
      var total = cur.reduce(function (a, w) { return a + w; }, 0) || 1;
      var most = Math.max(MIN_WIDTH, total - MIN_WIDTH * (n - 1));
      var want = Math.max(MIN_WIDTH, Math.min(most, f));
      var others = total - cur[col];
      var room = total - want;
      return cur.map(function (w, i) {
        if (i === col) return want;
        // Nothing left over anywhere: an even split of what remains, rather than a
        // division by zero writing NaN into the project.
        var share = others > 0 ? (w / others) * room : room / (n - 1);
        return Math.max(Math.min(MIN_WIDTH, room / (n - 1)), share);
      });
    }

