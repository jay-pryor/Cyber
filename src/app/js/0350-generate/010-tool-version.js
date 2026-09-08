  /* =============================================================================
   * MODULE: App.generate
   * PURPOSE: Orchestrate the three INDEPENDENT generators (spec §7, §10): gather a
   *          device's applicable+complete items per dataset, call adapter generators
   *          + platform preamble/postamble, assemble a manifest (with per-file
   *          sha256 + the decision snapshot used), and produce ONE store-only ZIP.
   * PURITY:  pure up to the final Blob (download is the UI's job, via util.dom).
   * DEPENDS: App.registry, App.projectIo, App.report, App.util.{hash,zip,stable,clock}
   * INVARIANTS: identical project+device ⇒ identical zip bytes under a fixed clock
   *             (DOD-7). Item/output ordering is stable; timestamps come from clock.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var TOOL_VERSION = '1.0';
    var TOOL_NAME = 'CH Config Tool';
    var sha = App.util.hash.sha256Hex;
    var stable = App.util.stable.stableStringify;
    var MD = App.md;

    /**
     * Original RegisterItems that are applicable to a device for a dataset AND complete
     * under their EFFECTIVE decision (default→group→device, spec §19.2/OVR-3), sorted by key.
     */
    function applicableComplete(project, deviceId, dsId) {
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return [];
      if (!App.registry.deviceHasDataset(project, dc, dsId)) return [];
      var adapter = App.registry.getDataset(project.platformProfileId, dsId);
      var ks = App.registry.applicableKeySet(project, dc, dsId);   // CUS-1
      return (project.items[dsId] || []).filter(function (it) {
        if (!ks[it.key]) return false;
        var eff = App.overrides ? App.overrides.effectiveItem(project, dsId, it, deviceId) : it;
        return App.completeness.itemComplete(adapter, eff);
      }).slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    }

    /**
     * Items applicable+complete, each with its decision replaced by the EFFECTIVE value
     * so adapters (generators/report) stay override-blind (spec §19.2, OVR-3).
     */
    function gather(project, deviceId, dsId) {
      return applicableComplete(project, deviceId, dsId).map(function (it) {
        return App.overrides ? App.overrides.effectiveItem(project, dsId, it, deviceId) : it;
      });
    }

    /** Compact a UTC ISO timestamp for a filename, e.g. 20260630T120000Z. */
    function stamp(iso) { return iso.replace(/\.\d+/, '').replace(/[-:]/g, ''); }

    /** Build the manifest.json content (deterministic except generatedUtc). */
    function buildManifest(project, dc, command, generatedUtc, platform, outputFiles) {
      var decisions = {};
      platform.datasets.forEach(function (ds) {
        // Record the EFFECTIVE decision + its source per item (spec §19.6 / OVR-7).
        decisions[ds.id] = applicableComplete(project, dc.id, ds.id).map(function (it) {
          var eff = App.overrides ? App.overrides.effectiveDecision(project, ds.id, it, dc.id) : { decision: it.decision, source: 'default' };
          return { key: it.key, decision: eff.decision, source: eff.source };
        });
      });
      var manifest = {
        tool: TOOL_NAME, toolVersion: TOOL_VERSION, command: command, generatedUtc: generatedUtc,
        projectSha256: sha(App.projectIo.serializeProject(project)),
        device: { id: dc.id, baseId: dc.baseId, version: dc.version, name: dc.name, model: dc.model, firmware: dc.firmware },
        outputs: outputFiles.map(function (f) { return { name: f.name, sha256: sha(f.content) }; })
          .sort(function (a, b) { return a.name < b.name ? -1 : 1; }),
        decisions: decisions
      };
      return stable(manifest);
    }

    // VER-5: the command travels with the context so a platform can shape its preamble to
    // the script it is actually wrapping. Profiles that ignore it are unaffected (DOD-11).
    function ctxFor(project, dc, generatedUtc, command) {
      return { device: dc, project: project, toolVersion: TOOL_VERSION, generatedUtc: generatedUtc, command: command };
    }
    function endsWith(s, suffix) { return s.lastIndexOf(suffix) === s.length - suffix.length; }

    /** Shared path for implementation/verification (scripts + data + manifest -> zip). */
    function buildScripts(project, deviceId, command, opts) {
      opts = opts || {};
      var platform = App.registry.getPlatform(project.platformProfileId);
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!platform || !dc) return { issues: [{ category: 'generation', severity: 'error', message: 'Unknown device or platform.', location: deviceId }] };
      var generatedUtc = App.util.clock.nowIso();
      var ctx = ctxFor(project, dc, generatedUtc, command);
      var genName = command === 'implementation' ? 'generateImplementation' : 'generateVerification';
      var ext = platform.scriptExtension;
      var files = [];
      // v1.3 (§20.6/§20.7): optional CSV verification-results scaffold accumulates rows.
      var csvRows = [];
      // Only-deviations (§20.7): the set of deviating keys per dataset, once.
      var devKeysByDs = {};
      if (opts.onlyDeviations && App.overrides) {
        App.overrides.deviceDeviations(project, deviceId).forEach(function (d) {
          (devKeysByDs[d.datasetId] = devKeysByDs[d.datasetId] || {})[d.key] = true;
        });
      }
      try {
        platform.datasets.forEach(function (ds) {
          // Dataset include filter (§20.6/§20.7) — skip an unticked dataset entirely.
          if (opts.datasets && opts.datasets[ds.id] === false) return;
          var adapter = App.registry.getDataset(project.platformProfileId, ds.id);
          var items = gather(project, deviceId, ds.id);
          // Action subset (§20.6, enum datasets only) — discovered data-drivenly.
          if (opts.actions && opts.actions[ds.id]) {
            var enumField = ((adapter.decisionSchema || []).filter(function (f) { return f.kind === 'enum'; })[0] || {}).name;
            if (enumField) {
              var amap = opts.actions[ds.id];
              items = items.filter(function (it) { return it.decision && amap[it.decision[enumField]] !== false; });
            }
          }
          // Only items that deviate from default (§20.7).
          if (opts.onlyDeviations) {
            var dk = devKeysByDs[ds.id] || {};
            items = items.filter(function (it) { return dk[it.key]; });
          }
          (ds[genName](items, ctx) || []).forEach(function (f) {
            var isScript = ext && endsWith(f.name, ext);
            // review-3 #1: optionally rename generated SCRIPT files to .txt (wrapping
            // is decided on the original extension first, so the preamble is kept).
            var name = (isScript && opts.scriptsAsTxt) ? f.name.slice(0, -ext.length) + '.txt' : f.name;
            // review-9 #4: a platform-provided "how to run" header for THIS file (if any).
            var runc = (isScript && typeof platform.runInstructions === 'function') ? platform.runInstructions(name) + '\n' : '';
            // Wrap script files (per platform.scriptExtension) with preamble/postamble;
            // leave data files (e.g. tactical.json) unwrapped (spec §10.1).
            var content = isScript ? runc + platform.scriptPreamble(ctx) + '\n' + f.content + '\n' + platform.scriptPostamble(ctx) : f.content;
            files.push({ name: name, content: content });
          });
          // CSV results scaffold (§20.7): expected = adapter decision-column display.
          if (opts.csvResults) {
            var get = decisionColGet(adapter);
            var dispKey = (adapter && adapter.displayKey) || function (k) { return k; };
            items.forEach(function (it) { csvRows.push({ dataset: ds.label, key: dispKey(it.key), expected: String(get(it)), actual: '', result: '' }); });
          }
        });
        if (opts.csvResults) {
          var cols = [{ key: 'dataset', label: 'dataset' }, { key: 'key', label: 'key' }, { key: 'expected', label: 'expected' }, { key: 'actual', label: 'actual' }, { key: 'result', label: 'result' }];
          files.push({ name: 'verification-results.csv', content: App.util.csv.toCsv(csvRows, cols) });
        }
      } catch (e) {
        return { issues: [{ category: 'generation', severity: 'error', message: 'Generation failed: ' + e.message }] };
      }
      files.push({ name: 'manifest.json', content: buildManifest(project, dc, command, generatedUtc, platform, files) });
      return { blob: App.util.zip.zip(files), name: dc.id + '-' + command + '-' + stamp(generatedUtc) + '.zip', issues: [], files: files };
    }

    /** @returns {{blob:Blob,name:string,issues:Issue[],files?:Object[]}} */
    function buildImplementation(project, deviceId, opts) { return buildScripts(project, deviceId, 'implementation', opts); }
    /** @returns {{blob:Blob,name:string,issues:Issue[],files?:Object[]}} */
    function buildVerification(project, deviceId, opts) { return buildScripts(project, deviceId, 'verification', opts); }

    /**
     * RPT-2: the Security Relevance filter for one report run.
     *
     * `opts.relevance` is an ordinary include-map — a MISSING key means included — so it
     * behaves exactly like every other generator include-map (§20.6) and "include
     * everything" is the empty object. An item whose relevance was left blank (most of
     * them) is keyed REL_UNSET, because '' is not a value a checkbox can carry in a data
     * attribute.
     *
     * When `opts.relevance` is absent there is NO filtering: a caller that asks for a
     * report without options still gets every item. The filter is a choice the operator
     * makes, never one the engine applies behind them.
     */
    var REL_UNSET = '_unset';
    function relevanceKeyOf(item) { return (item && item.relevance) || REL_UNSET; }
    function relevanceFilter(opts) {
      var map = opts && opts.relevance;
      if (!map) return null;
      return function (it) { return map[relevanceKeyOf(it)] !== false; };
    }
    /** gather() narrowed by an optional relevance predicate (null ⇒ everything). */
    function gatherKept(project, deviceId, dsId, keep) {
      var items = gather(project, deviceId, dsId);
      return keep ? items.filter(keep) : items;
    }

    /**
     * Build the Control-coverage section (spec §18.3 CTL-7): items grouped by
     * control (title + type), sub-grouped by dataset. Items referencing no control are
     * left out entirely (RPT-1).
     * @param {?function(RegisterItem):boolean} [keep]  RPT-2 relevance predicate
     * @returns {string} markdown
     */
    /**
     * CCOL-1: the Control coverage section's columns, declared rather than hard-wired.
     *
     * Same shape a dataset adapter declares (`id` / `label` / `optional`), so the Report
     * Design pane can offer ticks for these with the code it already has for the
     * registers. `Control` is the key column and is not offered: a coverage table with
     * no control in it is not a coverage table.
     */
    var CONTROL_COLUMNS = [
      // CCOL-2: the control's TYPE used to ride along in brackets after its title, which
      // made the first column two facts wide and left the type unsortable, unhideable
      // and unwidenable. It is a column like any other now.
      // COL-3: and one that ships OFF — "ASD" beside every row of a table that is all
      // ASD controls is a column of one repeated word.
      { id: 'type', label: 'Type', optional: true, defaultOff: true },
      // CCOL-3: what the control actually SAYS. The coverage table named a control and
      // asserted a status against it, and a reader who did not already know the control
      // had to go and look it up — which for an external reader means they cannot.
      { id: 'description', label: 'Description', optional: true },
      { id: 'status', label: 'Status', optional: true },
      // COL-3: ships OFF. It is the widest cell in the table by a distance — every key
      // satisfying the control, per register — and what a coverage table is read for is
      // whether the control is met, not the inventory behind it.
      { id: 'items', label: 'Items (by dataset)', optional: true, defaultOff: true },
      { id: 'justification', label: 'Justification', optional: true }
    ];

    /* REF-2: the anchor a control's coverage row answers to.
     *
     * Derived from the control's ID, never from its title, for the same reason a
     * section anchor is derived from a block id (DOC-3): renaming AHG-001 to AHG-001a
     * must move what every link SAYS without moving where any of them point.
     */
    function controlAnchor(controlId) { return MD.anchor('ctl-' + controlId); }

    /**
     * REF-2: every control mention that should become a link, and where it points.
     *
     * The terms are the control TITLES, because that is the string a person writes:
     * nobody types the minted id `ctl3` into a paragraph, they type `AHG-001`. The
     * anchor is the coverage row's, so a reader hovering a mention anywhere in the
     * document lands on the row that says what was done about it.
     *
     * Returns NOTHING when the Control coverage section is not in the document. A link
     * to a section that was not emitted is a link to nowhere, and pandoc will not warn
     * about it — so the honest answer to "the coverage table is switched off" is plain
     * text, not a dead link.
     *
     * @param {Array} [blocks]  the blocks being emitted; omitted ⇒ assume coverage is in
     */
    function controlLinkTerms(project, blocks) {
      if (blocks && !blocks.some(function (b) { return b && b.kind === 'control' && b.included !== false; })) return [];
      return ((project && project.controls) || [])
        .filter(function (c) { return c && String(c.title || '').trim(); })
        .map(function (c) { return { text: MD.text(String(c.title).trim()), anchor: controlAnchor(c.id) }; });
    }

    /* TBL-1: the wording of one table, for the sections that build their own.
     *
     * A dataset section gets this for free — its adapter hands `tables` to
     * App.report.buildSection, which does the work. The three sections that assemble a
     * table here (the provenance block, Control coverage, and each register's
     * divergences) have to ask for it, so they ask through one helper rather than three
     * copies of the same three lines.
     */
    /* 7a: these four moved to App.docBlocks — nothing in them knows what a device or
     * a control is, so they are the module's. Aliased here so the call sites below,
     * and in the fragments that share this closure, are unchanged. */
    var tableWording = App.docBlocks.tableWording;
    var headingsFor = App.docBlocks.headingsFor;
    var withWording = App.docBlocks.withWording;

    function buildControlSection(project, deviceId, platform, keep, tblOpts, colOpts, block) {
      // JUS-3: satisfaction state and justification are keyed by device BASE id, so they
      // survive re-onboarding (a new version of the same device) exactly like the state.
      var dcSec = (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0];
      var deviceBaseId = dcSec ? dcSec.baseId : '';
      var cols = colOpts || {};
      var shown = CONTROL_COLUMNS.filter(function (c) { return App.report.columnOn(c, cols); });
      var byCtl = {}; var ctlLabel = {}; var ctlType = {}; var ctlDesc = {};
      var controlsById = {}; (project.controls || []).forEach(function (c) { controlsById[c.id] = c; });
      platform.datasets.forEach(function (ds) {
        var adapter = App.registry.getDataset(project.platformProfileId, ds.id);
        var dispKey = (adapter && adapter.displayKey) || function (k) { return k; };
        gatherKept(project, deviceId, ds.id, keep).forEach(function (it) {
          // RPT-1: items referencing NO control are not listed. This section answers
          // "what did we do to meet each control?", and an item with no control is by
          // definition something that was left as it was — a "(no control)" row was a
          // dump of everything that did not change, which buried the controls the
          // section exists to evidence. (The standalone Control report keeps its
          // explicit "Include items with no control" opt-in, which is off by default.)
          var refs = (it.controlRefs || []).filter(function (r) { return !!r; });
          refs.forEach(function (ref) {
            var c = controlsById[ref];
            ctlLabel[ref] = c ? c.title : ref;
            ctlType[ref] = c ? c.type : '';
            ctlDesc[ref] = (c && c.description) || '';
            byCtl[ref] = byCtl[ref] || {};
            (byCtl[ref][ds.label] = byCtl[ref][ds.label] || []).push(dispKey(it.key));
          });
        });
      });
      // Sort by displayed label for stable, human-friendly ordering.
      // JUS-3: the per-device satisfaction decision and the JUSTIFICATION for it are the
      // evidence this section exists to carry — a coverage table that lists items but not
      // why they are considered sufficient is only half the answer.
      var refOrder = Object.keys(byCtl).sort(function (a, b) { return ctlLabel[a] < ctlLabel[b] ? -1 : ctlLabel[a] > ctlLabel[b] ? 1 : 0; });
      var rows = refOrder.map(function (ref) {
        // One line per dataset inside the cell, keys as code spans. CELL_BREAK makes
        // App.md pick a grid table, which is the only markdown table that can hold it.
        var itemsCell = Object.keys(byCtl[ref]).sort().map(function (dl) {
          return MD.cell(dl) + ': ' + byCtl[ref][dl].slice().sort().map(MD.code).join(', ');
        }).join(MD.CELL_BREAK);
        var c = controlsById[ref];
        var state = c ? App.store.controlDeviceState(c, deviceBaseId) : '';
        var why = c ? App.store.controlDeviceJustification(c, deviceBaseId) : '';
        // REF-2: the row's OWN control is not linked inside its own row — the row is
        // where the links point, and a link to the line you are reading is noise.
        var others = ((tblOpts && tblOpts.linkTerms) || []).filter(function (t) { return t.anchor !== controlAnchor(ref); });
        var link = function (s) { return MD.autoLink(s, others); };
        var cells = {
          type: MD.cell(ctlType[ref] || ''),
          // An undescribed control is stated as such rather than left blank, on the same
          // rule as the justification: an empty cell reads as an oversight either way,
          // and this way it says which.
          description: ctlDesc[ref] ? link(MD.cell(ctlDesc[ref])) : '*' + MD.text('No description recorded.') + '*',
          status: MD.cell(state ? App.projectIo.controlStateLabel(state) : '—'),
          items: itemsCell,
          // EXC-1: an exception with no justification is the worst of the three to leave
          // blank — the departure is precisely the thing the reader needs explained — so
          // it is called out in the same words a bare Satisfied is.
          justification: why ? link(MD.cell(why)) : (App.projectIo.controlStateDecided(state) ? '*No justification recorded.*' : '')
        };
        return [MD.cell(ctlLabel[ref])].concat(shown.map(function (c) { return cells[c.id]; }));
      });
      if (!rows.length) return MD.text('No decided item on this device references a control.');
      var text = tableWording(block, '_all');
      var headings = headingsFor(['control'].concat(shown.map(function (c) { return c.id; })),
        ['Control'].concat(shown.map(function (c) { return c.label; })), text.columns);
      return MD.table(headings.map(MD.cell),
        rows, App.report.tableOpts(withWording(tblOpts, text, (tblOpts || {}).captionText), {
          // REF-2: this is where every mention of a control in the document points.
          rowAnchors: refOrder.map(function (ref) { return '[]{#' + controlAnchor(ref) + '}'; })
        }));
    }

    /**
     * META-1: every row the Device Config Information block CAN carry, each with a
     * stable id so it can be switched off in the designer and the choice saved.
     *
     * The snapshot hashes are one id per dataset, discovered from the device rather
     * than listed here, so a new dataset gains a row with no core edit (DOD-11).
     *
     * There is no "Generated (UTC)" row: it said the same thing as the AEST row in a
     * timezone nobody here reads, and the exact UTC instant is still in the document's
     * metadata block as `generated-utc` for anything that needs to parse it.
     *
     * @returns {Array<{id:string,label:string,value:string,code?:boolean}>} ALL rows,
     *          unfiltered — deviceMeta() applies the operator's choice.
     */
    function metaFields(project, dc, generatedUtc) {
      var rows = [
        { id: 'platform', label: 'Project platform', value: project.platformProfileId },
        { id: 'device', label: 'Device', value: dc.name, code: false },
        { id: 'model', label: 'Model', value: dc.model, code: false },
        { id: 'firmware', label: 'Firmware', value: dc.firmware },
        { id: 'version', label: 'Version', value: 'v' + dc.version },
        { id: 'generated', label: 'Generated (AEST)', value: App.util.clock.toAest(generatedUtc), code: false },
        { id: 'projectHash', label: 'Project SHA-256', value: sha(App.projectIo.serializeProject(project)) }
      ];
      Object.keys(dc.snapshots).sort().forEach(function (dsId) {
        rows.push({ id: 'snapshot:' + dsId, label: dsId + ' snapshot SHA-256', value: dc.snapshots[dsId].sha256 });
      });
      return rows;
    }

