    /* =========================================================================
     * CONF-1: blocks in, one finished document out.
     *
     * This is the last step of generation and the one a host should not have to
     * write: resolve the formatting profile, number the headings, assemble the YAML
     * front matter, render the blocks, then fill in the `/[Tag]` placeholders in one
     * pass over the finished markdown.
     *
     * It lived in CH, which meant a second host could build every block the module
     * offers and still have no way to turn them into a .md without copying eighty
     * lines of pipeline. What is genuinely CH's about it — a device id, a project
     * hash, the words "OFFICIAL: Sensitive", the stable name each command's file
     * takes — arrives on `meta`, computed by whoever knows those things.
     * ====================================================================== */

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

    /**
     * Assemble, render and package a document.
     *
     * @param {Object} host    the installed host; only getState() is read
     * @param {Array} blocks   sectionContent()-shaped, each with `body` and/or `parts`
     * @param {{title?:string, subtitle?:string, date?:string, classification?:string,
     *          extra?:Array<{key:string,value:string}>, linkTerms?:Object,
     *          tags?:Object, filename?:string, fallbackName?:string,
     *          logicalName?:string}} meta
     * @returns {{blob:Blob,name:string,issues:Issue[],text:string,tags:string[],files:Object[]}}
     */
    function emitDocument(host, blocks, meta) {
      meta = meta || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var profile = taggedProfile(App.docFormat.resolve(state), meta.tags);
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
       * What is NOT withheld is the provenance the host handed in as `extra`: it still
       * travels as its own YAML keys below, and the metadata section still prints it
       * where a reader can see it. */
      var titleBlock = ((state.report || {}).titleBlock === true);
      var frontMatter = App.docFormat.frontMatter(profile, {
        title: titleBlock ? (meta.title || '') : '',
        subtitle: titleBlock ? (meta.subtitle || '') : '',
        date: titleBlock ? (meta.date || '') : '',
        // TOC-1: this document prints its own contents list iff it carries the section.
        tocSection: (blocks || []).some(function (b) { return b && b.kind === 'toc'; }),
        // The BANNER TEXT, not a flag: what a document is marked as is the host's own
        // vocabulary, and a module that spelled one classification out could only ever
        // serve the organisation that uses it.
        classification: meta.classification || '',
        // The manifest's job, done inside the document. `extra` lands in the YAML
        // block, which pandoc carries into the PDF metadata and any reader can see.
        extra: meta.extra || []
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
        // REF-2: prose renders its linked terms too, not just table cells. The host
        // decided which words those are, from the blocks actually being emitted.
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
        // The DOWNLOAD name is the operator's if they typed one (GEN-TAB), and
        // otherwise whatever the host would have called it.
        name: docFilename(meta.filename) || meta.fallbackName || 'document.md',
        issues: [], text: md,
        // GEN-TAB: what is still unfilled, so the pane can say so before it is downloaded.
        tags: findTags(md),
        // `files` keeps a stable LOGICAL name, so anything inspecting what was produced
        // addresses it by what it is rather than by when it was made.
        files: [{ name: meta.logicalName || 'document.md', content: md }]
      };
    }

    App.docGen = {
      // The three the host's own generator is a shim over.
      reportBlocks: hostBlocks, sectionColumns: hostColumns, sectionContent: hostContent,
      // How many rows sit in each of the host's filter categories.
      filterCounts: filterCounts,
      // GEN-TAB: `/[Tag]` placeholders — finding them, filling them, naming the file.
      findTags: findTags, applyTags: applyTags, docFilename: docFilename, TAG_RE: TAG_RE,
      // CONF-1: blocks in, one finished .md out — the step a host used to write itself.
      emitDocument: emitDocument,
      // Exposed for a host that assembles its own run: the sections for a run, and
      // the provider behind one block.
      sectionsOf: sectionsOf, providerOf: providerOf
    };
  })(App);
