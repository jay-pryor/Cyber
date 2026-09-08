  /* =============================================================================
   * MODULE: App.doc  — DOC-1..DOC-4: the document outline, numbering and renderer
   * PURPOSE: Turn an ordered list of report BLOCKS into a numbered, cross-referenced
   *          markdown document. Owns four things the generators must not each
   *          re-invent: heading-level resolution (DOC-1), hierarchical auto-numbering
   *          (DOC-2), stable cross-references (DOC-3), and the rendering of a
   *          hand-authored custom section's parts (DOC-4).
   * PURITY:  pure. No DOM, no I/O, no clock — the same blocks always render the
   *          same bytes, which is what DOD-7 requires of every generated artifact.
   * DEPENDS: App.md
   * INVARIANTS: an anchor is derived from a block ID and never from its title, which
   *             is what lets a cross-reference survive both a rename and a reorder.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var MD = App.md;

    /* -------------------------------------------------------------------------
     * DOC-1: five levels, and what "auto" means.
     *
     * A block carries a level of 1..4 (a heading) or 5 (body text with no heading
     * of its own), or `null` meaning "decide for me". The decision is deliberately
     * boring, because a surprising rule in a document outline is worse than a
     * slightly dumb one:
     *
     *   * an explicit level always wins — this is the "controllable" half;
     *   * a custom section with no title resolves to 5, so writing a paragraph with
     *     no heading gives you a paragraph rather than an empty heading;
     *   * anything else takes the level of the last HEADING before it, making it a
     *     sibling. Not the last block: a body-text block must not drag the sections
     *     after it down to level 5.
     *
     * That single rule produces the nesting behaviour asked for. Set one section to
     * H1 and the H2s that follow become its children automatically, because the
     * numbering below reads the level sequence as a tree — no parent has to be
     * nominated anywhere.
     * ---------------------------------------------------------------------- */

    var BODY_LEVEL = 5;
    /* TTL-1: a TITLE is a heading that takes no number and gives none away.
     *
     * A document that opens with a title page, a foreword or an executive summary wants
     * that page to carry a heading and wants the numbering to start at 1 on the section
     * AFTER it. Levelling it H1 numbers it 1; levelling it N gives it no heading at all.
     * Neither is what a title is, so it is its own level: printed at the top level,
     * never numbered, and — the part that matters — it does not touch the counters, so
     * the first real H1 that follows is still 1.
     */
    var TITLE_LEVEL = 0;
    /* CTR-1: the ordinal in the centring macro names App.docFormat defines per level.
     * Named by ordinal rather than by LaTeX command so this module does not have to
     * know which command a level maps to — the same reason it emits \chTitleStyle by
     * name. The two lists must agree, and a self-test is what says they do. */
    var CENTRE_WORDS = ['One', 'Two', 'Three', 'Four'];
    var LEVELS = [
      { value: TITLE_LEVEL, label: 'T', hint: 'Title — a heading with no number, and it does not consume one' },
      { value: 1, label: 'H1', hint: 'Top-level section' },
      { value: 2, label: 'H2', hint: 'Sub-section' },
      { value: 3, label: 'H3', hint: 'Sub-sub-section' },
      { value: 4, label: 'H4', hint: 'Fourth-level heading' },
      { value: BODY_LEVEL, label: 'N', hint: 'Normal text — no heading, keeps the level above it' }
    ];
    /** The short name of a resolved level — 'T', 'N' or 'H2'. One place, three views. */
    function levelLabel(lv) {
      return lv === TITLE_LEVEL ? 'T' : lv === BODY_LEVEL ? 'N' : 'H' + lv;
    }

    /**
     * DOC-1 + DOC-2: resolve levels and assign hierarchical numbers.
     *
     * Numbering is a counter stack: a level-N block increments counter N and clears
     * every counter below it, so 1 → 1.1 → 1.2 → 1.2.1 → 2 falls out of the order
     * alone. Body-text blocks are not numbered and do not disturb the counters.
     *
     * A level SKIP (an H3 with no H2 above it) has no single right answer. LaTeX
     * would number it 1.0.1; most authors mean "one level in". The formatting
     * profile decides via `clampSkips` — on by default, so the common case is the
     * friendly one — and either way the skip is reported on the block so the
     * designer can show it rather than silently reinterpreting the author.
     *
     * @param {Array<{id:string,label:string,level?:?number,title?:string,kind?:string,included?:boolean}>} blocks
     * @param {{baseLevel?:number, clampSkips?:boolean, numbered?:boolean}} [opts]
     * @returns {Array<Object>} the blocks, each with resolved
     *          {level, autoLevel:boolean, number:string, anchor:string, skipped:boolean}
     */
    function outline(blocks, opts) {
      opts = opts || {};
      var base = opts.baseLevel || 1;
      var clamp = opts.clampSkips !== false;
      var numbered = opts.numbered !== false;
      var counters = [], lastHeading = 0, depth = 0;
      var out = [];

      /** Take the next number at `lvl`, clearing everything below it. The counter stack
       *  is what makes 1 -> 1.1 -> 1.2 -> 1.2.1 -> 2 fall out of the order alone. */
      function bump(lvl) {
        counters.length = lvl;
        for (var i = 0; i < lvl; i++) if (counters[i] == null) counters[i] = 0;
        counters[lvl - 1]++;
        depth = lvl;
        return numbered ? counters.slice(0, lvl).join('.') : '';
      }

      /**
       * Resolve one block's level, advance the counters, and record it.
       *
       * `forced` marks a CHILD (a grouped dataset's group). A child advances the
       * counters and the depth, but deliberately does NOT become the "last heading"
       * the automatic rule reads: the groups under Packages are structural, not part
       * of the author's level sequence, and letting one set lastHeading made the next
       * top-level section a sibling of "Packages — Kept" rather than of "Packages".
       */
      function place(b, forced) {
        var explicit = (b.level === TITLE_LEVEL || b.level === 1 || b.level === 2 || b.level === 3 || b.level === 4 || b.level === BODY_LEVEL);
        var lvl;
        if (forced != null) {
          lvl = forced;                           // a child's level is set by its parent
        } else if (explicit) {
          lvl = b.level;
        } else if (b.kind === 'custom' && !String(b.title == null ? b.label : b.title).trim()) {
          lvl = BODY_LEVEL;                       // no header written ⇒ a paragraph
        } else {
          lvl = lastHeading || base;              // sibling of the last heading
        }

        var skipped = false;
        // TTL-1: a title is deliberately outside the counter machinery — not numbered,
        // not counted, and not the "last heading" the automatic rule reads. So a title
        // followed by an automatic section leaves that section at the base level, and
        // the first H1 after a title is still 1.
        if (lvl !== BODY_LEVEL && lvl !== TITLE_LEVEL) {
          if (lvl > depth + 1) { skipped = true; if (clamp) lvl = depth + 1; }
          bump(lvl);
          if (forced == null) lastHeading = lvl;
        }

        var res = Object.assign({}, b, {
          level: lvl,
          autoLevel: forced != null ? true : !explicit,
          skipped: skipped,
          number: (numbered && lvl !== BODY_LEVEL && lvl !== TITLE_LEVEL) ? counters.slice(0, lvl).join('.') : '',
          anchor: MD.anchor('sec-' + b.id)
        });
        out.push(res);
        return res;
      }

      (blocks || []).filter(function (b) { return b && b.included !== false; }).forEach(function (b) {
        var parent = place(b);
        var childLevel = parent.level === BODY_LEVEL ? base : Math.min(parent.level + 1, 4);
        /* SEC-2: a numbered introduction takes the FIRST of its section's child numbers,
         * so a register's groups shift down to make room for it — 4 Tactical, 4.1 the
         * introduction; 5 Packages, 5.1 the introduction, 5.2 Removed, 5.3 Disabled.
         *
         * It takes a number without becoming a BLOCK, because it is not one: it has no
         * heading, so it emits no anchor, so it is not something a cross-reference could
         * point at. The number is recorded on the parent and App.doc.render prefixes it
         * to the text. An empty introduction consumes nothing. */
        // `introBody` is the RENDERED introduction, which only the generator has built by
        // the time it outlines; the designer outlines the raw blocks, which carry the
        // unrendered `intro`. Either is evidence that there is one to number, and taking
        // both is what stops the preview numbering a section the document does not.
        var hasIntro = String((b.introBody == null ? b.intro : b.introBody) || '').trim();
        if (b.introNumbered && hasIntro && parent.level !== TITLE_LEVEL) {
          parent.introNumber = bump(childLevel);
        }
        /* TBL-1: a grouped dataset's groups are TABLES, not sub-sections.
         *
         * They used to be placed here as children one level down, which gave each of
         * them a numbered heading — "5.2 Removed", "5.3 Disabled" — and pushed a
         * heading between a section's introduction and the tables it introduces. The
         * group's declared name is no longer printed anywhere; a title row above each
         * table carries whatever the operator wants it to say instead.
         *
         * They keep their `children` array and their own table captions and anchors, so
         * a cross-reference can still point at one particular table; what they no longer
         * have is a heading, a number, or a place in the contents list.
         */
      });
      return out;
    }

    /* -------------------------------------------------------------------------
     * DOC-3: references that endure.
     *
     * The requirement is a link that survives both reordering and renaming. That
     * rules out linking by title (renaming breaks it) and by position (reordering
     * breaks it), which leaves linking by ID — so a reference stores nothing but the
     * target's id, and BOTH halves of what the reader sees are derived at render
     * time: the number comes from the outline, the title from the block.
     *
     * Deleting a target is the one case that cannot be derived away. It renders as a
     * visible "[missing reference]" rather than a silent gap, and the designer lists
     * the dangling ids, for the same reason the report states its omitted sections:
     * a document that quietly drops something is worse than one that admits it.
     * ---------------------------------------------------------------------- */

    /**
     * Build the reference resolver handed to App.md.rich().
     * @param {Array} resolved  the output of outline()
     * @param {Array<{id:string,number:string,caption:string,anchor:string}>} [tables]
     * @returns {(id:string)=>?{label:string,anchor:string}}
     */
    /* REF-1: a reference has three readings, and the designer picks one.
     *
     *   label       "Table 4: Packages removed" / "Section 2.1 — Firmware"
     *   numberLabel "Table 4"                   / "Section 2.1"
     *   titleLabel  "Packages removed"          / "Firmware"
     *
     * All three are derived here, from the outline and the table index, so a section
     * that moves or a table that gains one before it changes every reading of every
     * reference to it at the next render and nothing has to be re-inserted.
     *
     * The table's full reading uses a COLON rather than a dash, because that is the
     * separator the caption itself prints ("Table 4: Packages removed") — a reference
     * that reads differently from the thing it points at is a reference a reader has to
     * translate.
     */
    function sectionRef(b) {
      var title = String(b.title == null ? b.label : b.title).trim();
      var num = b.number ? 'Section ' + b.number : '';
      return {
        anchor: b.anchor,
        numberLabel: num || title,
        titleLabel: title || num,
        label: num ? (title ? num + ' — ' + title : num) : title
      };
    }
    function tableRef(t) {
      var num = 'Table ' + t.number;
      return {
        anchor: t.anchor, numberLabel: num, titleLabel: t.caption || num,
        label: num + (t.caption ? ': ' + t.caption : '')
      };
    }
    /* REF-1: a PARAGRAPH is a link target too.
     *
     * "See section 4" is often more precision than the writer has and less than the
     * reader wants — the thing being pointed at is one paragraph inside it. A paragraph
     * has no number of its own, so its readings are its opening words, which is what a
     * reader scanning for it will recognise. */
    var PARA_WORDS = 8;
    function paraRef(part, block) {
      var words = MD.plain(String(part.text || '')).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      var snippet = words.slice(0, PARA_WORDS).join(' ') + (words.length > PARA_WORDS ? '…' : '');
      var where = String(block.title == null ? block.label : block.title).trim();
      var name = snippet || ('a paragraph' + (where ? ' in ' + where : ''));
      return { anchor: MD.anchor('par-' + part.id), numberLabel: name, titleLabel: name, label: name };
    }

    /** Every link target in the document, keyed by id. One walk, three consumers. */
    function refIndex(resolved, tables) {
      var byId = {}, order = [];
      function add(id, kind, ref) { if (!byId[id]) order.push({ id: id, kind: kind }); byId[id] = ref; }
      (resolved || []).forEach(function (b) {
        // Body text has no heading, so there is nothing on the page to land on — but the
        // PARAGRAPHS inside it still have anchors of their own.
        if (b.level !== BODY_LEVEL) add(b.id, 'section', sectionRef(b));
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            if (p && p.kind === 'para' && String(p.text || '').trim()) add(p.id, 'paragraph', paraRef(p, b));
          });
        }
      });
      (tables || []).forEach(function (t) { add(t.id, 'table', tableRef(t)); });
      return { byId: byId, order: order };
    }

    /**
     * Build the reference resolver handed to App.md.rich().
     * @param {Array} resolved  the output of outline()
     * @param {Array<{id:string,number:string,caption:string,anchor:string}>} [tables]
     */
    function refResolver(resolved, tables) {
      var idx = refIndex(resolved, tables);
      return function (id) { return idx.byId[id] || null; };
    }

    /** The pickable link targets, for the designer's "insert reference" menu. */
    function refTargets(resolved, tables) {
      var idx = refIndex(resolved, tables);
      return idx.order.map(function (e) {
        var r = idx.byId[e.id];
        return { id: e.id, kind: e.kind, label: r.label, numberLabel: r.numberLabel, titleLabel: r.titleLabel };
      });
    }

    /* CAP-1: every table in the document is captioned, and the numbers agree.
     *
     * LaTeX numbers a captioned table itself — `\caption{X}` prints "Table 3: X". So
     * the caption text must NOT carry a number of its own (it used to, and the PDF read
     * "Table 3: Table 3 — X"), and the counter this module keeps is only there so a
     * cross-reference can NAME the number the page will show. The two agree because
     * every table now has a caption and both count them in emitted order — which is
     * also why an uncaptioned table is not allowed: one would advance LaTeX's counter
     * without advancing ours, and every reference after it would be off by one.
     */
    var TBL_ANCHOR = /^\[\]\{#(tbl-[A-Za-z0-9-]+)\}\s*$/;
    var TBL_CAPTION = /^:\s+(\S.*)$/;
    var ESCAPED = /\\([\\`*_{}\[\]<>#|$&^~%+\-=.!()])/g;

    /**
     * The captioned tables inside a GENERATED body, in emitted order. Generated bodies
     * are opaque markdown by the time they reach here, so they are read back rather
     * than declared — App.md emits the anchor line and the caption line as a pair, and
     * nothing between them is anything but the table itself.
     */
    function scanTables(md) {
      var out = [], pending = null;
      String(md == null ? '' : md).split('\n').forEach(function (l) {
        var a = TBL_ANCHOR.exec(l);
        if (a) { pending = { anchor: a[1], caption: '' }; out.push(pending); return; }
        if (!pending) return;
        var c = TBL_CAPTION.exec(l);
        if (c) { pending.caption = c[1].trim().replace(ESCAPED, '$1'); pending = null; }
      });
      return out;
    }

    /**
     * Assign document-wide table numbers, in emitted order. Done as its own pass
     * because a table's number depends on how many tables precede it across the WHOLE
     * document, which no single section can know — and because a reference to a table
     * has to resolve before that table's own section is rendered.
     *
     * A hand-authored table is read from its PART (its caption is still editable at
     * this point); a generated one is read back out of the body its producer already
     * built. Both land in the one list, so a reference can point at either.
     *
     * @returns {Array<{id,number,caption,anchor}>}
     */
    function tableIndex(resolved) {
      var out = [], n = 0;
      function push(id, caption, anchor) {
        n++;
        out.push({ id: id, number: String(n), caption: String(caption || '').trim(), anchor: anchor });
      }
      /* A grouped dataset declares its groups as `children`, and outline() FLATTENS
       * them into the list as blocks of their own. Descending into `children` as well
       * as reading those blocks counted every group's table twice: a report with a
       * three-group Packages section numbered its tables 1,2,3,4,5,3,4,5,… and every
       * cross-reference after it named a number the page did not print. So a parent
       * whose children are already in the list is not descended into. Un-outlined
       * blocks (the designer's per-section preview, and any caller holding the raw
       * shape) have no flattened children, and are walked as before. */
      var flattened = {};
      (resolved || []).forEach(function (b) { if (b && b.parentId) flattened[b.parentId] = true; });
      (resolved || []).forEach(function (b) {
        if (b.kind === 'custom') {
          (b.parts || []).forEach(function (p) {
            if (p.kind !== 'table') return;
            // CAP-4: a table asked to go uncaptioned takes no number either. It cannot
            // then be cross-referenced — "see Table 4" needs a Table 4 — which is the
            // trade the option is, and it is what keeps every OTHER number honest:
            // renderPart reads its caption from this list, so a table that is not here
            // emits none, and the count and the page agree by construction.
            if (p.noCaption === true) return;
            push(p.id, autoCaption(b, p), MD.anchor('tbl-' + p.id));
          });
          return;
        }
        // The body comes first, then each child, which is the order render() emits them.
        scanTables(b.body).forEach(function (t) { push(t.anchor, t.caption, t.anchor); });
        if (!flattened[b.id]) {
          (b.children || []).forEach(function (c) {
            scanTables(c.body).forEach(function (t) { push(t.anchor, t.caption, t.anchor); });
          });
        }
      });
      return out;
    }

