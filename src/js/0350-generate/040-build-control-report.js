    /**
     * Standalone control-keyed report (spec §20.5 / GEN-7): one section per control
     * APPLIED to the device (referenced by ≥1 decided applicable item), each listing the
     * satisfying items (Dataset · Key · Decision). Items with no control fall under
     * "(no control)" only if opts.includeUncontrolled.
     * @param {Project} project @param {string} deviceId @param {Object} [opts]
     * @returns {{blob:Blob,name:string,issues:Issue[],text?:string,files?:Object[]}}
     */
    function buildControlReport(project, deviceId, opts) {
      opts = opts || {};
      var platform = App.registry.getPlatform(project.platformProfileId);
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!platform || !dc) return { issues: [{ category: 'generation', severity: 'error', message: 'Unknown device or platform.', location: deviceId }] };
      var generatedUtc = App.util.clock.nowIso();
      var controlsById = {}; (project.controls || []).forEach(function (c) { controlsById[c.id] = c; });
      var NONE = '__none__', byCtl = {};
      platform.datasets.forEach(function (ds) {
        var adapter = App.registry.getDataset(project.platformProfileId, ds.id);
        var get = decisionColGet(adapter);
        var dispKey = (adapter && adapter.displayKey) || function (k) { return k; };
        gather(project, deviceId, ds.id).forEach(function (it) {
          var refs = (it.controlRefs && it.controlRefs.length) ? it.controlRefs : [NONE];
          refs.forEach(function (ref) { (byCtl[ref] = byCtl[ref] || []).push({ dsLabel: ds.label, key: dispKey(it.key), decision: String(get(it)) }); });
        });
      });
      function labelFor(ref) { if (ref === NONE) return '(no control)'; var c = controlsById[ref]; return c ? (c.title + ' (' + c.type + ')') : ref; }
      var refs = Object.keys(byCtl).filter(function (ref) { return ref !== NONE || opts.includeUncontrolled; });
      refs.sort(function (a, b) { var la = labelFor(a), lb = labelFor(b); return la < lb ? -1 : la > lb ? 1 : 0; });

      var blocks = [{ id: 'meta', kind: 'meta', label: 'Device Config Information', included: true, level: null,
        body: App.report.metaTable(deviceMeta(project, dc, generatedUtc), { captionId: 'meta', captionText: 'Device Config Information' }) }];

      if (!refs.length) {
        blocks.push({ id: 'applied', kind: 'note', label: 'Applied controls', included: true, level: null,
          body: MD.text('No controls are satisfied by this device\'s decided items.') });
      } else {
        refs.forEach(function (ref) {
          var c = controlsById[ref];
          var parts = [];
          if (ref !== NONE && c && c.description) parts.push(MD.text(c.description));
          // JUS-3: state + justification for THIS device, immediately under the heading.
          if (ref !== NONE && c) {
            var st = App.store.controlDeviceState(c, dc.baseId);
            var wy = App.store.controlDeviceJustification(c, dc.baseId);
            parts.push('**' + MD.text('Status on ' + dc.name + ':') + '** ' + MD.text(App.projectIo.controlStateLabel(st)));
            parts.push('**' + MD.text('Justification:') + '** ' + (wy ? MD.text(wy) : '*' + MD.text('None recorded.') + '*'));
          }
          var rows = byCtl[ref].slice().sort(function (a, b) { return (a.dsLabel + a.key) < (b.dsLabel + b.key) ? -1 : 1; })
            .map(function (r) { return [MD.cell(r.dsLabel), MD.code(r.key), MD.cell(r.decision)]; });
          parts.push(MD.table(['Dataset', 'Key', 'Decision'].map(MD.cell), rows,
            App.report.tableOpts({ captionId: 'ctl-' + ref, captionText: labelFor(ref) })));
          blocks.push({ id: 'ctl:' + ref, kind: 'control-entry', label: labelFor(ref), included: true, level: null, body: MD.join(parts) });
        });
      }

      return emitDocument(project, dc, 'control', generatedUtc, blocks, {
        title: 'Control Report — ' + dc.name,
        subtitle: dc.model + ' · ' + dc.firmware,
        classification: !!opts.classification
      });
    }

    // =========================================================================
    // PRO-2: the Procedure report — the work in the ORDER it is carried out.
    //
    // The other four outputs are organised by STRUCTURE: by dataset, by control, by
    // deviation. None of them answers the question someone standing in front of the
    // device actually has, which is "what do I do first, and what do I do after that".
    // So this one is organised by SEQUENCE, and the sequence is a decision the operator
    // records once (store.setProcedureOrder) rather than something the tool infers.
    //
    // A step is one of two things, and which one is decided by the ADAPTER, never here:
    //   * a whole captured register — "Configure Packages" — because the work is one
    //     scripted pass over hundreds of keys, and listing 400 packages as 400 steps
    //     would bury the six manual actions that genuinely need their own place;
    //   * a single hand-authored action (adapter.procedureStepPerItem), because each one
    //     IS a distinct piece of manual work with its own procedure written against it.
    // =========================================================================

    /** Items applicable to a device for a dataset, effective decisions applied, key-sorted. */
    function applicableEffective(project, deviceId, dsId) {
      var dc = (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0];
      if (!dc || !App.registry.deviceHasDataset(project, dc, dsId)) return [];
      var ks = App.registry.applicableKeySet(project, dc, dsId);
      return (project.items[dsId] || []).filter(function (it) { return ks[it.key]; })
        .slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
        .map(function (it) { return App.overrides ? App.overrides.effectiveItem(project, dsId, it, deviceId) : it; });
    }

    /**
     * PRO-2: the ordered steps of the procedure for one device.
     *
     * Ordering is SELF-HEALING by construction: the saved order is a ranking, not the
     * list. A step id that no longer exists (a deleted custom action) simply ranks
     * nothing; a step the saved order has never seen (a new action) falls to the end in
     * dataset order rather than vanishing. That is why deleting an action can never
     * invalidate the project, and why no pruning pass is needed on load.
     *
     * @param {Project} project @param {string} deviceId
     * @returns {Array<{id:string,kind:'dataset'|'item',label:string,dsId:string,dsLabel:string,
     *                  key?:string,item?:RegisterItem,adapter:Object,count?:number}>}
     */
    function procedureSteps(project, deviceId) {
      var platform = project ? App.registry.getPlatform(project.platformProfileId) : null;
      var dc = project ? (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0] : null;
      if (!platform || !dc) return [];
      var steps = [];
      platform.datasets.forEach(function (ds) {
        var adapter = App.registry.getDataset(project.platformProfileId, ds.id);
        if (!adapter) return;
        var items = applicableEffective(project, deviceId, ds.id);
        if (adapter.procedureStepPerItem) {
          items.forEach(function (it) {
            steps.push({ id: 'item:' + ds.id + ':' + it.key, kind: 'item', label: it.key,
              dsId: ds.id, dsLabel: ds.label, key: it.key, item: it, adapter: adapter });
          });
        } else if (App.registry.deviceHasDataset(project, dc, ds.id)) {
          steps.push({ id: 'ds:' + ds.id, kind: 'dataset',
            label: adapter.procedureStepLabel || ('Configure ' + ds.label),
            dsId: ds.id, dsLabel: ds.label, adapter: adapter, count: items.length });
        }
      });
      var order = (project.procedure && project.procedure.order) || [];
      var rank = {}; order.forEach(function (id, i) { rank[id] = i; });
      var n = order.length;
      return steps.map(function (s, i) { return { s: s, r: rank[s.id] === undefined ? n + i : rank[s.id] }; })
        .sort(function (a, b) { return a.r - b.r; })
        .map(function (x) { return x.s; });
    }

    /** Prose -> markdown: escaped, with the author's line breaks kept (they are the steps). */
    function proseMd(t) {
      return String(t == null ? '' : t).split(/\n{2,}/)
        .map(function (p) { return MD.text(p).split('\n').join('\\\n'); })
        .filter(function (p) { return p.length; }).join('\n\n');
    }

    /**
     * The action -> count breakdown for an enum dataset ('' when it has no enum field).
     * Discovered from the decisionSchema, so a dataset with a different vocabulary — or
     * none at all — needs no change here (DOD-11).
     */
    function actionBreakdown(adapter, items, capId, capText) {
      var f = ((adapter && adapter.decisionSchema) || []).filter(function (x) { return x.kind === 'enum'; })[0];
      if (!f) return '';
      var counts = {};
      items.forEach(function (it) {
        var v = (it.decision && it.decision[f.name] != null) ? String(it.decision[f.name]) : '(undecided)';
        counts[v] = (counts[v] || 0) + 1;
      });
      var keys = Object.keys(counts).sort();
      if (!keys.length) return '';
      var head = f.name.charAt(0).toUpperCase() + f.name.slice(1);   // 'action' -> 'Action'
      return MD.table([MD.cell(head), MD.cell('Items')], keys.map(function (v) { return [MD.cell(v), MD.cell(counts[v])]; }),
        App.report.tableOpts({ captionId: capId, captionText: capText }));
    }

    /**
     * One step's body. Dataset steps describe a scripted pass; item steps carry the
     * runbook.
     *
     * The runbook used to be a two-column table. In markdown it is a run of labelled
     * paragraphs instead: a Procedure field is several lines of prose, and a table cell
     * holding several lines of prose is both the hardest thing to represent in markdown
     * and the worst thing to read in a PDF, where it gets a narrow column and a lot of
     * hyphenation.
     */
    function procedureStepBody(project, deviceId, step, notes) {
      var parts = [];
      var note = notes[step.id] || '';
      if (step.kind === 'dataset') {
        parts.push(MD.text(step.adapter.procedureStepIntent ||
          ('Apply every decision recorded in the ' + step.dsLabel + ' register for this device.')));
        parts.push(MD.text(step.count + ' item(s) in scope on this device. The exact commands are in the ' +
          'Implementation bundle generated for this device; this step says when to run them.'));
        var bd = actionBreakdown(step.adapter, applicableEffective(project, deviceId, step.dsId),
          'step-' + step.id, step.label);
        if (bd) parts.push(bd);
      } else {
        var it = step.item;
        if (it.description) parts.push(proseMd(it.description));
        function field(label, body) { if (body) parts.push('**' + MD.text(label + ':') + '**\n\n' + body); }
        field('Action', it.decision ? proseMd(String(it.decision.action)) : '*' + MD.text('No action recorded — this step is undecided.') + '*');
        field('Procedure', it.procedure ? proseMd(it.procedure) : '*' + MD.text('No procedure written yet.') + '*');
        field('Rationale', it.rationale ? proseMd(it.rationale) : '');
        field('Rollback', it.rollback ? proseMd(it.rollback) : '');
        field('Controls', controlTitlesFor(project, it.controlRefs));
        field('Security Relevance', it.relevance ? MD.text(it.relevance) : '');
        if (it.diverges) field('Diverges from guidelines', proseMd(it.divergenceNarrative || 'Flagged, no narrative recorded.'));
      }
      if (note.trim()) parts.push('**' + MD.text('Notes for this step:') + '**\n\n' + proseMd(note));
      return MD.join(parts);
    }
    /** Control ids -> titles, for the step bodies (display only). */
    function controlTitlesFor(project, refs) {
      var by = {}; ((project && project.controls) || []).forEach(function (c) { by[c.id] = c.title; });
      return (refs || []).map(function (r) { return MD.text(by[r] || r); }).join(', ');
    }

    /**
     * PRO-2: the Procedure report. One numbered step per entry, in the configured order,
     * preceded by the running order itself so the sequence can be checked at a glance
     * before anyone touches a device.
     * @param {Project} project @param {string} deviceId
     * @param {{classification?:boolean, exclude?:Object<string,boolean>}} [opts]
     * @returns {{blob:Blob,name:string,issues:Issue[],text?:string,files?:Object[]}}
     */
    function buildProcedure(project, deviceId, opts) {
      opts = opts || {};
      var platform = App.registry.getPlatform(project.platformProfileId);
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!platform || !dc) return { issues: [{ category: 'generation', severity: 'error', message: 'Unknown device or platform.', location: deviceId }] };
      var generatedUtc = App.util.clock.nowIso();
      var notes = (project.procedure && project.procedure.notes) || {};
      var excluded = opts.exclude || {};
      var steps = procedureSteps(project, deviceId).filter(function (s) { return !excluded[s.id]; });

      var blocks = [{ id: 'meta', kind: 'meta', label: 'Device Config Information', included: true, level: null,
        body: App.report.metaTable(deviceMeta(project, dc, generatedUtc), { captionId: 'meta', captionText: 'Device Config Information' }) }];

      var orderRows = steps.map(function (s, i) {
        return [MD.cell(i + 1), MD.cell(s.label), MD.cell(s.kind === 'dataset' ? s.dsLabel + ' register' : s.dsLabel)];
      });
      blocks.push({ id: 'running-order', kind: 'note', label: 'Running order', included: true, level: null,
        body: orderRows.length
          ? MD.table(['Step', 'What is done', 'Where it comes from'].map(MD.cell), orderRows,
              App.report.tableOpts({ captionId: 'running-order', captionText: 'Running order' }))
          : MD.text('No steps — nothing applies to this device.') });

      steps.forEach(function (s, i) {
        blocks.push({ id: 'step:' + s.id, kind: 'step', label: 'Step ' + (i + 1) + ' — ' + s.label,
          included: true, level: null, body: procedureStepBody(project, deviceId, s, notes) });
      });

      return emitDocument(project, dc, 'procedure', generatedUtc, blocks, {
        title: 'Procedure — ' + dc.name,
        subtitle: dc.model + ' · ' + dc.firmware,
        classification: !!opts.classification
      });
    }
    App.generate = {
      buildImplementation: buildImplementation, buildVerification: buildVerification, buildReport: buildReport,
      buildControlReport: buildControlReport, _gather: gather,
      // PRO-2: the Procedure report + the step list the Generate tab orders.
      buildProcedure: buildProcedure, procedureSteps: procedureSteps,
      // RPT-2/RPT-3/DOC-1: the Report Design workspace builds its section list, its
      // level pickers and its relevance filter from these, so the panel and the
      // document cannot disagree.
      reportBlocks: reportBlocks,
      // CCOL-1/TW-2: the columns a generated section will actually have.
      sectionColumns: sectionColumns, CONTROL_COLUMNS: CONTROL_COLUMNS,
      // REF-2: which control mentions link, and where they land.
      controlLinkTerms: controlLinkTerms, controlAnchor: controlAnchor,
      relevanceCounts: relevanceCounts, relevanceKeys: relevanceKeys,
      relevanceLabel: relevanceLabel, REL_UNSET: REL_UNSET,
      // v2.2: exposed so the designer's live preview renders the SAME document the
      // Generate button downloads, rather than a second approximation of it.
      emitDocument: emitDocument,
      // GEN-TAB: `/[Tag]` placeholders — finding them, filling them, naming the file.
      findTags: findTags, applyTags: applyTags, docFilename: docFilename, TAG_RE: TAG_RE,
      // META-1 / GUIDE-1 / RD-8: the designer builds its metadata picker, its
      // divergence check and its per-section preview from these.
      metaFields: metaFields, deviceMeta: deviceMeta,
      guidelineChildren: guidelineChildren, hasGuidelineDeviations: hasGuidelineDeviations,
      sectionContent: sectionContent
    };
  })(App);
