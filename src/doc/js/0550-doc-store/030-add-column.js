    function addColumn(sectionId, partId) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var n = t.header.length;
        t.header.push('Column ' + (n + 1));
        t.align.push('l');
        t.rows.forEach(function (r) { r.push(''); });
        if (Array.isArray(t.widths) && t.widths.length === n) {
          // The newcomer takes an equal share of the widened table, and the others are
          // squeezed in proportion — nobody's relative width changes.
          var share = 1 / (n + 1), keep = 1 - share;
          t.widths = renormalise(t.widths).map(function (w) { return w * keep; }).concat([share]);
        }
      });
      return ok();
    }
    function removeColumn(sectionId, partId, at) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        // A table with no columns cannot render, so the last one is not removable.
        if (!t || !t.header || t.header.length <= 1 || at < 0 || at >= t.header.length) return;
        var had = Array.isArray(t.widths) && t.widths.length === t.header.length;
        t.header.splice(at, 1);
        t.align.splice(at, 1);
        t.rows.forEach(function (r) { r.splice(at, 1); });
        if (had) { t.widths.splice(at, 1); t.widths = renormalise(t.widths); }
      });
      return ok();
    }

    /**
     * TW-1: set one column's width on a HAND-AUTHORED table.
     * @param {string} sectionId @param {string} partId @param {number} col
     * @param {number} fraction  a share of the table, 0 < f <= 1
     * @param {boolean} [exact]  true when typed rather than dragged (see applyWidth)
     */
    function setWidth(sectionId, partId, col, fraction, exact) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      var n = (t0.header || []).length;
      if (n < 2) return err('A one-column table has no width to set.', partId);
      if (!(col >= 0 && col < n)) return err('No such column.', partId);
      var f = Number(fraction);
      if (!isFinite(f)) return err('A column width must be a number.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        var cur = (Array.isArray(t.widths) && t.widths.length === n) ? t.widths.slice() : evenWidths(n);
        t.widths = applyWidth(cur, col, f, exact === true);
      });
      return ok();
    }

    /** TW-1: hand a table back to automatic column widths. */
    function clearWidths(sectionId, partId) {
      if (!P()) return errNoProject();
      var t0 = part(P(), sectionId, partId);
      if (!t0 || t0.kind !== 'table') return err('Unknown table.', partId);
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        delete t.widths;
      });
      return ok();
    }

    /**
     * TW-2: the same, for a GENERATED section's table.
     *
     * Keyed by block id rather than by part, because a generated section has no parts —
     * and because a register split into groups produces several tables of the same
     * columns, which should all be the width the operator set once.
     *
     * The column COUNT has to be passed in: it depends on the platform's adapter and on
     * which optional columns are switched on, neither of which this module knows. A
     * stored set whose length no longer matches is simply replaced, which is the right
     * answer — widths for four columns mean nothing to a table that now has three.
     *
     * @param {string} blockId @param {number} count  columns the table has now
     * @param {number} col @param {number} fraction @param {boolean} [exact]
     */
    function setBlockWidth(blockId, count, col, fraction, exact) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var n = Number(count) | 0;
      if (n < 2) return err('A one-column table has no width to set.', blockId);
      if (!(col >= 0 && col < n)) return err('No such column.', blockId);
      var f = Number(fraction);
      if (!isFinite(f)) return err('A column width must be a number.', blockId);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tableWidths = b.tableWidths || {};
        var stored = b.tableWidths[blockId];
        var cur = (Array.isArray(stored) && stored.length === n) ? stored.slice() : evenWidths(n);
        b.tableWidths[blockId] = applyWidth(cur, col, f, exact === true);
      });
      return ok();
    }

    /** TW-2: hand a generated section's table back to automatic widths. */
    function clearBlockWidths(blockId) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (!b.tableWidths) return;
        delete b.tableWidths[blockId];
        if (!Object.keys(b.tableWidths).length) delete b.tableWidths;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * TW-1/TW-2: what a set of widths adds up to, and whether that is a problem.
     * One place, so the two editors cannot disagree about when to show the red flag.
     * @returns {{total:number, over:boolean, under:boolean, ok:boolean}} total as a percentage
     */
    function widthTotal(ws) {
      var sum = (ws || []).reduce(function (a, w) { return a + (Number(w) > 0 ? Number(w) : 0); }, 0);
      var pct = Math.round(sum * 1000) / 10;
      // Half a percent of slack: the widths come from dividing pixels by pixels, and
      // flagging 99.9% would make the warning meaningless.
      return { total: pct, over: pct > 100.5, under: pct < 99.5, ok: pct >= 99.5 && pct <= 100.5 };
    }

    /** Column alignment: 'l' | 'c' | 'r'. */
    function setAlign(sectionId, partId, col, value) {
      if (!P()) return errNoProject();
      if (['l', 'c', 'r'].indexOf(value) === -1) return err('Alignment must be l, c or r.');
      App.docHost.get().commit(function (p) {
        var t = part(p, sectionId, partId);
        if (t && t.align) t.align[col] = value;
      });
      return ok();
    }

    // ---- DS-5: formatting profiles -------------------------------------------

    function addFormat(name, from) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A formatting profile needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.formats = b.formats || [];
        id = nextId('fmt', b.formats);
        var base = App.docFormat.normalise(from || App.docFormat.standard());
        delete base.builtin;                        // a copy of the built-in is not the built-in
        base.id = id;
        base.name = String(name).trim();
        b.formats.push(base);
      });
      return { ok: true, id: id, issues: [] };
    }

    /** Patch a saved profile. The built-in is not editable — the UI duplicates it
     *  first — so an attempt to write to it is refused rather than silently ignored. */
    function updateFormat(id, patch) {
      if (!P()) return errNoProject();
      if (id === 'standard') return err('The Standard profile cannot be edited. Duplicate it first.');
      var found = ((P().report && P().report.formats) || []).some(function (f) { return f.id === id; });
      if (!found) return err('Unknown formatting profile.', id);
      App.docHost.get().commit(function (p) {
        var f = p.report.formats.filter(function (x) { return x.id === id; })[0];
        var merged = App.docFormat.normalise(Object.assign({}, f, patch || {}));
        delete merged.builtin;
        merged.id = id;
        p.report.formats = p.report.formats.map(function (x) { return x.id === id ? merged : x; });
      });
      return ok();
    }

    function removeFormat(id) {
      if (!P()) return errNoProject();
      if (id === 'standard') return err('The Standard profile cannot be removed.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.formats = (b.formats || []).filter(function (f) { return f.id !== id; });
        if (!b.formats.length) delete b.formats;
        // Deleting the profile in use falls back to the built-in rather than leaving
        // the project pointing at nothing.
        if (b.formatId === id) delete b.formatId;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    function setFormatId(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (!id || id === 'standard') delete b.formatId; else b.formatId = String(id);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    // ---- DS-6: section templates and report templates -------------------------

    /**
     * Save a section's shape (its title and every part) as a reusable template.
     * Part ids are re-minted when the template is USED, not when it is saved, so two
     * sections created from one template never share a table id — which would make a
     * cross-reference ambiguous.
     */
    function saveSectionTemplate(sectionId, name) {
      if (!P()) return errNoProject();
      var s = findSection(P(), sectionId);
      if (!s) return err('Unknown section.', sectionId);
      if (!String(name || '').trim()) return err('A section template needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sectionTemplates = b.sectionTemplates || [];
        id = nextId('tpl', b.sectionTemplates);
        var src = findSection(p, sectionId);
        b.sectionTemplates.push({
          id: id, name: String(name).trim(),
          title: src.title || '',
          parts: JSON.parse(JSON.stringify(src.parts || []))
        });
      });
      return { ok: true, id: id, issues: [] };
    }

    function removeSectionTemplate(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sectionTemplates = (b.sectionTemplates || []).filter(function (t) { return t.id !== id; });
        if (!b.sectionTemplates.length) delete b.sectionTemplates;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /** Create a new section from a template, with fresh part ids. */
    function useSectionTemplate(templateId) {
      if (!P()) return errNoProject();
      var t = ((P().report && P().report.sectionTemplates) || []).filter(function (x) { return x.id === templateId; })[0];
      if (!t) return err('Unknown section template.', templateId);
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.sections = b.sections || [];
        id = nextId('sec', b.sections);
        var used = allParts(p), parts = [];
        (t.parts || []).forEach(function (src) {
          var copy = JSON.parse(JSON.stringify(src));
          copy.id = nextId('part', used);
          used.push(copy);
          parts.push(copy);
        });
        b.sections.push({ id: id, title: t.title || '', parts: parts });
        if (Array.isArray(b.order) && b.order.length && b.order.indexOf(id) === -1) b.order.push(id);
      });
      return { ok: true, id: id, issues: [] };
    }

    /**
     * A whole report template: the arrangement, the levels, every custom section and
     * the formatting profile in force — everything the designer decides, in one
     * named thing that can be applied to another project.
     */
    function saveReportTemplate(name) {
      if (!P()) return errNoProject();
      if (!String(name || '').trim()) return err('A report template needs a name.');
      var id = null;
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.reportTemplates = b.reportTemplates || [];
        id = nextId('rpt', b.reportTemplates);
        b.reportTemplates.push({
          id: id, name: String(name).trim(),
          order: (b.order || []).slice(),
          levels: JSON.parse(JSON.stringify(b.levels || {})),
          centred: JSON.parse(JSON.stringify(b.centred || {})),
          meta: JSON.parse(JSON.stringify(b.meta || {})),
          // NAM-1/SEC-1/TBS-1 are part of the DESIGN, so a template that left them
          // behind would only be half the arrangement it claims to save.
          names: JSON.parse(JSON.stringify(b.names || {})),
          headings: JSON.parse(JSON.stringify(b.headings || {})),
          intros: JSON.parse(JSON.stringify(b.intros || {})),
          introNumbered: JSON.parse(JSON.stringify(b.introNumbered || {})),
          tableStyles: JSON.parse(JSON.stringify(b.tableStyles || {})),
          tableWidths: JSON.parse(JSON.stringify(b.tableWidths || {})),
          // TBL-1/SEC-4: the wording of each generated table, which sections start a
          // page, and which are kept out of the contents list — all design decisions.
          tables: JSON.parse(JSON.stringify(b.tables || {})),
          pageBreak: JSON.parse(JSON.stringify(b.pageBreak || {})),
          noToc: JSON.parse(JSON.stringify(b.noToc || {})),
          // SPC-1: how far down the page each section starts is an arrangement decision
          // like the page break beside it, so it travels with the template too.
          space: JSON.parse(JSON.stringify(b.space || {})),
          sections: JSON.parse(JSON.stringify(b.sections || [])),
          format: JSON.parse(JSON.stringify(App.docFormat.resolve(p)))
        });
      });
      return { ok: true, id: id, issues: [] };
    }

    function removeReportTemplate(id) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.reportTemplates = (b.reportTemplates || []).filter(function (t) { return t.id !== id; });
        if (!b.reportTemplates.length) delete b.reportTemplates;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * Apply a report template: REPLACES the arrangement, the levels and the custom
     * sections wholesale, and installs its formatting profile as a saved profile.
     * Destructive by design — "apply this template" means "make the document look
     * like that" — so the UI confirms first and the whole thing is one undo step.
     */
    function useReportTemplate(id) {
      if (!P()) return errNoProject();
      var t = ((P().report && P().report.reportTemplates) || []).filter(function (x) { return x.id === id; })[0];
      if (!t) return err('Unknown report template.', id);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.order = (t.order || []).slice();
        b.levels = JSON.parse(JSON.stringify(t.levels || {}));
        b.centred = JSON.parse(JSON.stringify(t.centred || {}));
        b.meta = JSON.parse(JSON.stringify(t.meta || {}));
        b.names = JSON.parse(JSON.stringify(t.names || {}));
        b.headings = JSON.parse(JSON.stringify(t.headings || {}));
        b.intros = JSON.parse(JSON.stringify(t.intros || {}));
        b.introNumbered = JSON.parse(JSON.stringify(t.introNumbered || {}));
        b.tableStyles = JSON.parse(JSON.stringify(t.tableStyles || {}));
        b.tableWidths = JSON.parse(JSON.stringify(t.tableWidths || {}));
        b.tables = JSON.parse(JSON.stringify(t.tables || {}));
        b.pageBreak = JSON.parse(JSON.stringify(t.pageBreak || {}));
        b.noToc = JSON.parse(JSON.stringify(t.noToc || {}));
        b.space = JSON.parse(JSON.stringify(t.space || {}));
        b.sections = JSON.parse(JSON.stringify(t.sections || []));
        if (!b.order.length) delete b.order;
        if (!b.sections.length) delete b.sections;
        ['levels', 'centred', 'meta', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
          'tables', 'pageBreak', 'noToc', 'space'].forEach(function (k) {
          if (!Object.keys(b[k]).length) delete b[k];
        });
        if (t.format) {
          var f = App.docFormat.normalise(t.format);
          delete f.builtin;
          if (f.id === 'standard') { f.id = nextId('fmt', b.formats || []); f.name = t.name + ' formatting'; }
          b.formats = (b.formats || []).filter(function (x) { return x.id !== f.id; }).concat([f]);
          b.formatId = f.id;
        }
      });
      return ok();
    }

