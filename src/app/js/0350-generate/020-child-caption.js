    /** The rows actually emitted: metaFields minus whatever was switched off. */
    /**
     * GUIDE-1: the items flagged as departing from the security guidelines (DIV-1),
     * grouped by the register they came from.
     *
     * A dataset with nothing flagged is NOT listed — an empty "Packages" heading under
     * this section would read as "we checked and there is nothing", which is the same
     * thing an absent heading says with less noise. Same rule at the top: if nothing
     * anywhere diverges, the whole section drops out (see reportBlocks).
     *
     * @param {?function(RegisterItem):boolean} [keep]  RPT-2 relevance predicate
     * @returns {Array<{id:string,label:string,body:string}>} one child per dataset
     */
    /** CAP-1: the caption options for one CHILD of a section, derived from the parent's.
     *  TBL-1: the child's LABEL no longer rides along in the caption — a child is a table
     *  under the section now, not a sub-section, and the section names it. */
    function childCaption(tblOpts, childId, childLabel) {
      var o = Object.assign({}, tblOpts || {});
      if (o.captionId) o.captionId = o.captionId + '-' + childId;
      return o;
    }

    function guidelineChildren(project, deviceId, platform, keep, tblOpts, block) {
      var out = [];
      // REF-2: a departure is usually explained in terms of the control it departs from,
      // so those mentions link like any other.
      var terms = (tblOpts && tblOpts.linkTerms) || null;
      platform.datasets.forEach(function (ds) {
        var adapter = App.registry.getDataset(project.platformProfileId, ds.id);
        var dispKey = (adapter && adapter.displayKey) || function (k) { return k; };
        var rows = gatherKept(project, deviceId, ds.id, keep)
          .filter(function (it) { return it.diverges; })
          .map(function (it) {
            return [
              MD.code(dispKey(it.key)),
              it.description ? MD.autoLink(MD.cell(it.description), terms) : '*' + MD.text('No description recorded.') + '*',
              it.divergenceNarrative ? MD.autoLink(MD.cell(it.divergenceNarrative), terms)
                : '*' + MD.text('Flagged, no narrative recorded.') + '*'
            ];
          });
        if (!rows.length) return;
        // TBL-1: one register's divergences are one table, with its own title row,
        // caption and column headings — keyed by the register, since that is what
        // distinguishes this table from the next one in the same section.
        var text = tableWording(block, ds.id);
        var base = childCaption(tblOpts, ds.id, ds.label);
        out.push({
          id: ds.id, label: ds.label,
          // Each register gets its own caption anchor — otherwise two tables in one
          // section would answer to the same one.
          body: MD.table(headingsFor(['item', 'description', 'narrative'],
            ['Item', 'Description', 'How it departs, and why'], text.columns).map(MD.cell), rows,
            App.report.tableOpts(withWording(base, text, base.captionText)))
        });
      });
      return out;
    }

    /**
     * GUIDE-1: does anything at all diverge? Decides whether the section exists.
     * Takes the SAME relevance predicate the section renders under — otherwise
     * filtering out the only flagged item would leave a heading with nothing beneath it.
     */
    function hasGuidelineDeviations(project, deviceId, platform, keep) {
      if (!platform) return false;
      if (deviceId) {
        return platform.datasets.some(function (ds) {
          return gatherKept(project, deviceId, ds.id, keep).some(function (it) { return it.diverges; });
        });
      }
      // No device in hand (the designer before one is picked): fall back to the whole
      // register, so the section is offered rather than mysteriously missing.
      return Object.keys((project && project.items) || {}).some(function (dsId) {
        return (project.items[dsId] || []).some(function (it) { return it.diverges; });
      });
    }

    function deviceMeta(project, dc, generatedUtc) {
      var chosen = (project && project.report && project.report.meta) || {};
      return metaFields(project, dc, generatedUtc).filter(function (r) { return chosen[r.id] !== false; });
    }

    /* =========================================================================
     * v2.2 — the document pipeline.
     *
     * All three document outputs (Reporting, Control report, Procedure) are markdown
     * now, and all three go out through emitDocument(): blocks in, one .md out. The
     * manifest.json that used to ride beside them in a zip is gone — the provenance
     * it carried (tool, version, device, generated-at, project hash) is inside the
     * document's own metadata block instead, where a reader of the PDF can see it.
     *
     * The SCRIPT bundles (Implementation, Verification) are untouched: they are still
     * zips and still carry a manifest, because a bundle of executables genuinely does
     * need a checksum list beside it.
     * ====================================================================== */

    /** The stable logical filename each document command produces. */
    var DOC_FILENAMES = { reporting: 'report.md', control: 'control-report.md', procedure: 'procedure.md' };

    /* GEN-TAB: the `/[Tag]` placeholder machinery is App.docGen's — nothing in it
     * knows what a device is. Aliased here so the call sites in this closure, and the
     * suites written against App.generate, are unchanged. */
    var TAG_RE = App.docGen.TAG_RE;
    var findTags = App.docGen.findTags;
    var applyTags = App.docGen.applyTags;
    var docFilename = App.docGen.docFilename;

    /**
     * CH's document pipeline: the module's, with CH's own facts supplied.
     *
     * Everything generic about emitting a document — resolving the profile, numbering
     * the outline, the YAML front matter, the render, the placeholder pass — moved to
     * App.docGen.emitDocument, so a second host does not have to reproduce eighty lines
     * of it (CONF-1). What stays here is the part only CH can answer: which device this
     * is, what the project hashes to, what the tool is called, what its classification
     * banner says, and the stable name each command's file takes.
     *
     * @param {Array} blocks  reportBlocks()-shaped, each with `body` and/or `parts`
     * @param {{title:string, subtitle?:string, classification?:boolean}} meta
     * @returns {{blob:Blob,name:string,issues:Issue[],text:string,files:Object[]}}
     */
    function emitDocument(project, dc, command, generatedUtc, blocks, meta) {
      return App.docGen.emitDocument({ getState: function () { return project; } }, blocks, {
        // TTL-2 gates all three of these inside the module. The date is AEST because
        // that is the timezone every other date in a CH document is printed in.
        title: meta.title, subtitle: meta.subtitle || '',
        date: App.util.clock.toAest(generatedUtc),
        classification: meta.classification ? 'OFFICIAL: Sensitive' : '',
        linkTerms: meta.linkTerms || null,
        filename: meta.filename, tags: meta.tags,
        // The manifest's job, done inside the document: the provenance a reader of the
        // PDF can see. Every one of the five is a CH shape, which is why they are
        // handed in rather than reached for.
        extra: [
          { key: 'tool', value: TOOL_NAME + ' ' + TOOL_VERSION },
          { key: 'device-id', value: dc.id },
          { key: 'device-version', value: 'v' + dc.version },
          { key: 'generated-utc', value: generatedUtc },
          { key: 'project-sha256', value: sha(App.projectIo.serializeProject(project)) }
        ],
        // The DOWNLOAD carries the device and a timestamp, as every artifact does —
        // unless the operator named it themselves (GEN-TAB).
        fallbackName: dc.id + '-' + command + '-' + stamp(generatedUtc) + '.md',
        // `files` keeps the stable LOGICAL name the zip entries used to have, so
        // anything inspecting what was produced — the Activity drawer, the preview,
        // the suite — addresses it by what it is rather than by when it was made.
        logicalName: DOC_FILENAMES[command] || (command + '.md')
      });
    }

    /**
     * RPT-3: apply the saved arrangement to the candidate section list.
     *
     * The saved order is a RANKING, not the list: sections it does not mention keep
     * their natural position after the ones it does — so adding a dataset to a project
     * that already carries an arrangement appends the new section rather than dropping
     * it or floating it to the top. An id in the saved order that no longer exists is
     * simply ignored: deleting a dataset must never invalidate an arrangement (same
     * rule as procedure.order).
     */
    var applySectionOrder = App.docBlocks.applySectionOrder;

