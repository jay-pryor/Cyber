    var packages = {
      id: 'android.packages',
      label: 'Packages',
      inputKind: 'text',
      // PRO-2: the name this register takes as a single step in the Procedure report.
      // Named on the adapter so the report never has to know what a package is.
      procedureStepLabel: 'Configure Packages',
      procedureStepIntent: 'Apply every package decision for this device — the keep / disable / remove actions recorded in the Packages register.',
      captureHint: 'adb -s <serial> shell pm list packages  >  pm_list.txt',

      /** @param {string} raw @returns {ParseResult} */
      parse: function (raw) {
        var warnings = [], errors = [], seen = {}, keys = [];
        var lines = String(raw).split(/\r?\n/);
        var anyToken = false;
        lines.forEach(function (line, idx) {
          var loc = 'line ' + (idx + 1);
          var s = line.trim();
          if (s === '' || s.charAt(0) === '#') return;       // blank / comment
          if (s.indexOf('package:') === 0) s = s.slice('package:'.length);
          var eq = s.indexOf('=');
          if (eq !== -1) s = s.slice(0, eq);                  // strip =path/installer
          s = s.trim();
          if (s === '') return;
          if (!PKG_TOKEN_RE.test(s)) {
            errors.push({ category: 'parse', severity: 'error', message: 'Not a valid package token: "' + s + '".', location: loc, fix: 'Package names may contain only letters, digits, "." and "_".' });
            return;
          }
          anyToken = true;
          if (seen[s]) { warnings.push({ category: 'parse', severity: 'warning', message: 'Duplicate package "' + s + '" ignored.', location: loc }); return; }
          seen[s] = true; keys.push(s);
        });
        if (!anyToken && errors.length === 0) {
          errors.push({ category: 'parse', severity: 'error', message: 'No packages found (file empty or all blank/comment).', location: 'file', fix: 'Provide one package per line.' });
        }
        keys.sort();
        return { items: keys.map(function (k) { return { key: k }; }), keys: keys, warnings: warnings, errors: errors };
      },

      decisionSchema: [{ name: 'action', kind: 'enum', options: ['keep', 'disable', 'remove'], required: true }],

      /** @param {RegisterItem} item @returns {Issue[]} */
      validateDecision: function (item) {
        var d = item.decision;
        if (d === null) return [];
        if (['keep', 'disable', 'remove'].indexOf(d.action) === -1) {
          return [{ category: 'validation', severity: 'error', message: 'action must be keep, disable, or remove.', location: item.key }];
        }
        return [];
      },
      /** @param {RegisterItem} item @returns {boolean} */
      isComplete: function (item) {
        return item.decision !== null && this.validateDecision(item).every(function (i) { return i.severity !== 'error'; });
      },

      columns: [
        { key: 'key', label: 'Package', get: function (it) { return it.key; } },
        { key: 'description', label: 'Description', get: function (it) { return it.description || ''; } },
        { key: 'decision', label: 'Action', get: function (it) { return it.decision ? it.decision.action : ''; } },
        { key: 'controlRefs', label: 'Control Refs', get: function (it) { return (it.controlRefs || []).join(', '); } }
      ],

      generateImplementation: function (items, ctx) {
        var lines = ['# Packages — implementation (APPLIED/ALREADY/PARTIAL/FAILED/MISSING/REVIEW)',
          '#',
          '# Each line applies one decision. The device state is read back FIRST, so an item',
          '# already in its decided state costs no device command — that, not a placeholder',
          '# guard, is what makes a re-run idempotent.',
          '#   keep     present and enabled is left alone; a disabled package is re-enabled,',
          '#            and one uninstalled for user 0 is restored and then enabled.',
          '#   disable  installed and enabled -> pm disable-user.',
          '#   remove   installed -> pm uninstall for user 0. If the uninstall is REFUSED',
          '#            (protected system package, MDM/Knox policy) the package is disabled',
          '#            instead and recorded PARTIAL — less than the decision, so it still',
          '#            fails the run. One stubborn package never ends the run.',
          '#',
          '# After the run the package state is re-read and every item is graded against its',
          '# decision, so the summary reports what the DEVICE ended up as — not merely whether',
          '# a command returned. Counts, percentages, and every failure, part-applied item,',
          '# missing package and item needing review are printed at the end with a reason.',
          '#',
          '# TO REVERSE THIS SCRIPT: see the REVERSE (ROLLBACK) SWITCHES block near the top —',
          '# uncomment $RestoreRemoved = $true to reinstall everything decided remove (and/or',
          '# $RestoreDisabled = $true to re-enable everything decided disable). The decisions',
          '# are untouched; only this run is retargeted, and it says so throughout.',
          '#',
          '# EXIT CODE: 0 = every decision met; 1 = at least one FAILED or PARTIAL. MISSING and',
          '# REVIEW do not fail the run, but both need a documented cause.',
          ''];
        items.slice().sort(byKey).forEach(function (it) {
          // Package tokens are charset-restricted at parse -> no escaping needed.
          if (!it.decision) return;
          lines.push('Apply-Package ' + psSingleQuote(it.key) + ' ' + psSingleQuote(it.decision.action));
        });
        return [{ name: 'packages.impl.ps1', content: lines.join('\n') }];
      },
      generateVerification: function (items, ctx) {
        var lines = ['# Packages — verification (PASS/FAIL/MISSING)',
          '#',
          '# Each line below reads the package back off the device and compares it to the',
          '# decided action. Verdicts:',
          '#   PASS    the device state matches the decision.',
          '#   FAIL    the device state differs; the reason is printed with the item and',
          '#           repeated in the end-of-run summary.',
          '#   MISSING the package is not part of this firmware build, so there was nothing',
          '#           to keep or disable. Every MISSING needs a documented cause.',
          '#',
          '# A summary at the end gives the count and percentage in each class and lists',
          '# every difference with its reason.',
          '# EXIT CODE: 0 = no FAIL (MISSING does not fail the run); 1 = at least one FAIL.',
          ''];
        items.slice().sort(byKey).forEach(function (it) {
          if (!it.decision) return;
          lines.push('Verify-Package ' + psSingleQuote(it.key) + ' ' + psSingleQuote(it.decision.action));
        });
        return [{ name: 'packages.verify.ps1', content: lines.join('\n') }];
      },
      // Declarative report metadata (spec §20.3): post-key columns (incl. Description,
      // report-gen #1) + a group split by action (GEN-2).
      reportGroups: { field: 'action', options: [{ value: 'remove', label: 'Removed' }, { value: 'disable', label: 'Disabled' }, { value: 'keep', label: 'Kept' }] },
      reportColumns: [
        { id: 'description', label: 'Description', optional: true, w: 3, get: function (it) { return it.description || ''; } },
        { id: 'action', label: 'Action', optional: true, w: 1, get: function (it) { return it.decision ? it.decision.action : ''; } },
        { id: 'control', label: 'Control', optional: true, w: 2, get: function (it, ctx) { return controlTitles(it.controlRefs, ctx); } },
        { id: 'rationale', label: 'Rationale', optional: true, defaultOff: true, w: 3, get: function (it) { return it.rationale || ''; } }
      ],
      // KEY-1: declared, not recovered by rendering the section and reading its first
      // header cell back out of the markdown.
      keyColumn: { id: '_key', label: 'Package', w: 2, get: function (it) { return it.key; } },
      renderReportSection: function (items, ctx, opts) {
        return App.report.buildSection('Packages', this.keyColumn, this.reportColumns, items, opts || {}, ctx, this.reportGroups);
      },
      // ---- bulk assignment (spec §18.2): a CSV of package,action,description ----
      assignmentHint: 'CSV with a header row starting exactly "package,action,description", optionally followed by "rationale" and then "relevance". Column 1 = package name (a leading "package:" is allowed), column 2 = keep|disable|remove, column 3 = description (may be quoted / contain commas), column 4 (optional) = rationale, column 5 (optional) = HIGH|MEDIUM|LOW|REPORT|IRRELEVANT (or blank).',
      /** @param {string} raw @returns {{assignments:Array,warnings:Issue[],errors:Issue[]}} */
      parseAssignment: function (raw) {
        var rows = parseCsv(raw), errors = [], warnings = [], assignments = [], seen = {};
        if (!rows.length) { return { assignments: [], warnings: [], errors: [{ category: 'parse', severity: 'error', message: 'Empty CSV.', location: 'file' }] }; }
        var header = rows[0].map(function (h) { return String(h).trim(); });
        // review-12 #4: 3 required columns + optional "rationale" and "relevance".
        var hdr = checkAssignHeader(header, ['package', 'action', 'description']);
        if (!hdr.ok) {
          return { assignments: [], warnings: [], errors: [{ category: 'parse', severity: 'error', message: 'Header row must be "package,action,description" (optionally followed by "rationale" and "relevance").', location: 'line 1', fix: 'Set the first row to: ' + hdr.expected }] };
        }
        for (var i = 1; i < rows.length; i++) {
          var r = rows[i], loc = 'line ' + (i + 1);
          if (r.length === 1 && String(r[0]).trim() === '') continue; // blank line
          if (r.length < 3) { errors.push({ category: 'parse', severity: 'error', message: 'Expected at least 3 columns.', location: loc }); continue; }
          var pkg = String(r[0]).trim();
          if (pkg.indexOf('package:') === 0) pkg = pkg.slice('package:'.length).trim();
          var action = String(r[1]).trim().toLowerCase(), desc = String(r[2]);
          if (!PKG_TOKEN_RE.test(pkg)) { errors.push({ category: 'parse', severity: 'error', message: 'Invalid package token "' + pkg + '".', location: loc }); continue; }
          if (['keep', 'disable', 'remove'].indexOf(action) === -1) { errors.push({ category: 'parse', severity: 'error', message: 'Invalid action "' + r[1] + '" (keep|disable|remove).', location: loc }); continue; }
          if (seen[pkg]) { errors.push({ category: 'parse', severity: 'error', message: 'Duplicate package "' + pkg + '".', location: loc }); continue; }
          var opt = readOptionalAssignFields(r, 3, hdr.extras);
          if (opt.error) { errors.push({ category: 'parse', severity: 'error', message: opt.error, location: loc }); continue; }
          seen[pkg] = true;
          var fields = { description: desc };
          Object.keys(opt.fields).forEach(function (k) { fields[k] = opt.fields[k]; });
          assignments.push({ key: pkg, decision: { action: action }, fields: fields });
        }
        if (!assignments.length && !errors.length) errors.push({ category: 'parse', severity: 'error', message: 'No package rows found.', location: 'file' });
        return { assignments: assignments, warnings: warnings, errors: errors };
      }
    };

    // ===========================================================================
    // android.tactical
    //
    // Apply model (confirmed with the team, 2026-06): the tactical config is applied
    // by MANUALLY UPLOADING the emitted JSON into Knox tactical — there is NO adb/
    // PowerShell push step. So the implementation output is simply the rebuilt JSON,
    // in the SAME structure/format as the captured input (object shape, nesting,
    // arrays, and JSON types all preserved by rebuildTacticalDoc).
    // ===========================================================================
    var tactical = {
      id: 'android.tactical',
      label: 'Tactical',
      inputKind: 'json',
      procedureStepLabel: 'Configure Tactical Settings',   // PRO-2
      procedureStepIntent: 'Apply the Knox tactical configuration for this device — upload the generated tactical JSON and confirm the settings it carries.',
      captureHint: 'Export the Knox tactical configuration as a JSON document; the tool emits an updated JSON in the same format to re-upload to Knox.',

      /** @param {string} raw @returns {ParseResult} */
      parse: function (raw) {
        var warnings = [], errors = [];
        var doc;
        try { doc = JSON.parse(raw); }
        catch (e) {
          return { items: [], keys: [], warnings: [], errors: [{ category: 'parse', severity: 'error', message: 'Invalid JSON: ' + e.message, location: 'file', fix: 'Provide a valid JSON document.' }] };
        }
        // The tactical document MUST have an object root. A top-level array/scalar
        // would flatten to an un-pathable empty-key leaf and break rebuild (D-002).
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
          return { items: [], keys: [], warnings: [], errors: [{ category: 'parse', severity: 'error', message: 'Tactical root must be a JSON object.', location: 'file', fix: 'Wrap top-level values in an object, e.g. {"config": ...}.' }] };
        }
        if (doc && typeof doc === 'object' && !Array.isArray(doc) && Object.keys(doc).length === 0) {
          warnings.push({ category: 'parse', severity: 'warning', message: 'Tactical document is an empty object.', location: 'file' });
        }
        // review-17 #4: `imsSettings` is OPTIONAL in the uploaded JSON. When it is
        // absent the Samsung default block is added, so the per-SIM IMS toggle is
        // always available to decide (and always present in the emitted JSON).
        if (ensureImsSettings(doc)) {
          warnings.push({
            category: 'parse', severity: 'warning',
            message: 'imsSettings was not in the uploaded document — the default block (both SIM slots, IMS disabled) was added.',
            location: 'file'
          });
        }
        // USB-1: a `usbInterfaces` block is completed to the full class list, so the
        // register never carries a half-answered deny-list.
        var usbAdded = ensureUsbInterfaces(doc);
        if (usbAdded.length) {
          warnings.push({
            category: 'parse', severity: 'warning',
            message: 'usbInterfaces did not list every host interface class — ' + usbAdded.length +
              ' missing class(es) were added as false (' + usbAdded.map(function (k) { return k.split('.').pop(); }).join(', ') + ').',
            location: 'file'
          });
        }
        var leaves = flattenTactical(doc);
        var keys = leaves.map(function (l) { return l.key; }).sort();
        return {
          items: leaves.map(function (l) { return { key: l.key, defaultValue: l.value, valueType: l.type }; }),
          keys: keys, warnings: warnings, errors: errors, template: doc
        };
      },

      decisionSchema: [{ name: 'value', kind: 'value-typed', required: true }],

      validateDecision: function (item) {
        var d = item.decision;
        if (d === null) return [];
        if (!Object.prototype.hasOwnProperty.call(d, 'value')) {
          return [{ category: 'validation', severity: 'error', message: 'value is required.', location: item.key }];
        }
        // FW-1: the firewall leaf holds the whole RULE LIST. Anything else here would be
        // written straight into the emitted Knox document, where a string in place of the
        // rules array is not a small mistake — it is a firewall that does not load.
        if (isFirewallKey(item.key) && !Array.isArray(d.value)) {
          return [{ category: 'validation', severity: 'error', message: 'Firewall rules must be a JSON array of rule objects (use [] for none).', location: item.key,
            fix: 'Paste the rules as a JSON list, e.g. [{"addressType":"IPV4","direction":"ALL", …}].' }];
        }
        return [];
      },
      isComplete: function (item) {
        return item.decision !== null && this.validateDecision(item).every(function (i) { return i.severity !== 'error'; });
      },

      // Strip the internal `policyList.` segment for human-facing key display
      // (review-4 #1). Storage/routing keys are unaffected.
      displayKey: stripPolicyPrefix,

      columns: [
        { key: 'key', label: 'Path', get: function (it) { return stripPolicyPrefix(it.key); } },
        { key: 'description', label: 'Description', get: function (it) { return it.description || ''; } },
        { key: 'decision', label: 'Value', get: function (it) { return it.decision ? stableStringify(it.decision.value) : ''; } },
        { key: 'controlRefs', label: 'Control Refs', get: function (it) { return (it.controlRefs || []).join(', '); } }
      ],

      /** Rebuild the tactical.json artifact from a retained template (spec §5.1). */
      rebuildArtifact: function (template, items) {
        var doc = rebuildTacticalDoc(template, items);
        return { name: 'tactical.json', content: stableStringify(doc) };
      },
      generateImplementation: function (items, ctx) {
        // Implementation = the rebuilt JSON ONLY (manually uploaded to Knox tactical).
        // No push script / TODO — applying is a single manual Knox upload step.
        var template = ctx && ctx.device && ctx.device.snapshots && ctx.device.snapshots['android.tactical']
          ? ctx.device.snapshots['android.tactical'].template : {};
        return [this.rebuildArtifact(template || {}, items)];
      },
      generateVerification: function (items, ctx) {
        // Tactical is verified by inspecting Knox after upload — there is no adb
        // read-back. Emit a NON-script evidence note (so it is not adb-wrapped),
        // marking each decided item EVIDENCED (spec §10.2 EVIDENCED semantics).
        var lines = ['Tactical — verification (EVIDENCED)',
          'Applied by manual upload of tactical.json to Knox tactical; confirm in the Knox console.', ''];
        items.slice().sort(byKey).forEach(function (it) {
          if (!it.decision) return;
          // Show the human-facing policy name (review-4 #1), consistent with the report.
          lines.push('EVIDENCED ' + stripPolicyPrefix(it.key) + ' = ' + stableStringify(it.decision.value));
        });
        return [{ name: 'tactical.verify.txt', content: lines.join('\n') }];
      },

      /**
       * Bring a snapshot captured BEFORE `imsSettings` was modelled up to the guarantee
       * the parser now makes (review-17 #4): the block is part of every tactical
       * snapshot. Without this, a device onboarded earlier has no imsSettings keys, so
       * a tactical import on the Devices tab is rejected — the file (which the parser
       * completes) carries two keys the device does not list as applicable.
       * Called by the project loader; safe and idempotent on an already-complete snapshot.
       * @param {Snapshot} snap  mutated in place
       * @returns {string[]} the keys that were added (empty when there was nothing to do)
       */
      completeSnapshot: function (snap) {
        if (!snap || snap.template === undefined || snap.template === null) return { added: [], removed: [] };
        if (!Array.isArray(snap.keys)) return { added: [], removed: [] };
        ensureImsSettings(snap.template);
        ensureUsbInterfaces(snap.template);
        // FW-1: the rule now is simply "the stored key list is what the parser produces
        // from the retained template". That covers all three cases at once — imsSettings
        // and usbInterfaces keys the capture predates are ADDED, and the positional
        // `firewallRules[0].addressType` keys an older flatten produced are REMOVED,
        // because the same template now yields one `firewallRules` leaf instead.
        var want = {}, wantList = [];
        flattenTactical(snap.template).forEach(function (l) { want[l.key] = true; wantList.push(l.key); });
        var have = {}; snap.keys.forEach(function (k) { have[k] = true; });
        var added = wantList.filter(function (k) { return !have[k]; });
        var removed = snap.keys.filter(function (k) { return !want[k]; });
        if (added.length || removed.length) {
          snap.keys = wantList.slice().sort();
        }
        return { added: added, removed: removed };
      },

      // Single-table dataset; Path key strips the policyList prefix (RV4-1); Description kept.
      reportColumns: [
        { id: 'description', label: 'Description', optional: true, w: 3, get: function (it) { return it.description || ''; } },
        // HUM-1: the REPORT is read by a person, so the value is printed as a reading
        // rather than as JSON — a firewall rule list arrives as numbered rules, a
        // whitelist as one entry per line. The canonical form still goes to
        // `tactical.json` and to the verification script, which are read by machines.
        { id: 'value', label: 'Value', optional: true, w: 2, get: function (it) { return it.decision ? App.md.human(it.decision.value) : ''; } },
        { id: 'control', label: 'Control', optional: true, w: 2, get: function (it, ctx) { return controlTitles(it.controlRefs, ctx); } },
        { id: 'rationale', label: 'Rationale', optional: true, defaultOff: true, w: 2, get: function (it) { return it.rationale || ''; } }
      ],
      // KEY-1: the policy prefix is stripped for display, which is the getter's job.
      keyColumn: { id: '_key', label: 'Path', w: 2, get: function (it) { return stripPolicyPrefix(it.key); } },
      renderReportSection: function (items, ctx, opts) {
        return App.report.buildSection('Tactical', this.keyColumn, this.reportColumns, items, opts || {}, ctx, null);
      },
      /** Captured value/type per leaf path, to prefill the decision editor (UI only). */
      capturedDefaults: function (snap) {
        var out = {};
        if (snap && snap.template !== undefined) flattenTactical(snap.template).forEach(function (l) { out[l.key] = { value: l.value, type: l.type }; });
        return out;
      },
      // ---- bulk assignment (spec §18.2): reuse the JSON parser; value/type per leaf ----
      assignmentHint: 'Tactical/Knox JSON document (same object format as captured). Each leaf value/type is applied.',
      parseAssignment: function (raw) {
        var pr = this.parse(raw);
        if (pr.errors.length) return { assignments: [], warnings: pr.warnings, errors: pr.errors };
        return { assignments: pr.items.map(function (it) { return { key: it.key, decision: { value: it.defaultValue } }; }), warnings: pr.warnings, errors: pr.errors };
      }
    };

