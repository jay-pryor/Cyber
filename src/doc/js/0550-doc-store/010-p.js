  /* =============================================================================
   * MODULE: App.docStore  — DS-1..DS-6: the Report Design mutators
   * PURPOSE: Every write the Report Design workspace makes to the project — heading
   *          levels, custom sections and their parts, formatting profiles, section
   *          templates, report templates. Kept out of App.store because none of it
   *          touches the register, the devices or the controls; it is document
   *          composition, and App.store is already the largest module in the file.
   * PURITY:  NOT pure (mutates the project) — but every id it mints is DERIVED, never
   *          random, so the same sequence of edits produces the same project bytes.
   * DEPENDS: App.docHost (getState/commit), App.docFormat
   * INVARIANTS: ids are stable for the life of the thing they name — renaming a
   *             section or reordering the document never re-mints one, because
   *             cross-references (DOC-3) are stored against exactly those ids.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* The project, read through the host — never off a store this module knows the
     * name of. Everything below runs against whatever the host handed over. */
    function P() { return App.docHost.get().getState(); }
    function errNoProject() { return { ok: false, issues: [{ category: 'state', severity: 'error', message: 'No project loaded.' }] }; }
    function err(msg, loc) { return { ok: false, issues: [{ category: 'validation', severity: 'error', message: msg, location: loc }] }; }
    function ok() { return { ok: true, issues: [] }; }

    /** The `report` sub-object, created on demand. Callers run inside _commit. */
    function bag(p) { p.report = p.report || {}; return p.report; }

    /**
     * DS-1: mint the next id in a family.
     *
     * Deterministic by construction — the next free integer suffix, not a random or
     * clock-derived value. Two operators performing the same edits on the same
     * project get the same ids, which is what keeps the project file byte-stable
     * (DOD-7) and makes a cross-reference portable between their two copies.
     */
    function nextId(prefix, existing) {
      var max = 0;
      (existing || []).forEach(function (x) {
        var m = /(\d+)$/.exec(String((x && x.id) || x));
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return prefix + (max + 1);
    }

    /** Every part id currently in use, across every section AND every template —
     *  a part id must be unique document-wide or a table reference could aim at two. */
    function allParts(p) {
      var out = [];
      ((p.report && p.report.sections) || []).forEach(function (s) { out = out.concat(s.parts || []); });
      ((p.report && p.report.sectionTemplates) || []).forEach(function (t) { out = out.concat(t.parts || []); });
      return out;
    }

    function findSection(p, id) {
      return ((p.report && p.report.sections) || []).filter(function (s) { return s.id === id; })[0] || null;
    }

    /**
     * RPT-3: the order the sections are emitted in — block ids first, everything
     * unnamed keeping its declared position behind them.
     *
     * An EMPTY list is the reset: it deletes the key rather than storing `[]`, so a
     * project that was never reordered and one that was reordered back are the same
     * bytes (DOD-7).
     */
    function setReportOrder(order) {
      if (!P()) return errNoProject();
      var ids = (order || []).map(String);
      App.docHost.get().commit(function (p) {
        bag(p).order = ids;
        if (!ids.length) delete p.report.order;
        if (!Object.keys(p.report).length) delete p.report;
      });
      return ok();
    }

    // ---- DS-2: heading levels ------------------------------------------------

    /**
     * Pin a block to a heading level, or hand it back to the automatic rule.
     * @param {string} blockId  any block id — a built-in section or a custom one
     * @param {?number} level   1..5, or null/'' to return to automatic
     */
    function setBlockLevel(blockId, level) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var lv = (level === null || level === undefined || level === '') ? null : Number(level);
      if (lv !== null && [App.doc.TITLE_LEVEL, 1, 2, 3, 4, App.doc.BODY_LEVEL].indexOf(lv) === -1) {
        return err('Heading level must be 1-4, 5 for normal text, or 0 for an unnumbered title.');
      }
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.levels = b.levels || {};
        // Automatic is the ABSENT state rather than a stored null, so a section that
        // was never touched and one handed back to automatic serialise identically.
        if (lv === null) delete b.levels[blockId]; else b.levels[blockId] = lv;
        if (!Object.keys(b.levels).length) delete b.levels;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * Centre a whole section's body. Absent means "not centred", so a section that was
     * centred and un-centred leaves no trace in the file (DOD-7).
     */
    function setBlockCentre(blockId, on) { return setBlockFlag('centred', blockId, on); }

    /**
     * A per-section boolean, stored as PRESENCE. Off leaves no trace in the file, so a
     * section that was switched on and off again serialises exactly as one that never
     * was (DOD-7) — the rule every block-keyed field here follows.
     *
     * SEC-4 added two more of these (`pageBreak`, `noToc`) to the one that existed
     * (`centred`), which is what turned three copies of the same eight lines into one.
     * @param {'centred'|'pageBreak'|'noToc'} bagKey
     */
    var BLOCK_FLAGS = ['centred', 'pageBreak', 'noToc'];
    function setBlockFlag(bagKey, blockId, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      if (BLOCK_FLAGS.indexOf(bagKey) === -1) return err('Unknown section flag "' + bagKey + '".');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b[bagKey] = b[bagKey] || {};
        if (on) b[bagKey][blockId] = true; else delete b[bagKey][blockId];
        if (!Object.keys(b[bagKey]).length) delete b[bagKey];
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * SPC-1: how far down the page a section's HEADING starts, in millimetres.
     *
     * A number, so it is not one of BLOCK_FLAGS — but it follows the same presence rule:
     * zero is stored as absence, so a gap that was set and cleared leaves the project
     * exactly as it found it (DOD-7).
     *
     * Above the heading rather than below it, which is the whole reason it cannot be a
     * Space part: a signature page wants its heading two thirds of the way down, and
     * every part a section has is already underneath that heading.
     */
    function setBlockSpace(blockId, mm) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var v = mmValue(mm);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.space = b.space || {};
        if (v > 0) b.space[blockId] = v; else delete b.space[blockId];
        if (!Object.keys(b.space).length) delete b.space;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * TTL-2: whether the document opens with the automatic title block — the report
     * title, the model-and-firmware line and the date, printed by pandoc's \maketitle
     * ahead of everything the designer arranged.
     *
     * A DESIGN decision, not a session one: someone who composes their own title page
     * would otherwise have to switch this off again every time the app is opened. Off
     * is stored as absence, so a project that never wanted one carries no trace of it.
     */
    function setTitleBlock(on) { return setReportSwitch('titleBlock', on); }

    /**
     * CLS-1: whether the report carries the OFFICIAL: Sensitive banner on every page.
     *
     * It used to live in the session block with the filename and the `/[Tag]` values, on
     * the reasoning that it was an answer for one run. It is not: the sensitivity of what
     * a report contains is a property of the report, and a house that classifies one
     * classifies all of them — so re-ticking it every time the tool was opened was work
     * with no decision in it, and a document issued from an unticked session went out
     * unmarked. Stored beside the title block, and on the same presence rule.
     */
    function setClassification(on) { return setReportSwitch('classification', on); }

    /** The shape both of the above share: a document-level switch, stored as presence. */
    function setReportSwitch(key, on) {
      if (!P()) return errNoProject();
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        if (on) b[key] = true; else delete b[key];
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * NAM-1: the name the designer's section list calls a block, when that is not the
     * same string as the heading the document prints. Blank hands it back to the
     * heading, and is stored as absence so a named-then-unnamed section leaves no trace.
     */
    function setBlockName(blockId, name) {
      return setBlockText('names', blockId, name);
    }

    /**
     * SEC-1: prose that sits between a generated section's heading and its table.
     * Same rich-text token markup a custom paragraph uses (App.md.rich), so the one
     * editor and the one escaping discipline serve both.
     */
    function setBlockIntro(blockId, text) {
      return setBlockText('intros', blockId, text);
    }

    /**
     * SEC-2: whether a section's introduction takes a number of its own.
     *
     * It takes the FIRST of the section's child numbers, so a register's groups shift
     * down to make room — 5 Packages, 5.1 the introduction, 5.2 Removed. Off is the
     * absent state, so a numbered-then-unnumbered introduction leaves no trace.
     */
    function setBlockIntroNumbered(blockId, on) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.introNumbered = b.introNumbered || {};
        if (on) b.introNumbered[blockId] = true; else delete b.introNumbered[blockId];
        if (!Object.keys(b.introNumbered).length) delete b.introNumbered;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * NAM-2: the heading a GENERATED section prints, when the platform's own label is
     * not the wording this house uses. Blank hands it back to the label, so a reworded
     * and then blanked heading leaves no trace in the file.
     *
     * Hand-authored sections are not covered here on purpose: they already own their
     * heading as `title`, and two places to set one thing is how they end up disagreeing.
     */
    function setBlockHeading(blockId, heading) {
      return setBlockText('headings', blockId, heading);
    }

    function setBlockText(bagKey, blockId, value) {
      if (!P()) return errNoProject();
      if (!blockId) return err('A section is required.');
      var v = String(value == null ? '' : value);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b[bagKey] = b[bagKey] || {};
        if (v.trim()) b[bagKey][blockId] = v; else delete b[bagKey][blockId];
        if (!Object.keys(b[bagKey]).length) delete b[bagKey];
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /* TBL-1: the wording of ONE of a section's generated tables.
     *
     * A grouped register produces several tables from one block, and they used to be
     * distinguished by a sub-heading carrying the group's declared name. With those gone
     * the operator names each table instead — a title row above it, a caption under it,
     * and a heading per column, because the same column carries different content in
     * each of them ("Package" in one, "Package removed" in another).
     *
     * Keyed `report.tables[blockId][tableKey]`, where tableKey is the group value or
     * `_all` for a section that produces a single table. Blank is stored as ABSENCE at
     * every level, so a table that was named and then un-named leaves no trace in the
     * file (DOD-7), exactly as the heading and name fields do.
     */
    function pruneTables(b, blockId, key) {
      var byBlock = b.tables && b.tables[blockId];
      if (!byBlock) return;
      var e = byBlock[key];
      if (e && e.columns && !Object.keys(e.columns).length) delete e.columns;
      if (e && !Object.keys(e).length) delete byBlock[key];
      if (!Object.keys(byBlock).length) delete b.tables[blockId];
      if (b.tables && !Object.keys(b.tables).length) delete b.tables;
    }

    /** @param {'title'|'caption'} field */
    function setTableText(blockId, tableKey, field, value) {
      if (!P()) return errNoProject();
      if (!blockId || !tableKey) return err('A table is required.');
      if (field !== 'title' && field !== 'caption') return err('A table carries a "title" or a "caption".');
      var v = String(value == null ? '' : value);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tables = b.tables || {};
        var byBlock = b.tables[blockId] = b.tables[blockId] || {};
        var e = byBlock[tableKey] = byBlock[tableKey] || {};
        if (v.trim()) e[field] = v; else delete e[field];
        pruneTables(b, blockId, tableKey);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /**
     * CAP-4: whether one of a section's tables prints a caption at all.
     *
     * Stored beside the wording, because it is the same decision one step further: a
     * caption you did not write, then a caption you do not want. An uncaptioned table
     * is also left out of the NUMBERING (see App.doc.tableIndex), so the numbers a
     * reader counts and the numbers a cross-reference names stay the same numbers.
     * @param {string} blockId @param {string} tableKey @param {boolean} off
     */
    function setTableNoCaption(blockId, tableKey, off) {
      if (!P()) return errNoProject();
      if (!blockId || !tableKey) return err('A table is required.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tables = b.tables || {};
        var byBlock = b.tables[blockId] = b.tables[blockId] || {};
        var e = byBlock[tableKey] = byBlock[tableKey] || {};
        if (off) e.noCaption = true; else delete e.noCaption;
        pruneTables(b, blockId, tableKey);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /** TBL-1: one column's heading on one of a section's tables. Blank = the adapter's. */
    function setTableColumnLabel(blockId, tableKey, colId, label) {
      if (!P()) return errNoProject();
      if (!blockId || !tableKey || !colId) return err('A table column is required.');
      var v = String(label == null ? '' : label);
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        b.tables = b.tables || {};
        var byBlock = b.tables[blockId] = b.tables[blockId] || {};
        var e = byBlock[tableKey] = byBlock[tableKey] || {};
        e.columns = e.columns || {};
        if (v.trim()) e.columns[colId] = v; else delete e.columns[colId];
        pruneTables(b, blockId, tableKey);
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

    /* -------------------------------------------------------------------------
     * OPT-2: what the report is MADE OF now lives in the project.
     *
     * Which sections are in, which groups of a register are in, which optional columns
     * each of them carries and which Security Relevance categories are reported were
     * session state — the same footing as "make the scripts .txt". That was wrong about
     * what they are. A report that carries Rationale but not Rollback, and reports
     * everything but the parked items, is a decision about the DOCUMENT, made once and
     * lived with; losing it on reload meant re-making it on every run, and it never
     * reached the operator on the other end of the file at all.
     *
     * Stored as DEVIATIONS from the default rather than as a full picture, which is what
     * keeps the file byte-stable (DOD-7): a project that has never opened the workspace
     * carries nothing, and one that switched a column on and off again carries nothing
     * either. The default itself is not stored, because it is not the operator's — it is
     * the column's declaration (COL-3) or the vocabulary's.
     *
     * `filename` and the `/[Tag]` values stay in the session, deliberately: they are
     * answers for THIS run, and the point of a tag is that the same design produces a
     * different document each time.
     *
     * @param {'sections'|'datasetSections'|'columns'|'relevance'} map
     * @param {string} key      section id / dataset id / relevance value
     * @param {?string} subKey  group value or column id, for the two nested maps
     * @param {boolean} on      included?
     * @param {boolean} dflt    what "not stored" means for this one
     */
    var INCLUDE_MAPS = ['sections', 'datasetSections', 'columns', 'relevance'];
    function setReportInclude(map, key, subKey, on, dflt) {
      if (!P()) return errNoProject();
      if (INCLUDE_MAPS.indexOf(map) === -1) return err('Unknown report option map "' + map + '".');
      if (!key) return err('A report option needs something to apply to.');
      App.docHost.get().commit(function (p) {
        var b = bag(p);
        var o = b.options = b.options || {};
        var m = o[map] = o[map] || {};
        var holder = m, field = key;
        if (subKey != null) { holder = m[key] = m[key] || {}; field = subKey; }
        if (!!on === (dflt !== false)) delete holder[field]; else holder[field] = !!on;
        // Prune at every level, so switching something back leaves no fingerprint.
        if (subKey != null && !Object.keys(m[key]).length) delete m[key];
        if (!Object.keys(m).length) delete o[map];
        if (!Object.keys(o).length) delete b.options;
        if (!Object.keys(b).length) delete p.report;
      });
      return ok();
    }

