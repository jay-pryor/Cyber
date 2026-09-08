  /* =============================================================================
   * MODULE: App.ui.views.reportDesign  — RD-1..RD-7: the Report Design workspace
   * PURPOSE: The full-screen workspace that decides what the document contains, in
   *          what order, at what heading level, with what hand-authored sections,
   *          under which formatting profile — plus the live preview and the template
   *          catalogues. Replaces the old "Report options" modal.
   * PURITY:  UI/DOM
   * DEPENDS: App.docHost (the host contract), App.generate, App.doc, App.docFormat,
   *          App.docStore, App.docTemplates, App.ui.mdPreview,
   *          App.docSession (this run's filename and tag values)
   * INVARIANTS: everything shown is derived from hostBlocks and App.doc.outline — the
   *             same two calls the generator itself makes — so the panel cannot
   *             describe a document the generator would not produce. Everything it
   *             knows about the APP it is attached to arrives through App.docHost:
   *             which subjects there are, which is ready, what sections are on offer
   *             and what the rows are filtered by.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * Layout: an ordered section list on the left, a pane switcher on the right.
     *
     * The list is the spine of the document and stays visible whatever you are doing,
     * because every other decision in here — a heading level, a paragraph, a
     * formatting profile — is answering "what does this do to the document?", and
     * that question is unanswerable if the document's shape is on another screen.
     *
     * Six panes rather than one long column: the formatting controls alone are about
     * forty fields, and stacking them under the section list would bury the section
     * list. A new pane is one entry in PANES.
     * ---------------------------------------------------------------------- */

    var PANES = [
      { id: 'section', label: 'Section' },
      { id: 'relevance', label: 'Relevance' },
      { id: 'formatting', label: 'Formatting' },
      // HDR-1: the running header and footer are a big enough question — six slots, a
      // different first page, and the classification banner — to be their own pane
      // rather than a fourth fieldset under Formatting.
      { id: 'headerfooter', label: 'Header & Footer' },
      { id: 'templates', label: 'Templates' },
      { id: 'preview', label: 'Preview' },
      // GEN-TAB: generation is the last thing you do, so it is the last tab. It is also
      // the only pane that WRITES a file, which is reason enough not to have its button
      // sitting in the footer of every other one.
      { id: 'generate', label: 'Generate' }
    ];

    var _rd = {
      open: false,
      pane: 'section',
      pages: false,          // PRV-4: is the preview showing sheets of paper?
      selected: null,        // block id being edited in the Section pane
      fmtId: null,           // profile being edited in the Formatting pane
      conflict: null,        // { kindKey, plan, decisions } while an import is being resolved
      refFor: null,          // part id whose "insert reference" menu is open
      optMenu: null,         // block id whose columns/groups menu is open (OPT-1)
      preview: null          // cached { html, outline } so switching panes is not a re-generate
    };
    var _ctx = null;
    var _dragId = null;      // section being dragged
    var _dragPart = null;    // part being dragged inside a section

    /* OPT-2: the report options, exactly as the Generate button will see them — the
     * project's four include-maps plus this run's filename, tags and classification.
     * READ-ONLY: it is assembled fresh on every call, so the four maps are written
     * through App.docStore.setReportInclude and the three session fields through
     * `session()` below. Mutating what this returns would change nothing. */
    function opts() { return App.docSession.options(); }
    /** The per-run half, which is still a live object and still written to directly. */
    function session() { return App.docSession.get(); }
    /* The subjects the document could be about, as the HOST describes them. A
     * subject is {id, label, sublabel} to the module; `config` is whatever the host
     * needs handed back to it, and only the host ever reads it. */
    function H() { return App.docHost.get(); }
    function latest() { var h = H(); return (h && h.subject) ? h.subject.list() : []; }
    /** The host's declaration for one block, unbound — labels, columns, table keys. */
    function providerFor(block) {
      var id = block && block.id;
      return App.docHost.sections(null).filter(function (x) { return x && x.id === id; })[0] || null;
    }
    /** The host's sections BOUND to what is being previewed, filter and all. */
    function runSections(selId) {
      return App.docHost.sections({ subjectId: selId, categories: opts().relevance || null });
    }
    /**
     * How many rows sit in each of the host's filter categories, for the omission note
     * and the tick list beside it. Counted UNFILTERED — the whole point is to say how
     * many the filter is leaving out.
     */
    function categoryCounts(selId) {
      var h = H(); if (!h || !selId || !h.filter) return {};
      var rows = [];
      App.docHost.sections({ subjectId: selId, categories: null }).forEach(function (pv) {
        if (typeof pv.rows === 'function') rows = rows.concat(pv.rows());
      });
      return App.generate.filterCounts(h, rows);
    }
    function selectedDeviceId() { return App.docSession.selectedSubjectId(); }
    function bag(project) { return (project && project.report) || {}; }
    function customSection(project, id) {
      return (bag(project).sections || []).filter(function (s) { return s.id === id; })[0] || null;
    }
    function cb(attrs, label, on) {
      return '<label class="gen-opt"><input type="checkbox" ' + attrs + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }
    function incMapOn(map, ds, key) {
      var m = opts()[map] || {};
      if (key != null) { var d = m[ds] || {}; return d[key] !== false; }
      return m[ds] !== false;
    }

    /** Blocks + their resolved levels/numbers — the same pair the generator uses. */
    function outlineNow(project) {
      // The device goes in: GUIDE-1 exists only when something on THIS device diverges,
      // so the section list would otherwise offer a section the document will not have.
      var blocks = App.generate.hostBlocks(H(),
        Object.assign({}, opts(), { deviceId: selectedDeviceId(project) }));
      var profile = App.docFormat.resolve(project);
      return {
        blocks: blocks,
        resolved: App.doc.outline(blocks, {
          baseLevel: 1,
          clampSkips: profile.headings.clampSkips !== false,
          numbered: profile.headings.numbered !== false
        }),
        profile: profile
      };
    }

    // ======================================================================
    // RD-1: the section list
    // ======================================================================

    var LEVEL_OPTS = [{ value: '', label: 'Auto' }].concat(App.doc.LEVELS.map(function (l) {
      return { value: String(l.value), label: l.label };
    }));

    function levelSelect(b, resolvedFor) {
      var cur = b.level == null ? '' : String(b.level);
      var shown = resolvedFor ? resolvedFor.level : null;
      var title = b.level == null
        ? 'Automatic — currently ' + (shown === App.doc.BODY_LEVEL ? 'normal text' : App.doc.levelLabel(shown)) + '. Pick a level to pin it.'
        : 'Pinned. Choose Auto to let it follow the section above.';
      return '<select class="rd-level" data-rd-level="' + esc(b.id) + '" title="' + esc(title) + '" aria-label="Heading level for ' + esc(b.label) + '">' +
        LEVEL_OPTS.map(function (o) {
          var label = (o.value === '' && shown != null)
            ? 'Auto (' + App.doc.levelLabel(shown) + ')'
            : o.label;
          return '<option value="' + o.value + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('') + '</select>';
    }

    /**
     * OPT-1: a section's columns and groups, on the section ROW rather than in the
     * Section pane.
     *
     * They were in the pane, which meant switching what a register carries cost a trip
     * away from whatever was on the right — and the pane worth being on while doing it
     * is the Preview, which is exactly the one you had to leave. On the row they are two
     * clicks from anywhere, and the pane behind them does not move.
     *
     * @returns {string} '' when the section has nothing to choose
     */
    function optionsMenu(project, b) {
      var cols = App.generate.hostColumns(H(), b, opts());
      var optional = (cols && cols.optional) || [];
      var groups = b.groups || [];
      if (!optional.length && !groups.length) return '';
      var key = b.dsId || b.kind;
      var open = _rd.optMenu === b.id;
      var body = '';
      if (groups.length) {
        body += '<div class="rd-optmenu-h">Groups</div>' + groups.map(function (g) {
          return cb('data-rd-dsmap="datasetSections" data-rd-ds="' + esc(b.dsId) + '" data-rd-key="' + esc(g.value) + '"', g.label, g.included);
        }).join('');
      }
      if (optional.length) {
        // COL-3: ticked iff the column will actually be there — which for an untouched
        // project is the column's own declaration, not a blanket yes.
        var colOpts = (opts().columns || {})[key] || {};
        body += '<div class="rd-optmenu-h">Columns</div>' + optional.map(function (c) {
          return cb('data-rd-dsmap="columns" data-rd-ds="' + esc(key) + '" data-rd-key="' + esc(c.id) + '"', c.label, App.report.columnOn(c, colOpts));
        }).join('');
      }
      return '<span class="rd-opt">' +
        '<button type="button" class="rd-optbtn' + (open ? ' on' : '') + '" data-rd-optmenu="' + esc(b.id) + '"' +
          ' aria-expanded="' + (open ? 'true' : 'false') + '"' +
          ' title="Which columns' + (groups.length ? ' and groups' : '') + ' this section carries">&#9776;</button>' +
        (open ? '<span class="rd-optmenu">' + body + '</span>' : '') + '</span>';
    }

    function renderSectionList(project, view) {
      var byId = {};
      view.resolved.forEach(function (r) { if (!r.parentId) byId[r.id] = r; });

      var rows = view.blocks.map(function (b, i) {
        var off = !b.included;
        var r = byId[b.id];
        var num = (off || !r) ? '—' : (r.number || '·');
        var aria = ' aria-label="Include ' + esc(b.label) + '"';
        var inc = b.groups
          ? '<input type="checkbox" data-rd-ds-all="' + esc(b.dsId) + '"' + (off ? '' : ' checked') + aria + '>'
          : b.kind === 'dataset'
            ? '<input type="checkbox" data-rd-inc-ds="' + esc(b.dsId) + '"' + (off ? '' : ' checked') + aria + '>'
            : '<input type="checkbox" data-rd-inc="' + esc(b.kind === 'custom' ? b.id : b.kind) + '"' + (off ? '' : ' checked') + aria + '>';

        // A level skip is reported rather than silently reinterpreted (DOC-2).
        var warn = (r && r.skipped)
          ? '<span class="rd-warn" title="There is no heading one level above this one. It has been pulled up to H' + r.level + '.">↰ H' + r.level + '</span>'
          : '';
        var kind = b.kind === 'custom'
          ? '<span class="rd-kind rd-kind-custom">custom</span>'
          : '<span class="rd-kind">' + esc(b.kind === 'dataset' ? 'register' : b.kind) + '</span>';
        var sel = _rd.selected === b.id ? ' sel' : '';

        return '<li class="ord-step rd-row' + (off ? ' off' : '') + sel + '" draggable="true" data-rd-block="' + esc(b.id) + '">' +
          '<span class="ord-num">' + esc(num) + '</span>' +
          '<label class="ord-inc" title="Include this section in the document">' + inc + '</label>' +
          '<span class="ord-body">' +
            '<button type="button" class="rd-open" data-rd-select="' + esc(b.id) + '" title="Select this section. The pane on the right stays where it is.">' + esc(b.label) + '</button>' +
            '<span class="rd-meta">' + kind + warn + '</span>' +
          '</span>' +
          optionsMenu(project, b) +
          levelSelect(b, r) +
          '<span class="ord-move">' +
            '<button type="button" data-rd-up="' + esc(b.id) + '"' + (i === 0 ? ' disabled' : '') + ' title="Move earlier" aria-label="Move ' + esc(b.label) + ' earlier">▲</button>' +
            '<button type="button" data-rd-down="' + esc(b.id) + '"' + (i === view.blocks.length - 1 ? ' disabled' : '') + ' title="Move later" aria-label="Move ' + esc(b.label) + ' later">▼</button>' +
          '</span></li>';
      }).join('');

      var tpls = (bag(project).sectionTemplates || []);
      var tplPicker = tpls.length
        ? '<select data-rd-use-template aria-label="Add a section from a template">' +
            '<option value="">From template&hellip;</option>' +
            tpls.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') +
          '</select>'
        : '';

      return '<div class="rpt-pane rpt-pane-main"><h4>Sections</h4>' +
        '<p class="muted rpt-note">Drag, or use ▲/▼, to set the order. The level box sets the heading — <strong>Auto</strong> makes a section a sibling of the one above it, and numbering follows the levels. ' +
        'Untick one to leave it out.</p>' +
        '<div class="rd-addbar"><button type="button" class="primary" data-rd-add-section>+ Add section</button>' + tplPicker + '</div>' +
        '<div id="rd-order-host"><ol class="ord-list">' + rows + '</ol></div></div>';
    }

    // ======================================================================
    // RD-2: the Section pane — hand-authored content, or a register's options
    // ======================================================================

    function hostileHint(text) {
      var chars = MD.hostileChars(text);
      if (!chars.length) return '';
      return '<div class="rd-esc" title="These are escaped on the way into the .md so LaTeX renders them literally. Your text is stored exactly as typed.">' +
        'Escaped for LaTeX: ' + chars.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</div>';
    }

    /* -------------------------------------------------------------------------
     * RTX-1: the box that shows what it holds.
     *
     * Every place the designer writes prose used to be a `<textarea>` holding the raw
     * token markup, so a cross-reference to the packages register read
     * `{{ref:ds:android.packages}}` while you were writing the sentence around it — the
     * one thing about it you cannot check by looking. The box is a contenteditable now
     * and shows the same text the page will: bold as bold, a code span as code, a line
     * break as a line break, and a reference as the name of what it points at.
     *
     * The STORAGE is unchanged (see App.ui.richText): the tokens are still the truth,
     * and a project written before this opens in it unaltered.
     *
     * `resolveRef` is the document's own resolver — the same one App.doc renders with —
     * so a chip reads exactly what the PDF will print, renumbering included.
     * ---------------------------------------------------------------------- */
    function refResolver(project) {
      try { return docCtx(project, filledView(project)).resolveRef; }
      catch (e) { return null; }        // a half-built document must not break the editor
    }

    /**
     * @param {string} attrs   the data attributes identifying what this box writes to
     * @param {string} tokens  the stored token text
     */
    function richBox(project, attrs, tokens, cls, placeholder) {
      return '<div class="rd-rich ' + (cls || '') + '" contenteditable="true" role="textbox"' +
        ' aria-multiline="true" spellcheck="true" data-rd-rich ' + attrs +
        (placeholder ? ' data-rd-ph="' + esc(placeholder) + '"' : '') + '>' +
        App.ui.richText.toHtml(tokens || '', { resolveRef: refResolver(project) }) + '</div>';
    }

    /* RTX-1: the four formatting buttons, wherever prose is written. `host` is the data
     * attributes that say which box they act on, so one row of buttons serves a
     * paragraph, an introduction and a table cell without three copies of it. */
    var TOOLBAR = [['b', 'B', 'Bold'], ['i', 'I', 'Italic'], ['c', '‹›', 'Code'], ['br', '↵', 'Line break']];
    function toolbar(host) {
      return TOOLBAR.map(function (t) {
        return '<button type="button" class="rd-tb" data-rd-wrap="' + t[0] + '" ' + host +
          ' title="' + esc(t[2]) + '">' + esc(t[1]) + '</button>';
      }).join('');
    }

    function partControls(sec, part, i, n) {
      return '<span class="rd-part-move">' +
        '<button type="button" data-rd-part-up="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' + (i === 0 ? ' disabled' : '') + ' title="Move up">▲</button>' +
        '<button type="button" data-rd-part-down="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"' + (i === n - 1 ? ' disabled' : '') + ' title="Move down">▼</button>' +
        '<button type="button" class="danger" data-rd-part-del="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '" title="Delete this block">✕</button>' +
        '</span>';
    }

    /* REF-1: the insert-a-reference menu, and the two questions it has to answer.
     *
     * WHAT to point at is the list of targets — now sections, tables AND paragraphs,
     * all derived from the same outline the document is built from.
     *
     * WHAT IT SHOULD SAY is the second question, and it used only to have one answer.
     * A writer wants "see Table 4" as often as "see Table 4: Packages removed", and
     * when the sentence already reads "…in the packages table" they want the words they
     * already typed to become the link. So a target offers a reading per column, and
     * selecting text before pressing the button pre-empts all three: the selection is
     * the link text and the reading buttons are not shown for it.
     *
     * `own` — the section the paragraph being edited lives in — is dropped from the list
     * for a section target: a link from a section to itself is a link to where you are.
     */
    var REF_READINGS = [
      { tag: 'ref', label: 'Full', hint: 'Table 4: Packages removed' },
      { tag: 'refn', label: 'Number', hint: 'Table 4' },
      { tag: 'reft', label: 'Title', hint: 'Packages removed' }
    ];

    /**
     * @param {string} host  the data attributes identifying the box being written into
     */
    function refMenuFor(project, ownId, host) {
      // Filled, so the register tables are in the list — see filledView.
      var view = filledView(project);
      var tables = App.doc.tableIndex(view.resolved);
      var targets = App.doc.refTargets(view.resolved, tables).filter(function (t) { return t.id !== ownId; });
      if (!targets.length) return '<div class="rd-refmenu"><em>Nothing to link to yet.</em></div>';
      return '<div class="rd-refmenu">' +
        '<div class="rd-refmenu-h">Link to&hellip;</div>' +
        '<p class="muted rd-refmenu-note">Select text first to link the words you have already written. ' +
        'Otherwise pick what the link should read as — all three follow the target if it is renamed or renumbered.</p>' +
        targets.map(function (t) {
          return '<div class="rd-reftarget">' +
            '<span class="rd-kind">' + esc(t.kind) + '</span>' +
            '<span class="rd-reftarget-l" title="' + esc(t.label) + '">' + esc(t.label) + '</span>' +
            '<span class="rd-refreadings">' + REF_READINGS.map(function (r) {
              var reading = r.tag === 'refn' ? t.numberLabel : r.tag === 'reft' ? t.titleLabel : t.label;
              return '<button type="button" data-rd-ref-pick="' + esc(t.id) + '" data-rd-ref-tag="' + r.tag + '" ' + host +
                ' title="' + esc('Reads as: ' + reading) + '">' + esc(r.label) + '</button>';
            }).join('') + '</span></div>';
        }).join('') + '</div>';
    }

    function refMenu(project, sec, part) {
      if (_rd.refFor !== part.id) return '';
      return refMenuFor(project, sec.id,
        'data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"');
    }

    function paraEditor(project, sec, part, i, n) {
      var host = 'data-rd-part="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"';
      return '<div class="rd-part" draggable="true" data-rd-partrow="' + esc(part.id) + '">' +
        '<div class="rd-part-head"><span class="rd-part-kind">Paragraph</span>' +
          '<span class="rd-tbs">' + toolbar(host) +
            '<button type="button" class="rd-tb" data-rd-ref-open="' + esc(part.id) + '" title="Insert a cross-reference that survives renaming and reordering">🔗 Link</button>' +
          '</span>' +
          cb('data-rd-part-flag="centre" ' + host, 'Centre', part.centre === true) +
          partControls(sec, part, i, n) + '</div>' +
        refMenu(project, sec, part) +
        richBox(project, 'data-rd-text="' + esc(part.id) + '" data-rd-sec="' + esc(sec.id) + '"',
          part.text, '', 'Write the paragraph. Enter is a line break; a blank line starts a new paragraph.') +
        hostileHint(part.text || '') + '</div>';
    }

    /**
     * TW-1: the editor table is constrained to the PROFILE's text width, and the widths
     * are shown as a `<colgroup>` of percentages.
     *
     * Both for the same reason: a drag has to mean something. Dragging a column edge
     * inside a box of arbitrary width tells you the ratio but not the result, and a
     * table that fills a 1400px pane while the page is 160mm wide invites layouts that
     * do not survive the conversion. Constrained, what the operator drags is the shape
     * the PDF will have — at a scale, but honestly at a scale.
     * @returns {number} the editor table's width in px
     */
    function textWidthPx(profile) { return App.docFormat.textWidthPx(profile); }

    /**
     * PRV-2: a rendered document, wrapped in a page-shaped box carrying the profile's
     * own CSS — so paper, margins, font size, line spacing, heading styling, table
     * shading and caption alignment all show here rather than only in the PDF.
     *
     * The stylesheet is emitted beside the content rather than into the app's own, for
     * the reason it exists: it changes with the profile, and the workspace re-renders as
     * a string on every edit, so it stays in step by construction.
     */
    function paper(project, html, extraClass) {
      return '<style>' + App.docFormat.previewCss(App.docFormat.resolve(project)) + '</style>' +
        '<div class="rd-paper ' + (extraClass || '') + '">' + html + '</div>';
    }

