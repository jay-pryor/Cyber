  /* =============================================================================
   * MODULE: App.docGen — DOC-GEN: the document, built from a host's declarations
   * PURPOSE: Turn what a HOST declares — its sections, its subject, its filter —
   *          into the blocks a document is made of, the columns each block prints
   *          and the markdown each block contains. This is the generator half of
   *          the module: the designer shows what this produces, and the host's
   *          own Generate button emits it.
   * PURITY:  pure. No DOM, no I/O, no clock — the time arrives on the context.
   * DEPENDS: App.docHost, App.docBlocks, App.docProviders, App.docFormat, App.doc,
   *          App.report, App.md
   * INVARIANTS: nothing in here knows what a device, a dataset or a control is.
   *             Everything specific to the app it is attached to arrives through a
   *             provider or through the host, which is what lets the same code
   *             generate CH's hardening report and something else entirely.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** The host's sections for a run, whether it declared an array or a function. */
    function sectionsOf(host, run) {
      var s = host && host.sections;
      return (typeof s === 'function' ? s(run || null) : s) || [];
    }

    /** Which subject, and which of the filter's categories, this document is about. */
    function runOf(opts) {
      return { subjectId: (opts && (opts.subjectId || opts.deviceId)) || null,
               categories: (opts && opts.categories) || (opts && opts.relevance) || null };
    }

    /**
     * The provider behind a block, if there is one.
     *
     * By block id first, because that is what a block IS. A block assembled by hand —
     * a designer probe asking "what columns would this section have?" — may carry only
     * the host's own key for it, so that is tried second.
     */
    function providerOf(opts, id, block, host) {
      var list = (opts && opts.providers) || [];
      // A caller that did not pre-bind the host's sections gets them bound here, from
      // the same run the options describe. Pre-binding is an optimisation for a whole
      // document — one binding for every block — not a precondition.
      if (!list.length && host) list = sectionsOf(host, runOf(opts));
      var hit = list.filter(function (x) { return x && x.id === id; })[0];
      if (hit || !block) return hit || null;
      var key = block.dsId || block.kind;
      return list.filter(function (x) { return x && includeOf(x).key === key; })[0] || null;
    }

    /* Where a section's per-column and per-group ticks live.
     *
     * A provider says where its own tick is stored — `include.map` names one of the
     * state's tick maps and `include.key` the entry in it — because CH keeps a
     * register's ticks in a different map from a one-off section's, and a module that
     * hardcoded either would have to be edited to add a section (DOD-11). */
    function includeOf(pv) {
      var inc = (pv && pv.include) || {};
      return { map: inc.map || 'sections', key: inc.key || (pv && pv.id), perGroup: inc.perGroup === true };
    }
    function columnKey(block, pv) {
      if (pv) return includeOf(pv).key;
      return block.dsId || block.kind;
    }
    function groupTicks(pv, opts, key) {
      var inc = includeOf(pv);
      return inc.perGroup ? ((opts[inc.map] || {})[key] || {}) : {};
    }

    /**
     * One provider, as the orderable block it becomes.
     *
     * `available()` is the reason a block can be a candidate at all: GUIDE-1 exists
     * only when something actually diverges, and a section that exists solely to say
     * "nothing diverges" is noise. A provider that never has nothing to say declares
     * no available(), and gets no `empty` flag to be greyed out by.
     */
    function providerBlock(pv, opts) {
      var inc = includeOf(pv);
      var map = opts[inc.map] || {};
      var b = Object.assign({}, pv.blockFields || {},
        { id: pv.id, kind: pv.kind || 'section', label: pv.label });
      if (inc.perGroup) {
        var entry = map[inc.key] || {};
        if (pv.groups && pv.groups.field) {
          b.groups = pv.groups.options.map(function (g) {
            return { value: g.value, label: g.label, included: entry[g.value] !== false };
          });
          // A grouped section is "included" while any one of its groups is.
          b.included = b.groups.some(function (g) { return g.included; });
        } else {
          b.groups = null;
          b.included = entry._all !== false;
        }
      } else {
        b.included = map[inc.key] !== false;
      }
      if (typeof pv.available === 'function') {
        var ok = pv.available();
        b.included = b.included && ok;
        b.empty = !ok;
      }
      return b;
    }

    /**
     * How many rows fall into each of the host's declared filter categories.
     * Shared by the designer's toggles and the document's omission note, so the
     * count shown before generating is the count the document states afterwards.
     */
    function filterCounts(host, rows) {
      var f = host && host.filter;
      if (!f) return {};
      var out = {};
      f.categories().forEach(function (c) { out[c.key] = 0; });
      (rows || []).forEach(function (r) {
        var k = f.categoryOf(r);
        if (out[k] !== undefined) out[k] += 1;
      });
      return out;
    }

    /**
     * The report's candidate BLOCKS, in the order they will be emitted (spec §20.4 /
     * GEN-4, RPT-3, DOC-1). The "Sections included" table, the report body and the
     * Report Design workspace are all built from THIS, so the three cannot drift.
     *
     * A block is the orderable unit and carries a stable id — `toc`, `meta`,
     * one per section the HOST declares, plus one per hand-authored custom section.
     * Ids come from the host's providers and from the project, so a host that adds a
     * section makes it orderable with no edit here (DOD-11).
     *
     * DOC-1: each block also carries its explicit heading `level` when the operator
     * has pinned one, or null for "decide automatically". Resolution happens in
     * App.doc.outline, not here — this function only reports what was chosen.
     *
     * @returns {Array<{id:string,kind:string,label:string,included:boolean,level:?number,
     *                  dsId?:string,title?:string,parts?:Array,
     *                  groups?:Array<{value:string,label:string,included:boolean}>}>}
     */
    function hostBlocks(host, opts) {
      opts = opts || {};
      var state = (host && typeof host.getState === 'function' && host.getState()) || {};
      var sec = opts.sections || {}, d = [];
      var bag = state.report || {};
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
      var wantToc = !!(App.docFormat.resolve(state).toc || {}).include;
      d.push({ id: 'toc', kind: 'toc', label: 'Contents', included: wantToc && sec.toc !== false, empty: !wantToc });
      /* META-2: the provenance section exists only where the host has a SUBJECT to
       * describe. A host generating a document about nothing in particular — a policy,
       * a template — is not offered a section it could only leave blank. */
      if (host && host.subject && typeof host.subject.meta === 'function') {
        d.push({ id: 'meta', kind: 'meta', label: host.subject.metaLabel || 'Metadata', included: sec.meta !== false });
      }
      /* One block per section the host declares, in the order it declares them. This
       * used to iterate the platform's datasets and then push `control` and
       * `guidelines` by hand, which is what made three of CH's concepts structural
       * facts about the document module. */
      sectionsOf(host, runOf(opts)).forEach(function (pv) { d.push(providerBlock(pv, opts)); });

      // DOC-4: hand-authored sections join the SAME list, which is what lets them be
      // interleaved with the generated ones rather than bolted on at the end.
      (bag.sections || []).forEach(function (s) {
        d.push({
          id: s.id, kind: 'custom', label: String(s.title || '').trim() || '(untitled section)',
          title: s.title || '', parts: s.parts || [], included: sec[s.id] !== false
        });
      });

      var names = bag.names || {}, intros = bag.intros || {}, tstyles = bag.tableStyles || {}, twidths = bag.tableWidths || {};
      var heads = bag.headings || {}, introNums = bag.introNumbered || {};
      var centred = bag.centred || {};
      var tableText = bag.tables || {}, breaks = bag.pageBreak || {}, noToc = bag.noToc || {};
      var space = bag.space || {};   // SPC-1
      return App.docBlocks.applySectionOrder(d, bag.order).map(function (b) {
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
    function hostColumns(host, block, opts) {
      opts = opts || {};
      if (!block || block.kind === 'custom') return null;
      var colOpts = (opts.columns || {})[columnKey(block)] || {};
      function pack(fixed, optional) {
        // COL-3: the same predicate the builders use, so the designer's column list and
        // the table it is describing cannot disagree about what a blank answer means.
        var shown = optional.filter(function (c) { return App.report.columnOn(c, colOpts); });
        return { fixed: fixed, optional: optional, all: fixed.concat(shown) };
      }
      // A provider's COLUMNS are static, but its rows() and render() are bound to a
      // run. The designer asks for columns with no run in hand, so it falls back to
      // the host's UNBOUND providers: only the declarations are read here.
      var unbound = { providers: sectionsOf(host, null) };
      var hp = providerOf(opts, block.id, block, host) || providerOf(unbound, block.id, block);
      if (hp) {
        // KEY-1: the key column is DECLARED. It used to be recovered by rendering an
        // empty section and scraping the first pipe-table header row out of the result,
        // which returned nothing at all for a provider whose section is not a pipe
        // table — a trap for the next section rather than for these three.
        var key = hp.keyColumn || { id: '_key', label: 'Key' };
        var declared = hp.columns || [];
        // A column the provider did not mark `optional` is FIXED: it is in the table,
        // and it takes a width slot, but it is offered no tick — because a tick that
        // cannot turn anything off is worse than no tick at all.
        return pack([{ id: key.id || '_key', label: key.label }].concat(declared.filter(function (c) { return !c.optional; })),
                    declared.filter(function (c) { return c.optional; }));
      }
      if (block.kind === 'meta') return pack([{ id: 'field', label: 'Field' }, { id: 'value', label: 'Value' }], []);
      return null;
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
    function hostContent(host, b, opts, ctx, metaRows) {
      opts = opts || {};
      var out;
      // CAP-1/TBS-1: a generated table's caption is DERIVED from the block it belongs
      // to, so the same project always emits the same caption and the same anchor
      // (DOD-7) — nothing is minted at generate time.
      var capText = String(b.title || '').trim() || b.label;
      var profile = App.docFormat.resolve((host && typeof host.getState === 'function' && host.getState()) || {});
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
        out = Object.assign({}, b, { body: App.md.rawLatex('\\chContents') });
      } else if (b.kind === 'meta') {
        var metaText = App.docBlocks.tableWording(b, '_all');
        out = Object.assign({}, b, { body: metaRows
          ? App.report.metaTable(metaRows,
              Object.assign(App.docBlocks.withWording(tblOpts, metaText, capText),
                { headings: App.docBlocks.headingsFor(['field', 'value'], ['Field', 'Value'], metaText.columns) }))
          : '' });
      } else if (providerOf(opts, b.id, null, host)) {
        /* 8: every generated section arrives here. Registers, control coverage and
         * guideline deviations used to be three branches, two of which meant this code
         * knew what a control and a dataset were. They are host providers now, reached
         * the same way any section a future host declares will be. */
        var pv = providerOf(opts, b.id, null, host);
        var ck = columnKey(b, pv);
        var pr = App.docProviders.renderSection(pv, pv.rows ? pv.rows() : [], ctx,
          Object.assign({
            columns: (opts.columns || {})[ck],
            colOpts: (opts.columns || {})[ck],
            groups: groupTicks(pv, opts, ck),
            // TBL-1: the per-table wording, passed straight through to buildSection —
            // a provider never has to know it exists (DOD-11).
            tables: b.tables || null,
            block: b
          }, tblOpts));
        out = Object.assign({}, b, { body: pr.body, children: pr.children });
      } else if (b.kind === 'custom') {
        out = b;                                            // App.doc renders its parts
      } else {
        out = b;
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
        if (out.body) out = Object.assign({}, out, { body: App.md.centred(out.body) });
        if (out.children && out.children.length) {
          out = Object.assign({}, out, { children: out.children.map(function (c) {
            return Object.assign({}, c, { body: c.body ? App.md.centred(c.body) : c.body });
          }) });
        }
      }
      return out;
    }

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
        return raw ? String(v) : App.md.text(String(v));
      });
    }
