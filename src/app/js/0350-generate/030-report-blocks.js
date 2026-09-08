    /**
     * The report's candidate BLOCKS, in the order they will be emitted (spec §20.4 /
     * GEN-4, RPT-3, DOC-1). The "Sections included" table, the report body and the
     * Report Design workspace are all built from THIS, so the three cannot drift.
     *
     * A block is the orderable unit and carries a stable id — `toc`, `meta`,
     * one `ds:<dsId>` per dataset, `control`, `guidelines`, plus one per hand-authored
     * custom section. Ids come from the platform and from the project, so a new
     * dataset is orderable with no core edit (DOD-11).
     *
     * DOC-1: each block also carries its explicit heading `level` when the operator
     * has pinned one, or null for "decide automatically". Resolution happens in
     * App.doc.outline, not here — this function only reports what was chosen.
     *
     * @returns {Array<{id:string,kind:string,label:string,included:boolean,level:?number,
     *                  dsId?:string,title?:string,parts?:Array,
     *                  groups?:Array<{value:string,label:string,included:boolean}>}>}
     */
    function reportBlocks(project, platform, opts) {
      opts = opts || {};
      var sec = opts.sections || {}, dsSecAll = opts.datasetSections || {}, d = [];
      var bag = (project && project.report) || {};
      var levels = bag.levels || {};

      /* TOC-1: the contents list is a section, so it can be ordered, levelled, renamed
       * and given an introduction like any other. It used to be a YAML variable, which
       * pinned it immediately after the title with LaTeX's own heading — the one part of
       * the document the section order could not touch.
       *
       * TWO switches, and both mean something: "Include a table of contents" in the
       * formatting profile is the house decision and travels with the profile; the
       * section's own tick is this report's decision, like every other section's. A
       * profile with no contents list offers no row to tick. */
      var wantToc = !!(App.docFormat.resolve(project).toc || {}).include;
      d.push({ id: 'toc', kind: 'toc', label: 'Contents', included: wantToc && sec.toc !== false, empty: !wantToc });
      d.push({ id: 'meta', kind: 'meta', label: 'Device Config Information', included: sec.meta !== false });
      platform.datasets.forEach(function (ds) {
        var adapter = App.registry.getDataset(project.platformProfileId, ds.id);
        var dsSec = dsSecAll[ds.id] || {};
        if (adapter && adapter.reportGroups && adapter.reportGroups.field) {
          var groups = adapter.reportGroups.options.map(function (g) {
            return { value: g.value, label: g.label, included: dsSec[g.value] !== false };
          });
          d.push({
            id: 'ds:' + ds.id, kind: 'dataset', dsId: ds.id, label: ds.label, groups: groups,
            // A grouped dataset is "included" while any one of its groups is.
            included: groups.some(function (g) { return g.included; })
          });
        } else {
          d.push({ id: 'ds:' + ds.id, kind: 'dataset', dsId: ds.id, label: ds.label, groups: null, included: dsSec._all !== false });
        }
      });
      d.push({ id: 'control', kind: 'control', label: 'Control coverage', included: sec.control !== false });
      // GUIDE-1: only a candidate when something actually diverges. A section that
      // exists solely to say "nothing diverges" is noise.
      var anyDiv = hasGuidelineDeviations(project, opts.deviceId, platform, relevanceFilter(opts));
      d.push({
        id: 'guidelines', kind: 'guidelines', label: 'Deviations from Security Guidelines',
        included: anyDiv && sec.guidelines !== false, empty: !anyDiv
      });

      // DOC-4: hand-authored sections join the SAME list, which is what lets them be
      // interleaved with the generated ones rather than bolted on at the end.
      (bag.sections || []).forEach(function (s) {
        d.push({
          id: s.id, kind: 'custom', label: String(s.title || '').trim() || '(untitled section)',
          title: s.title || '', parts: s.parts || [], included: sec[s.id] !== false
        });
      });

      /* NAM-1: a section's NAME and its HEADING are two different strings.
       *
       * The heading is what the document prints; the name is what the designer's
       * section list calls it. They were the same string, which made a section whose
       * heading is long, or conditional on how the report is being used ("Deviations
       * from ASD Samsung Hardening Guidelines, June 2026"), unusable as a list entry —
       * and gave a shorthand nowhere to live. With no name, the name IS the heading, so
       * nothing changes for a section that never needed one.
       *
       * `title` therefore becomes the heading on EVERY block, generated or not, and
       * `label` becomes the name. App.doc.headingFor and refResolver already prefer
       * `title` over `label`, so a named section still prints its heading. */
      var names = bag.names || {}, intros = bag.intros || {}, tstyles = bag.tableStyles || {}, twidths = bag.tableWidths || {};
      var heads = bag.headings || {}, introNums = bag.introNumbered || {};
      var centred = bag.centred || {};
      var tableText = bag.tables || {}, breaks = bag.pageBreak || {}, noToc = bag.noToc || {};
      var space = bag.space || {};   // SPC-1
      return applySectionOrder(d, bag.order).map(function (b) {
        // NAM-2: a GENERATED section's heading is editable too. It has to be: once a
        // name and a heading are two different strings, a section whose name is a
        // shorthand needs somewhere to say what the long form actually is — and
        // "Deviations from Security Guidelines" is exactly the heading a house wants to
        // reword. A hand-authored section keeps its own Heading box (`title`) and is
        // deliberately not overridden here, so its heading has one home, not two.
        var dflt = b.title === undefined ? b.label : b.title;
        var heading = dflt;
        if (b.kind !== 'custom' && typeof heads[b.id] === 'string') heading = heads[b.id];
        var name = String(names[b.id] || '').trim();
        return Object.assign({}, b, {
          title: heading,
          // The wording the platform declares, so the designer can offer it as the
          // placeholder and tell a reworded heading from an untouched one.
          defaultTitle: dflt,
          label: name || String(heading).trim() || b.label,
          name: name,
          // TOC-1: a contents list starts as a TITLE — "1 Contents" numbered ahead of
          // the section it lists reads as a section of the report, which it is not. It
          // is only a default; the level picker moves it like any other block's.
          level: levels[b.id] === undefined ? (b.kind === 'toc' ? App.doc.TITLE_LEVEL : null) : levels[b.id],
          centre: centred[b.id] === true,
          // SEC-1: prose the operator wrote to sit between this section's heading and
          // its generated table. Stored as the same rich-text token markup a custom
          // paragraph uses, so one editor serves both.
          intro: String(intros[b.id] || ''),
          // SEC-2: whether that introduction takes a number of its own.
          introNumbered: introNums[b.id] === true,
          // TBS-1: which of this section's tables wear the profile's table styling.
          tableStyle: { head: (tstyles[b.id] || {}).head === true, firstColumn: (tstyles[b.id] || {}).firstColumn === true },
          // TW-2: hand-set column widths for this section's generated table.
          widths: Array.isArray(twidths[b.id]) ? twidths[b.id].slice() : null,
          // TBL-1: the title row, caption and column headings of each table this section
          // produces, keyed by group value (or `_all` when it produces just the one).
          tables: tableText[b.id] || null,
          /* SEC-4: whether this section starts a page of its own.
           *
           * Distinct from the formatting profile's per-LEVEL `pageBreakBefore`, which is
           * a house rule ("every H1 starts a page"); this is a decision about ONE
           * section, which is what an annex or a title page needs. App.doc emits the
           * break, so it lands ahead of the heading rather than inside the body. */
          pageBreakBefore: breaks[b.id] === true,
          /* SPC-1: millimetres of empty page above this section's heading.
           *
           * Composes with the page break above rather than replacing it: "start a new
           * page, then come down 60mm on it" is one signature page, and the two decisions
           * are made separately because either is useful without the other. */
          spaceBefore: Number(space[b.id]) > 0 ? Number(space[b.id]) : 0,
          // SEC-4: a section that prints a heading but is not listed in the contents —
          // a title block, a colophon, anything that is not part of the argument.
          noToc: noToc[b.id] === true
        });
      });
    }

    /**
     * TW-2/CCOL-1: the COLUMNS a generated section's table will have, as they will be
     * after the optional ones are filtered.
     *
     * The Report Design pane needs this twice over: to offer a tick per optional column,
     * and to draw a width editor with the right number of slots and the right labels.
     * Deriving it here rather than in the view is what keeps the designer's picture and
     * the generated table the same picture — the same rule as reportBlocks.
     *
     * @returns {?{fixed:Array<{id,label}>, optional:Array<{id,label}>, all:Array<{id,label}>}}
     *          null for a hand-authored section, whose parts carry their own columns
     */
    /* An ADAPTER is not a PROVIDER. The adapter is CH's: it carries `columns` for the
     * Data tab's editable table and `reportColumns` for the document, which are
     * different sets of different things. The module's contract knows only `columns`,
     * meaning the ones the document prints — so the adapter is presented as a provider
     * here rather than renamed into one, which would have quietly emptied the Data tabs. */
    function providerFor(adapter) {
      if (!adapter) return null;
      return {
        id: adapter.id,
        label: adapter.label,
        keyColumn: adapter.keyColumn,
        columns: adapter.reportColumns || [],
        groups: adapter.reportGroups || null
      };
    }

    function sectionColumns(project, block, opts) {
      opts = opts || {};
      if (!block || block.kind === 'custom') return null;
      var colOpts = (opts.columns || {})[block.dsId || block.kind] || {};
      function pack(fixed, optional) {
        // COL-3: the same predicate the builders use, so the designer's column list and
        // the table it is describing cannot disagree about what a blank answer means.
        var shown = optional.filter(function (c) { return App.report.columnOn(c, colOpts); });
        return { fixed: fixed, optional: optional, all: fixed.concat(shown) };
      }
      if (block.kind === 'dataset') {
        var adapter = App.registry.getDataset(project.platformProfileId, block.dsId);
        if (!adapter) return null;
        // KEY-1: the key column is DECLARED. It used to be recovered by rendering an
        // empty section and scraping the first pipe-table header row out of the result,
        // which returned nothing at all for an adapter whose section is not a pipe
        // table — a trap for the next dataset rather than for these three.
        var key = adapter.keyColumn || { id: '_key', label: 'Key' };
        return pack([{ id: '_key', label: key.label }], (adapter.reportColumns || []).filter(function (c) { return c.optional; }));
      }
      if (block.kind === 'control') return pack([{ id: 'control', label: 'Control' }], CONTROL_COLUMNS);
      if (block.kind === 'meta') return pack([{ id: 'field', label: 'Field' }, { id: 'value', label: 'Value' }], []);
      if (block.kind === 'guidelines') {
        return pack([{ id: 'item', label: 'Item' }, { id: 'description', label: 'Description' },
          { id: 'narrative', label: 'How it departs, and why' }], []);
      }
      return null;
    }

    /** RPT-2: the Security Relevance categories in report order — unset comes last. */
    function relevanceKeys() { return App.projectIo.RELEVANCE_OPTIONS.concat([REL_UNSET]); }
    function relevanceLabel(k) { return k === REL_UNSET ? '(not set)' : k; }

    /**
     * RPT-2: how many applicable, complete items sit in each Security Relevance category
     * for a device. Shared by the report's filter note and the Report Design workspace,
     * so the count shown before generating is the count the report states afterwards.
     * @returns {Object<string,number>} keyed by relevance value, unset keyed REL_UNSET
     */
    function relevanceCounts(project, deviceId) {
      var platform = App.registry.getPlatform(project.platformProfileId);
      var out = {};
      if (!platform) return out;
      platform.datasets.forEach(function (ds) {
        gather(project, deviceId, ds.id).forEach(function (it) {
          var k = relevanceKeyOf(it);
          out[k] = (out[k] || 0) + 1;
        });
      });
      return out;
    }

    /**
     * Fill in ONE generated block's content.
     *
     * Pulled out of buildReport so the Report Design workspace can render a single
     * section for its preview without generating the whole document — and, more to the
     * point, so the preview of a section and the section in the finished document come
     * from the same call and cannot drift.
     *
     * @returns {Object} the block, plus `body` (markdown) and/or `children`
     */
    function sectionContent(project, deviceId, platform, b, opts, ctx, metaRows) {
      opts = opts || {};
      var keep = relevanceFilter(opts);
      var dc = (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0];
      var out;
      // CAP-1/TBS-1: a generated table's caption is DERIVED from the block it belongs
      // to, so the same project always emits the same caption and the same anchor
      // (DOD-7) — nothing is minted at generate time.
      var capText = String(b.title || '').trim() || b.label;
      var profile = App.docFormat.resolve(project);
      var tblOpts = {
        captionId: b.id, captionText: capText,
        // REF-2: a control named in any cell of this section links to its coverage row.
        linkTerms: opts.linkTerms || null,
        metrics: App.docFormat.tableMetrics(profile),
        style: App.docFormat.tableStyle(profile, b.tableStyle),
        // TW-2: a generated table's columns are the section's, not any one table's, so a
        // grouped register's groups all wear the same widths — which is right, since
        // they are the same columns showing different rows.
        widths: (b.widths && b.widths.length) ? b.widths : null
      };
      if (b.kind === 'toc') {
        // TOC-1: the whole body is one macro. The entries come from LaTeX's .toc file,
        // which is written by the headings this document has already emitted — so a
        // contents section placed at the end lists the same document as one at the
        // front, and neither needs to be told what is in it.
        out = Object.assign({}, b, { body: MD.rawLatex('\\chContents') });
      } else if (b.kind === 'meta') {
        var metaText = tableWording(b, '_all');
        out = Object.assign({}, b, { body: dc
          ? App.report.metaTable(metaRows || [],
              Object.assign(withWording(tblOpts, metaText, capText),
                { headings: headingsFor(['field', 'value'], ['Field', 'Value'], metaText.columns) }))
          : '' });
      } else if (b.kind === 'control') {
        out = Object.assign({}, b, { body: buildControlSection(project, deviceId, platform, keep, tblOpts, (opts.columns || {}).control, b) });
      } else if (b.kind === 'guidelines') {
        out = Object.assign({}, b, { body: '', children: guidelineChildren(project, deviceId, platform, keep, tblOpts, b) });
      } else if (b.kind === 'custom') {
        out = b;                                            // App.doc renders its parts
      } else {
        var adapter = App.registry.getDataset(project.platformProfileId, b.dsId);
        var items = gatherKept(project, deviceId, b.dsId, keep);
        var r = App.docProviders.renderSection(providerFor(adapter), items, ctx, Object.assign({
          columns: (opts.columns || {})[b.dsId], groups: (opts.datasetSections || {})[b.dsId] || {},
          // TBL-1: the per-table wording, passed straight through to buildSection —
          // a provider never has to know it exists (DOD-11).
          tables: b.tables || null
        }, tblOpts));
        out = Object.assign({}, b, { body: r.body, children: r.children });
      }
      /* SEC-1: the operator's own words, between the heading and whatever the register
       * produced. It sits ABOVE the table because that is where a reader looks for what
       * a table is for — and it belongs to the section rather than to the table, so a
       * grouped dataset's introduction is written once rather than once per group.
       *
       * Kept OUT of `body` and handed to App.doc as its own field, because SEC-2 lets it
       * take a number and numbering is App.doc's job — baked into the body it would have
       * been a string nobody could put a number in front of. */
      // SEC-1: the introduction stays as its TOKEN text and is rendered by App.doc,
      // which is the only place holding a reference resolver (REF-1). It used to be
      // rendered here with an empty options object, which is why a cross-reference in
      // an introduction printed as "[missing reference]" — or, before REF-1, as the
      // raw token.
      // Centring is applied to the BODY, not the heading: a centred heading is a
      // formatting-profile decision, and centring the heading here would fight it.
      if (b.centre) {
        if (out.body) out = Object.assign({}, out, { body: MD.centred(out.body) });
        if (out.children && out.children.length) {
          out = Object.assign({}, out, { children: out.children.map(function (c) {
            return Object.assign({}, c, { body: c.body ? MD.centred(c.body) : c.body });
          }) });
        }
      }
      return out;
    }

    /**
     * @param {Project} project @param {string} deviceId
     * @param {Object} [opts]  `_gen.report`-shaped (undefined ⇒ include everything).
     * @returns {{blob:Blob,name:string,issues:Issue[],text?:string,files?:Object[]}}
     */
    function buildReport(project, deviceId, opts) {
      opts = opts || {};
      var platform = App.registry.getPlatform(project.platformProfileId);
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!platform || !dc) return { issues: [{ category: 'generation', severity: 'error', message: 'Unknown device or platform.', location: deviceId }] };
      var generatedUtc = App.util.clock.nowIso();
      var ctx = ctxFor(project, dc, generatedUtc, 'reporting');

      // The device travels in the options because one block's very existence depends
      // on it: GUIDE-1 is present only when something on THIS device diverges, under
      // THIS relevance filter.
      var bopts = Object.assign({}, opts, { deviceId: deviceId });
      var blocks = reportBlocks(project, platform, bopts);
      // REF-2: which control mentions become links is decided ONCE, from the blocks that
      // will actually be emitted — a document without the coverage section gets no links
      // rather than a page of links to a section that is not in it.
      bopts.linkTerms = controlLinkTerms(project, blocks);
      var metaRows = deviceMeta(project, dc, generatedUtc);
      var prepared = blocks.map(function (b) { return sectionContent(project, deviceId, platform, b, bopts, ctx, metaRows); });

      return emitDocument(project, dc, 'reporting', generatedUtc, prepared, {
        linkTerms: bopts.linkTerms,
        // GEN-TAB: the operator's filename and their answers to this document's tags.
        filename: opts.filename, tags: opts.tags,
        title: 'CH Configuration Report — ' + dc.name,
        subtitle: dc.model + ' · ' + dc.firmware,
        classification: !!opts.classification
      });
    }

    /** The adapter's decision-column display getter (generic; no adapter change). */
    function decisionColGet(adapter) {
      var col = (adapter.columns || []).filter(function (c) { return c.key === 'decision'; })[0];
      return (col && col.get) ? col.get : function (it) { return it.decision ? stable(it.decision) : ''; };
    }

