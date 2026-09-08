    /** Render the decisionSchema-driven control(s) for one item's decision cell. */
    function renderDecisionControl(adapter, dsId, item, captured, project) {
      var d = item.decision, cap = captured[item.key];
      var VF = App.valueFormats;
      var fmt = VF ? VF.resolve(project || null, item, cap ? cap.type : undefined, cap ? cap.value : undefined) : null;
      var html = adapter.decisionSchema.map(function (f) {
        if (f.kind === 'enum') {
          var cur = d && d[f.name] != null ? d[f.name] : '';
          return '<select ' + ctrl(dsId, item.key, f.name, 'enum') + ' aria-label="' + esc(f.name) + '">' +
            '<option value=""' + (cur === '' ? ' selected' : '') + '>—</option>' +
            f.options.map(function (o) { return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
            '</select>';
        }
        if (f.kind === 'string' || f.kind === 'value-typed') {
          // VF-8: both text primaries now route through the format-driven editor. The
          // captured leaf type still supplies the DEFAULT format (data-vtype is kept so
          // an item with no declared format coerces exactly as it did before).
          var rawVal = d && (f.name in d) ? d[f.name] : (cap ? cap.value : '');
          var vtype = (cap && cap.type) ? cap.type : (d && d.type ? d.type : 'string');
          var attrs = ctrl(dsId, item.key, f.name, f.kind, ' data-vtype="' + esc(vtype) + '"');
          return renderValueEditor(fmt, attrs, rawVal);
        }
        if (f.kind === 'bool') {
          var on = !!(d && d[f.name]);
          return '<input type="checkbox" ' + ctrl(dsId, item.key, f.name, 'bool') + (on ? ' checked' : '') + ' aria-label="' + esc(f.name) + '">';
        }
        return '';
      }).join(' ');
      // review-16 #1: an emptied TEXT box is committed as a blank value (e.g. clearing
      // a comma-separated list), so it can no longer double as "clear the decision" —
      // that gets this explicit button. Enum datasets keep their "—" option instead.
      // review-17 #2: value box and clear button share one flex row, so the button
      // sits beside the box instead of wrapping under it.
      if (d != null && isTextPrimary(adapter)) {
        html = '<div class="dec-row">' + html +
          '<button type="button" class="dec-clear" data-decision-clear data-ds="' + esc(dsId) + '" data-key="' + esc(item.key) + '"' +
          ' title="Clear this decision (back to undecided)">clear</button></div>';
      }
      return html;
    }
    /** True when the dataset's primary decision field is a free-text box, not an enum. */
    function isTextPrimary(adapter) {
      var f = adapter && adapter.decisionSchema && adapter.decisionSchema[0];
      return !!f && (f.kind === 'string' || f.kind === 'value-typed');
    }

    /** Render the expanded detail editor row (description/ISM/rationale/rollback + issues). */
    /**
     * Multi-select over the control catalogue (spec §18.3 CTL-5; review-5 #2).
     * A native <select multiple> made it impossible to add more than one ref or to
     * remove one without modifier-clicks, so this is a searchable CHECKBOX list:
     * each control is a checkbox (checked = referenced); ticking/unticking toggles
     * that single ref, so any number can be added and any one removed independently.
     * The search box filters the visible options client-side (no store round-trip).
     */
    function controlSelect(dsId, key, refs, controls) {
      if (!controls.length) return '<span class="muted" style="font-size:12px">No controls yet — add them in Control Manager.</span>';
      var sel = {}; (refs || []).forEach(function (r) { sel[r] = true; });
      var opts = controls.slice().sort(function (a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; })
        .map(function (c) {
          // Show the control title only (review-5 follow-up): the "(TYPE)" suffix is
          // unnecessary noise in the selection list.
          return '<label class="ctl-opt" data-ctl-opt>' +
            '<input type="checkbox" data-control-ref-toggle data-ds="' + esc(dsId) + '" data-key="' + esc(key) + '" data-control-id="' + esc(c.id) + '"' + (sel[c.id] ? ' checked' : '') + '> ' +
            '<span>' + esc(c.title) + '</span></label>';
        }).join('');
      var count = (refs || []).length;
      return '<div class="control-multiselect" data-control-multiselect>' +
        '<input type="search" class="ctl-opt-search" data-control-search placeholder="Filter controls…" aria-label="Filter controls">' +
        '<div class="ctl-opts">' + opts + '</div>' +
        '<div class="muted ctl-opt-count" style="font-size:11px">' + count + ' selected</div>' +
        '</div>';
    }

    /**
     * The Security Relevance cell (review-12 #3): a <select> wearing the badge skin, so
     * an unset value reads as a plain "—" and a set one reads as a coloured badge
     * (HIGH red / MEDIUM orange / LOW blue) that is still editable in place.
     */
    function relevanceCell(dsId, item) {
      var cur = item.relevance || '';
      var opts = [''].concat(App.projectIo.RELEVANCE_OPTIONS).map(function (o) {
        return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + (o ? esc(o) : '—') + '</option>';
      }).join('');
      return '<td class="rel-cell"><select class="rel-select ' + relevanceClass(cur) + '" data-relevance data-ds="' + esc(dsId) + '" data-key="' + esc(item.key) + '"' +
        ' aria-label="Security Relevance for ' + esc(item.key) + '" title="Security Relevance (optional)">' + opts + '</select></td>';
    }
    /** @returns {string} the badge modifier class for a relevance value ('' ⇒ none). */
    function relevanceClass(v) {
      return v ? 'rel-' + String(v).toLowerCase() : '';
    }
    /** A read-only Security Relevance badge (used outside the editable table). */
    function relevanceBadge(v) {
      return v ? '<span class="badge ' + relevanceClass(v) + '">' + esc(v) + '</span>' : '';
    }

    /**
     * VF-4: the per-item "Value format" row in the expander — a picker over the
     * built-ins plus the project's named formats, a live hint describing the current
     * one, and a button into the format manager. Only rendered for datasets whose
     * primary decision is a VALUE (a packages action is already a closed enum).
     */
    function formatPicker(dsId, item, project, adapter, captured) {
      var VF = App.valueFormats;
      var schema = (adapter && adapter.decisionSchema) || [];
      var primary = schema[0];
      if (!VF || !primary || (primary.kind !== 'value-typed' && primary.kind !== 'string')) return '';
      if (adapter.noValueFormats) return '';   // CUS-1: the action box stays open-ended
      var cap = captured && captured[item.key];
      var capType = cap ? cap.type : undefined;
      var cur = VF.resolve(project, item, capType, cap ? cap.value : undefined);
      var inferredId = VF.inferId(capType, cap ? cap.value : undefined);
      var all = VF.list(project);
      var builtins = all.filter(function (f) { return f.builtin; });
      var customs = all.filter(function (f) { return !f.builtin; });
      function opt(f) {
        var label = f.name + (f.id === inferredId && !item.format ? ' (inferred from capture)' : '');
        return '<option value="' + esc(f.id) + '"' + (item.format === f.id ? ' selected' : '') + '>' + esc(label) + '</option>';
      }
      var html = '<select data-format-pick ' + 'data-ds="' + esc(dsId) + '" data-key="' + esc(item.key) + '" aria-label="Value format">' +
        '<option value=""' + (item.format ? '' : ' selected') + '>Automatic — ' + esc((BUILTIN_NAME[inferredId] || inferredId)) + ' (from the capture)</option>' +
        '<optgroup label="Standard formats">' + builtins.map(opt).join('') + '</optgroup>' +
        (customs.length ? '<optgroup label="Project formats">' + customs.map(opt).join('') + '</optgroup>' : '') +
        '</select>';
      var hint = cur.danglingRef
        ? '<span class="fmt-warn">Format &ldquo;' + esc(cur.danglingRef) + '&rdquo; no longer exists — using ' + esc(cur.name) + '.</span>'
        : '<span class="muted">' + esc(cur.hint || cur.description || describeFormat(cur)) + '</span>';
      return '<label>Value format</label><div class="fmt-cell">' + html +
        ' <button type="button" data-format-manage title="Create and edit the project\'s named value formats">Manage…</button>' +
        '<div class="fmt-hint">' + hint + '</div></div>';
    }
    var BUILTIN_NAME = { bool: 'Boolean', number: 'Number', string: 'Text', stringArray: 'String list', json: 'JSON value' };
    /** One line describing what a custom format allows (shown under the picker). */
    function describeFormat(f) {
      if (f.kind === 'options') {
        var vals = (f.options || []).map(function (o) { return o.value; });
        return vals.length ? 'Allowed: ' + vals.join(', ') : 'No options defined yet — any text is accepted until you add some.';
      }
      if (f.kind === 'number') return 'A number' + (typeof f.min === 'number' || typeof f.max === 'number' ? ' between ' + (f.min != null ? f.min : '−∞') + ' and ' + (f.max != null ? f.max : '∞') : '') + '.';
      if (f.kind === 'stringArray') return 'A list of strings, one per line.';
      return 'Free text.';
    }

    function renderDetailRow(dsId, item, colspan, issues, controls, project, adapter, captured) {
      var key = item.key;
      var iss = (issues && issues[dsId + '|' + key]) || [];
      var issHtml = iss.length ? '<div class="detail-issues">' + iss.map(function (i) {
        return '<div class="issue ' + esc(i.severity) + '">' + esc(i.severity.toUpperCase()) + ': ' + esc(i.message) + '</div>';
      }).join('') + '</div>' : '';
      var dk = 'data-ds="' + esc(dsId) + '" data-key="' + esc(key) + '"';
      var fld = function (field, label, ta, val) {
        var common = 'data-field-edit="' + field + '" ' + dk;
        return '<label for="">' + esc(label) + '</label>' + (ta
          ? '<textarea ' + common + '>' + esc(val || '') + '</textarea>'
          : '<input type="text" ' + common + ' value="' + esc(val || '') + '">');
      };
      // Rationale gets a quick-fill preset button to the right (review-3 #4).
      var rationaleCell = '<label>Rationale</label><div class="rationale-cell">' +
        '<textarea data-field-edit="rationale" ' + dk + '>' + esc(item.rationale || '') + '</textarea>' +
        '<button type="button" data-action="rationale-preset" ' + dk + ' title="Fill the rationale with the standard not-required note">Set to "Not required for device use-case"</button>' +
        '</div>';
      // DIV-2: the Divergence Narrative exists ONLY while the item is flagged as diverging.
      // The box appearing is what ticking the column does, and its absence is what "does
      // not diverge" looks like — there is no empty box inviting an answer to a question
      // nobody asked. Whatever has been written survives an unticking (see store DIV-1),
      // so a mis-click cannot destroy the prose; it comes back with the tick.
      var divergenceCell = item.diverges
        ? '<label>Divergence Narrative</label><div class="divergence-cell">' +
            '<textarea data-field-edit="divergenceNarrative" ' + dk +
            ' placeholder="How this departs from the guidelines, WHICH guideline it departs from, and why that choice was made."' +
            ' aria-label="Divergence Narrative">' + esc(item.divergenceNarrative || '') + '</textarea>' +
            (item.divergenceNarrative ? ''
              : '<div class="divergence-hint">Flagged as diverging with nothing recorded yet — say what it diverges from and why.</div>') +
          '</div>'
        : '';
      // CUS-2: only a hand-authored item can be renamed. For a captured row the key is
      // evidence — it is what the device reported — so there is no box here at all
      // rather than a disabled one implying the name is merely locked for now.
      var nameCell = (adapter && adapter.userCreatable)
        ? '<label for="">Name</label><div class="rename-cell">' +
            '<input type="text" data-rename-key ' + dk + ' value="' + esc(key) + '" aria-label="Name of this ' + esc(adapter.newItemNoun || 'item') + '">' +
            '<span class="muted rename-hint">The name identifies this row everywhere — renaming it carries its decisions and overrides with it.</span>' +
          '</div>'
        : '';
      // PRO-1: the procedure — HOW the action is carried out, step by step. Only for a
      // dataset that asks for one (adapter.hasProcedure), because it is only meaningful
      // where the work is done by hand: a package removal's "procedure" is the generated
      // adb line, and an empty box inviting someone to re-describe it would be noise.
      var procedureCell = (adapter && adapter.hasProcedure)
        ? '<label>Procedure</label><div class="procedure-cell">' +
            '<textarea data-field-edit="procedure" ' + dk +
            ' placeholder="How to carry this action out, step by step — what to open, what to set, and how to tell it worked."' +
            ' aria-label="Procedure">' + esc(item.procedure || '') + '</textarea>' +
            '<div class="muted procedure-hint">Carried into the Implementation runbook and the Procedure report, in the order set on the Generate tab.</div>' +
          '</div>'
        : '';
      return '<tr class="detail-row" data-detail-key="' + esc(key) + '"><td colspan="' + colspan + '"><div class="detail-form">' +
        nameCell +
        fld('description', 'Description', true, item.description) +
        '<label>Control Refs</label>' + controlSelect(dsId, key, item.controlRefs, controls || []) +
        procedureCell +
        rationaleCell +
        fld('rollback', 'Rollback', true, item.rollback) +
        divergenceCell +
        formatPicker(dsId, item, project, adapter, captured) +
        issHtml +
        '</div></td></tr>';
    }

    /**
     * DIV-3: re-render ONE open row's expander, for the handler that ticks the Diverges
     * column. That tick has to make the narrative box appear (or go away) without
     * re-rendering the table under the pointer — which is the whole of STAB-3.
     * @param {Project} project @param {string} dsId @param {string} key
     * @param {Object} [ui] @param {{issues?:Object}} [opts]
     * @returns {string} the <tr class="detail-row"> HTML, or '' if there is nothing to show
     */
    function detailRowHtml(project, dsId, key, ui, opts) {
      opts = opts || {}; ui = ui || {};
      if (!project) return '';
      var adapter = App.registry.getDataset(project.platformProfileId, dsId);
      if (!adapter) return '';
      var item = (project.items[dsId] || []).filter(function (it) { return it.key === key; })[0];
      if (!item) return '';
      var colspan = visibleColumns(adapter, ui).length + 1 + (ui.applyMode ? 1 : 0) + (ui.deleteMode ? 1 : 0) + (ui.assignMode ? 1 : 0);
      return renderDetailRow(dsId, item, colspan, opts.issues, (project.controls || []), project, adapter,
        buildCapturedMap(project, dsId));
    }

    /**
     * DIV-1: what the Diverges tick says when you hover it. A flag with no narrative
     * behind it says nothing on its own, so the hover states plainly that one is missing
     * rather than showing an empty tooltip.
     * @param {RegisterItem} item @returns {string}
     */
    function divergesHint(item) {
      if (!item || !item.diverges) {
        return 'Tick when this decision departs from the guidelines — then record what it departs from, and why, in the row’s Divergence Narrative.';
      }
      return item.divergenceNarrative
        ? item.divergenceNarrative
        : 'Diverges from guidelines — no Divergence Narrative recorded yet. Open the row (▸) and write one.';
    }
    /** DIV-1: the tick cell itself — a full-cell hit target, like the bulk columns. */
    function divergesCell(dsId, item) {
      var on = !!item.diverges;
      return '<td class="div-cell' + (on && !item.divergenceNarrative ? ' div-nonarr' : '') + '">' +
        '<label class="cell-check" title="' + esc(divergesHint(item)) + '">' +
        '<input type="checkbox" data-diverges data-ds="' + esc(dsId) + '" data-key="' + esc(item.key) + '"' + (on ? ' checked' : '') +
        ' aria-label="' + esc(item.key) + ' diverges from guidelines"></label></td>';
    }

    /**
     * BULK-3: the tick column's HEADING — which is itself the bulk action. Clicking it
     * applies the selected control to every row the table is currently showing, or (when
     * they all already carry it) removes it from all of them, exactly like RV9-1.
     *
     * This replaced a separate "Apply to all N shown" button in the tools rail. Two
     * things were wrong with that: the control that fills a column sat nowhere near the
     * column, and the rail is not re-rendered while you type in the search box, so its
     * count went stale the moment the table narrowed. Sitting in the table, this heading
     * is re-rendered with the rows it counts.
     *
     * Returned as its own string (not baked into renderTableHtml) so a row tick can
     * refresh JUST this button in place — a tick suppresses the full re-render to keep
     * the page still, and without this the heading would still read "✓ Apply all 3"
     * after you had ticked all three by hand, while the click would in fact REMOVE.
     *
     * @param {Project} project @param {string} dsId @param {Object} ui @param {number} nShown
     * @returns {string} the <button> HTML (no <th> wrapper)
     */
    function applyHeadButton(project, dsId, ui, nShown) {
      var controlId = (ui || {}).applyControlId;
      // The plan comes from the SAME helper the click handler uses, so the count promised
      // here and the set acted on there cannot drift apart.
      var plan = controlId ? App.ui.model.applyAllShownPlan(project, dsId, ui, controlId) : null;
      var can = !!(plan && nShown);
      var label = !plan ? '✓ Apply' : plan.removing ? '✕ Remove all ' + nShown : '✓ Apply all ' + nShown;
      var title = !plan
        ? 'Tick a row to add the selected control to it. Pick a control in the Tools panel and this heading applies it to every row shown.'
        : !nShown ? 'No rows are shown — adjust the search or filters'
        : plan.removing
          ? 'Every row currently shown already has this control — click to remove it from all ' + nShown
          : 'Click to add this control to the ' + plan.changing + ' of ' + nShown + ' shown row(s) that do not have it yet. The search and filters decide what "shown" means.';
      return '<button type="button" class="apply-col-all' + (plan && plan.removing ? ' danger' : '') + '"' +
        ' data-apply-all="' + esc(dsId) + '"' + (can ? '' : ' disabled') +
        ' title="' + esc(title) + '">' + esc(label) + '</button>';
    }

    /**
     * DEV-1: the device tick column's HEADING, which is itself the bulk action — the twin
     * of applyHeadButton, and deliberately identical in behaviour: it assigns every row
     * the table is currently showing to the selected device, or (when they all already
     * apply to it) takes them all off. Same reasoning for it living in the table rather
     * than the rail: the count has to be re-rendered with the rows it counts.
     * @param {Project} project @param {string} dsId @param {Object} ui @param {number} nShown
     * @returns {string} the <button> HTML (no <th> wrapper)
     */
    function assignHeadButton(project, dsId, ui, nShown) {
      var deviceId = (ui || {}).assignDeviceId;
      var dc = deviceId ? (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0] : null;
      var carries = !!(dc && App.registry.deviceHasDataset(project, dc, dsId));
      var plan = carries ? App.ui.model.assignAllShownPlan(project, dsId, ui, deviceId) : null;
      var can = !!(plan && nShown);
      var label = !plan ? '✓ Assign' : plan.removing ? '✕ Remove all ' + nShown : '✓ Assign all ' + nShown;
      var title = !dc ? 'Pick a device in the Tools panel, then tick the rows that apply to it — or use this heading to do the whole shown set at once.'
        : !carries ? dc.name + ' has no capture for this register, so nothing here can be assigned to it.'
        : !nShown ? 'No rows are shown — adjust the search or filters'
        : plan.removing
          ? 'Every row currently shown already applies to ' + dc.name + ' — click to take all ' + nShown + ' off it'
          : 'Click to assign the ' + plan.changing + ' of ' + nShown + ' shown row(s) that do not yet apply to ' + dc.name + '. The search and filters decide what "shown" means.';
      return '<button type="button" class="apply-col-all' + (plan && plan.removing ? ' danger' : '') + '"' +
        ' data-assign-all="' + esc(dsId) + '"' + (can ? '' : ' disabled') +
        ' title="' + esc(title) + '">' + esc(label) + '</button>';
    }

    /**
     * BULK-4: the value tick column's HEADING, which is itself the bulk action — the
     * third sibling of applyHeadButton/assignHeadButton and deliberately identical in
     * behaviour: it sets the chosen value on every row the table is currently showing,
     * or (when they all already carry it) clears it from all of them.
     * @param {Project} project @param {string} dsId @param {Object} ui
     * @param {number} nShown @param {DatasetAdapter} adapter
     * @returns {string} the <button> HTML (no <th> wrapper)
     */
    function valueHeadButton(project, dsId, ui, nShown, adapter) {
      var spec = valueApplySpec(adapter, ui);
      var plan = spec && spec.value ? App.ui.model.valueAllShownPlan(project, dsId, ui, spec.read, spec.value) : null;
      var can = !!(plan && nShown);
      var what = spec ? spec.label.toLowerCase() : 'value';
      var label = !plan ? '✓ Set' : plan.removing ? '✕ Clear all ' + nShown : '✓ Set all ' + nShown;
      var title = !plan
        ? 'Pick a value in the Tools panel, then tick rows — or use this heading to set it on every row shown.'
        : !nShown ? 'No rows are shown — adjust the search or filters'
        : plan.removing
          ? 'Every row currently shown already has this ' + what + ' — click to clear it from all ' + nShown
          : 'Click to set this ' + what + ' on the ' + plan.changing + ' of ' + nShown + ' shown row(s) that do not have it. The search and filters decide what "shown" means.';
      return '<button type="button" class="apply-col-all' + (plan && plan.removing ? ' danger' : '') + '"' +
        ' data-value-all="' + esc(dsId) + '"' + (can ? '' : ' disabled') +
        ' title="' + esc(title) + '">' + esc(label) + '</button>';
    }

    /**
     * SORT-1: the tooltip on a column heading — what the next click on it will do.
     *
     * Reads the same App.ui.model.nextSort the click handler runs, so the promise and the
     * action are the same function; the third state exists only if something says so.
     * @param {{sortKey?:string,sortDir?:string}} ui @param {string} col
     * @returns {string}
     */
    function sortHint(ui, col) {
      var next = App.ui.model.nextSort(ui, col);
      if (!next.sortKey) return 'Sorted by this column. Click to sort by nothing — the rows go back to register order.';
      return 'Click to sort by this column, ' + (next.sortDir === 'desc' ? 'descending' : 'ascending') + '.';
    }

