    // ===========================================================================
    // android.custom — Custom Security Actions (CUS-1)
    //
    // The hardening a fleet needs is not exhausted by "remove this package" and "set
    // this Knox key". Setting a Knox tactical passcode, sealing a SIM tray, a documented
    // physical or procedural step — these are real, auditable security actions with a
    // control behind them, and before this tab they had nowhere to live: they were not
    // in a capture, so they could not be a Packages or Tactical row, and anything not in
    // the register is absent from the report.
    //
    // So this dataset is VIRTUAL (registry CUS-1): there is no capture file, no
    // Snapshot, and nothing to diff. Its items are AUTHORED in the tool — you name the
    // action, describe it, and write what to do in a free-text box that is deliberately
    // not a vocabulary, because the whole point is the things nobody could enumerate in
    // advance. Everything else an action carries — Control Refs, Applies to, Status,
    // Security Relevance, Diverges from Guidelines, Rationale, Rollback — is the same
    // machinery every other dataset uses, so a custom action is a first-class register
    // entry in the tables, the reports and the manifest rather than a note on the side.
    //
    // Apply model: manual. The emitted artifact is a RUNBOOK, not a script — the tool
    // cannot know how to perform an action it did not define, and pretending otherwise
    // would be worse than saying so plainly.
    // ===========================================================================
    var custom = {
      id: 'android.custom',
      // One label everywhere — the tab, the Generate section tick, the report heading
      // and the readiness message all read it, and a tick called "Custom Actions"
      // producing a heading called "Custom Security Actions" is a mismatch you notice
      // exactly when you are trying to decide whether to include the section.
      label: 'Custom Security Actions',
      inputKind: 'none',
      // CUS-1: authored, not captured — no Onboard slot, applicable to every device.
      virtual: true,
      // CUS-2: rows are created by the operator, so the tables render an "add" bar.
      userCreatable: true,
      // PRO-1: this dataset's items carry a PROCEDURE — the steps a person follows to
      // carry the action out. Declared here rather than assumed by the tables, because
      // it is only meaningful for work done by hand (see renderDetailRow).
      hasProcedure: true,
      // PRO-2: each action is its own step in the Procedure report; the two captured
      // registers are one step each (see the platform profile's procedureStepLabel).
      procedureStepPerItem: true,
      newItemNoun: 'custom action',
      newItemHint: 'A short, unique name — e.g. "Knox tactical passcode". It identifies the action everywhere, and can be renamed later from the row’s ▸ panel.',
      captureHint: 'Nothing to capture — custom actions are written here by hand and apply to every device in the project.',

      /**
       * A virtual dataset is never parsed from a file; this exists so the generic
       * machinery (which may call parse defensively) has something total to call.
       * @returns {ParseResult}
       */
      parse: function () {
        return { items: [], keys: [], warnings: [], errors: [] };
      },

      // Free text on purpose (CUS-1): the action is prose describing what to do.
      decisionSchema: [{ name: 'action', kind: 'string', required: true }],
      // VF-4 opt-out. Value formats exist to pin down a CAPTURED key whose shape is
      // knowable — this Knox leaf is a boolean, that one is a list. A custom action is
      // the opposite case by construction: it is here because nobody could enumerate it
      // in advance, so offering to constrain it to "Boolean" or "Number" would only
      // invite someone to break the one box that has to stay open-ended.
      noValueFormats: true,

      /** @param {RegisterItem} item @returns {Issue[]} */
      validateDecision: function (item) {
        var d = item.decision;
        if (d === null) return [];
        if (!Object.prototype.hasOwnProperty.call(d, 'action') || typeof d.action !== 'string') {
          return [{ category: 'validation', severity: 'error', message: 'action must be text.', location: item.key }];
        }
        // An action with nothing written in it is not a decision — unlike a Tactical
        // leaf, where blank is a real value to push, there is no "do blank" step to
        // carry into a runbook. The row stays undecided until something is written.
        if (!d.action.trim()) {
          return [{ category: 'validation', severity: 'error', message: 'Describe the action to perform (the box is empty).', location: item.key, fix: 'Write what has to be done, or use "clear" to return the row to undecided.' }];
        }
        return [];
      },
      /** @param {RegisterItem} item @returns {boolean} */
      isComplete: function (item) {
        return item.decision !== null && this.validateDecision(item).every(function (i) { return i.severity !== 'error'; });
      },

      columns: [
        { key: 'key', label: 'Action Name', get: function (it) { return it.key; } },
        { key: 'description', label: 'Description', get: function (it) { return it.description || ''; } },
        { key: 'decision', label: 'Action', get: function (it) { return it.decision ? String(it.decision.action) : ''; } },
        { key: 'controlRefs', label: 'Control Refs', get: function (it) { return (it.controlRefs || []).join(', '); } }
      ],

      /**
       * The implementation artifact is a human runbook (spec §10.2 EVIDENCED semantics),
       * NOT a .ps1 — it must not be wrapped in the ADB preamble, because none of it runs
       * through adb. Rollback is carried alongside each step: the moment to know how to
       * undo a manual change is while you are making it.
       */
      generateImplementation: function (items, ctx) {
        var decided = items.filter(function (it) { return it.decision; });
        // Nothing decided ⇒ NO file. Packages and Tactical always emit theirs because a
        // device always has packages and a tactical document; a project with no custom
        // actions has nothing manual to do, and an empty runbook in the ZIP would read
        // as a step someone forgot to write rather than a step that does not exist.
        if (!decided.length) return [];
        var lines = ['Custom Security Actions — implementation (MANUAL)',
          'Each action below is performed by hand and confirmed on the device; there is no script step.', ''];
        decided.slice().sort(byKey).forEach(function (it) {
          lines.push('---');
          lines.push('ACTION: ' + it.key);
          if (it.description) lines.push('  Description: ' + it.description);
          lines.push('  Perform: ' + String(it.decision.action));
          // PRO-1: the written steps, one per line, indented under a Procedure heading.
          // This is a runbook — the procedure is the part someone actually follows.
          if (it.procedure) {
            lines.push('  Procedure:');
            String(it.procedure).split('\n').forEach(function (l) { lines.push('    ' + l); });
          }
          if (it.rationale) lines.push('  Rationale: ' + it.rationale);
          if (it.rollback) lines.push('  Rollback:  ' + it.rollback);
          if (it.controlRefs && it.controlRefs.length) lines.push('  Controls:  ' + controlTitles(it.controlRefs, ctx));
          if (it.diverges) lines.push('  Diverges from guidelines: ' + (it.divergenceNarrative || 'flagged, no narrative recorded'));
          lines.push('');
        });
        return [{ name: 'custom-actions.txt', content: lines.join('\n') }];
      },
      generateVerification: function (items, ctx) {
        // Verified by inspection, exactly like Tactical: a non-script evidence note, so
        // the generator does not wrap it in PowerShell it could never execute.
        var decided = items.filter(function (it) { return it.decision; });
        if (!decided.length) return [];   // nothing to evidence ⇒ no file (see above)
        var lines = ['Custom Security Actions — verification (EVIDENCED)',
          'Confirm each action on the device and record the evidence; there is no adb read-back.', ''];
        decided.slice().sort(byKey).forEach(function (it) {
          lines.push('EVIDENCED ' + it.key + ' = ' + String(it.decision.action));
        });
        return [{ name: 'custom-actions.verify.txt', content: lines.join('\n') }];
      },

      // Single-table report section. Rollback is offered here (and nowhere else) because
      // a manual action is the one kind whose undo nobody can reconstruct from the tool.
      reportColumns: [
        { id: 'description', label: 'Description', optional: true, w: 3, get: function (it) { return it.description || ''; } },
        { id: 'action', label: 'Action', optional: true, w: 3, get: function (it) { return it.decision ? String(it.decision.action) : ''; } },
        { id: 'procedure', label: 'Procedure', optional: true, w: 3, get: function (it) { return it.procedure || ''; } },   // PRO-1
        { id: 'control', label: 'Control', optional: true, w: 2, get: function (it, ctx) { return controlTitles(it.controlRefs, ctx); } },
        { id: 'rationale', label: 'Rationale', optional: true, defaultOff: true, w: 2, get: function (it) { return it.rationale || ''; } },
        { id: 'rollback', label: 'Rollback', optional: true, defaultOff: true, w: 2, get: function (it) { return it.rollback || ''; } }
      ],
      renderReportSection: function (items, ctx, opts) {
        return App.report.buildSection(this.label, { label: 'Action Name', w: 2, get: function (it) { return it.key; } },
          this.reportColumns, items, opts || {}, ctx, null);
      }
      // No parseAssignment: there is no capture format to bulk-import from, and the
      // Devices tab discovers that by the absence of the hook (spec §18.2).
    };

    function byKey(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }

    var parseCsv = App.util.csv.parseCsv; // shared RFC-4180 parser

    App.adapters = App.adapters || {};
    App.adapters.android = {
      packages: packages, tactical: tactical, custom: custom,
      psSingleQuote: psSingleQuote, shSingleQuote: shSingleQuote,
      parsePath: parsePath, setAtPath: setAtPath, flattenTactical: flattenTactical,
      rebuildTacticalDoc: rebuildTacticalDoc, stripPolicyPrefix: stripPolicyPrefix,
      ensureImsSettings: ensureImsSettings, imsDefaultBlock: imsDefaultBlock
    };
  })(App);
