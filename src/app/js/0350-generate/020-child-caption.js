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
     * Assemble, render and package a document.
     * @param {Array} blocks  reportBlocks()-shaped, each with `body` and/or `parts`
     * @param {{title:string, subtitle?:string, classification?:boolean}} meta
     * @returns {{blob:Blob,name:string,issues:Issue[],text:string,files:Object[]}}
     */
    /**
     * GEN-TAB: a profile whose header and footer slots have had their placeholders
     * filled in, on the RAW text.
     *
     * Every other placeholder in the document is substituted at the very end, on the
     * finished markdown, which is what makes one pass catch them all. A slot cannot wait
     * for that pass: it reaches the page through `header-includes`, which pandoc hands
     * to LaTeX verbatim, so what goes in has to be escaped for LaTeX rather than for
     * markdown — and by the end of the pipeline the slot has already been escaped and
     * the two cannot be told apart. Filled here, the value is escaped by `slotLatex`
     * along with the words around it, once, in the right language.
     */
    function taggedProfile(profile, tags) {
      if (!tags || !Object.keys(tags).length) return profile;
      var out = JSON.parse(JSON.stringify(profile));
      var hf = out.headerFooter || {};
      App.docFormat.HF_SETS.forEach(function (k) {
        App.docFormat.HF_SLOTS.forEach(function (slot) {
          if (hf[k] && hf[k][slot]) hf[k][slot] = applyTags(hf[k][slot], tags, true);
        });
      });
      return out;
    }

    function emitDocument(project, dc, command, generatedUtc, blocks, meta) {
      var profile = taggedProfile(App.docFormat.resolve(project), meta.tags);
      var resolved = App.doc.outline(blocks, {
        baseLevel: 1,
        clampSkips: profile.headings.clampSkips !== false,
        numbered: profile.headings.numbered !== false
      });
      /* TTL-2: the automatic title block is a CHOICE, and it is off unless asked for.
       *
       * `title`/`subtitle`/`date` in the YAML make pandoc's template call \maketitle,
       * which prints a title page this file composed — a heading, a model-and-firmware
       * line and a date — ahead of everything the designer arranged. Anyone who wants
       * their own title page cannot have one while it is there, and there is no
       * markdown that suppresses it: the only way not to get the block is not to name
       * the metadata. So the switch simply withholds the three keys.
       *
       * What is NOT withheld is the provenance: tool, device, version, generated-at and
       * the project hash still travel as their own YAML keys below, and the Device
       * Config Information section still prints them where a reader can see them. */
      var titleBlock = ((project.report || {}).titleBlock === true);
      var frontMatter = App.docFormat.frontMatter(profile, {
        title: titleBlock ? meta.title : '',
        subtitle: titleBlock ? (meta.subtitle || '') : '',
        date: titleBlock ? App.util.clock.toAest(generatedUtc) : '',
        // TOC-1: this document prints its own contents list iff it carries the section.
        tocSection: (blocks || []).some(function (b) { return b && b.kind === 'toc'; }),
        classification: meta.classification ? 'OFFICIAL: Sensitive' : '',
        // The manifest's job, done inside the document. `extra` lands in the YAML
        // block, which pandoc carries into the PDF metadata and any reader can see.
        extra: [
          { key: 'tool', value: TOOL_NAME + ' ' + TOOL_VERSION },
          { key: 'device-id', value: dc.id },
          { key: 'device-version', value: 'v' + dc.version },
          { key: 'generated-utc', value: generatedUtc },
          { key: 'project-sha256', value: sha(App.projectIo.serializeProject(project)) }
        ]
      });
      // TBS-1: the PART carries the flags, the PROFILE carries the look. App.doc has no
      // business knowing about either, so it is handed the resolver rather than the two.
      // HDR-1: page 1 is an ordinary page unless the profile gives it its own header
      // and footer, in which case it has to be told so from inside the document.
      var firstPage = profile.headerFooter && profile.headerFooter.firstDifferent;
      var md = App.doc.render({
        frontMatter: frontMatter, blocks: resolved,
        prologue: firstPage ? '\\thispagestyle{chfirst}' : '',
        // SEC-4: so a section whose level already starts a page does not get a second
        // break, and a blank page between the two.
        levelBreaks: App.docFormat.levelBreaks(profile),
        // REF-2: prose renders its control mentions as links too, not just table cells.
        linkTerms: meta.linkTerms || null,
        metrics: App.docFormat.tableMetrics(profile),
        // CAP-3: which side of the table the caption goes. The look of it is the
        // profile's business too, but that reaches the page as preamble macros.
        captionPosition: profile.tables.captionPosition,
        styleFor: function (part) {
          return App.docFormat.tableStyle(profile, { head: part.styleHead === true, firstColumn: part.styleFirstColumn === true });
        }
      });
      // GEN-TAB: the last thing that happens to the document, so a tag written anywhere
      // in it — heading, table cell, footer slot, YAML title — is caught by one pass.
      md = applyTags(md, meta.tags);
      return {
        blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
        // The DOWNLOAD carries the device and a timestamp, as every artifact does —
        // unless the operator named it themselves (GEN-TAB).
        name: docFilename(meta.filename) || (dc.id + '-' + command + '-' + stamp(generatedUtc) + '.md'),
        issues: [], text: md,
        // GEN-TAB: what is still unfilled, so the pane can say so before it is downloaded.
        tags: findTags(md),
        // `files` keeps the stable LOGICAL name the zip entries used to have, so
        // anything inspecting what was produced — the Activity drawer, the preview,
        // the suite — addresses it by what it is rather than by when it was made.
        files: [{ name: DOC_FILENAMES[command] || (command + '.md'), content: md }]
      };
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

