    function paneFormatting(project) {
      var all = App.docFormat.list(project);
      var active = App.docFormat.resolve(project);
      var editId = _rd.fmtId || active.id;
      var f = all.filter(function (x) { return x.id === editId; })[0] || active;
      var builtin = !!f.builtin;

      var head = '<div class="rd-fmt-head">' +
        '<label class="rd-lab">Profile in use' +
          '<select data-rd-fmt-active aria-label="Formatting profile in use">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === active.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<label class="rd-lab">Editing' +
          '<select data-rd-fmt-edit aria-label="Formatting profile being edited">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === f.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" data-rd-fmt-new>Duplicate</button>' +
        '<button type="button" class="danger" data-rd-fmt-del' + (builtin ? ' disabled' : '') + '>Delete</button>' +
        '</div>';

      var locked = builtin
        ? '<div class="rd-locked">The <strong>Standard</strong> profile ships with the tool and cannot be edited — <strong>Duplicate</strong> it and change the copy. That keeps a known-good baseline in every project.</div>'
        : '';

      var page = '<div class="rd-fieldset"><strong>Page</strong>' +
        '<div class="rd-grid">' +
          pick('Paper', 'page.paper', f.page.paper, App.docFormat.PAPERS) +
          // FNT-3: the document's own size has moved to the Fonts table below, beside the
          // heading sizes and the two table sizes — every size in the document, in one
          // place, rather than one under Page, two under Tables and four under Headings.
          pick('Body font', 'page.fontFamily', f.page.fontFamily, App.docFormat.FONTS,
            'Every font here ships with the TeX distribution, so the .md carries its own font and needs nothing installed on the machine that builds the PDF.') +
          num('Line spacing', 'page.lineSpacing', f.page.lineSpacing, '1 = single, 1.15, 1.5 …') +
          num('Margin top', 'page.marginTop', f.page.marginTop, 'A bare number is read as millimetres.') +
          num('Margin bottom', 'page.marginBottom', f.page.marginBottom, 'A bare number is read as millimetres.') +
          num('Margin left', 'page.marginLeft', f.page.marginLeft, 'A bare number is read as millimetres.') +
          num('Margin right', 'page.marginRight', f.page.marginRight, 'A bare number is read as millimetres.') +
          // HDR-1: the page-number picker is gone. It offered five fixed positions for
          // one thing, and the Header & Footer pane offers six slots you can put
          // anything in — the number included. Two mechanisms aiming at the same three
          // positions is how a document ends up printing the number twice.
        '</div>' +
        // CODE-1: a shade well plus its "no shade" button, the same pair the table
        // styling uses — a colour picker has no "none", and white is a colour.
        '<div class="rd-grid rd-grid-inline">' +
          '<label class="rd-lab rd-lab-s" title="The background behind a package name, a key or a hash. A run too long to fit stays unshaded so it can still wrap.">Code shading' +
            '<input type="color" class="rd-shade" value="' + esc(f.page.codeShade || '#ffffff') + '" data-rd-fmt="page.codeShade" aria-label="Code span shading"></label>' +
          '<button type="button" data-rd-fmt-clear="page.codeShade" title="No background behind code spans">No shade</button>' +
        '</div></div>';

      /* FNT-3: every size in the document, in one table.
       *
       * The four heading levels were here; the document's own size was under Page and the
       * two table sizes under Tables, which meant "what size is this set at?" was three
       * questions in three places. They are one question, so they are one table — and the
       * three that are not headings simply have fewer answers: a run of body text has a
       * size and nothing else. What has no meaning for a row is DISABLED rather than
       * absent, so the column still lines up and the row says plainly that the setting
       * belongs to headings.
       */
      function txtCell(key, v, label, on) {
        return '<td><input class="rd-tiny" value="' + esc(v == null ? '' : v) + '"' +
          (on === false ? ' disabled' : ' data-rd-fmt="' + esc(key) + '"') +
          ' aria-label="' + esc(label) + '"></td>';
      }
      function boolCell(key, checked, label, on) {
        return '<td><input type="checkbox"' + (checked ? ' checked' : '') +
          (on === false ? ' disabled' : ' data-rd-fmt-bool="' + esc(key) + '"') +
          ' aria-label="' + esc(label) + '"></td>';
      }
      /**
       * FNT-4: a row for something that has a size, a weight and a slope — but none of
       * the placement a heading has.
       *
       * Bold and italic used to be greyed out here, which said "body text cannot be
       * bold" — untrue of every one of these four, and the reason a report whose house
       * style sets tables in italic could not be produced. What genuinely has no meaning
       * for them is leading, the two spacings and the page break, and those stay
       * disabled so the row still says plainly which settings belong to headings.
       */
      /* `sizeKey` may be null, for a kind of text with a weight and a slope but no size
       * of its own. FNT-5 made the table's first column one such row, because its
       * emphasis travels as markdown on the cell and markdown cannot say "and set this
       * column two points smaller". FNT-6 gave it one anyway — through a LaTeX macro,
       * which is the same route the shading has always taken — so nothing uses the null
       * form today. It stays because the next kind of text may want it. */
      function textRow(label, sizeKey, size, boldKey, bold, italicKey, italic) {
        return '<tr><th>' + esc(label) + '</th>' +
          (sizeKey ? txtCell(sizeKey, size, label + ' size') : txtCell('', '', label + ' size', false)) +
          txtCell('', '', label + ' leading', false) +
          boolCell(boldKey, bold, label + ' bold') + boolCell(italicKey, italic, label + ' italic') +
          txtCell('', '', label + ' space before', false) + txtCell('', '', label + ' space after', false) +
          boolCell('', false, label + ' new page', false) + '</tr>';
      }
      var fonts = '<div class="rd-fieldset"><strong>Fonts</strong>' +
        flag('Number the sections', 'headings.numbered', f.headings.numbered !== false, 'Numbers are written into the markdown, so the preview, the .md and the PDF all agree.') +
        flag('Pull up a skipped level', 'headings.clampSkips', f.headings.clampSkips !== false, 'An H3 with no H2 above it becomes an H2. Switch off to let it number as 1.0.1, which is what LaTeX would do.') +
        '<table class="rd-lvl"><thead><tr><th>Text</th><th>Size</th><th>Leading</th><th>Bold</th><th>Italic</th><th>Space before</th><th>Space after</th><th>New page</th></tr></thead><tbody>' +
        f.levels.map(function (lv, i) {
          // TTL-3: the title is a level like any other in this table, and the first one —
          // it prints above every heading, so it is listed above them.
          var name = lv.level === App.doc.TITLE_LEVEL ? 'Title' : 'H' + lv.level;
          function cell(k, v) {
            return txtCell('levels.' + i + '.' + k, v, name + ' ' + k);
          }
          function bcell(k, on) {
            return boolCell('levels.' + i + '.' + k, on, name + ' ' + k);
          }
          return '<tr><th>' + esc(name) + '</th>' + cell('size', lv.size) + cell('leading', lv.leading) +
            bcell('bold', lv.bold) + bcell('italic', lv.italic) +
            cell('spaceBefore', lv.spaceBefore) + cell('spaceAfter', lv.spaceAfter) +
            bcell('pageBreakBefore', lv.pageBreakBefore) + '</tr>';
        }).join('') +
        textRow('Regular', 'page.fontSize', f.page.fontSize, 'page.bold', f.page.bold, 'page.italic', f.page.italic) +
        textRow('Table text', 'tables.fontSize', f.tables.fontSize, 'tables.bold', f.tables.bold, 'tables.italic', f.tables.italic) +
        textRow('Table headers', 'tables.headFontSize', f.tables.headFontSize, 'tables.headBold', f.tables.headBold, 'tables.headItalic', f.tables.headItalic) +
        // FNT-5: the first column of every table, beside the header row it matches.
        // FNT-6: with a size of its own, like every other row in this table.
        textRow('Table first column', 'tables.firstColFontSize', f.tables.firstColFontSize,
          'tables.firstColBold', f.tables.firstColBold, 'tables.firstColItalic', f.tables.firstColItalic) +
        textRow('Table captions', 'tables.captionFontSize', f.tables.captionFontSize, 'tables.captionBold', f.tables.captionBold, 'tables.captionItalic', f.tables.captionItalic) +
        '</tbody></table>' +
        '<p class="muted rd-hint"><strong>Title</strong> is the <code>T</code> level — a heading that prints at the top level and takes no number. ' +
        '<strong>Regular</strong> is the document’s own size, which everything else falls back to: leave the three table sizes blank and a table is set at it. ' +
        '<strong>Table headers</strong> and <strong>Table first column</strong> apply to every table, whether or not the section has opted that part in for shading — including their <strong>size</strong>, so a key column can be set smaller than the prose beside it. ' +
        'The greyed cells are heading-only — a run of body text has a size and a weight, not a space-before.</p></div>';

      var toc = '<div class="rd-fieldset"><strong>Contents</strong>' +
        flag('Include a table of contents', 'toc.include', !!(f.toc && f.toc.include)) +
        '<div class="rd-grid">' +
          num('Depth', 'toc.depth', f.toc.depth, 'How many heading levels the contents lists.') +
          num('Space between entries', 'toc.entrySpacing', f.toc.entrySpacing,
            'Points between one line of the contents and the next. Nested entries take half. LaTeX’s own is about 10pt, which on a report of one-line sections reads as a half-empty page.') +
        '</div>' +
        '<p class="muted rd-hint">Where the list goes is the <strong>Contents</strong> section’s business, in the list on the left — move it, rename it or give it a heading level like any other section.</p></div>';

      // TBS-1: the LOOK of a styled header row / first column. Which tables wear it is
      // decided per table — on a generated section in the Section pane, on a
      // hand-authored one on the table itself — so nothing here switches anything on.
      /* FNT-4/FNT-5: neither row has a bold/italic cell here any more.
       *
       * Both had one, and so did the Fonts table, and the two meant different things —
       * this one only reached the sections that had ticked the part in, that one reached
       * every table. Two switches saying "bold" is how a document ends up with two kinds
       * of header. The weights live with the other type settings now.
       *
       * They were left here as a greyed "set in Fonts, above" note, which is two dead
       * columns explaining themselves in every profile anybody opens. The sentence under
       * the table says the same thing once, so the columns are gone: what this table is
       * for is the SHADE, and it now says only that.
       */
      function styleRow(label, key, s) {
        return '<tr><th>' + esc(label) + '</th>' +
          '<td><input type="color" class="rd-shade" value="' + esc(s.shade || '#ffffff') + '" data-rd-fmt="tables.' + key + '.shade" aria-label="' + esc(label) + ' shade colour"></td>' +
          '<td><button type="button" data-rd-fmt-clear="tables.' + key + '.shade" title="Remove the shading">No shade</button></td></tr>';
      }
      var tables = '<div class="rd-fieldset"><strong>Tables</strong>' +
        // FNT-3: the two table SIZES are in the Fonts table above, with every other size
        // in the document. What is left here is what is particular to a table.
        '<div class="rd-grid">' +
          pick('Caption position', 'tables.captionPosition', f.tables.captionPosition, CAPTION_POSITIONS,
            'Which side of the table the caption sits on. It is numbered either way — “Table 4: …” — with the same number a cross-reference to it uses.') +
          num('Caption gap', 'tables.captionSkip', f.tables.captionSkip, 'Points between the table and its caption.') +
        '</div>' +
        flag('Centre the table caption', 'tables.captionCentre', !!(f.tables && f.tables.captionCentre),
          'Otherwise it starts at the left edge of the text, like a paragraph.') +
        '<p class="muted">What a section buys by opting its header row or first column in: the <strong>shading</strong>, which reaches the PDF as a LaTeX table colour and needs no filter and no extra tool. Their size, weight and slope are in <strong>Fonts</strong>, above, and reach every table.</p>' +
        '<table class="rd-lvl"><thead><tr><th>Part</th><th>Shade</th><th></th></tr></thead><tbody>' +
        styleRow('Header row', 'head', f.tables.head) +
        // FNT-5/FNT-6: the first column's size, weight and slope are in the Fonts table,
        // for the reason the header row's are — they reach every table, and a second
        // "bold" here meant a document could end up with two kinds of first column.
        styleRow('First column', 'firstColumn', f.tables.firstColumn) +
        '</tbody></table></div>';

      // Sharing profiles between projects is a CATALOGUE job, so it lives in the
      // Templates pane beside the other two — one place to look for import/export,
      // rather than three scattered through the workspace.
      var io = '<p class="muted rd-hint">Profiles travel with the project file. To share one between projects, ' +
        'export it from the <strong>Templates</strong> pane.</p>';

      return head + locked + '<fieldset class="rd-fmt-body"' + (builtin ? ' disabled' : '') + '>' + page + fonts + toc + tables + '</fieldset>' + io;
    }

    // ======================================================================
    // HDR-1: the header and footer
    // ======================================================================

    /**
     * Six slots, and a second six for the first page when it is asked to be different.
     *
     * Drawn as a three-column strip rather than a list of labelled boxes, because what
     * an operator is deciding is a POSITION — "the classification goes in the middle" —
     * and a row of three boxes in the order they will print says that without a word.
     */
    function hfRow(project, f, set, label, hint) {
      var hfv = f.headerFooter[set];
      return '<div class="rd-hf"><div class="rd-hf-h">' + esc(label) +
        (hint ? '<span class="muted"> — ' + esc(hint) + '</span>' : '') + '</div>' +
        '<div class="rd-hf-slots">' + App.docFormat.HF_SLOTS.map(function (s) {
          return '<label class="rd-lab rd-lab-s">' + esc(s === 'centre' ? 'Centre' : s === 'left' ? 'Left' : 'Right') +
            '<input value="' + esc(hfv[s] || '') + '" data-rd-hf-set="' + esc(set) + '" data-rd-hf-slot="' + s + '"' +
              ' aria-label="' + esc(label + ', ' + s) + '"></label>';
        }).join('') + '</div></div>';
    }

    function paneHeaderFooter(project) {
      var all = App.docFormat.list(project);
      var active = App.docFormat.resolve(project);
      var editId = _rd.fmtId || active.id;
      var f = all.filter(function (x) { return x.id === editId; })[0] || active;
      var builtin = !!f.builtin;
      var first = f.headerFooter.firstDifferent;

      var head = '<div class="rd-fmt-head">' +
        '<label class="rd-lab">Editing' +
          '<select data-rd-fmt-edit aria-label="Formatting profile being edited">' +
            all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === f.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') +
          '</select></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" data-rd-fmt-new>Duplicate</button>' +
        '</div>' +
        (builtin
          ? '<div class="rd-locked">The <strong>Standard</strong> profile ships with the tool and cannot be edited — <strong>Duplicate</strong> it and change the copy.</div>'
          : '');

      var banner = '<div class="rd-fieldset"><strong>Classification banner</strong>' +
        // CLS-1: read from the project, like the title block — not from the session.
        cb('data-rd-classification', 'OFFICIAL: Sensitive on every page',
          ((project.report || {}).classification === true)) +
        '<p class="muted rd-hint">Printed in the first free slot of the header and of the footer, preferring the centre. ' +
        'Fill all three slots of a line yourself and the banner leaves that line alone — your words win.</p>' +
        '<p class="muted rd-hint">Saved with the project, so it is set once for the document rather than re-ticked ' +
        'every time the tool is opened.</p></div>';

      var body = '<fieldset class="rd-fmt-body"' + (builtin ? ' disabled' : '') + '>' +
        '<div class="rd-fieldset"><strong>Every page</strong>' +
          '<p class="muted">What each line reads. Write <code>#page</code> for the page number and <code>#pages</code> for the total — ' +
          'so <code>Page #page of #pages</code> prints “Page 3 of 12”. Everything else is printed as you write it, ' +
          'so a header reading “Title page” stays “Title page”.</p>' +
          hfRow(project, f, 'header', 'Header') +
          hfRow(project, f, 'footer', 'Footer') +
        '</div>' +
        '<div class="rd-fieldset"><strong>The first page</strong>' +
          cb('data-rd-hf-first', 'Give the first page its own header and footer', first) +
          '<p class="muted rd-hint">A title page usually wants neither. Leave every slot empty and the first page carries nothing.</p>' +
          (first
            ? hfRow(project, f, 'firstHeader', 'First-page header') + hfRow(project, f, 'firstFooter', 'First-page footer')
            : '') +
        '</div>' +
        '</fieldset>';

      return head + banner + body +
        '<p class="muted rd-hint">These show in the <strong>Preview</strong> only with <strong>Pages</strong> switched on — ' +
        'a continuous scroll has no page edges to put them against.</p>';
    }

    // ======================================================================
    // RD-5: templates (TPL-1..TPL-4)
    // ======================================================================

    function templateList(items, kind, emptyNote) {
      if (!items.length) return '<p class="muted">' + esc(emptyNote) + '</p>';
      return '<ul class="rd-tpl-list">' + items.map(function (t) {
        return '<li><span class="rd-tpl-name">' + esc(t.name) + '</span>' +
          (kind === 'sections'
            ? '<button type="button" data-rd-tpl-use="' + esc(t.id) + '" title="Add a new section from this template">Use</button>'
            : '<button type="button" data-rd-rpt-use="' + esc(t.id) + '" title="Replace the current arrangement with this one">Apply</button>') +
          '<button type="button" class="danger" data-rd-tpl-del="' + esc(kind) + '" data-rd-tpl-id="' + esc(t.id) + '" title="Delete this template">✕</button></li>';
      }).join('') + '</ul>';
    }

    function paneTemplates(project) {
      var b = bag(project);
      var profiles = (b.formats || []);
      return '<div class="rd-fieldset"><strong>Formatting profiles</strong>' +
          '<p class="muted">Page setup and heading styling, saved under a name. Edit them in the <strong>Formatting</strong> pane; export them here to reuse in another project.</p>' +
          (profiles.length
            ? '<ul class="rd-tpl-list">' + profiles.map(function (f) {
                return '<li><span class="rd-tpl-name">' + esc(f.name) + '</span></li>';
              }).join('') + '</ul>'
            : '<p class="muted">Only the built-in Standard profile so far. Duplicate it in the Formatting pane to make your own.</p>') +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-export="formats"' + (profiles.length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn">Import<input type="file" accept=".json,application/json" data-rd-import="formats"></label>' +
          '</div></div>' +
        '<div class="rd-fieldset"><strong>Section templates</strong>' +
          '<p class="muted">A saved section — its heading and every paragraph, table and rule in it. Use one to drop a ready-made section into this document. Save one from the <strong>Section</strong> pane.</p>' +
          templateList(b.sectionTemplates || [], 'sections', 'No section templates yet.') +
          '<div class="rd-addbar">' +
            '<button type="button" data-rd-export="sections"' + ((b.sectionTemplates || []).length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn">Import<input type="file" accept=".json,application/json" data-rd-import="sections"></label>' +
          '</div></div>' +
        '<div class="rd-fieldset"><strong>Report templates</strong>' +
          '<p class="muted">The whole design: the section order, the pinned levels, every custom section and the formatting profile. Applying one <strong>replaces</strong> the current arrangement.</p>' +
          templateList(b.reportTemplates || [], 'reports', 'No report templates yet.') +
          '<div class="rd-addbar">' +
            '<button type="button" class="primary" data-rd-rpt-save>Save current design&hellip;</button>' +
            '<button type="button" data-rd-export="reports"' + ((b.reportTemplates || []).length ? '' : ' disabled') + '>Export</button>' +
            '<label class="rd-filebtn">Import<input type="file" accept=".json,application/json" data-rd-import="reports"></label>' +
          '</div></div>' +
        '<p class="muted rd-hint">An import never deletes what you already have. If a name collides you are asked, one by one, which to keep.</p>';
    }

    /** TPL-3: the conflict resolver, shown over the workspace while a merge is pending. */
    function renderConflict() {
      var c = _rd.conflict;
      if (!c) return '';
      var K = App.docTemplates.KINDS[c.kindKey];
      var rows = c.plan.conflicts.map(function (x) {
        var key = App.docTemplates._norm(x.incoming.name);
        var choice = c.decisions[key] || 'keep';
        return '<li><span class="rd-tpl-name">' + esc(x.incoming.name) + '</span>' +
          '<label class="rd-radio"><input type="radio" name="cf-' + esc(key) + '" data-rd-cf="' + esc(key) + '" value="keep"' + (choice === 'keep' ? ' checked' : '') + '> Keep mine</label>' +
          '<label class="rd-radio"><input type="radio" name="cf-' + esc(key) + '" data-rd-cf="' + esc(key) + '" value="replace"' + (choice === 'replace' ? ' checked' : '') + '> Use imported</label>' +
          '</li>';
      }).join('');
      return '<div class="modal-overlay" id="rd-conflict-host">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Resolve import conflicts">' +
        '<div class="modal-head"><div><h3>' + esc(K.label) + ' — name conflicts</h3>' +
          '<div class="modal-sub">' + c.plan.additions.length + ' will be added. ' + c.plan.conflicts.length +
          ' already exist' + (c.plan.conflicts.length === 1 ? 's' : '') + ' under the same name — choose which to keep.</div></div>' +
          '<button type="button" class="modal-close" data-rd-cf-cancel aria-label="Cancel">×</button></div>' +
        '<div class="modal-body"><ul class="rd-tpl-list rd-cf-list">' + rows + '</ul></div>' +
        '<div class="modal-foot">' +
          '<button type="button" data-rd-cf-all="keep">Keep all mine</button>' +
          '<button type="button" data-rd-cf-all="replace">Replace all</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" data-rd-cf-cancel>Cancel</button>' +
          '<button type="button" class="primary" data-rd-cf-apply>Import</button>' +
        '</div></div></div>';
    }

