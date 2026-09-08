    // ======================================================================
    // GEN-TAB: the Generate pane
    // ======================================================================

    /**
     * The last pane, and the only one that writes a file.
     *
     * Two things happen here that cannot happen anywhere else. The document is NAMED —
     * a report an operator will file alongside forty others should not have to be called
     * `dev-m1-reporting-20260630T120000Z.md` — and every `/[Tag]` written anywhere in it
     * is listed with a box beside it, so the same design can be issued repeatedly with a
     * new date, a new author, a new reference number.
     *
     * The tag list is read off the FINISHED document, which is why this pane builds one
     * to draw itself. That is the only way the list can be complete: a tag in a footer
     * slot, in a column heading and in a paragraph all arrive in the same string in the
     * end, and nothing short of the end sees all three.
     */
    function paneGenerate(project, platform, view) {
      var selId = selectedDeviceId(project);
      if (!selId) return '<p class="muted">No device selected — nothing to generate.</p>';
      var ready = App.completeness.deviceReady(project, selId);
      var o = opts();
      var built = null;
      try { built = App.generate.buildReport(project, selId, Object.assign({}, o, { tags: {} })); } catch (e) { built = null; }
      var tags = built ? App.generate.findTags(built.text || '') : [];
      var values = o.tags || {};
      var unfilled = tags.filter(function (t) { return !String(values[t] || '').trim(); });

      var name = App.generate.docFilename(o.filename);
      var tagRows = tags.length
        ? tags.map(function (t) {
            var v = String(values[t] || '');
            return '<label class="rd-lab rd-tagrow"><code>/[' + esc(t) + ']</code>' +
              '<input value="' + esc(v) + '" data-rd-tag="' + esc(t) + '"' +
                ' placeholder="What should this read?" aria-label="Value for the ' + esc(t) + ' tag"></label>';
          }).join('')
        : '<p class="muted">None written yet. Type <code>/[Date]</code> — a slash, then a name in square brackets — ' +
          'in any heading, paragraph, table or header slot and it will be listed here.</p>';

      return '<div class="rd-fieldset"><strong>File name</strong>' +
          '<p class="muted">What the downloaded <code>.md</code> is called. Leave it blank for the standard ' +
          'device-and-timestamp name.</p>' +
          '<label class="rd-lab"><input class="rd-title" value="' + esc(o.filename || '') + '" data-rd-filename' +
            ' placeholder="' + esc(selId + '-reporting-…….md') + '" aria-label="File name"></label>' +
          (name ? '<p class="muted rd-hint">Saves as <code>' + esc(name) + '</code>.</p>' : '') +
        '</div>' +
        '<div class="rd-fieldset"><strong>Placeholders</strong>' +
          '<p class="muted">Every <code>/[Tag]</code> written anywhere in the document, filled in once here and ' +
          'replaced everywhere it appears. A tag left blank is printed as it stands, so an unfinished document ' +
          'looks unfinished rather than merely incomplete.</p>' +
          tagRows +
          (unfilled.length
            ? '<p class="rpt-omit"><strong>' + unfilled.length + '</strong> placeholder' + (unfilled.length === 1 ? '' : 's') +
              ' still to fill in: ' + unfilled.map(function (t) { return '<code>/[' + esc(t) + ']</code>'; }).join(' ') + '</p>'
            : (tags.length ? '<p class="rpt-omit muted">Every placeholder has a value.</p>' : '')) +
        '</div>' +
        '<div class="rd-fieldset"><strong>Generate</strong>' +
          '<p class="muted">' + (ready
            ? 'One <code>.md</code>, exactly as the Preview shows it.'
            : 'This device is not ready — some applicable items are still undecided.') + '</p>' +
          '<div class="rd-addbar">' +
            '<button type="button" class="primary" data-generate-action="reporting"' + (ready ? '' : ' disabled') + '>Generate .md</button>' +
          '</div>' +
        '</div>' +
        /* The conversion, in full.
         *
         * It used to be half a sentence — `pandoc report.md -o report.pdf` — which is not
         * the command that produces this document: it names no engine, and it does not
         * pass the Lua filter every table in the file depends on. Run as written it either
         * failed or quietly produced a document with the tables broken. The three things
         * that actually go wrong are on Windows and none of them are LaTeX, so they are
         * here rather than in a troubleshooting page nobody reaches.
         */
        '<div class="rd-fieldset"><strong>Converting it to PDF</strong>' +
          '<p class="muted">One command — pandoc drives tectonic itself, so there is no second step. ' +
          'Run it in the folder holding both the <code>.md</code> and <code>pdfGenLuaConfig.lua</code>:</p>' +
          '<pre class="rd-cmd">pandoc report.md --lua-filter=pdfGenLuaConfig.lua --pdf-engine=tectonic -o report.pdf</pre>' +
          '<p class="muted">Or with full paths, from anywhere:</p>' +
          '<pre class="rd-cmd">pandoc "C:\\path\\to\\report.md" --lua-filter="C:\\path\\to\\pdfGenLuaConfig.lua" ' +
            '--pdf-engine=tectonic -o "C:\\path\\to\\report.pdf"</pre>' +
          '<p class="muted">The Lua filter is not optional: the tables in this document are built as LaTeX ' +
          '<code>longtable</code>s through it, and without it the shading, the merged title rows, the column ' +
          'widths and the line breaks inside cells are all lost.</p>' +
          '<p class="muted"><strong>Three things that bite on Windows.</strong></p>' +
          '<ul class="muted rd-cmdlist">' +
            '<li><strong>Both <code>pandoc.exe</code> and <code>tectonic.exe</code> must be on <code>PATH</code>.</strong> ' +
              'Pandoc calls tectonic by name, so one sitting in your Downloads folder will not be found even though ' +
              'you can double-click it. Check with <code>where pandoc</code> and <code>where tectonic</code> before ' +
              'blaming the document.</li>' +
            '<li><strong>Tectonic needs the internet the first time.</strong> It downloads the TeX packages it needs ' +
              'into a local cache; after that it works offline. (This tool never touches the network either way — ' +
              'the conversion is a separate step you run yourself.)</li>' +
            '<li><strong>Close the PDF in your viewer first.</strong> Acrobat holds an exclusive lock on Windows, and ' +
              'the build fails at the last step with a permissions error.</li>' +
          '</ul>' +
          '<p class="muted">To see what LaTeX complained about, send the log to a file — ' +
          '<code>… -o report.pdf 2&gt; tex.log</code> — and look for <code>Overfull \\hbox</code>. ' +
          'Anything over about 1pt means a table is running past the right margin; the sub-0.2pt ones are ' +
          'longtable rounding and are always there.</p>' +
          '<p class="muted">Verified against <strong>pandoc 3.1.11</strong> and <strong>tectonic 0.15.0</strong>.</p>' +
        '</div>';
    }

    // ======================================================================
    // RD-6: the preview
    // ======================================================================

    function buildPreview(project) {
      var selId = selectedDeviceId(project);
      if (!selId) return { html: '<p class="muted">No device selected.</p>', outline: [] };
      try {
        var out = App.generate.buildReport(project, selId, opts());
        if (!out || !out.text) return { html: '<p class="muted">Nothing to preview.</p>', outline: [] };
        // SEC-4: the per-LEVEL page breaks live in the profile and reach the PDF as
        // titlesec's own hook, so there is no `\newpage` in the markdown for the
        // paginator to find. Handed in, they become a class it can break on.
        return App.ui.mdPreview.toHtml(out.text, null,
          { breaks: App.docFormat.levelBreaks(App.docFormat.resolve(project)) });
      } catch (e) {
        return { html: '<p class="rd-err">Preview failed: ' + esc(e && e.message) + '</p>', outline: [] };
      }
    }

    /* PRV-4: the running header and footer, drawn on a page of the preview.
     *
     * Only in PAGE view, and that is not a simplification — a continuous scroll has no
     * page edges to put them against, and drawing a "footer" halfway down a column of
     * text would be inventing a page boundary that the toggle is switched off precisely
     * to avoid claiming.
     *
     * The slots come from App.docFormat.headerFooter, which is the same call the LaTeX
     * preamble makes, so the classification banner lands in the same slot in both.
     */
    function runningSlots(set, n, total) {
      var any = App.docFormat.HF_SLOTS.some(function (s) { return set[s]; });
      if (!any) return '';
      return App.docFormat.HF_SLOTS.map(function (s) {
        // `#page` and `#pages` are LaTeX macros on the page; only the preview is in a
        // position to know what they will print, so this is where they become numbers.
        var text = App.docFormat.slotParts(set[s]).map(function (p) {
          return p.token === 'page' ? String(n) : p.token === 'pages' ? String(total) : p.text;
        }).join('');
        return '<span class="prv-hf-' + s + '">' + esc(text) + '</span>';
      }).join('');
    }

    /**
     * PRV-4: the document laid out as sheets of paper.
     *
     * The break positions cannot be computed here — a browser decides where a paragraph
     * ends only once it has laid it out, and this runs as a string. So the markup is a
     * single flow inside a page-height CLIP, and `paginate()` (below, after mount) walks
     * the laid-out children and moves them into as many sheets as they need. That keeps
     * the whole thing to one render path: page view and continuous view are the same
     * HTML, with the sheets built around it or not.
     */
    function pagedPaper(project, html) {
      var f = App.docFormat.resolve(project);
      var m = App.docFormat.pageMetrics(f);
      var hf = App.docFormat.headerFooter(f, { classification: opts().classification ? 'OFFICIAL: Sensitive' : '' });
      // Written as data attributes rather than inline styles so `paginate` can read the
      // numbers back without re-resolving the profile, and so a redraw cannot disagree
      // with the measurement that produced it.
      return '<style>' + App.docFormat.previewCss(f) + '</style>' +
        '<div class="rd-pages" data-prv-pages' +
          ' data-prv-pw="' + m.width + '" data-prv-ph="' + m.height + '"' +
          ' data-prv-mt="' + m.top + '" data-prv-mb="' + m.bottom + '"' +
          ' data-prv-ml="' + m.left + '" data-prv-mr="' + m.right + '"' +
          ' data-prv-first="' + (hf.firstDifferent ? '1' : '') + '"' +
          ' data-prv-hf="' + esc(JSON.stringify(hf)) + '">' +
          '<div class="rd-pageflow rd-paper">' + html + '</div>' +
        '</div>';
    }

    function panePreview(project) {
      var p = _rd.preview || (_rd.preview = buildPreview(project));
      var nav = p.outline.map(function (o) {
        return '<a class="rd-nav rd-nav-' + o.level + '" href="#' + esc(o.anchor) + '" data-prv-jump="' + esc(o.anchor) + '">' +
          (o.number ? '<span class="rd-nav-n">' + esc(o.number) + '</span> ' : '') + esc(o.title) + '</a>';
      }).join('');
      var paged = _rd.pages === true;
      return '<div class="rd-preview">' +
        '<div class="rd-addbar"><button type="button" data-rd-refresh-preview>↻ Refresh</button>' +
          // PRV-4: the toggle. Off is the view this pane has always had — one continuous
          // sheet — because that is the better one for reading what the document SAYS.
          // On answers the other question: where does it break, and what is on every page.
          '<label class="gen-opt"><input type="checkbox" data-rd-pageview' + (paged ? ' checked' : '') + '> Pages</label>' +
          '<span class="muted">' + (paged
            ? 'Laid out as it will be printed, with the header and footer on every page.'
            : 'This is the document the Generate button downloads, rendered from the same markdown.') + '</span></div>' +
        '<div class="rd-preview-body">' +
          '<nav class="rd-preview-nav">' + (nav || '<span class="muted">No sections.</span>') + '</nav>' +
          '<article class="rd-preview-doc' + (paged ? ' rd-preview-paged' : '') + '" id="rd-preview-doc">' +
            (paged ? pagedPaper(project, p.html) : paper(project, p.html)) + '</article>' +
        '</div></div>';
    }

    // ======================================================================
    // assembly
    // ======================================================================

    function inner(project, platform) {
      var selId = selectedDeviceId(project);
      var dc = latest(project).filter(function (c) { return c.id === selId; })[0];
      var ready = selId ? App.completeness.deviceReady(project, selId) : false;
      var view = outlineNow(project, platform);
      var included = view.blocks.filter(function (b) { return b.included; }).length;
      var omitted = omittedByRelevance(project, selId);

      var paneBody =
        _rd.pane === 'section' ? paneSection(project, platform, view) :
        _rd.pane === 'relevance' ? paneRelevance(project) :
        _rd.pane === 'formatting' ? paneFormatting(project) :
        _rd.pane === 'headerfooter' ? paneHeaderFooter(project) :
        _rd.pane === 'templates' ? paneTemplates(project) :
        _rd.pane === 'generate' ? paneGenerate(project, platform, view) :
        panePreview(project);

      var tabs = PANES.map(function (p) {
        return '<button type="button" class="rd-tab' + (_rd.pane === p.id ? ' on' : '') + '" data-rd-pane="' + p.id + '"' +
          (_rd.pane === p.id ? ' aria-current="true"' : '') + '>' + esc(p.label) + '</button>';
      }).join('');

      return '<div class="modal modal-full" role="dialog" aria-modal="true" aria-label="Report Design">' +
        '<div class="modal-head"><div><h3>Report Design</h3>' +
          '<div class="modal-sub">' + (dc ? esc(dc.name) + ' — what the document contains, in what order, and how it looks.' : 'No device selected.') + '</div></div>' +
          '<button type="button" class="modal-close" data-rd-close aria-label="Close">×</button></div>' +
        '<div class="modal-body"><div class="rpt-body rd-layout">' +
          renderSectionList(project, platform, view) +
          '<div class="rd-right"><div class="rd-tabs">' + tabs + '</div>' +
            '<div class="rpt-pane rd-pane">' + paneBody + '</div></div>' +
        '</div></div>' +
        '<div class="modal-foot">' +
          '<span class="foot-summary">' + included + ' of ' + view.blocks.length + ' section' + (view.blocks.length === 1 ? '' : 's') + ' included' +
            (omitted ? ' &middot; ' + omitted + ' item' + (omitted === 1 ? '' : 's') + ' omitted by relevance' : '') +
            ' &middot; ' + esc(view.profile.name) +
            (ready ? '' : ' &middot; device not ready') + '</span>' +
          '<span class="spacer"></span>' +
          '<button type="button" data-rd-reset-order title="Put the sections back in the order the platform declares them">Reset order</button>' +
          // GEN-TAB: the Generate button has moved to the Generate pane, where the file
          // is named and the placeholders are filled in. A button that writes a file
          // sitting in the footer of every pane meant it could be pressed from five
          // screens away from the two things that decide what it writes.
          '<button type="button" data-rd-close>Close</button>' +
        '</div></div>' + renderConflict();
    }

    /** @returns {string} the workspace, or '' when closed. */
    function render(project, platform) {
      if (!_rd.open || !project || !platform) return '';
      return '<div class="modal-overlay overlay-full" id="rd-modal-host" data-rd-modal>' + inner(project, platform) + '</div>';
    }

    /**
     * Repaint in place, keeping the body's scroll position.
     *
     * Same reasoning as PRO-3 and the old RPT-4 modal: a tick changes numbering and the
     * footer summary, so the workspace genuinely has to be redrawn — but the page
     * behind it has not changed, and routing this through the app's full re-render
     * threw away where you were in a long section list on every click.
     * @returns {boolean} false when the workspace is not open (caller falls back)
     */
    function refresh() {
      var host = document.getElementById('rd-modal-host');
      if (!host) return false;
      var project = App.store.getProject(); if (!project) return false;
      var platform = App.registry.getPlatform(project.platformProfileId);
      if (!platform) return false;
      var body = host.querySelector('.modal-body');
      var top = body ? body.scrollTop : 0;
      var pane = host.querySelector('.rd-pane');
      var paneTop = pane ? pane.scrollTop : 0;
      host.innerHTML = inner(project, platform);
      var again = host.querySelector('.modal-body');
      if (again) again.scrollTop = top;
      var pane2 = host.querySelector('.rd-pane');
      if (pane2) pane2.scrollTop = paneTop;
      return true;
    }
