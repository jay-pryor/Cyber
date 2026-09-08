    /* An ADAPTER is not a PROVIDER. The adapter is CH's: it carries `columns` for the
     * Data tab's editable table and `reportColumns` for the document, which are
     * different sets of different things. The module's contract knows only `columns`,
     * meaning the ones the document prints — so the adapter is presented as a provider
     * here rather than renamed into one, which would have quietly emptied the Data tabs.
     *
     * `include` says where this section's ticks live: a register keeps them under
     * `datasetSections`, one entry per group, because that is where every project on
     * disk already has them. The module treats both names as opaque.
     */
    function providerFor(adapter, project, deviceId, keep) {
      if (!adapter) return null;
      return {
        id: 'ds:' + adapter.id,
        kind: 'dataset',
        label: adapter.label,
        keyColumn: adapter.keyColumn,
        columns: adapter.reportColumns || [],
        groups: adapter.reportGroups || null,
        include: { map: 'datasetSections', key: adapter.id, perGroup: true },
        // CH's own field on the block, so the Data tabs, the designer and the report
        // options all still address a register section by its dataset id.
        blockFields: { dsId: adapter.id },
        rows: function () { return gatherKept(project, deviceId, adapter.id, keep); }
      };
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

    /* -------------------------------------------------------------------------
     * CH's three entry points into the host-driven generator above.
     *
     * They exist because CH speaks of a project, a platform and a device, and the
     * module speaks of a host, sections and a subject. Each shim does the one
     * translation and nothing else, so the Report Design workspace, the Generate
     * button and 190-odd suites are all still calling what they always called.
     * ---------------------------------------------------------------------- */

    /** The host view of ONE project + platform, bound to one run. */
    function chHost(project, platform, opts) {
      opts = opts || {};
      return {
        getState: function () { return project; },
        commit: function (m) { App.store._commit(m); },
        clock: App.util.clock,
        subject: {
          list: function () { return App.ui.model.getLatestConfigs(project); },
          ready: function (id) { return App.completeness.deviceReady(project, id); },
          meta: function (id) { return metaFields(project, deviceConfig(project, id), App.util.clock.nowIso()); },
          metaLabel: 'Device Config Information'
        },
        sections: function (run) {
          return hostSections(project, (run && run.subjectId) || opts.deviceId || null, platform,
            relevanceFilter({ relevance: (run && run.categories) || opts.relevance }));
        }
      };
    }
    function deviceConfig(project, id) {
      return ((project && project.deviceConfigs) || []).filter(function (c) { return c.id === id; })[0] || null;
    }

    function reportBlocks(project, platform, opts) {
      return App.docGen.reportBlocks(chHost(project, platform, opts), opts);
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
    function sectionColumns(project, block, opts) {
      var platform = App.registry.getPlatform(project.platformProfileId);
      return App.docGen.sectionColumns(chHost(project, platform, opts), block, opts);
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
      var host = chHost(project, platform, Object.assign({ deviceId: deviceId }, opts || {}));
      return App.docGen.sectionContent(host, b, opts, ctx, deviceConfig(project, deviceId) ? (metaRows || []) : null);
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
      bopts.providers = hostSections(project, deviceId, platform, relevanceFilter(bopts));
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

