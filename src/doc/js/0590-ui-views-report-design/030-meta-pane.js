    /** META-1: the include/exclude ticks for the Device Config Information rows. */
    function metaPane(project) {
      var selId = selectedDeviceId(project);
      if (!selId) return '<p class="muted">No device selected.</p>';
      var chosen = (bag(project).meta) || {};
      // Every row the host CAN state, ticked or not — this is the picker, so a row
      // switched off still has to appear in it.
      var rows = H().subject.meta(selId);
      return '<div class="rd-fieldset"><strong>Rows</strong>' +
        '<p class="muted">Which lines of provenance this block carries. Saved with the project, so it travels in a report template.</p>' +
        rows.map(function (r) {
          var v = String(r.value);
          return '<label class="gen-opt rd-metarow"><input type="checkbox" data-rd-meta="' + esc(r.id) + '"' +
            (chosen[r.id] === false ? '' : ' checked') + ' aria-label="Include ' + esc(r.label) + '"> ' +
            esc(r.label) + '<span class="rd-metaval">' + esc(v.slice(0, 28) + (v.length > 28 ? '…' : '')) + '</span></label>';
        }).join('') + '</div>';
    }

    /** Centre a whole section's body — available to generated and authored alike. */
    function centreToggle(project, block, resolved) {
      /* SEC-4: the per-section page break, greyed out when the LEVEL already makes one.
       *
       * The two are different decisions — a house rule about every H1, against a decision
       * about one section — but they aim at the same thing, and both firing emitted two
       * breaks and therefore a blank page between them. App.doc now suppresses the
       * second; this says so, rather than leaving a tick that visibly does nothing. */
      var lvl = resolved ? resolved.level : null;
      var byLevel = App.docFormat.levelBreaks(App.docFormat.resolve(project))[lvl] === true;
      return '<div class="rd-fieldset"><strong>On the page</strong>' +
        cb('data-rd-centre="' + esc(block.id) + '"',
          'Centre this section\u2019s content \u2014 heading included', block.centre === true) +
        cb('data-rd-pagebreak="' + esc(block.id) + '"',
          'Start this section on a new page', byLevel || block.pageBreakBefore === true, byLevel) +
        (byLevel
          ? '<p class="muted rd-hint">Already on: <strong>' + esc(App.doc.levelLabel(lvl)) +
            '</strong> starts a new page under <strong>Formatting \u2192 Fonts</strong>, for every section at that level. ' +
            'Change it there, or give this section a different level.</p>'
          : '') +
        cb('data-rd-notoc="' + esc(block.id) + '"',
          'Leave this section out of the contents list', block.noToc === true) +
        '<p class="muted rd-hint">A section left out of the contents still prints its heading and keeps its number, ' +
        'so a cross-reference to it still reads correctly \u2014 it is simply not listed.</p>' +
        /* SPC-1: space ABOVE the heading, which is the one gap no part can make \u2014 every
         * part a section has is already below it. With the page break above, this is how
         * a signature page is composed: its own page, and its heading two thirds down. */
        '<label class="rd-mmlab rd-secspace">Start this section <input class="rd-mm" type="number" min="0" max="' +
          App.docStore.MAX_SPACE_MM + '" step="5" value="' + esc(String(App.docStore.mmValue(block.spaceBefore) || '')) +
          '" data-rd-space-block="' + esc(block.id) + '" placeholder="0" aria-label="Millimetres of space above this section"> mm ' +
          'further down the page</label>' +
        '<p class="muted rd-hint">Empty space above the heading, which the page break above composes with: a new page, ' +
        'then this far down it. It survives being at the top of a page, so the gap is there whether or not the section ' +
        'happened to break.</p>' +
        '</div>';
    }

    /* TBL-1: the wording of each table a generated section produces.
     *
     * A grouped register produces one table per group. They used to be told apart by a
     * sub-heading carrying the group's declared name \u2014 "Removed", "Disabled", "Kept" \u2014
     * which put the same word on the page three times over and left nothing editable.
     * Those headings are gone, so each table names itself here: a title row above it, a
     * caption under it, and a heading per column, because the same column carries
     * different content in each ("Package" against "Package removed").
     */
    function tableWordingEditor(project, block) {
      var cols = App.docGen.sectionColumns(H(), block, opts());
      if (!cols || !cols.all.length) return '';
      // One editor per table the section will produce: one per group, or — for a
      // section that splits its tables on an axis of its own — one per key the
      // PROVIDER names. The divergence section splits per register, which is a fact
      // about that section and not about documents, so it is the provider that says so.
      var keys = (block.groups || []).filter(function (g) { return g.included; })
        .map(function (g) { return { key: g.value, label: g.label }; });
      var pv = providerFor(block);
      if (!keys.length && pv && typeof pv.tableKeys === 'function') keys = pv.tableKeys();
      if (!keys.length) keys = [{ key: '_all', label: '' }];
      var stored = block.tables || {};
      var body = keys.map(function (k) {
        var e = stored[k.key] || {}, custom = e.columns || {};
        var attrs = 'data-rd-tbl-block="' + esc(block.id) + '" data-rd-tbl-key="' + esc(k.key) + '"';
        return '<div class="rd-tblword">' +
          (k.label ? '<div class="rd-tblword-h">' + esc(k.label) + '</div>' : '') +
          '<label class="rd-lab">Title row' +
            '<input class="rd-title" value="' + esc(e.title || '') + '" ' + attrs + ' data-rd-tbl-field="title"' +
              ' placeholder="Optional \u2014 a row above the column headings" aria-label="Title row"></label>' +
          // CAP-4: the caption box is hidden rather than disabled when there is to be no
          // caption — a box you may type into that will not be printed is a trap.
          (e.noCaption === true
            ? '<p class="muted rd-hint">Uncaptioned, so this table takes no number and cannot be cross-referenced.</p>'
            : '<label class="rd-lab">Caption' +
              '<input class="rd-title" value="' + esc(e.caption || '') + '" ' + attrs + ' data-rd-tbl-field="caption"' +
                ' placeholder="' + esc(String(e.title || '').trim() || block.title || block.label) + '" aria-label="Caption"></label>') +
          cb(attrs + ' data-rd-tbl-nocap', 'No caption', e.noCaption === true) +
          '<div class="rd-grid">' + cols.all.map(function (c) {
            return '<label class="rd-lab rd-lab-s">' + esc(c.label) +
              '<input value="' + esc(custom[c.id] || '') + '" ' + attrs + ' data-rd-tbl-col="' + esc(c.id) + '"' +
                ' placeholder="' + esc(c.label) + '" aria-label="Heading for the ' + esc(c.label) + ' column"></label>';
          }).join('') + '</div></div>';
      }).join('');
      return '<div class="rd-fieldset"><strong>Table wording</strong>' +
        '<p class="muted">What each of this section\u2019s tables calls itself and its columns. Blank means the standard wording. ' +
        'The caption follows the title row unless you give it one of its own.</p>' +
        body + '</div>';
    }

    /**
     * NAM-1: the name the section list calls this block, when that is not its heading.
     *
     * Offered on every kind of section, because the reason for wanting one \u2014 a heading
     * that is long, or that changes with how the report is being used \u2014 applies just as
     * much to "Deviations from Security Guidelines" as to a hand-written section.
     */
    /* HEADING FIRST, then the name \u2014 the same order a hand-authored section puts them
     * in, because they are the same two questions. A generated section used to ask for
     * the name first, which read as though the name were the primary string and the
     * heading an afterthought; it is the other way round on the page. */
    function nameField(block, dflt) {
      var heading = String(block.title || '').trim();
      return (dflt === undefined ? '' :
          // NAM-2: a generated section has a heading too, and once the name stopped
          // being it there was nowhere to say what it should read.
          '<label class="rd-lab">Heading in the document' +
            '<input class="rd-title" value="' + esc(heading === dflt ? '' : heading) + '" data-rd-sec-heading="' + esc(block.id) + '"' +
              ' placeholder="' + esc(dflt) + '" aria-label="Heading for ' + esc(block.label) + '"></label>' +
          '<p class="muted rd-hint">What the document prints. Leave it blank for the standard wording, <strong>' + esc(dflt) + '</strong>.</p>') +
        '<label class="rd-lab">Name in this list' +
        '<input class="rd-title" value="' + esc(block.name || '') + '" data-rd-sec-name="' + esc(block.id) + '"' +
          ' placeholder="' + esc(heading || 'Same as the heading') + '" aria-label="Name for ' + esc(block.label) + '"></label>' +
        '<p class="muted rd-hint">Shorthand for the section list only \u2014 the document still prints the heading. Leave it blank and the name <em>is</em> the heading.</p>';
    }

    /** SEC-1: prose between this section's heading and its generated table. */
    function introField(project, block) {
      /* REF-1: the same toolbar a hand-authored paragraph has.
       *
       * An introduction is a paragraph in the same token markup, rendered by the same
       * App.md.rich \u2014 the only thing it was missing was the two buttons, and (until
       * REF-1) a reference resolver at render time, so a link inserted here would not
       * have resolved anyway. Both are fixed together; one without the other is a button
       * that produces "[missing reference]". */
      var refOpen = _rd.refFor === 'intro:' + block.id;
      return '<div class="rd-fieldset"><strong>Introduction</strong>' +
        '<p class="muted">Your own words, printed between the heading and the table. Written once for the section, so a register split into groups is introduced once rather than once per group.</p>' +
        '<div class="rd-part-head"><span class="rd-tbs">' + toolbar('data-rd-block="' + esc(block.id) + '"') +
          '<button type="button" class="rd-tb" data-rd-ref-open="' + esc('intro:' + block.id) + '"' +
            ' title="Insert a cross-reference that survives renaming and reordering">\ud83d\udd17 Link</button>' +
        '</span></div>' +
        (refOpen ? refMenuFor(project, block.id, 'data-rd-ref-block="' + esc(block.id) + '"') : '') +
        richBox(project, 'data-rd-intro="' + esc(block.id) + '"' +
          ' aria-label="Introduction for ' + esc(block.label) + '"', block.intro, '',
          'Optional. A blank line starts a new paragraph.') +
        hostileHint(block.intro || '') +
        cb('data-rd-intro-num="' + esc(block.id) + '"', 'Number it', block.introNumbered === true) +
        '<p class="muted rd-hint">A numbered introduction takes the first of this section\u2019s numbers \u2014 <em>5 Packages</em>, then <em>5.1</em> the introduction, then <em>5.2 Packages \u2014 Removed</em>. Unnumbered, it is simply the prose under the heading.</p>' +
        '</div>';
    }

    /** TBS-1: whether this section's generated tables wear the profile's table styling. */
    function tableStyleField(project, block) {
      var t = App.docFormat.normalise(App.docFormat.resolve(project)).tables;
      function describe(s) {
        var bits = [];
        if (s.bold) bits.push('bold');
        if (s.italic) bits.push('italic');
        if (s.shade) bits.push('shaded ' + s.shade);
        return bits.length ? bits.join(', ') : 'no styling set';
      }
      var st = block.tableStyle || {};
      return '<div class="rd-fieldset"><strong>Table styling</strong>' +
        '<p class="muted">What <em>styled</em> looks like is set once, in the <strong>Formatting</strong> pane; which tables wear it is decided here, per section.</p>' +
        // FNT-4: opting in is about the SHADE now; the weight reaches every table.
        cb('data-rd-tstyle="head" data-rd-block="' + esc(block.id) + '"', 'Shade the header row (' + describe(t.head) + ')', st.head === true) +
        cb('data-rd-tstyle="firstColumn" data-rd-block="' + esc(block.id) + '"', 'Style the first column (' + describe(t.firstColumn) + ')', st.firstColumn === true) +
        '</div>';
    }

    function paneSection(project, view) {
      var id = _rd.selected;
      if (!id) return '<p class="muted">Pick a section on the left to open it.</p>';
      var block = view.blocks.filter(function (b) { return b.id === id; })[0];
      if (!block) return '<p class="muted">That section is no longer in the document.</p>';

      // --- a generated section: its groups, its columns, and a preview of it
      if (block.kind !== 'custom') {
        var out = ['<h5>' + esc(block.label) + '</h5>'];
        if (block.kind === 'meta') out.push('<p class="muted">Device, model, firmware, capture hashes and the project hash — the provenance block that used to travel in <code>manifest.json</code>.</p>');
        if (block.kind === 'guidelines') {
          out.push('<p class="muted">Every item flagged as departing from the security guidelines, grouped by register, with its description and the narrative behind it. ' +
            'A register with nothing flagged is left out; if nothing anywhere is flagged, so is the whole section.</p>');
        }
        out.push(nameField(block, block.defaultTitle));
        out.push(centreToggle(project, block, view.resolved.filter(function (r) { return r.id === block.id; })[0]));
        out.push(introField(project, block));
        out.push(tableWordingEditor(project, block));
        out.push(tableStyleField(project, block));
        if (block.kind === 'meta') out.push(metaPane(project));
        // OPT-1: the column and group ticks are on the section ROW now, not here — see
        // optionsMenu. What stays is the width strip, which is drawn against whatever
        // those ticks have left switched on.
        var cols = App.docGen.sectionColumns(H(), block, opts());
        if (cols && cols.all.length) out.push(widthStrip(project, block.id, cols.all, block.widths));
        out.push('<p class="muted rd-hint">This section\'s content is generated from the register. Its <strong>columns</strong>' +
          (block.groups ? ' and <strong>groups</strong>' : '') + ' are on the &#9776; button beside it in the list, so they can be changed without leaving whatever pane you are on. ' +
          'Add a <strong>custom section</strong> if you need prose or a table of your own.</p>');
        out.push('<div class="rd-fieldset rd-secprev-wrap"><strong>Preview</strong>' +
          '<p class="muted">This section as it will appear, for the selected device.</p>' +
          sectionPreview(project, block) + '</div>');
        return out.join('');
      }

      // --- a hand-authored section
      var sec = customSection(project, id);
      if (!sec) return '<p class="muted">That section is no longer in the document.</p>';
      var parts = sec.parts || [];
      var body = parts.map(function (p, i) {
        if (p.kind === 'para') return paraEditor(project, sec, p, i, parts.length);
        if (p.kind === 'table') return tableEditor(project, sec, p, i, parts.length);
        if (p.kind === 'rule') return simplePart(sec, p, i, parts.length, 'Horizontal line', 'A rule across the page.');
        if (p.kind === 'space') return spaceEditor(sec, p, i, parts.length);
        return simplePart(sec, p, i, parts.length, 'Page break', 'Forces what follows onto a new page.');
      }).join('');

      return '<div class="rd-sec-edit">' +
        centreToggle(project, block, view.resolved.filter(function (r) { return r.id === block.id; })[0]) +
        '<label class="rd-lab">Heading<input class="rd-title" value="' + esc(sec.title || '') + '" data-rd-sec-title="' + esc(sec.id) + '" placeholder="Leave blank for a paragraph with no heading" aria-label="Section heading"></label>' +
        '<p class="muted rd-hint">With no heading this becomes body text and keeps the level of the section above it — unless you pin a level on the left.</p>' +
        nameField(block) +
        '<div class="rd-parts">' + (body || '<p class="muted">Nothing in this section yet.</p>') + '</div>' +
        '<div class="rd-addbar">' +
          '<button type="button" data-rd-addpart="para" data-rd-sec="' + esc(sec.id) + '">+ Paragraph</button>' +
          '<button type="button" data-rd-addpart="table" data-rd-sec="' + esc(sec.id) + '">+ Table</button>' +
          '<button type="button" data-rd-addpart="rule" data-rd-sec="' + esc(sec.id) + '">+ Line</button>' +
          '<button type="button" data-rd-addpart="space" data-rd-sec="' + esc(sec.id) + '" title="A measured gap down the page">+ Space</button>' +
          '<button type="button" data-rd-addpart="pagebreak" data-rd-sec="' + esc(sec.id) + '">+ Page break</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" data-rd-save-template="' + esc(sec.id) + '" title="Save this section\'s shape for reuse in any project">Save as template&hellip;</button>' +
          '<button type="button" class="danger" data-rd-del-section="' + esc(sec.id) + '">Delete section</button>' +
        '</div>' +
        '<div class="rd-fieldset rd-secprev-wrap"><strong>Preview</strong>' +
          '<p class="muted">This section as it will appear, numbered as it will be numbered.</p>' +
          sectionPreview(project, block) + '</div>' +
        '</div>';
    }

    // ======================================================================
    // RD-3: relevance (RPT-2, carried over unchanged)
    // ======================================================================

    function omittedByRelevance(project, selId) {
      var counts = categoryCounts(selId);
      var map = opts().relevance || {};
      var n = 0;
      Object.keys(counts).forEach(function (k) { if (map[k] === false) n += counts[k]; });
      return n;
    }

    function paneRelevance(project) {
      var selId = selectedDeviceId(project);
      var counts = categoryCounts(selId);
      var map = opts().relevance || {};
      var rows = ((H().filter && H().filter.categories()) || []).map(function (c) {
        var k = c.key, on = map[k] !== false, num = counts[k] || 0, label = c.label;
        // The category's own name, styled by the host's stylesheet if it wants to.
        // It used to borrow CH's register badge, which is a component of the app's
        // data tables and has no business being reachable from in here.
        var chip = '<span class="rd-cat rd-cat-' + esc(String(k).toLowerCase()) + '">' + esc(label) + '</span>';
        return '<label class="rpt-rel"><input type="checkbox" data-rd-rel="' + esc(k) + '"' + (on ? ' checked' : '') +
          ' aria-label="Include ' + esc(label) + ' items"> ' + chip + '<span class="rpt-rel-count">' + num + ' item' + (num === 1 ? '' : 's') + '</span></label>';
      }).join('');
      var omitted = omittedByRelevance(project, selId);
      return '<p class="muted rpt-note">Which categories of item the document carries. Anything switched off is counted and named in it, so a shorter report never passes for a complete one.</p>' +
        rows +
        (omitted
          ? '<p class="rpt-omit"><strong>' + omitted + '</strong> item' + (omitted === 1 ? '' : 's') + ' will be left out.</p>'
          : '<p class="rpt-omit muted">Every applicable item is being carried.</p>') +
        '<div class="rd-fieldset"><strong>Document</strong>' +
          // HDR-1: the OFFICIAL: Sensitive banner has moved to the Header & Footer pane,
          // which is where it goes on the page and where everything else that appears on
          // every page is now decided.
          // TTL-2: a project decision, so it is stored rather than reset each session —
          // hence its own attribute rather than another session flag.
          cb('data-rd-titleblock', 'Automatic title block (title, model and date)',
            ((project.report || {}).titleBlock === true)) +
          '<p class="muted rd-hint">Off, the document starts with whatever section you put first — compose your own title page as a section and give it the <strong>T</strong> level.</p>' +
        '</div>';
    }

    // ======================================================================
    // RD-4: formatting profiles (FMT-1..FMT-4)
    // ======================================================================

    function num(label, key, val, hint) {
      return '<label class="rd-lab rd-lab-s" title="' + esc(hint || '') + '">' + esc(label) +
        '<input value="' + esc(val == null ? '' : val) + '" data-rd-fmt="' + esc(key) + '" aria-label="' + esc(label) + '"></label>';
    }
    function pick(label, key, val, options, hint) {
      return '<label class="rd-lab rd-lab-s" title="' + esc(hint || '') + '">' + esc(label) +
        '<select data-rd-fmt="' + esc(key) + '" aria-label="' + esc(label) + '">' +
        options.map(function (o) {
          var v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label;
          return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
        }).join('') + '</select></label>';
    }
    var CAPTION_POSITIONS = [
      { value: 'below', label: 'Below the table' },
      { value: 'above', label: 'Above the table' }
    ];
    function flag(label, key, on, hint) {
      return '<label class="gen-opt" title="' + esc(hint || '') + '"><input type="checkbox" data-rd-fmt-bool="' + esc(key) + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }

