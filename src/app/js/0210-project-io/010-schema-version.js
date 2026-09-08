  /* =============================================================================
   * MODULE: App.projectIo
   * PURPOSE: (De)serialize, schema-validate (Appendix A), and migrate the project
   *          file (spec §6.1, §7, §17.A). Canonical (de)serialization is the basis
   *          of DOD-2 (lossless round-trip) and DOD-7 (determinism).
   * PURITY:  pure
   * DEPENDS: App.util.stable, App.registry (dataset-id cross-checks, gracefully
   *          degraded when the platform is not registered)
   * INVARIANTS:
   *   * serializeProject is canonical: deviceConfigs sorted by (baseId,version),
   *     items arrays sorted by key, controlRefs sorted, object keys sorted, snapshot
   *     keys sorted. => serialize(parse(serialize(p))) === serialize(p).
   *   * parseProject NEVER throws for bad input; it returns located Issues.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* v4 (TW-1): a table part may carry per-column `widths`.
     *
     * Every earlier addition under `report` was made WITHOUT a bump, on the rule that an
     * additive key an older build ignores is not a schema change. A width is different
     * in one respect that matters: it is not decoration the reader can do without, it
     * decides the shape of a table an author laid out deliberately, and a build that
     * silently drops it produces a visibly different document from the same file. So the
     * version states it. The migration itself has nothing to do — absent widths ARE the
     * old behaviour — which is exactly what makes the bump cheap to honour. */
    var SCHEMA_VERSION = 4;
    var TOP_KEYS = ['schemaVersion', 'platformProfileId', 'meta', 'deviceConfigs', 'groups', 'items', 'controls', 'controlTypes', 'controlTags', 'valueFormats',
      // NOTE-1 / PRO-2: both additive and optional — a project saved without them loads
      // unchanged, which is why neither needs a schemaVersion bump (as controlTags).
      // RPT-3: `report` holds the Reporting report's SECTION ORDER, for the same reason
      // `procedure` holds the running order — an arrangement of sections is a decision,
      // and re-making it every session would make the feature not worth using.
      'deviceNotes', 'procedure', 'report'];
    var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
    var SHA_RE = /^[0-9a-f]{64}$/;
    // review-12 #3 / review-14: the Security Relevance vocabulary. '' means "not set"
    // (the column is optional and may be left empty); the options are ordered
    // most→least security-significant.
    var RELEVANCE_OPTIONS = ['HIGH', 'MEDIUM', 'LOW', 'REPORT', 'IRRELEVANT'];
    // REL-1: 'CONTEXT' was the original name for what is now 'LOW'. Projects saved before
    // the rename still carry it, and the vocabulary is a CLOSED one — so an untranslated
    // value would fail validation and the project would refuse to open. The rename is
    // therefore a load-time translation (see renameLegacyRelevance), not a new option.
    // REL-7: 'REPORTING' → 'REPORT' for the same reason and by the same mechanism. The
    // category never meant "this is a reporting activity" — it means "carry this into the
    // report even though it is not a hardening decision", and REPORT says that in the one
    // word that now also names a generator option (see RPT-2 in App.generate).
    var RELEVANCE_RENAMES = { CONTEXT: 'LOW', REPORTING: 'REPORT' };
    var RELEVANCE_VALUES = [''].concat(RELEVANCE_OPTIONS);
    // review-14 / REL-8: the "parked" categories — items carrying one are hidden from the
    // data tables unless its Include toggle is on, so the working view stays on the items
    // that still need a security decision.
    //
    // REPORT used to be parked and no longer is. It means "not a hardening decision, but
    // carry it into the report" — that is a statement about the REPORT, not a reason to
    // hide the item from the person deciding things; and hiding it made an item you had
    // deliberately tagged harder to find than one you had never looked at. IRRELEVANT is
    // the only category that genuinely means "nothing to see here".
    var RELEVANCE_PARKED = ['IRRELEVANT'];
    /* review-12 #1 / EXC-1: per-device control satisfaction states (default =
     * 'unsatisfied'). `exception` is "satisfied, with a documented departure" — the
     * honest answer when a control is met in substance but not in the form the
     * guideline states, and the answer people were previously forced to give as either
     * a false Satisfied or a Unsatisfied that misrepresents the work done. It is a
     * DECIDED state: it does not count towards "controls still unsatisfied", and, like
     * Satisfied, it is flagged when no justification is recorded — more so, since the
     * exception IS the thing the reader needs explained.
     * The array order is also the CYCLE order the UI steps through on each click. */
    var CONTROL_STATES = ['unsatisfied', 'satisfied', 'exception'];
    /** The reader-facing name of a control state. One place, so the report, the Devices
     *  tab and the Control Manager cannot drift. */
    var CONTROL_STATE_LABELS = {
      unsatisfied: 'Unsatisfied', satisfied: 'Satisfied', exception: 'Satisfied with Exception'
    };
    /** Is this state a decision that the control has been dealt with? */
    function controlStateDecided(s) { return s === 'satisfied' || s === 'exception'; }
    function controlStateLabel(s) { return CONTROL_STATE_LABELS[s] || CONTROL_STATE_LABELS.unsatisfied; }
    /** EXC-1: the next state one more click produces — unsatisfied → satisfied →
     *  exception → unsatisfied. */
    function nextControlState(s) {
      // An unrecognised state reads as 'unsatisfied' everywhere else (see
      // store.controlDeviceState), so the next click from it is the same as the next
      // click from Unsatisfied. Anything else would make the cycle depend on damage.
      var i = CONTROL_STATES.indexOf(s);
      return CONTROL_STATES[((i === -1 ? 0 : i) + 1) % CONTROL_STATES.length];
    }
    // VF-3: the built-in value-format ids (see App.valueFormats). Duplicated here as a
    // literal rather than read from that module because projectIo loads BEFORE it and
    // must stay dependency-light; the pair is asserted equal by a self-test.
    var BUILTIN_FORMAT_IDS = ['bool', 'number', 'string', 'stringArray', 'json'];
    var CUSTOM_FORMAT_KINDS = ['options', 'number', 'string', 'stringArray'];

    function issue(severity, message, location, fix) {
      return { category: 'validation', severity: severity, message: message, location: location, fix: fix };
    }
    function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
    function isStringArray(v) { return Array.isArray(v) && v.every(function (x) { return typeof x === 'string'; }); }

    /* v2.2 (Report Design): everything the document designer stores lives under the
     * existing `report` key, so no schemaVersion bump is needed — a project saved by
     * an older build simply has none of it, and one saved by this build loads in an
     * older build minus the design (the section ORDER, which older builds do read,
     * survives either way). Same additive rule as controlTags and valueFormats. */
    var REPORT_KEYS = ['order', 'levels', 'centred', 'meta', 'sections', 'formatId', 'formats', 'sectionTemplates', 'reportTemplates',
      // v2.3: NAM-1 section names, SEC-1 per-section introductions, TBS-1 per-section
      // table styling. All three are keyed by BLOCK ID, so they cover a generated
      // section and a hand-authored one with one shape and no per-kind special case.
      'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
      // TTL-2: whether pandoc's own title block opens the document.
      // CLS-1: and whether it carries the classification banner, which is a decision
      // about the DOCUMENT (a house rule, or the sensitivity of what is in it) rather
      // than an answer for one run — so it is stored beside the title block.
      'titleBlock', 'classification',
      // TBL-1: per-table title rows, captions and column headings, keyed by block id and
      // then by table key. SEC-4: which sections start a page and which are left out of
      // the contents list.
      // OPT-2: which sections, groups, columns and relevance categories the report
      // carries — stored as deviations from the default, so an untouched project has
      // none of it.
      // SPC-1: millimetres of space above a section's heading, keyed by block id. A
      // number rather than a flag, so it does not join BLOCK_FLAGS.
      'tables', 'pageBreak', 'noToc', 'options', 'space'];
    /** OPT-2: the four include-maps, and whether each is keyed one level or two. */
    var REPORT_OPTION_MAPS = { sections: 1, datasetSections: 2, columns: 2, relevance: 1 };

    /**
     * TW-1/TW-2: a column-width array.
     *
     * The widths are relative SHARES, not a partition. Typing 60% into one column and
     * 50% into another is something the designer can do — and is told about, in red —
     * so the total is deliberately NOT constrained to 1 here. What must hold is that
     * each column has one positive share no larger than the whole table; anything else
     * cannot be rendered as a width at all.
     * @returns {boolean} true when it is usable
     */
    function checkWidths(ws, expected, loc, what, issues) {
      if (!Array.isArray(ws) || !ws.length) { issues.push(issue('error', what + ' must be a non-empty array of numbers.', loc)); return false; }
      if (!ws.every(function (w) { return typeof w === 'number' && isFinite(w) && w > 0 && w <= 1; })) {
        issues.push(issue('error', what + ' must be numbers greater than 0 and no more than 1 (a share of the table).', loc));
        return false;
      }
      if (expected != null && ws.length !== expected) {
        issues.push(issue('error', what + ' has ' + ws.length + ' entries for ' + expected + ' columns.', loc,
          'Add or remove a width so there is exactly one per column.'));
        return false;
      }
      return true;
    }
    var PART_KINDS = ['para', 'table', 'rule', 'pagebreak', 'space'];

    /**
     * SPC-1: a millimetre measurement written into the project.
     *
     * Checked here rather than trusted at the point of use, because it is interpolated
     * into LaTeX (App.md.mmLen) where none of this file's escaping reaches. A number, in
     * range, or the field is not there at all.
     * @returns {boolean} true when it is usable
     */
    var MAX_SPACE_MM = 500;
    function checkMm(v, loc, what, issues) {
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > MAX_SPACE_MM) {
        issues.push(issue('error', what + ' must be a number of millimetres between 0 and ' + MAX_SPACE_MM + '.', loc));
        return false;
      }
      return true;
    }

    /** DOC-4: the ordered content parts of a hand-authored section. */
    function validateDocParts(parts, loc, issues) {
      if (parts === undefined) return;
      if (!Array.isArray(parts)) { issues.push(issue('error', 'parts must be an array.', loc + '.parts')); return; }
      parts.forEach(function (pt, i) {
        var l = loc + '.parts[' + i + ']';
        if (!isPlainObject(pt)) { issues.push(issue('error', 'A part must be an object.', l)); return; }
        if (typeof pt.id !== 'string' || !pt.id) issues.push(issue('error', 'A part needs a string id.', l));
        if (PART_KINDS.indexOf(pt.kind) === -1) { issues.push(issue('error', 'Unknown part kind "' + pt.kind + '".', l, 'Expected one of: ' + PART_KINDS.join(', ') + '.')); return; }
        if (pt.kind === 'para' && pt.text !== undefined && typeof pt.text !== 'string') issues.push(issue('error', 'A paragraph\'s text must be a string.', l));
        if (pt.kind === 'table') {
          if (!isStringArray(pt.header) || !pt.header.length) issues.push(issue('error', 'A table needs a non-empty header row of strings.', l));
          if (pt.rows !== undefined && (!Array.isArray(pt.rows) || !pt.rows.every(isStringArray))) issues.push(issue('error', 'A table\'s rows must be arrays of strings.', l));
          if (pt.align !== undefined && !isStringArray(pt.align)) issues.push(issue('error', 'A table\'s align must be an array of l/c/r.', l));
          // TW-1: per-column widths as fractions of the table. Absent means "auto" —
          // the behaviour every project before v4 had — so only a PRESENT array is
          // checked, and it is checked against the header because a width array that
          // does not match the columns cannot be applied to anything.
          if (pt.widths !== undefined) {
            checkWidths(pt.widths, Array.isArray(pt.header) ? pt.header.length : null, l, 'A table\'s widths', issues);
          }
          // TBS-1: whether this table wears the profile's header / first-column style.
          // CAP-4: and whether it prints a caption at all.
          ['styleHead', 'styleFirstColumn', 'noCaption'].forEach(function (k) {
            if (pt[k] !== undefined && typeof pt[k] !== 'boolean') issues.push(issue('error', 'A table\'s ' + k + ' must be true or false.', l));
          });
          // SPC-1: extra millimetres under the ticked body rows.
          if (pt.rowHeight !== undefined) checkMm(pt.rowHeight, l, 'A table\'s rowHeight', issues);
          /* SPC-1: which rows those are — one boolean per row, checked against the rows
           * for the same reason a width array is checked against the columns: a list that
           * does not match cannot be applied to anything. Absent means every row, and an
           * all-true list is therefore a file this build would not have written. */
          if (pt.tallRows !== undefined) {
            if (!Array.isArray(pt.tallRows) || !pt.tallRows.every(function (v) { return typeof v === 'boolean'; })) {
              issues.push(issue('error', 'A table\'s tallRows must be an array of true/false, one per row.', l));
            } else if (pt.tallRows.length !== (Array.isArray(pt.rows) ? pt.rows.length : 0)) {
              issues.push(issue('error', 'A table\'s tallRows has ' + pt.tallRows.length + ' entries for ' +
                (Array.isArray(pt.rows) ? pt.rows.length : 0) + ' rows.', l,
                'Add or remove an entry so there is exactly one per row.'));
            } else if (pt.tallRows.every(Boolean)) {
              issues.push(issue('error', 'A table\'s tallRows must name a row that is NOT taller (omit it for all of them).', l));
            }
          }
        }
        // SPC-1: a measured gap between blocks.
        if (pt.kind === 'space' && pt.height !== undefined) checkMm(pt.height, l, 'A space\'s height', issues);
      });
    }

    /** DOC-4: a list of custom sections (in the project, or inside a report template). */
    function validateDocSections(sections, loc, issues) {
      if (sections === undefined) return;
      if (!Array.isArray(sections)) { issues.push(issue('error', loc + ' must be an array.', loc)); return; }
      var seen = {};
      sections.forEach(function (s, i) {
        var l = loc + '[' + i + ']';
        if (!isPlainObject(s)) { issues.push(issue('error', 'A section must be an object.', l)); return; }
        if (typeof s.id !== 'string' || !s.id) { issues.push(issue('error', 'A section needs a string id.', l)); return; }
        // Ids are what cross-references point at, so a duplicate is a real error
        // rather than a tidiness complaint — two sections sharing one id would make
        // every link to it ambiguous.
        if (seen[s.id]) issues.push(issue('error', 'Duplicate section id "' + s.id + '".', l));
        seen[s.id] = true;
        if (s.title !== undefined && typeof s.title !== 'string') issues.push(issue('error', 'A section title must be a string.', l));
        validateDocParts(s.parts, l, issues);
      });
    }

    /** Shared shape check for the three template/profile lists (id + name + per-kind). */
    function validateDocList(list, loc, what, issues, each) {
      if (list === undefined) return;
      if (!Array.isArray(list)) { issues.push(issue('error', loc + ' must be an array.', loc)); return; }
      var seen = {};
      list.forEach(function (x, i) {
        var l = loc + '[' + i + ']';
        if (!isPlainObject(x)) { issues.push(issue('error', 'A ' + what + ' must be an object.', l)); return; }
        if (typeof x.id !== 'string' || !x.id) { issues.push(issue('error', 'A ' + what + ' needs a string id.', l)); return; }
        if (typeof x.name !== 'string' || !x.name) issues.push(issue('error', 'A ' + what + ' needs a name.', l));
        if (seen[x.id]) issues.push(issue('error', 'Duplicate ' + what + ' id "' + x.id + '".', l));
        seen[x.id] = true;
        if (each) each(x, l);
      });
    }

