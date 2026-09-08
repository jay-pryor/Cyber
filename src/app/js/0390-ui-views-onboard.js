  /* =============================================================================
   * MODULE: App.ui.views.onboard
   * PURPOSE: The Onboard tab (spec §11.4): one data-driven file slot per
   *          active-platform dataset), name/model/firmware fields, a gated Onboard
   *          button, capture help, and a triage summary. Re-onboard aware (§8.7).
   * PURITY:  UI/DOM
   * DEPENDS: App.registry, App.store, App.validation, App.util.*, App.ui.activity
   * INVARIANTS: Onboard is disabled until ALL slots parse without errors AND a
   *             non-empty name is given; identical re-onboard is a no-op.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var dom = App.util.dom, esc = App.util.html.esc;

    // View-local state (not canonical; just the in-progress form).
    var _ob = { fields: { name: '', model: '', firmware: '' }, slots: {} };
    var _ctx = null;

    function activePlatform() { return App.registry.getActivePlatform(); }
    /**
     * The datasets Onboard is about: the CAPTURED ones. A virtual dataset (CUS-1) has no
     * file to supply, so offering an empty file slot for it would gate the Onboard button
     * on a file that can never be chosen.
     */
    function datasets() {
      var p = activePlatform();
      return p ? p.datasets.filter(function (d) { return !App.registry.isVirtualDataset(d); }) : [];
    }
    /** Every dataset, captured or not — used only to land on the first tab after onboarding. */
    function allDatasets() { var p = activePlatform(); return p ? p.datasets : []; }

    function slotState(dsId) { return _ob.slots[dsId] || null; }
    function allSlotsOk() {
      return datasets().every(function (ds) {
        var s = slotState(ds.id);
        return s && s.parse && s.parse.errors.length === 0;
      });
    }
    function nameOk() { return !!(_ob.fields.name && _ob.fields.name.trim()); }
    function canOnboard() { return allSlotsOk() && nameOk(); }

    /** Detect whether the current name/model would re-onboard an existing device. */
    function reonboardTarget(project) {
      if (!project || !nameOk()) return null;
      var baseId = App.store.slugify(_ob.fields.name + '-' + _ob.fields.model) || App.store.slugify(_ob.fields.name);
      var latest = App.store.getLatestConfigs(project).filter(function (c) { return c.baseId === baseId; });
      return latest.length ? latest[0] : null;
    }

    function render(project) {
      var ds = datasets();
      var slotsHtml = ds.map(function (d) {
        var s = slotState(d.id);
        var status, cls;
        if (!s) { status = 'No file selected'; cls = 'muted'; }
        else if (s.parse && s.parse.errors.length) { status = '✗ ' + s.parse.errors[0].message; cls = 'error'; }
        else if (s.parse) { status = '✓ ' + s.parse.keys.length + ' items' + (s.parse.warnings.length ? ' (' + s.parse.warnings.length + ' warning' + (s.parse.warnings.length > 1 ? 's' : '') + ')' : ''); cls = 'success'; }
        else { status = 'Reading…'; cls = 'muted'; }
        return '' +
          '<div class="onboard-slot" style="margin-bottom:12px;padding:10px;border:1px solid var(--c-border);border-radius:6px;background:var(--c-surface)">' +
          '<strong>' + esc(d.label) + '</strong> <span class="muted" style="font-size:12px">(' + esc(d.inputKind) + ')</span><br>' +
          '<span class="muted" style="font-size:12px">' + esc(d.captureHint) + '</span><br>' +
          '<input type="file" data-onboard-file="' + esc(d.id) + '" aria-label="' + esc(d.label) + ' capture file" style="margin-top:6px">' +
          '<div class="' + cls + '" data-onboard-status="' + esc(d.id) + '" style="font-family:var(--mono);font-size:12px;margin-top:4px">' + esc(status) + '</div>' +
          '</div>';
      }).join('');

      var ro = reonboardTarget(project);
      var roNote = ro
        ? '<div class="warning" style="margin:8px 0">This will re-onboard <strong>' + esc(ro.name) + '</strong> (creates a new version, or a no-op if snapshots are unchanged).</div>'
        : '';

      var instructions = activePlatform() ? activePlatform().captureInstructions : '';

      return '' +
        '<div style="max-width:760px">' +
        '<h2>Onboard a device</h2>' +
        '<details style="margin-bottom:12px"><summary>Capture instructions</summary><pre class="mono" style="white-space:pre-wrap;background:var(--c-surface-alt);padding:10px;border-radius:6px">' + esc(instructions) + '</pre></details>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">' +
          field('name', 'Device name *', _ob.fields.name) +
          field('model', 'Model', _ob.fields.model) +
          field('firmware', 'Firmware', _ob.fields.firmware) +
        '</div>' +
        slotsHtml +
        roNote +
        '<button class="primary" data-onboard-action="onboard"' + (canOnboard() ? '' : ' disabled') + ' style="margin-top:8px">Onboard</button>' +
        '<span class="muted" data-onboard-hint style="margin-left:10px">' + esc(canOnboard() ? 'Ready.' : 'Provide all files (no errors) and a device name.') + '</span>' +
        '</div>';
    }

    function field(name, label, val) {
      return '<label style="display:flex;flex-direction:column;font-size:12px;color:var(--c-text-muted)">' + esc(label) +
        '<input type="text" data-onboard-field="' + esc(name) + '" value="' + esc(val) + '" style="font-size:14px;color:var(--c-text);padding:5px 7px;border:1px solid var(--c-border);border-radius:6px;min-width:200px"></label>';
    }

    /** Update only the Onboard button + hint (no full re-render; preserves focus). */
    function refreshButton() {
      if (!_ctx) return;
      var btn = _ctx.root.querySelector('[data-onboard-action="onboard"]');
      var hint = _ctx.root.querySelector('[data-onboard-hint]');
      if (btn) btn.disabled = !canOnboard();
      if (hint) hint.textContent = canOnboard() ? 'Ready.' : 'Provide all files (no errors) and a device name.';
    }

    function handleFile(dsId, file) {
      if (!file) return;
      var adapter = App.registry.getDataset(activePlatform().id, dsId);
      _ob.slots[dsId] = { filename: file.name, text: null, sha256: null, parse: null };
      _ctx.refreshMain();
      dom.readFileText(file).then(function (text) {
        var pr = adapter.parse(text);
        _ob.slots[dsId] = { filename: file.name, text: text, sha256: App.util.hash.sha256Hex(text), parse: pr };
        App.ui.activity.logIssues(pr.errors, dsId);
        App.ui.activity.logIssues(pr.warnings, dsId);
        if (!pr.errors.length) App.ui.activity.log({ severity: 'info', message: dsId + ': parsed ' + pr.keys.length + ' items from ' + file.name + '.' });
        _ctx.refreshMain();
      }).catch(function (err) {
        _ob.slots[dsId] = { filename: file.name, parse: { items: [], keys: [], warnings: [], errors: [{ category: 'parse', severity: 'error', message: 'Read failed: ' + (err && err.message), location: 'file' }] } };
        _ctx.refreshMain();
      });
    }

    function doOnboard() {
      var project = App.store.getProject();
      var ds = datasets();
      // Defensive: re-check validation just before commit.
      var parsed = {}; ds.forEach(function (d) { parsed[d.id] = slotState(d.id) ? slotState(d.id).parse : null; });
      var vIssues = App.validation.validateOnboarding({ name: _ob.fields.name, parsed: parsed }, ds.map(function (d) { return d.id; }));
      if (vIssues.length) { App.ui.activity.logIssues(vIssues, 'Onboard blocked'); return; }

      // Onboarding from scratch: create an empty project for the active platform.
      if (!project) { App.store.init(App.store.empty(activePlatform().id)); }

      var snapshots = {}, descriptions = {};
      ds.forEach(function (d) {
        var s = slotState(d.id), pr = s.parse;
        var snap = { capturedUtc: App.util.clock.nowIso(), sourceFilename: s.filename, sha256: s.sha256, keys: pr.keys };
        if (pr.values) snap.values = pr.values;
        if (pr.template !== undefined) snap.template = pr.template;
        snapshots[d.id] = snap;
        // review-10 #3: carry any descriptions the capture parser imported.
        if (pr.descriptions && Object.keys(pr.descriptions).length) descriptions[d.id] = pr.descriptions;
      });

      var res = App.store.onboardDevice({ name: _ob.fields.name, model: _ob.fields.model, firmware: _ob.fields.firmware, snapshots: snapshots, descriptions: descriptions });
      App.ui.activity.logIssues(res.issues);
      if (!res.ok) return;

      if (res.result.noop) { return; } // logged "nothing to do"; stay on Onboard

      // Per-dataset triage breakdown to the drawer.
      ds.forEach(function (d) {
        var pd = res.result.perDataset[d.id];
        App.ui.activity.log({ severity: 'info', message: d.label + ': ' + pd.newCount + ' new, ' + pd.existingCount + ' inherited.' });
      });

      // Reset the form and switch focus to the first dataset (review-4 #2: land with
      // the Incomplete-only filter UNticked so the full list shows by default).
      _ob = { fields: { name: '', model: '', firmware: '' }, slots: {} };
      _ctx.switchTab((allDatasets()[0] || ds[0]).id);
    }

    function wire(ctx) {
      _ctx = ctx;
      dom.on(ctx.root, 'change', '[data-onboard-file]', function (e, el) { handleFile(el.getAttribute('data-onboard-file'), el.files[0]); });
      dom.on(ctx.root, 'input', '[data-onboard-field]', function (e, el) { _ob.fields[el.getAttribute('data-onboard-field')] = el.value; refreshButton(); });
      dom.on(ctx.root, 'click', '[data-onboard-action="onboard"]', function () { doOnboard(); });
    }

    App.ui = App.ui || {};
    App.ui.views = App.ui.views || {};
    App.ui.views.onboard = { render: render, wire: wire };
  })(App);
