    /**
     * Produce the canonical, deterministic project string (spec §8.6).
     * @param {Project} project
     * @returns {string}
     */
    function serializeProject(project) {
      var p = clone(project);

      // Canonical item ordering: sort items arrays by key; sort controlRefs.
      if (isPlainObject(p.items)) {
        Object.keys(p.items).forEach(function (dsId) {
          if (Array.isArray(p.items[dsId])) {
            p.items[dsId].forEach(function (it) { if (Array.isArray(it.controlRefs)) it.controlRefs.sort(); });
            p.items[dsId].sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
          }
        });
      }
      // Canonical device ordering: by baseId then version.
      if (Array.isArray(p.deviceConfigs)) {
        p.deviceConfigs.sort(function (a, b) {
          if (a.baseId !== b.baseId) return a.baseId < b.baseId ? -1 : 1;
          return a.version - b.version;
        });
        // Ensure snapshot keys sorted.
        p.deviceConfigs.forEach(function (dc) {
          if (dc.snapshots) Object.keys(dc.snapshots).forEach(function (dsId) {
            if (Array.isArray(dc.snapshots[dsId].keys)) dc.snapshots[dsId].keys.sort();
          });
          // DEV-1: manual device assignments are a SET, so they sort; and empty is absent,
          // so ticking a box and unticking it leaves no fingerprint in the file (DOD-7).
          if (isPlainObject(dc.scope)) {
            Object.keys(dc.scope).forEach(function (dsId) {
              var sc = dc.scope[dsId];
              if (!isPlainObject(sc)) { delete dc.scope[dsId]; return; }
              ['add', 'remove'].forEach(function (f) {
                if (Array.isArray(sc[f]) && sc[f].length) sc[f] = sc[f].slice().sort();
                else delete sc[f];
              });
              if (!sc.add && !sc.remove) delete dc.scope[dsId];
            });
            if (!Object.keys(dc.scope).length) delete dc.scope;
          }
        });
      }
      // Canonical control ordering: by id; sort assignedDeviceIds.
      if (Array.isArray(p.controls)) {
        p.controls.forEach(function (c) {
          if (Array.isArray(c.assignedDeviceIds)) c.assignedDeviceIds.sort();
          if (Array.isArray(c.tags)) c.tags.sort();                                  // TAG-1
        });
        p.controls.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      }
      // NOTE-1 / PRO-2: empty is absent. A blanked note and a device that never had one
      // must serialise identically, or "delete everything you wrote" would leave a
      // fingerprint in the file and break the byte-stability DOD-7 promises.
      if (isPlainObject(p.deviceNotes)) {
        Object.keys(p.deviceNotes).forEach(function (b) { if (!String(p.deviceNotes[b] || '').trim()) delete p.deviceNotes[b]; });
        if (!Object.keys(p.deviceNotes).length) delete p.deviceNotes;
      }
      if (isPlainObject(p.procedure)) {
        // Step ORDER is meaningful, so it is never sorted — only emptiness is normalised.
        if (Array.isArray(p.procedure.order) && !p.procedure.order.length) delete p.procedure.order;
        if (isPlainObject(p.procedure.notes)) {
          Object.keys(p.procedure.notes).forEach(function (k) { if (!String(p.procedure.notes[k] || '').trim()) delete p.procedure.notes[k]; });
          if (!Object.keys(p.procedure.notes).length) delete p.procedure.notes;
        }
        if (!Object.keys(p.procedure).length) delete p.procedure;
      }
      // RPT-3: same rule for the report section order — meaningful, so never sorted; only
      // emptiness is normalised, so "never reordered" and "reordered back" are one file.
      if (isPlainObject(p.report)) {
        if (Array.isArray(p.report.order) && !p.report.order.length) delete p.report.order;
        if (isPlainObject(p.report.levels) && !Object.keys(p.report.levels).length) delete p.report.levels;
        // NAM-1 / SEC-1: a blank name or introduction is the ABSENT state, so naming a
        // section and clearing the name again leaves no fingerprint in the file (DOD-7).
        ['names', 'headings', 'intros'].forEach(function (k) {
          if (!isPlainObject(p.report[k])) return;
          Object.keys(p.report[k]).forEach(function (id) { if (!String(p.report[k][id] || '').trim()) delete p.report[k][id]; });
        });
        // TBS-1: same rule — an entry with nothing switched on says nothing.
        if (isPlainObject(p.report.tableStyles)) {
          Object.keys(p.report.tableStyles).forEach(function (id) {
            var v = p.report.tableStyles[id];
            if (!isPlainObject(v)) { delete p.report.tableStyles[id]; return; }
            if (v.head !== true) delete v.head;
            if (v.firstColumn !== true) delete v.firstColumn;
            if (!Object.keys(v).length) delete p.report.tableStyles[id];
          });
        }
        // TW-2: the same rounding as a table part's widths, and for the same reason —
        // two operators dragging a column to the same place must write the same bytes.
        if (isPlainObject(p.report.tableWidths)) {
          Object.keys(p.report.tableWidths).forEach(function (id) {
            var ws = p.report.tableWidths[id];
            if (!Array.isArray(ws) || !ws.length) { delete p.report.tableWidths[id]; return; }
            p.report.tableWidths[id] = ws.map(function (w) { return Math.round(Number(w) * 10000) / 10000; });
          });
        }
        // TBL-1: a per-table entry that has been emptied is dropped at every level, so a
        // title row typed and then cleared leaves no fingerprint in the file.
        if (isPlainObject(p.report.tables)) {
          Object.keys(p.report.tables).forEach(function (id) {
            var byBlock = p.report.tables[id];
            if (!isPlainObject(byBlock)) { delete p.report.tables[id]; return; }
            Object.keys(byBlock).forEach(function (k) {
              var e = byBlock[k];
              if (!isPlainObject(e)) { delete byBlock[k]; return; }
              if (isPlainObject(e.columns) && !Object.keys(e.columns).length) delete e.columns;
              ['title', 'caption'].forEach(function (f) {
                if (typeof e[f] === 'string' && !e[f].trim()) delete e[f];
              });
              // CAP-4: captioned is the default, so only "no caption" is ever stored.
              if (e.noCaption !== true) delete e.noCaption;
              if (!Object.keys(e).length) delete byBlock[k];
            });
            if (!Object.keys(byBlock).length) delete p.report.tables[id];
          });
        }
        // OPT-2: the include-maps prune at every level, so a column switched on and off
        // again is a project that says nothing about that column.
        if (isPlainObject(p.report.options)) {
          Object.keys(p.report.options).forEach(function (m) {
            var map = p.report.options[m];
            if (!isPlainObject(map)) { delete p.report.options[m]; return; }
            Object.keys(map).forEach(function (k) {
              if (isPlainObject(map[k]) && !Object.keys(map[k]).length) delete map[k];
            });
            if (!Object.keys(map).length) delete p.report.options[m];
          });
        }
        // SPC-1: a section's space above prunes at zero, like every other "off" here.
        if (isPlainObject(p.report.space)) {
          Object.keys(p.report.space).forEach(function (k) {
            var n = Number(p.report.space[k]);
            if (!isFinite(n) || n <= 0) delete p.report.space[k];
            else p.report.space[k] = Math.round(Math.min(n, 500) * 100) / 100;
          });
        }
        ['centred', 'meta', 'names', 'headings', 'intros', 'introNumbered', 'tableStyles', 'tableWidths',
          'tables', 'pageBreak', 'noToc', 'options', 'space'].forEach(function (k) {
          if (isPlainObject(p.report[k]) && !Object.keys(p.report[k]).length) delete p.report[k];
        });
        // v2.2: `sections` is the DOCUMENT ORDER of the hand-authored sections and each
        // section's `parts` are the order they are read in, so neither is ever sorted —
        // sorting them would silently rewrite the author's document. Emptiness is still
        // normalised, so adding a section and deleting it leaves no fingerprint (DOD-7).
        if (Array.isArray(p.report.sections)) {
          p.report.sections.forEach(function (s) {
            (s.parts || []).forEach(canonicalPart);
            if (Array.isArray(s.parts) && !s.parts.length) delete s.parts;
            if (typeof s.title === 'string' && !s.title.length) delete s.title;
          });
          if (!p.report.sections.length) delete p.report.sections;
        }
        // A section template carries parts too, and it must serialise by the same rules
        // or a table saved as a template and one used from it would differ in the file.
        (p.report.sectionTemplates || []).forEach(function (t) { (t.parts || []).forEach(canonicalPart); });
        (p.report.reportTemplates || []).forEach(function (t) {
          (t.sections || []).forEach(function (s) { (s.parts || []).forEach(canonicalPart); });
        });
        // The three CATALOGUES are sets, not sequences — nothing reads their order — so
        // they sort by id for a canonical form, exactly as controls and valueFormats do.
        ['formats', 'sectionTemplates', 'reportTemplates'].forEach(function (k) {
          if (!Array.isArray(p.report[k])) return;
          if (!p.report[k].length) { delete p.report[k]; return; }
          p.report[k].sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
        });
        // Pointing at the built-in is the DEFAULT, so it is stored as absence — a
        // project that never chose a profile and one switched back to Standard are
        // the same document and must serialise to the same bytes.
        if (p.report.formatId === 'standard' || p.report.formatId === '') delete p.report.formatId;
        if (!Object.keys(p.report).length) delete p.report;
      }
      if (Array.isArray(p.controlTypes)) p.controlTypes.sort();
      if (Array.isArray(p.controlTags)) p.controlTags.sort();                       // TAG-1
      // Canonical value-format ordering (VF-3): by id. Option ORDER is meaningful (it is
      // the order of the picker), so options are never sorted.
      if (Array.isArray(p.valueFormats)) p.valueFormats.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      // Canonical groups (spec §19.7): drop empty overrides, sort deviceBaseIds, sort by id.
      if (Array.isArray(p.deviceConfigs)) p.deviceConfigs.forEach(dropEmptyOverrides);
      if (Array.isArray(p.groups)) {
        p.groups.forEach(function (g) {
          if (Array.isArray(g.deviceBaseIds)) g.deviceBaseIds.sort();
          dropEmptyOverrides(g);
        });
        p.groups.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
      }
      // stableStringify sorts all object keys.
      return App.util.stable.stableStringify(p);
    }

    App.projectIo = {
      parseProject: parseProject, serializeProject: serializeProject,
      migrate: migrate, validateSchema: validateSchema, SCHEMA_VERSION: SCHEMA_VERSION,
      // v2.0: datasets removed from the product; stripped on load with a warning.
      RETIRED_DATASETS: RETIRED_DATASETS, dropRetiredDatasets: dropRetiredDatasets,
      // v2.1 (VF-3): value-format vocabularies, shared with App.valueFormats.
      BUILTIN_FORMAT_IDS: BUILTIN_FORMAT_IDS, CUSTOM_FORMAT_KINDS: CUSTOM_FORMAT_KINDS,
      // review-12: shared vocabularies (UI pickers, CSV import, store validation).
      RELEVANCE_OPTIONS: RELEVANCE_OPTIONS, CONTROL_STATES: CONTROL_STATES,
      RELEVANCE_PARKED: RELEVANCE_PARKED,
      // EXC-1: the tri-state vocabulary, shared by the store, the report and both views.
      CONTROL_STATE_LABELS: CONTROL_STATE_LABELS, controlStateLabel: controlStateLabel,
      controlStateDecided: controlStateDecided, nextControlState: nextControlState,
      // REL-1: retired relevance names -> current ones (load-time translation + CSV import).
      RELEVANCE_RENAMES: RELEVANCE_RENAMES, renameLegacyRelevance: renameLegacyRelevance
    };
  })(App);
