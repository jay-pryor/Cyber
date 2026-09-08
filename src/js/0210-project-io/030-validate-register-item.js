    function validateRegisterItem(it, loc, issues) {
      if (!isPlainObject(it)) { issues.push(issue('error', 'RegisterItem must be an object.', loc)); return; }
      if (typeof it.key !== 'string' || !it.key) issues.push(issue('error', 'RegisterItem.key must be a non-empty string.', loc + '.key'));
      if (!(it.decision === null || isPlainObject(it.decision))) issues.push(issue('error', 'RegisterItem.decision must be an object or null.', loc + '.decision'));
      if (!isStringArray(it.controlRefs)) issues.push(issue('error', 'RegisterItem.controlRefs must be an array of strings.', loc + '.controlRefs'));
      if (it.status !== 'undecided' && it.status !== 'decided') issues.push(issue('error', 'RegisterItem.status must be "undecided" or "decided".', loc + '.status'));
      // DIV-2: divergenceNarrative is an ordinary optional prose field, like the others.
      // PRO-1: so is `procedure` — the steps for carrying a manual action out. Only the
      // datasets that ask for it (adapter.hasProcedure) show a box, but the field itself
      // is generic, exactly as `rollback` is.
      ['description', 'rationale', 'rollback', 'divergenceNarrative', 'procedure'].forEach(function (f) {
        if (it[f] !== undefined && typeof it[f] !== 'string') issues.push(issue('error', 'RegisterItem.' + f + ' must be a string when present.', loc + '.' + f));
      });
      // DIV-1: optional "diverges from guidelines" flag. Only ever `true` when present —
      // absent means it does not diverge, so the canonical form has no `false` (as HELD-1).
      if (it.diverges !== undefined && it.diverges !== true) {
        issues.push(issue('error', 'RegisterItem.diverges must be true when present (omit it otherwise).', loc + '.diverges'));
      }
      // review-12 #3: optional Security Relevance — '' (unset) or one of the three options.
      if (it.relevance !== undefined) {
        if (typeof it.relevance !== 'string') issues.push(issue('error', 'RegisterItem.relevance must be a string when present.', loc + '.relevance'));
        else if (RELEVANCE_VALUES.indexOf(it.relevance) === -1) issues.push(issue('error', 'RegisterItem.relevance must be empty or one of ' + RELEVANCE_OPTIONS.join('/') + '.', loc + '.relevance'));
      }
      // HELD-1: optional "flagged for review" marker. Only ever `true` when present —
      // absent means not held, so the canonical form has no `false`.
      if (it.held !== undefined && it.held !== true) {
        issues.push(issue('error', 'RegisterItem.held must be true when present (omit it otherwise).', loc + '.held'));
      }
      // VF-3: optional value-format reference — a built-in id or a project format id.
      // Deliberately NOT checked for existence here: a dangling ref degrades to the
      // inferred built-in at render time (App.valueFormats.resolve) rather than
      // refusing to open the project. Only the type is structural.
      if (it.format !== undefined && typeof it.format !== 'string') {
        issues.push(issue('error', 'RegisterItem.format must be a string when present.', loc + '.format'));
      }
    }

    function validateSnapshot(sn, loc, issues) {
      if (!isPlainObject(sn)) { issues.push(issue('error', 'Snapshot must be an object.', loc)); return; }
      if (!ISO_RE.test(sn.capturedUtc || '')) issues.push(issue('error', 'Snapshot.capturedUtc must be a UTC ISO date-time.', loc + '.capturedUtc'));
      if (typeof sn.sourceFilename !== 'string') issues.push(issue('error', 'Snapshot.sourceFilename must be a string.', loc + '.sourceFilename'));
      if (!SHA_RE.test(sn.sha256 || '')) issues.push(issue('error', 'Snapshot.sha256 must be 64 hex chars.', loc + '.sha256'));
      if (!isStringArray(sn.keys)) {
        issues.push(issue('error', 'Snapshot.keys must be an array of strings.', loc + '.keys'));
      } else {
        var sorted = sn.keys.slice().sort();
        for (var i = 0; i < sn.keys.length; i++) {
          if (sn.keys[i] !== sorted[i]) { issues.push(issue('error', 'Snapshot.keys must be sorted ascending.', loc + '.keys')); break; }
        }
        var uniq = {};
        sn.keys.forEach(function (k) {
          if (uniq[k]) issues.push(issue('error', 'Snapshot.keys contains duplicate "' + k + '".', loc + '.keys'));
          uniq[k] = true;
        });
      }
      if (sn.values !== undefined && !isPlainObject(sn.values)) issues.push(issue('error', 'Snapshot.values must be an object when present.', loc + '.values'));
    }

    function validateDeviceConfig(dc, loc, validDs, issues) {
      if (!isPlainObject(dc)) { issues.push(issue('error', 'DeviceConfig must be an object.', loc)); return; }
      if (typeof dc.id !== 'string' || !SLUG_RE.test(dc.id)) issues.push(issue('error', 'DeviceConfig.id must be a slug.', loc + '.id'));
      if (typeof dc.baseId !== 'string' || !SLUG_RE.test(dc.baseId)) issues.push(issue('error', 'DeviceConfig.baseId must be a slug.', loc + '.baseId'));
      if (!(typeof dc.version === 'number' && dc.version >= 1 && dc.version % 1 === 0)) issues.push(issue('error', 'DeviceConfig.version must be an integer >= 1.', loc + '.version'));
      if (!(dc.supersedesId === null || (typeof dc.supersedesId === 'string' && SLUG_RE.test(dc.supersedesId)))) issues.push(issue('error', 'DeviceConfig.supersedesId must be a slug or null.', loc + '.supersedesId'));
      ['name', 'model', 'firmware'].forEach(function (f) {
        if (typeof dc[f] !== 'string') issues.push(issue('error', 'DeviceConfig.' + f + ' must be a string.', loc + '.' + f));
      });
      if (typeof dc.name === 'string' && !dc.name.trim()) issues.push(issue('error', 'DeviceConfig.name must not be blank.', loc + '.name'));
      if (!ISO_RE.test(dc.onboardedUtc || '')) issues.push(issue('error', 'DeviceConfig.onboardedUtc must be a UTC ISO date-time.', loc + '.onboardedUtc'));
      if (!isPlainObject(dc.snapshots)) {
        issues.push(issue('error', 'DeviceConfig.snapshots must be an object keyed by dataset id.', loc + '.snapshots'));
      } else {
        Object.keys(dc.snapshots).forEach(function (dsId) {
          if (validDs && validDs.indexOf(dsId) === -1) issues.push(issue('error', 'Snapshot key "' + dsId + '" is not a dataset of the active platform.', loc + '.snapshots.' + dsId));
          validateSnapshot(dc.snapshots[dsId], loc + '.snapshots.' + dsId, issues);
        });
      }
      // overrides (spec §19.2.1): structural only; applicability/validity self-heal on load.
      if (dc.overrides !== undefined && !isPlainObject(dc.overrides)) issues.push(issue('error', 'DeviceConfig.overrides must be an object.', loc + '.overrides'));
      // DEV-1: `scope` — the by-hand adjustments to what this device's capture makes
      // applicable, keyed by dataset. Structural only, exactly like `overrides`: an entry
      // naming a key that has since left the register is pruned on load rather than
      // refused, because a stale adjustment is not a corrupt file.
      if (dc.scope !== undefined) {
        if (!isPlainObject(dc.scope)) {
          issues.push(issue('error', 'DeviceConfig.scope must be an object keyed by dataset id.', loc + '.scope'));
        } else {
          Object.keys(dc.scope).forEach(function (dsId) {
            var sc = dc.scope[dsId], sloc = loc + '.scope.' + dsId;
            if (validDs && validDs.indexOf(dsId) === -1) issues.push(issue('error', 'Scope key "' + dsId + '" is not a dataset of the active platform.', sloc));
            if (!isPlainObject(sc)) { issues.push(issue('error', 'DeviceConfig.scope entry must be an object.', sloc)); return; }
            ['add', 'remove'].forEach(function (f) {
              if (sc[f] !== undefined && !isStringArray(sc[f])) issues.push(issue('error', 'DeviceConfig.scope.' + f + ' must be an array of strings.', sloc + '.' + f));
            });
          });
        }
      }
    }

    /**
     * Validate per-baseId version integrity (Appendix A): contiguous 1..n chain;
     * each non-v1 supersedesId references the immediately-prior version's id;
     * exactly one latest (unreferenced) config per baseId.
     */
    function validateVersionIntegrity(configs, issues) {
      var byBase = {};
      configs.forEach(function (dc) {
        if (!dc || typeof dc.baseId !== 'string') return;
        (byBase[dc.baseId] = byBase[dc.baseId] || []).push(dc);
      });
      Object.keys(byBase).forEach(function (baseId) {
        var group = byBase[baseId].slice().sort(function (a, b) { return a.version - b.version; });
        // contiguous 1..n
        for (var i = 0; i < group.length; i++) {
          if (group[i].version !== i + 1) {
            issues.push(issue('error', 'baseId "' + baseId + '" versions are not a contiguous 1..n chain.', 'deviceConfigs'));
            break;
          }
        }
        // supersedes chain
        var idByVersion = {};
        group.forEach(function (dc) { idByVersion[dc.version] = dc.id; });
        group.forEach(function (dc) {
          if (dc.version === 1) {
            if (dc.supersedesId !== null) issues.push(issue('error', 'v1 config "' + dc.id + '" must have supersedesId null.', 'deviceConfigs'));
          } else if (dc.supersedesId !== idByVersion[dc.version - 1]) {
            issues.push(issue('error', 'Config "' + dc.id + '" supersedesId must reference the prior version id.', 'deviceConfigs'));
          }
        });
        // exactly one latest (unreferenced by any supersedesId)
        var referenced = {};
        group.forEach(function (dc) { if (dc.supersedesId) referenced[dc.supersedesId] = true; });
        var latest = group.filter(function (dc) { return !referenced[dc.id]; });
        if (latest.length !== 1) issues.push(issue('error', 'baseId "' + baseId + '" must have exactly one latest version (found ' + latest.length + ').', 'deviceConfigs'));
      });
    }

    function slugifyControl(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

    /**
     * Migrate a v1 project to v2 (spec §18.3 CTL-3): create `controls`, convert each
     * item's legacy free-text `ismRefs` into find-or-created controls (type inferred),
     * and replace with `controlRefs` of those control ids. Lossless.
     * @param {Project} v1
     * @returns {Project} v2
     */
    function migrateV1toV2(v1) {
      var out = JSON.parse(JSON.stringify(v1));
      out.schemaVersion = 2;
      if (!Array.isArray(out.controls)) out.controls = [];
      var byTitle = {}, usedIds = {};
      out.controls.forEach(function (c) { byTitle[c.title] = c; usedIds[c.id] = true; });
      function ensureControl(title) {
        if (byTitle[title]) return byTitle[title].id;
        var type = /^ISM/i.test(title) ? 'ISM' : (/^AHG/i.test(title) ? 'AHG' : 'Custom');
        var base = slugifyControl(title) || ('control-' + (out.controls.length + 1)), id = base, n = 2;
        while (usedIds[id]) { id = base + '-' + n; n++; }
        usedIds[id] = true;
        var c = { id: id, title: title, type: type, description: '', assignedDeviceIds: [] };
        out.controls.push(c); byTitle[title] = c; return id;
      }
      Object.keys(out.items || {}).forEach(function (dsId) {
        (out.items[dsId] || []).forEach(function (it) {
          var legacy = Array.isArray(it.ismRefs) ? it.ismRefs : [];
          it.controlRefs = legacy.map(ensureControl);
          delete it.ismRefs;
        });
      });
      return out;
    }

    /**
     * Migrate a v2 project to v3 (spec §19.7): add top-level `groups` and a per-config
     * `overrides` map. Lossless. (Empty override maps are dropped at serialize time.)
     * @param {Project} v2
     * @returns {Project} v3
     */
    function migrateV2toV3(v2) {
      var out = JSON.parse(JSON.stringify(v2));
      out.schemaVersion = 3;
      if (!Array.isArray(out.groups)) out.groups = [];
      (out.deviceConfigs || []).forEach(function (dc) { if (!isPlainObject(dc.overrides)) dc.overrides = {}; });
      return out;
    }

    /**
     * Migrate a v3 project to v4 (TW-1): table parts may carry per-column `widths`.
     *
     * There is nothing to convert. An absent `widths` array is exactly the behaviour a
     * v3 project had — each column as wide as its content — so a v3 file becomes a v4
     * file by saying so, and a table laid out before this build renders byte-identically
     * after it. The function exists because the migrate CHAIN must be unbroken: without
     * it, every project written by an earlier build would fail to open.
     * @param {Project} v3 @returns {Project} v4
     */
    function migrateV3toV4(v3) {
      var out = JSON.parse(JSON.stringify(v3));
      out.schemaVersion = 4;
      return out;
    }

    // ---- retired datasets (v2.0) ----------------------------------------------
    // `android.settings` was retired: every hardening change the fleet needs is
    // expressible through Packages and Tactical, so the Settings register was pure
    // noise. Projects saved by an earlier build still carry its items, snapshots
    // and overrides, and the dataset-id cross-checks in validateSchema would reject
    // those as "not a dataset of this platform" — i.e. every existing project would
    // fail to open. So retired ids are stripped on load, LOUDLY (one warning per
    // dataset in the Activity drawer), never silently. Everything else in the file
    // is untouched, so the project keeps its devices, controls, groups and history.
    var RETIRED_DATASETS = { 'android.settings': 'Settings' };

    /**
     * Remove every trace of a retired dataset from a just-parsed project. Mutates `p`.
     * @param {Object} p
     * @returns {Issue[]} one warning per retired dataset that was actually present
     */
    function dropRetiredDatasets(p) {
      var warnings = [];
      if (!isPlainObject(p)) return warnings;
      Object.keys(RETIRED_DATASETS).forEach(function (dsId) {
        var label = RETIRED_DATASETS[dsId], hit = false, itemCount = 0, deviceCount = 0;
        if (isPlainObject(p.items) && p.items[dsId] !== undefined) {
          itemCount = Array.isArray(p.items[dsId]) ? p.items[dsId].length : 0;
          delete p.items[dsId]; hit = true;
        }
        (Array.isArray(p.deviceConfigs) ? p.deviceConfigs : []).forEach(function (dc) {
          if (!isPlainObject(dc)) return;
          if (isPlainObject(dc.snapshots) && dc.snapshots[dsId] !== undefined) { delete dc.snapshots[dsId]; deviceCount++; hit = true; }
          if (isPlainObject(dc.overrides) && dc.overrides[dsId] !== undefined) { delete dc.overrides[dsId]; hit = true; }
        });
        (Array.isArray(p.groups) ? p.groups : []).forEach(function (g) {
          if (isPlainObject(g) && isPlainObject(g.overrides) && g.overrides[dsId] !== undefined) { delete g.overrides[dsId]; hit = true; }
        });
        if (hit) {
          warnings.push({
            category: 'validation', severity: 'warning', location: dsId,
            message: 'The ' + label + ' dataset has been retired. ' + itemCount + ' register item(s) and ' +
              deviceCount + ' captured ' + label + ' snapshot(s) were dropped from this project; ' +
              'everything else was kept. Express these changes through Packages or Tactical instead.',
            fix: 'Nothing to do — save the project to make the removal permanent.'
          });
        }
      });
      return warnings;
    }

    /**
     * REL-1: translate retired Security Relevance names to their current ones. Purely a
     * RENAME — 'CONTEXT' and 'LOW' are the same category, so nothing about the item's
     * meaning changes and nothing is dropped. Runs on every load (not gated on
     * schemaVersion) for the same reason dropRetiredDatasets does: the vocabulary is
     * closed, so an untranslated value is a hard validation error and the project would
     * simply refuse to open. Mutates `p`.
     * @param {Object} p
     * @returns {Issue[]} one warning per rename actually applied
     */
    function renameLegacyRelevance(p) {
      var warnings = [], counts = {};
      if (!isPlainObject(p) || !isPlainObject(p.items)) return warnings;
      Object.keys(p.items).forEach(function (dsId) {
        (Array.isArray(p.items[dsId]) ? p.items[dsId] : []).forEach(function (it) {
          if (!isPlainObject(it)) return;
          var to = RELEVANCE_RENAMES[it.relevance];
          if (!to) return;
          counts[it.relevance] = (counts[it.relevance] || 0) + 1;
          it.relevance = to;
        });
      });
      Object.keys(counts).sort().forEach(function (from) {
        warnings.push({
          category: 'validation', severity: 'warning', location: 'items',
          message: 'Security Relevance "' + from + '" has been renamed to "' + RELEVANCE_RENAMES[from] + '"; ' +
            counts[from] + ' item(s) were updated. It is the same category under a clearer name.',
          fix: 'Nothing to do — save the project to make the rename permanent.'
        });
      });
      return warnings;
    }

    /**
     * Migrate a project forward to the current schema version (spec §17.A, §18.3, §19.7).
     * Migrations CHAIN (v1→v2→v3→v4) so an old file reaches the current schema in one call.
     * @param {Project} project
     * @returns {Project}
     */
    function migrate(project) {
      var p = project;
      if (p && p.schemaVersion === 1) p = migrateV1toV2(p);
      if (p && p.schemaVersion === 2) p = migrateV2toV3(p);
      if (p && p.schemaVersion === 3) p = migrateV3toV4(p);
      return p; // v4 (current) or unknown -> pass through; schema check flags unknown
    }

    /** Latest DeviceConfig per baseId (highest version), keyed by baseId. */
    function latestByBase(configs) {
      var out = {};
      (configs || []).forEach(function (dc) {
        if (dc && typeof dc.baseId === 'string' && (!out[dc.baseId] || dc.version > out[dc.baseId].version)) out[dc.baseId] = dc;
      });
      return out;
    }

