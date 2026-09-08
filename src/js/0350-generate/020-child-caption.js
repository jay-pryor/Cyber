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

    /* =========================================================================
     * GEN-TAB: `/[Tag]` — a placeholder filled in at generate time.
     *
     * Write `/[Date]` in a heading, an introduction, a table cell, a footer — anywhere
     * you type text — and the Generate pane lists it once with a box beside it. What you
     * put in the box replaces every occurrence in the document.
     *
     * Found and replaced on the FINISHED markdown, not on the strings that went into it,
     * and that is the whole design. A tag can appear in any of a dozen places — a
     * section heading, a section name, an introduction, a table's title row, a column
     * heading, a paragraph, a hand-authored cell, a header slot — and threading a
     * substitution through all of them is a dozen chances to miss one. The document is
     * the one place they have all arrived at, so it is the one place this happens.
     *
     * Both escaped and unescaped forms are matched, because both occur: prose reaches
     * the .md through MD.text and comes out as `/\[Date\]`, while the same tag inside a
     * code span is verbatim. The body is deliberately narrow — letters, digits, spaces,
     * `_` and `-`, up to 40 characters — so that a `/[` inside a captured device value
     * cannot be mistaken for one.
     */
    var TAG_RE = /\/(\\?)\[([A-Za-z0-9 _-]{1,40})(\\?)\]/g;

    /** Every distinct tag in a document, in the order it is first written. */
    function findTags(md) {
      var seen = {}, out = [], m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(String(md == null ? '' : md))) !== null) {
        var name = m[2];
        if (!seen[name]) { seen[name] = true; out.push(name); }
      }
      return out;
    }

    /**
     * Replace each tag with what the operator typed for it.
     *
     * A tag with no value is LEFT AS IT IS rather than blanked. A document with
     * `/[Date]` still printed in it is obviously unfinished; one with a silent gap where
     * the date should be reads as complete and is not — the same rule the rest of this
     * file follows for a missing cross-reference and an unstated omission.
     *
     * The replacement is escaped, because it is text somebody typed arriving in a
     * document that is markdown on its way to LaTeX. It is escaped ONCE, here, on the
     * same rule as everything else. This is the BODY's escaper: the one place a
     * placeholder can land that is NOT markdown is a header or footer slot, and those
     * are filled in before the profile is compiled (see taggedProfile), so by the time
     * this runs there is nothing left in the preamble for it to get wrong.
     */
    /**
     * GEN-TAB: the name the operator gave the file, made safe to be one.
     *
     * A filename typed into a box reaches `download`'s `a[download]` attribute, so it is
     * reduced to characters that cannot mean anything to a filesystem or a shell — no
     * separators, no traversal, no leading dot. Blank (or nothing left after that) falls
     * back to the device-and-timestamp name every other artifact uses.
     */
    function docFilename(name) {
      var s = String(name == null ? '' : name).trim().replace(/\.md$/i, '');
      s = s.replace(/[^A-Za-z0-9 ._-]+/g, '-').replace(/^[.\-]+/, '').replace(/\s+/g, ' ').trim();
      return s ? s + '.md' : '';
    }

    function applyTags(md, values, raw) {
      values = values || {};
      return String(md == null ? '' : md).replace(TAG_RE, function (whole, e1, name) {
        var v = values[name];
        if (v === undefined || v === null || !String(v).length) return whole;
        // `raw` for a header or footer slot, which is escaped later and for LaTeX.
        return raw ? String(v) : MD.text(String(v));
      });
    }

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
    function applySectionOrder(list, order) {
      var pos = {}, n = (order || []).length;
      (order || []).forEach(function (id, i) { if (pos[id] === undefined) pos[id] = i; });
      return list.map(function (x, i) { return { x: x, k: pos[x.id] === undefined ? n + i : pos[x.id], i: i }; })
        .sort(function (a, b) { return (a.k - b.k) || (a.i - b.i); })
        .map(function (e) { return e.x; });
    }

