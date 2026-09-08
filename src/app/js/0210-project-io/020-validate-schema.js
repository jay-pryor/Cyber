    /**
     * Validate a candidate project object against the Appendix A schema.
     * @param {*} p
     * @returns {Issue[]}  empty when valid
     */
    function validateSchema(p) {
      var issues = [];
      if (!isPlainObject(p)) { issues.push(issue('error', 'Project root must be a JSON object.', 'root')); return issues; }

      // Unknown top-level keys (Appendix A: reject unknown).
      Object.keys(p).forEach(function (k) {
        if (TOP_KEYS.indexOf(k) === -1) issues.push(issue('error', 'Unknown top-level key "' + k + '".', 'root.' + k, 'Remove it.'));
      });

      if (p.schemaVersion !== SCHEMA_VERSION) {
        issues.push(issue('error', 'schemaVersion must be ' + SCHEMA_VERSION + '.', 'schemaVersion', 'Set schemaVersion to ' + SCHEMA_VERSION + '.'));
      }
      if (typeof p.platformProfileId !== 'string' || !p.platformProfileId) {
        issues.push(issue('error', 'platformProfileId must be a non-empty string.', 'platformProfileId'));
      } else if (App.registry.listPlatforms().length && !App.registry.hasPlatform(p.platformProfileId)) {
        issues.push(issue('error', 'platformProfileId "' + p.platformProfileId + '" is not a registered platform.', 'platformProfileId'));
      }

      // meta
      if (!isPlainObject(p.meta)) {
        issues.push(issue('error', 'meta must be an object.', 'meta'));
      } else {
        if (!ISO_RE.test(p.meta.createdUtc || '')) issues.push(issue('error', 'meta.createdUtc must be a UTC ISO date-time.', 'meta.createdUtc'));
        if (!ISO_RE.test(p.meta.modifiedUtc || '')) issues.push(issue('error', 'meta.modifiedUtc must be a UTC ISO date-time.', 'meta.modifiedUtc'));
        if (typeof p.meta.appVersion !== 'string') issues.push(issue('error', 'meta.appVersion must be a string.', 'meta.appVersion'));
      }

      // Determine valid dataset ids for cross-checks (only if platform registered).
      var validDs = null;
      if (typeof p.platformProfileId === 'string' && App.registry.hasPlatform(p.platformProfileId)) {
        validDs = App.registry.datasetIds(p.platformProfileId);
      }

      // controlTypes (review-3 #5a): optional list of user-added control types.
      if (p.controlTypes !== undefined && !isStringArray(p.controlTypes)) {
        issues.push(issue('error', 'controlTypes must be an array of strings.', 'controlTypes'));
      }
      // TAG-1: optional catalogue of user-defined control tags. A control's `tags` is a
      // free multi-valued dimension, distinct from its single `type` — e.g. marking the
      // administrative controls you track but never action through this tool.
      if (p.controlTags !== undefined && !isStringArray(p.controlTags)) {
        issues.push(issue('error', 'controlTags must be an array of strings.', 'controlTags'));
      }

      // controls (spec §18.3 CTL-1). Build the id set for controlRefs integrity.
      var controlIds = {};
      if (p.controls === undefined || !Array.isArray(p.controls)) {
        issues.push(issue('error', 'controls must be an array (schemaVersion 2).', 'controls', 'Add a top-level "controls": [].'));
      } else {
        p.controls.forEach(function (c, i) {
          var loc = 'controls[' + i + ']';
          if (!isPlainObject(c)) { issues.push(issue('error', 'Control must be an object.', loc)); return; }
          if (typeof c.id !== 'string' || !SLUG_RE.test(c.id)) issues.push(issue('error', 'Control.id must be a slug.', loc + '.id'));
          if (typeof c.title !== 'string' || !c.title) issues.push(issue('error', 'Control.title must be a non-empty string.', loc + '.title'));
          if (typeof c.type !== 'string' || !c.type) issues.push(issue('error', 'Control.type must be a non-empty string.', loc + '.type'));
          if (c.description !== undefined && typeof c.description !== 'string') issues.push(issue('error', 'Control.description must be a string.', loc + '.description'));
          if (c.tags !== undefined && !isStringArray(c.tags)) issues.push(issue('error', 'Control.tags must be an array of strings.', loc + '.tags')); // TAG-1
          // JUS-1: {deviceBaseId: 'why this control is met here'}. Free text; only the
          // shape is structural.
          if (c.deviceJustifications !== undefined) {
            if (!isPlainObject(c.deviceJustifications)) issues.push(issue('error', 'Control.deviceJustifications must be an object.', loc + '.deviceJustifications'));
            else Object.keys(c.deviceJustifications).forEach(function (bid) {
              if (typeof c.deviceJustifications[bid] !== 'string') issues.push(issue('error', 'Control.deviceJustifications["' + bid + '"] must be a string.', loc + '.deviceJustifications'));
            });
          }
          if (c.assignedDeviceIds !== undefined && !isStringArray(c.assignedDeviceIds)) issues.push(issue('error', 'Control.assignedDeviceIds must be an array of strings.', loc + '.assignedDeviceIds'));
          // review-12 #1: {deviceBaseId: 'satisfied'|'unsatisfied'} — device-specific
          // satisfaction of this control. Absent/unknown baseId ⇒ 'unsatisfied'.
          if (c.deviceStates !== undefined) {
            if (!isPlainObject(c.deviceStates)) issues.push(issue('error', 'Control.deviceStates must be an object.', loc + '.deviceStates'));
            else Object.keys(c.deviceStates).forEach(function (b) {
              if (CONTROL_STATES.indexOf(c.deviceStates[b]) === -1) issues.push(issue('error', 'Control.deviceStates["' + b + '"] must be one of: ' + CONTROL_STATES.join(', ') + '.', loc + '.deviceStates'));
            });
          }
          if (typeof c.id === 'string') {
            if (controlIds[c.id]) issues.push(issue('error', 'Duplicate Control id "' + c.id + '".', loc));
            controlIds[c.id] = true;
          }
        });
      }

      // groups (spec §19.2.2): structural validation only — dangling/non-applicable
      // memberships and overrides are auto-pruned on load (selfHealV3), never a hard
      // error (mirrors the CTL-2 controlRefs path).
      if (p.groups !== undefined) {
        if (!Array.isArray(p.groups)) {
          issues.push(issue('error', 'groups must be an array.', 'groups'));
        } else {
          var gids = {};
          p.groups.forEach(function (g, i) {
            var loc = 'groups[' + i + ']';
            if (!isPlainObject(g)) { issues.push(issue('error', 'DeviceGroup must be an object.', loc)); return; }
            if (typeof g.id !== 'string' || !SLUG_RE.test(g.id)) issues.push(issue('error', 'DeviceGroup.id must be a slug.', loc + '.id'));
            else { if (gids[g.id]) issues.push(issue('error', 'Duplicate DeviceGroup id "' + g.id + '".', loc)); gids[g.id] = true; }
            if (typeof g.name !== 'string' || !g.name) issues.push(issue('error', 'DeviceGroup.name must be a non-empty string.', loc + '.name'));
            if (g.deviceBaseIds !== undefined && !isStringArray(g.deviceBaseIds)) issues.push(issue('error', 'DeviceGroup.deviceBaseIds must be an array of strings.', loc + '.deviceBaseIds'));
            if (g.overrides !== undefined && !isPlainObject(g.overrides)) issues.push(issue('error', 'DeviceGroup.overrides must be an object.', loc + '.overrides'));
          });
        }
      }

      // valueFormats (VF-3): the named, reusable custom formats. Additive — a project
      // without the key is normal. Structural only; semantic problems (an options format
      // with no options yet) are a UI concern, not a load failure.
      if (p.valueFormats !== undefined) {
        if (!Array.isArray(p.valueFormats)) {
          issues.push(issue('error', 'valueFormats must be an array.', 'valueFormats'));
        } else {
          var fmtIds = {};
          p.valueFormats.forEach(function (f, i) {
            var floc = 'valueFormats[' + i + ']';
            if (!isPlainObject(f)) { issues.push(issue('error', 'ValueFormat must be an object.', floc)); return; }
            if (typeof f.id !== 'string' || !SLUG_RE.test(f.id)) issues.push(issue('error', 'ValueFormat.id must be a slug.', floc + '.id'));
            else {
              if (fmtIds[f.id]) issues.push(issue('error', 'Duplicate ValueFormat id "' + f.id + '".', floc));
              fmtIds[f.id] = true;
              if (BUILTIN_FORMAT_IDS.indexOf(f.id) !== -1) issues.push(issue('error', 'ValueFormat.id "' + f.id + '" collides with a built-in format.', floc + '.id', 'Rename the format.'));
            }
            if (typeof f.name !== 'string' || !f.name) issues.push(issue('error', 'ValueFormat.name must be a non-empty string.', floc + '.name'));
            if (typeof f.kind !== 'string' || CUSTOM_FORMAT_KINDS.indexOf(f.kind) === -1) {
              issues.push(issue('error', 'ValueFormat.kind must be one of ' + CUSTOM_FORMAT_KINDS.join('/') + '.', floc + '.kind'));
            }
            if (f.description !== undefined && typeof f.description !== 'string') issues.push(issue('error', 'ValueFormat.description must be a string.', floc + '.description'));
            if (f.options !== undefined) {
              if (!Array.isArray(f.options)) issues.push(issue('error', 'ValueFormat.options must be an array.', floc + '.options'));
              else {
                var seenOpt = {};
                f.options.forEach(function (o, j) {
                  var oloc = floc + '.options[' + j + ']';
                  if (!isPlainObject(o)) { issues.push(issue('error', 'Option must be an object.', oloc)); return; }
                  if (typeof o.value !== 'string' || o.value === '') issues.push(issue('error', 'Option.value must be a non-empty string.', oloc + '.value'));
                  else {
                    if (seenOpt[o.value]) issues.push(issue('error', 'Duplicate option value "' + o.value + '".', oloc));
                    seenOpt[o.value] = true;
                  }
                  if (o.description !== undefined && typeof o.description !== 'string') issues.push(issue('error', 'Option.description must be a string.', oloc + '.description'));
                });
              }
            }
            ['min', 'max'].forEach(function (nk) {
              if (f[nk] !== undefined && typeof f[nk] !== 'number') issues.push(issue('error', 'ValueFormat.' + nk + ' must be a number when present.', floc + '.' + nk));
            });
            if (f.pattern !== undefined && typeof f.pattern !== 'string') issues.push(issue('error', 'ValueFormat.pattern must be a string when present.', floc + '.pattern'));
          });
        }
      }

      // NOTE-1: the per-device knowledge notes, {deviceBaseId: sanitised rich-text HTML}.
      // Keyed by BASE id (not config id) so a re-onboarded device keeps what was written
      // about it, exactly like a control's per-device state. The HTML is re-sanitised on
      // render, so a hand-edited project file cannot smuggle markup into the page.
      if (p.deviceNotes !== undefined) {
        if (!isPlainObject(p.deviceNotes)) issues.push(issue('error', 'deviceNotes must be an object keyed by device baseId.', 'deviceNotes'));
        else Object.keys(p.deviceNotes).forEach(function (b) {
          if (typeof p.deviceNotes[b] !== 'string') issues.push(issue('error', 'deviceNotes["' + b + '"] must be a string.', 'deviceNotes'));
        });
      }

      // PRO-2: the Procedure report's step ORDER (and any per-step note). Structural only
      // — a step id that no longer exists is ignored when the steps are rebuilt, never a
      // load failure, because deleting a custom action must not invalidate the project.
      if (p.procedure !== undefined) {
        if (!isPlainObject(p.procedure)) {
          issues.push(issue('error', 'procedure must be an object.', 'procedure'));
        } else {
          Object.keys(p.procedure).forEach(function (k) {
            if (k !== 'order' && k !== 'notes') issues.push(issue('error', 'Unknown key "' + k + '" in procedure.', 'procedure.' + k, 'Remove it.'));
          });
          if (p.procedure.order !== undefined && !isStringArray(p.procedure.order)) {
            issues.push(issue('error', 'procedure.order must be an array of step ids.', 'procedure.order'));
          }
          if (p.procedure.notes !== undefined) {
            if (!isPlainObject(p.procedure.notes)) issues.push(issue('error', 'procedure.notes must be an object.', 'procedure.notes'));
            else Object.keys(p.procedure.notes).forEach(function (k) {
              if (typeof p.procedure.notes[k] !== 'string') issues.push(issue('error', 'procedure.notes["' + k + '"] must be a string.', 'procedure.notes'));
            });
          }
        }
      }

      // RPT-3: the Reporting report's SECTION order. Structural only, and for the same
      // reason as procedure.order — a section id that no longer exists (a dataset that
      // went away, a report group an adapter stopped offering) is ignored when the
      // candidate list is rebuilt, never a load failure.
      if (p.report !== undefined) {
        if (!isPlainObject(p.report)) {
          issues.push(issue('error', 'report must be an object.', 'report'));
        } else {
          Object.keys(p.report).forEach(function (k) {
            if (REPORT_KEYS.indexOf(k) === -1) issues.push(issue('error', 'Unknown key "' + k + '" in report.', 'report.' + k, 'Remove it.'));
          });
          if (p.report.order !== undefined && !isStringArray(p.report.order)) {
            issues.push(issue('error', 'report.order must be an array of section ids.', 'report.order'));
          }
          // DOC-1: pinned heading levels. Keyed by block id, so a level pinned on a
          // section that later goes away is ignored rather than a load failure — same
          // rule as the order above.
          if (p.report.levels !== undefined) {
            if (!isPlainObject(p.report.levels)) issues.push(issue('error', 'report.levels must be an object.', 'report.levels'));
            else Object.keys(p.report.levels).forEach(function (k) {
              // TTL-1 added 0, an unnumbered title. Listed as a literal rather than read
              // from App.doc because projectIo loads first and must stay dependency-light;
              // the pair is asserted equal by a self-test.
              if ([0, 1, 2, 3, 4, 5].indexOf(p.report.levels[k]) === -1) {
                issues.push(issue('error', 'report.levels["' + k + '"] must be 0 (an unnumbered title), 1-4 (a heading) or 5 (normal text).', 'report.levels'));
              }
            });
          }
          // v2.2: `centred` and `meta` are both "true/false by id" maps. Only the
          // NON-default value is ever stored, so both are validated the same way.
          [['centred', true], ['meta', false], ['introNumbered', true]].forEach(function (pair) {
            var m = p.report[pair[0]];
            if (m === undefined) return;
            if (!isPlainObject(m)) { issues.push(issue('error', 'report.' + pair[0] + ' must be an object.', 'report.' + pair[0])); return; }
            Object.keys(m).forEach(function (k) {
              if (m[k] !== pair[1]) {
                issues.push(issue('error', 'report.' + pair[0] + '["' + k + '"] must be ' + pair[1] + ' when present (omit it otherwise).', 'report.' + pair[0]));
              }
            });
          });
          if (p.report.formatId !== undefined && typeof p.report.formatId !== 'string') {
            issues.push(issue('error', 'report.formatId must be a string.', 'report.formatId'));
          }
          // NAM-1/SEC-1: free text, keyed by block id. Blank is stored as absence, so a
          // present entry that is blank is a file nobody could have produced.
          [['names', 'A section name'], ['headings', 'A section heading'], ['intros', 'A section introduction']].forEach(function (pair) {
            var m = p.report[pair[0]];
            if (m === undefined) return;
            if (!isPlainObject(m)) { issues.push(issue('error', 'report.' + pair[0] + ' must be an object.', 'report.' + pair[0])); return; }
            Object.keys(m).forEach(function (k) {
              if (typeof m[k] !== 'string' || !m[k].trim()) {
                issues.push(issue('error', pair[1] + ' must be a non-empty string (omit it otherwise).', 'report.' + pair[0] + '["' + k + '"]'));
              }
            });
          });
          // SPC-1: millimetres above a section's heading, keyed by block id. Zero is
          // stored as absence, like every other "off" here, so a present entry is a real
          // measurement — and it is checked, because it reaches LaTeX as a length.
          if (p.report.space !== undefined) {
            if (!isPlainObject(p.report.space)) issues.push(issue('error', 'report.space must be an object.', 'report.space'));
            else Object.keys(p.report.space).forEach(function (k) {
              var loc = 'report.space["' + k + '"]';
              if (checkMm(p.report.space[k], loc, 'A section\'s space above', issues) && !p.report.space[k]) {
                issues.push(issue('error', 'A section\'s space above must be greater than 0 when present (omit it otherwise).', loc));
              }
            });
          }
          // TBS-1: only the switched-ON state is ever stored.
          if (p.report.tableStyles !== undefined) {
            if (!isPlainObject(p.report.tableStyles)) issues.push(issue('error', 'report.tableStyles must be an object.', 'report.tableStyles'));
            else Object.keys(p.report.tableStyles).forEach(function (k) {
              var e = p.report.tableStyles[k], loc = 'report.tableStyles["' + k + '"]';
              if (!isPlainObject(e) || !Object.keys(e).length) { issues.push(issue('error', 'A table style must be a non-empty object.', loc)); return; }
              Object.keys(e).forEach(function (f) {
                if (['head', 'firstColumn'].indexOf(f) === -1) issues.push(issue('error', 'Unknown table style "' + f + '".', loc));
                else if (e[f] !== true) issues.push(issue('error', 'A table style must be true when present (omit it otherwise).', loc));
              });
            });
          }
          /* OPT-2: the four include-maps. Every value is a BOOLEAN, and only the ones
           * that differ from the default are ever written — so a map full of `true` is
           * a file this build could not have produced, and is worth saying so about.
           * The KEYS are not checked against anything: a column an adapter no longer
           * declares, or a section a platform no longer has, is a choice about something
           * that is not there, which is ignored at render time rather than being a
           * reason the project will not open. */
          if (p.report.options !== undefined) {
            if (!isPlainObject(p.report.options)) issues.push(issue('error', 'report.options must be an object.', 'report.options'));
            else Object.keys(p.report.options).forEach(function (m) {
              var depth = REPORT_OPTION_MAPS[m], loc = 'report.options.' + m;
              if (!depth) { issues.push(issue('error', 'Unknown report option map "' + m + '".', loc)); return; }
              var map = p.report.options[m];
              if (!isPlainObject(map)) { issues.push(issue('error', loc + ' must be an object.', loc)); return; }
              Object.keys(map).forEach(function (k) {
                var v = map[k], l = loc + '["' + k + '"]';
                if (depth === 1) {
                  if (typeof v !== 'boolean') issues.push(issue('error', 'A report option must be true or false.', l));
                  return;
                }
                if (!isPlainObject(v)) { issues.push(issue('error', l + ' must be an object.', l)); return; }
                Object.keys(v).forEach(function (k2) {
                  if (typeof v[k2] !== 'boolean') issues.push(issue('error', 'A report option must be true or false.', l + '["' + k2 + '"]'));
                });
              });
            });
          }
          // TW-2: per-section column widths. The column COUNT is not known here — it
          // depends on the platform and on which optional columns are on — so only the
          // shape is checked; a set that no longer matches its table is ignored at
          // render time rather than being a reason the project will not open.
          if (p.report.tableWidths !== undefined) {
            if (!isPlainObject(p.report.tableWidths)) issues.push(issue('error', 'report.tableWidths must be an object.', 'report.tableWidths'));
            else Object.keys(p.report.tableWidths).forEach(function (k) {
              checkWidths(p.report.tableWidths[k], null, 'report.tableWidths["' + k + '"]', 'Section column widths', issues);
            });
          }
          // TTL-2: present only when the automatic title block is wanted, and only ever
          // true — off is absence, so a project cannot carry two ways of saying no.
          // TTL-2/CLS-1: two document-level switches, stored as presence — only the
          // switched-ON state is ever written, so an untouched project carries neither.
          ['titleBlock', 'classification'].forEach(function (k) {
            if (p.report[k] !== undefined && p.report[k] !== true) {
              issues.push(issue('error', 'report.' + k + ' must be true when present (omit it otherwise).', 'report.' + k));
            }
          });
          validateDocSections(p.report.sections, 'report.sections', issues);
          validateDocList(p.report.formats, 'report.formats', 'formatting profile', issues, function (f, loc) {
            var v = App.docFormat ? App.docFormat.validate(f, loc) : { ok: true, issues: [] };
            v.issues.forEach(function (i) { issues.push(issue(i.severity, i.message, i.location)); });
          });
          validateDocList(p.report.sectionTemplates, 'report.sectionTemplates', 'section template', issues, function (t, loc) {
            validateDocParts(t.parts, loc, issues);
          });
          validateDocList(p.report.reportTemplates, 'report.reportTemplates', 'report template', issues, function (t, loc) {
            if (t.order !== undefined && !isStringArray(t.order)) issues.push(issue('error', 'order must be an array of section ids.', loc + '.order'));
            ['centred', 'meta'].forEach(function (k) {
              if (t[k] !== undefined && !isPlainObject(t[k])) issues.push(issue('error', k + ' must be an object.', loc + '.' + k));
            });
            validateDocSections(t.sections, loc + '.sections', issues);
          });
        }
      }

      // items
      if (!isPlainObject(p.items)) {
        issues.push(issue('error', 'items must be an object keyed by dataset id.', 'items'));
      } else {
        Object.keys(p.items).forEach(function (dsId) {
          if (validDs && validDs.indexOf(dsId) === -1) {
            issues.push(issue('error', 'items key "' + dsId + '" is not a dataset of platform "' + p.platformProfileId + '".', 'items.' + dsId));
          }
          var arr = p.items[dsId];
          if (!Array.isArray(arr)) { issues.push(issue('error', 'items["' + dsId + '"] must be an array.', 'items.' + dsId)); return; }
          var seen = {};
          arr.forEach(function (it, i) {
            var loc = 'items.' + dsId + '[' + i + ']';
            validateRegisterItem(it, loc, issues);
            if (it && typeof it.key === 'string') {
              if (seen[it.key]) issues.push(issue('error', 'Duplicate item key "' + it.key + '" in dataset "' + dsId + '".', loc));
              seen[it.key] = true;
            }
            // controlRefs integrity (CTL-2): dangling refs warn (non-blocking, lossless).
            if (it && Array.isArray(it.controlRefs)) it.controlRefs.forEach(function (ref) {
              if (!controlIds[ref]) issues.push(issue('warning', 'controlRef "' + ref + '" does not match any control.', loc + '.controlRefs'));
            });
          });
        });
      }

      // deviceConfigs
      if (!Array.isArray(p.deviceConfigs)) {
        issues.push(issue('error', 'deviceConfigs must be an array.', 'deviceConfigs'));
      } else {
        var ids = {};
        p.deviceConfigs.forEach(function (dc, i) {
          var loc = 'deviceConfigs[' + i + ']';
          validateDeviceConfig(dc, loc, validDs, issues);
          if (dc && typeof dc.id === 'string') {
            if (ids[dc.id]) issues.push(issue('error', 'Duplicate DeviceConfig id "' + dc.id + '".', loc));
            ids[dc.id] = true;
          }
        });
        validateVersionIntegrity(p.deviceConfigs, issues);
      }

      return issues;
    }

