  /* =============================================================================
   * MODULE: App.ui.views.generate
   * PURPOSE: The Generate tab (spec §11.5): device selector + three INDEPENDENT
   *          commands (Implementation/Verification/Reporting), each enabled iff the
   *          device is ready, disabled buttons explaining why. Generation itself is
   *          wired to App.generate when present (Phase 7); until then it logs intent.
   * PURITY:  UI/DOM
   * DEPENDS: App.store, App.completeness, App.ui.model, App.util.*, App.ui.activity
   * INVARIANTS: a command is enabled ⇔ App.completeness.deviceReady(project, id).
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    // v1.3 (§20.2): four independent, session-only option blocks. Include-maps default
    // to "included" on a missing key; boolean toggles default to false.
    var _gen = {
      deviceId: null, scriptsAsTxt: false, openOptions: {},
      // RPT-2: `relevance` is an include-map over the Security Relevance vocabulary
      // (missing key ⇒ included, as every other generator include-map). IRRELEVANT
      // starts EXCLUDED: an item marked "not security-significant at all" is exactly
      // what nobody wants to read a page of, and the report states the omission.
      // v2.2: the workspace's own open/closed state moved to App.ui.views.reportDesign;
      // what stays here is the option data BOTH the tab and the workspace read.
      /* GEN-TAB: `filename` and `tags` are per-RUN, which is why they live here with the
       * other session options rather than in the project. A tag value is typically the
       * date the document is being issued or the name of the person issuing it — the
       * point of a `/[Tag]` is that the same design produces a different document each
       * time it is generated, so storing last time's answers would defeat it. */
      /* OPT-2: what the report is MADE OF moved into the project (docStore's
       * setReportInclude) — which sections, which groups, which columns, which relevance
       * categories. CLS-1 took the classification banner the same way: the sensitivity of
       * what a report contains is a property of the report, not an answer for one run.
       * What is left here is what genuinely belongs to one run: the filename and the
       * `/[Tag]` values. */
      report: { filename: '', tags: {} },
      control: { includeUncontrolled: false },
      implementation: { datasets: {}, actions: {} },
      verification: { datasets: {}, onlyDeviations: false, csvResults: false },
      // PRO-2: only the EXCLUSIONS are session state. The ORDER is a decision and lives
      // in the project (store.setProcedureOrder), so it survives a reload and travels
      // with the file — leaving someone to re-sequence twenty steps every session would
      // make the feature not worth using.
      procedure: { exclude: {} }
    };
    var _ctx = null;
    var _dragId = null;   // PRO-2: the step currently being dragged in the order editor

    /* -------------------------------------------------------------------------
     * OPT-2/RPT-2: the report options a generator is actually handed.
     *
     * The four include-maps come from the PROJECT and travel with the file; the three
     * per-run fields come from the session block above. Assembled here, in one place, so
     * the Generate button and the workspace's preview cannot be looking at different
     * documents.
     *
     * Only `relevance` needs a default folded in, and only because its default is not
     * "everything": IRRELEVANT starts EXCLUDED — an item marked "not security-significant
     * at all" is exactly what nobody wants to read a page of, and the report states the
     * omission. The project stores DEVIATIONS from that, so including IRRELEVANT is
     * stored as `true` and the untouched project stores nothing (DOD-7). Column defaults
     * need no folding: a column declares its own (COL-3) and App.report.columnOn reads it.
     * ---------------------------------------------------------------------- */
    /**
     * CLS-1: whether the documents this project produces carry the classification banner.
     *
     * ONE answer, for every command that has a banner — the report, the control report
     * and the procedure. The sensitivity of what a project contains does not change with
     * which document you happen to be printing, and three ticks that always agree are
     * three chances for them not to.
     *
     * It lived in the per-run session blocks, which meant it had to be re-ticked every
     * time the tool was opened and a document issued from a fresh session went out
     * unmarked. It is a decision about the project, so it is stored with the project.
     */
    function classificationOn(project) {
      return (((project || App.store.getProject() || {}).report) || {}).classification === true;
    }

    var REPORT_RELEVANCE_DEFAULT = { IRRELEVANT: false };
    function reportOptions(project) {
      var bag = (project || App.store.getProject() || {}).report || {};
      var stored = bag.options || {};
      return Object.assign({}, _gen.report, {
        sections: stored.sections || {},
        datasetSections: stored.datasetSections || {},
        columns: stored.columns || {},
        relevance: Object.assign({}, REPORT_RELEVANCE_DEFAULT, stored.relevance || {}),
        // CLS-1: from the PROJECT now, so it survives a reload and travels with the file.
        classification: bag.classification === true
      });
    }

    var COMMANDS = [
      { id: 'implementation', label: 'Implementation', build: 'buildImplementation', block: 'implementation' },
      { id: 'verification', label: 'Verification', build: 'buildVerification', block: 'verification' },
      { id: 'reporting', label: 'Reporting', build: 'buildReport', block: 'report' },
      { id: 'control', label: 'Control report', build: 'buildControlReport', block: 'control' },
      { id: 'procedure', label: 'Procedure', build: 'buildProcedure', block: 'procedure' }
    ];

    // ---- option checkbox helpers (missing-key ⇒ included for include-maps) ----
    function incMapOn(block, map, ds, key) {
      var m = (_gen[block][map]) || {};
      if (key != null) { var d = m[ds] || {}; return d[key] !== false; }
      return m[ds] !== false;
    }
    function cb(attrs, label, on, off) {
      return '<label class="gen-opt' + (off ? ' gen-opt-off' : '') + '"><input type="checkbox" ' + attrs +
        (on ? ' checked' : '') + (off ? ' disabled' : '') + '> ' + esc(label) + '</label>';
    }

    /** Per-command options panel (spec §20.8), fully data-driven from the platform. */
    function renderOptions(cmd, project, platform) {
      var dss = platform.datasets, parts = [];
      function adapterFor(dsId) { return App.registry.getDataset(project.platformProfileId, dsId); }
      // RPT-4: 'reporting' has NO inline panel — its options live in the full-screen
      // Report Design workspace (App.ui.views.reportDesign), because the section list,
      // the section editor and the formatting controls do not fit in a card.
      if (cmd.id === 'control') {
        parts.push(cb('data-rd-classification', 'OFFICIAL: Sensitive header/footer', classificationOn(project)));
        parts.push(cb('data-gen-block="control" data-gen-flag="includeUncontrolled"', 'Include items with no control', _gen.control.includeUncontrolled === true));
      } else if (cmd.id === 'implementation') {
        parts.push('<div class="gen-opt-grp"><strong>Datasets</strong>');
        dss.forEach(function (ds) {
          parts.push(cb('data-gen-block="implementation" data-gen-map="datasets" data-gen-ds="' + esc(ds.id) + '"', ds.label, incMapOn('implementation', 'datasets', ds.id, null)));
          var a = adapterFor(ds.id); var enumF = ((a && a.decisionSchema) || []).filter(function (f) { return f.kind === 'enum'; })[0];
          if (enumF) {
            parts.push('<div class="gen-opt-sub"><em>actions</em>' +
              enumF.options.map(function (o) { return cb('data-gen-block="implementation" data-gen-map="actions" data-gen-ds="' + esc(ds.id) + '" data-gen-key="' + esc(o) + '"', o, incMapOn('implementation', 'actions', ds.id, o)); }).join('') + '</div>');
          }
        });
        parts.push('</div>');
      } else if (cmd.id === 'procedure') {
        parts.push(renderProcedureOrder(project));
        parts.push(cb('data-rd-classification', 'OFFICIAL: Sensitive header/footer', classificationOn(project)));
      } else if (cmd.id === 'verification') {
        parts.push('<div class="gen-opt-grp"><strong>Datasets</strong>');
        dss.forEach(function (ds) { parts.push(cb('data-gen-block="verification" data-gen-map="datasets" data-gen-ds="' + esc(ds.id) + '"', ds.label, incMapOn('verification', 'datasets', ds.id, null))); });
        parts.push('</div>');
        parts.push(cb('data-gen-block="verification" data-gen-flag="onlyDeviations"', 'Only items that deviate from default', _gen.verification.onlyDeviations === true));
        parts.push(cb('data-gen-block="verification" data-gen-flag="csvResults"', 'Also emit results CSV', _gen.verification.csvResults === true));
      }
      return parts.join('');
    }

    /**
     * PRO-2: the running-order editor. The steps of the Procedure report, in the order
     * they will be carried out, each row draggable and each with ▲/▼ (the buttons are
     * not a fallback for people who cannot drag — they are the keyboard path, and they
     * are what makes a 30-step order editable without a long drag down the page).
     *
     * The numbers count only the steps that are IN, so what the list shows is exactly
     * what the report will say — an excluded row reads "—" rather than holding a number
     * nothing will carry.
     */
    function renderProcedureOrder(project) {
      var selId = selectedId(project);
      var steps = (App.generate && App.generate.procedureSteps) ? App.generate.procedureSteps(project, selId) : [];
      if (!steps.length) {
        return '<div class="gen-opt-grp"><strong>Running order</strong>' +
          '<p class="muted">Nothing applies to this device yet. Onboard a capture, or add a Custom Security Action.</p></div>';
      }
      var notes = (project.procedure && project.procedure.notes) || {};
      var n = 0;
      var rows = steps.map(function (s, i) {
        var off = !!_gen.procedure.exclude[s.id];
        if (!off) n++;
        var num = off ? '—' : String(n);
        var sub = s.kind === 'dataset'
          ? esc(s.dsLabel) + ' register · ' + s.count + ' item' + (s.count === 1 ? '' : 's')
          : esc(s.dsLabel) + (s.item && s.item.procedure ? ' · procedure written' : ' · <em>no procedure written yet</em>');
        var detail = s.kind === 'dataset'
          ? '<textarea class="proc-note" data-proc-note="' + esc(s.id) + '" rows="2"' +
              ' placeholder="Anything specific to this step — where to run it from, what to check first. Optional."' +
              ' aria-label="Notes for step ' + esc(s.label) + '">' + esc(notes[s.id] || '') + '</textarea>'
          : '<div class="muted proc-hint">' + (s.item && s.item.procedure
              ? esc(String(s.item.procedure).split('\n')[0]).slice(0, 140)
              : 'Write the steps in this action&rsquo;s <strong>Procedure</strong> box, on the ' + esc(s.dsLabel) + ' tab.') + '</div>';
        return '<li class="proc-step' + (off ? ' off' : '') + '" draggable="true" data-proc-step="' + esc(s.id) + '">' +
          '<span class="proc-num">' + esc(num) + '</span>' +
          '<label class="proc-inc" title="Include this step in the report"><input type="checkbox" data-proc-include="' + esc(s.id) + '"' + (off ? '' : ' checked') +
            ' aria-label="Include ' + esc(s.label) + '"></label>' +
          '<span class="proc-body"><span class="proc-label">' + esc(s.label) + '</span>' +
            '<span class="muted proc-sub">' + sub + '</span>' + detail + '</span>' +
          '<span class="proc-move">' +
            '<button type="button" data-proc-up="' + esc(s.id) + '"' + (i === 0 ? ' disabled' : '') + ' title="Move this step earlier" aria-label="Move ' + esc(s.label) + ' earlier">▲</button>' +
            '<button type="button" data-proc-down="' + esc(s.id) + '"' + (i === steps.length - 1 ? ' disabled' : '') + ' title="Move this step later" aria-label="Move ' + esc(s.label) + ' later">▼</button>' +
          '</span></li>';
      }).join('');
      return '<div class="gen-opt-grp proc-order"><strong>Running order</strong>' +
        '<div class="muted proc-order-note">Drag a step, or use ▲/▼, to set the order the work is done in. ' +
        'The order is saved with the project. Untick a step to leave it out of this report.</div>' +
        // PRO-3: the list is addressable so a reorder can repaint JUST the list. See below.
        '<div id="proc-order-host"><ol class="proc-list">' + rows + '</ol></div></div>';
    }

    /**
     * PRO-3: repaint the running order in place, without re-rendering the tab.
     *
     * Reordering used to go through the ordinary store-change re-render, which rebuilds
     * the whole page and then puts the scroll offset back. That is fine for a table cell
     * and wrong here: the order editor is near the BOTTOM of a long Generate tab, and
     * every drop bounced the view to the top — so re-sequencing twenty steps meant
     * scrolling back down twenty times. Same reasoning as STAB-3 on the data tabs: the
     * only thing that changed is the list, so the only thing that should be redrawn is
     * the list.
     */
    function refreshProcedureOrder() {
      var host = document.getElementById('proc-order-host');
      if (!host) return;
      var project = App.store.getProject(); if (!project) return;
      // renderProcedureOrder returns the whole group (heading + note + host); take the
      // list out of it rather than duplicating the markup here.
      var holder = document.createElement('div');
      holder.innerHTML = renderProcedureOrder(project);
      var fresh = holder.querySelector('#proc-order-host');
      if (fresh) host.innerHTML = fresh.innerHTML;
    }
    /** Commit an order/exclusion change without the app's full re-render. */
    function quietly(fn) {
      if (_ctx && _ctx.quietEdit) _ctx.quietEdit(fn); else fn();
    }

    /** Persist a reorder: move one step id before/after another, then save the whole list. */
    function moveStep(project, id, delta, beforeId) {
      var steps = App.generate.procedureSteps(project, selectedId(project));
      var ids = steps.map(function (s) { return s.id; });
      var from = ids.indexOf(id);
      if (from === -1) return;
      var to;
      if (beforeId != null) {
        ids.splice(from, 1);
        var at = ids.indexOf(beforeId);
        to = at === -1 ? ids.length : at;
        ids.splice(to, 0, id);
      } else {
        to = from + delta;
        if (to < 0 || to >= ids.length) return;
        ids.splice(from, 1);
        ids.splice(to, 0, id);
      }
      App.store.setProcedureOrder(ids);
    }

    function latest(project) { return App.ui.model.getLatestConfigs(project); }
    function selectedId(project) {
      var l = latest(project);
      if (_gen.deviceId && l.some(function (c) { return c.id === _gen.deviceId; })) return _gen.deviceId;
      return l.length ? l[0].id : null;
    }
    function reasonText(readiness) {
      if (readiness.ready) return '';
      return readiness.reasons.map(function (r) { return r.undecided + ' ' + r.label.toLowerCase() + ' undecided'; }).join(', ');
    }

    function render(project) {
      if (!project) return '<div class="empty-state"><h2>Generate</h2><p>Load a project or onboard a device first.</p></div>';
      var l = latest(project);
      if (!l.length) return '<div class="empty-state"><h2>Generate</h2><p>No device configurations yet — onboard a device.</p></div>';
      var selId = selectedId(project);
      var readiness = App.completeness.deviceReadiness(project, selId);
      var why = reasonText(readiness);
      var dc = l.filter(function (c) { return c.id === selId; })[0];

      var opts = l.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === selId ? ' selected' : '') + '>' + esc(c.name) + ' (v' + c.version + ', ' + esc(c.model) + ')</option>';
      }).join('');

      var statusLine = readiness.ready
        ? '<span class="gen-ready">Ready — all applicable items decided.</span>'
        : '<span class="gen-blocked">Blocked: ' + esc(why) + '.</span>';

      var platform = App.registry.getPlatform(project.platformProfileId);
      var cards = COMMANDS.map(function (cmd) {
        var dis = readiness.ready ? '' : ' disabled';
        var open = !!_gen.openOptions[cmd.id];
        // RPT-4: Reporting's options are a workspace, not a dropdown — its button opens
        // the full-screen panel instead of expanding the card.
        var isReport = cmd.id === 'reporting';
        var optsBtn = isReport
          ? ' <button class="gen-options-toggle" data-rd-open aria-haspopup="dialog">Report Design&hellip;</button>'
          : ' <button class="gen-options-toggle" data-gen-options-toggle="' + cmd.id + '" aria-expanded="' + open + '">' + (open ? 'Hide options' : 'Options ▾') + '</button>';
        var optsPanel = (!isReport && open) ? '<div class="gen-options">' + renderOptions(cmd, project, platform) + '</div>' : '';
        // PRO-2: the order editor needs the full row while it is open; closed, the card
        // sits in the grid with the other four.
        var wide = (cmd.id === 'procedure' && open) ? ' wide' : '';
        return '<div class="gen-card' + wide + '">' +
          '<h3>' + esc(cmd.label) + '</h3>' +
          '<button class="primary" data-generate-action="' + cmd.id + '"' + dis + '>Generate ' + esc(cmd.label) + '</button>' +
          optsBtn +
          '<div class="why">' + (readiness.ready ? '' : esc(why)) + '</div>' +
          optsPanel +
          '</div>';
      }).join('');

      return '<div style="max-width:820px"><h2>Generate</h2>' +
        '<label class="platform">Device <select data-generate-device>' + opts + '</select></label>' +
        '<p>' + statusLine + '</p>' +
        '<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 0 4px">' +
          '<input type="checkbox" data-generate-txt' + (_gen.scriptsAsTxt ? ' checked' : '') + '> Output scripts as <code>.txt</code> instead of <code>.ps1</code></label>' +
        // review-10 #1: HighCom-network warning about .ps1 handling (theme-aware box).
        '<div class="warning" style="margin:0 0 10px;padding:8px 10px;border:1px solid var(--c-undecided-border);border-left-width:4px;border-radius:6px;background:var(--c-warn-bg);color:var(--c-text);font-size:13px">' +
          '<strong style="color:var(--c-warn)">⚠ HighCom network note:</strong> HighCom computers block opening a folder that contains <code>.ps1</code> files. ' +
          'Generate the scripts as <code>.txt</code> (tick the box above), transfer them to a non-HighCom machine, then rename them back to <code>.ps1</code> before running.' +
        '</div>' +
        '<div class="gen-grid">' + cards + '</div>' +
        '<p class="muted">Implementation and Verification produce a single <code>.zip</code>; the three documents produce a single <code>.md</code>. ' +
        'Outputs are deterministic for identical inputs.</p>' +
        '</div>' +
        // RPT-4: rendered last so the overlay sits above the tab it belongs to.
        App.ui.views.reportDesign.render(project, platform);
    }

    /**
     * TF.10: where a generated artifact goes. Connected to a folder, the entries are
     * written UNPACKED under Outputs/<device>/<command>/ — the one-zip-per-generator
     * rule exists because browsers throttle rapid downloads, and that constraint
     * simply does not apply to a folder write. Unconnected, it downloads the zip
     * exactly as before. Either way the Activity log says which happened, so it is
     * never ambiguous where the files went (requirements 9.3).
     */
    function emit(out, cmd, deviceId) {
      if (!out || !out.blob) return;
      var files = out.files;
      if (App.ui.folder && App.ui.folder.canWrite() && files && files.length) {
        App.ui.folder.writeOutputs(deviceId, cmd.id, files).then(function (paths) {
          App.ui.activity.log({
            severity: 'success',
            message: 'Generated ' + cmd.label + ': ' + paths.length + ' file(s) written to Outputs/' + deviceId + '/' + cmd.id + '/'
          });
        }, function (e) {
          // Falling back to the download keeps the artifact reachable rather than lost.
          App.util.dom.download(out.blob, out.name);
          App.ui.activity.log({ severity: 'warning', message: 'Could not write to the folder (' + (e && e.message) + ') — downloaded ' + out.name + ' instead.' });
        });
        return;
      }
      App.util.dom.download(out.blob, out.name);
      App.ui.activity.log({ severity: 'success', message: 'Generated ' + cmd.label + ': ' + out.name });
    }

    function doGenerate(cmdId) {
      var project = App.store.getProject(); if (!project) return;
      var selId = selectedId(project);
      if (!App.completeness.deviceReady(project, selId)) {
        App.ui.activity.log({ severity: 'warning', message: 'Cannot generate: device not ready.' });
        return;
      }
      var cmd = COMMANDS.filter(function (c) { return c.id === cmdId; })[0];
      if (App.generate && typeof App.generate[cmd.build] === 'function') {
        try {
          // Pass the command's own option block; impl/verify also carry the global scriptsAsTxt.
          // OPT-2: the reporting command's options are half project, half session.
          // CLS-1: whichever document it is, whether it is marked is one project answer.
          var block = cmd.block === 'report' ? reportOptions(project)
            : Object.assign({}, _gen[cmd.block] || {}, { classification: classificationOn(project) });
          var opts = (cmd.id === 'implementation' || cmd.id === 'verification') ? Object.assign({}, block, { scriptsAsTxt: _gen.scriptsAsTxt }) : block;
          var out = App.generate[cmd.build](project, selId, opts);
          emit(out, cmd, selId);
          (out && out.issues || []).forEach(function (i) { App.ui.activity.log(i); });
        } catch (err) { App.ui.activity.log({ severity: 'error', message: 'Generation failed: ' + (err && err.message) }); }
      } else {
        App.ui.activity.log({ severity: 'info', message: cmd.label + ' generation will be available in Phase 7.' });
      }
    }

