    /**
     * Render the data table (header + body), with inline decision editing and a
     * per-row expander for description/ISM/rationale/rollback (spec §11.2).
     * @param {Project} project
     * @param {string} dsId
     * @param {Object} ui   per-dataset UI state (search/sort/incompleteOnly/expanded)
     * @param {{issues?:Object}} [opts]
     * @returns {string} HTML
     */
    function renderTableHtml(project, dsId, ui, opts) {
      opts = opts || {};
      var expanded = ui.expanded || {};
      var adapter = App.registry.getDataset(project.platformProfileId, dsId);
      if (!adapter) return '<div class="empty-state">No adapter for ' + esc(dsId) + '.</div>';
      var captured = buildCapturedMap(project, dsId);
      var controls = project.controls || [];
      var controlsById = {}; controls.forEach(function (c) { controlsById[c.id] = c; });
      // review-12 #3: "Security Relevance" is a core (dataset-independent) column, so it
      // is appended for every dataset rather than duplicated in each adapter — see
      // coreColumns(). COL-1: what is actually rendered is that list minus whatever the
      // column picker has hidden (the key column excepted; it cannot be hidden).
      var cols = visibleColumns(adapter, ui);
      var rows = App.ui.model.filterSortRows(project, dsId, adapter, ui);
      // SORT-1: '' when the sorting rule has been cycled off — then no heading is marked.
      var sk = App.ui.model.sortKeyOf(ui), sdir = ui.sortDir || 'asc';
      // review-7 #2: an extra checkbox column when Apply Control Mode is on.
      var applyMode = !!ui.applyMode, applyControlId = ui.applyControlId;
      // review-12 #2: likewise for Delete Mode (the three modes are mutually exclusive).
      var deleteMode = !!ui.deleteMode, deleteSel = ui.deleteSel || {};
      // DEV-1: …and for Assign to Device Mode, whose tick column is the applicability of
      // each row to ONE chosen device.
      var assignMode = !!ui.assignMode, assignDeviceId = ui.assignDeviceId;
      var assignDc = assignDeviceId ? (project.deviceConfigs || []).filter(function (c) { return c.id === assignDeviceId; })[0] : null;
      var assignOk = !!(assignDc && App.registry.deviceHasDataset(project, assignDc, dsId));
      var assignSet = assignOk ? App.ui.model.deviceAppliesSet(project, dsId, assignDeviceId) : {};
      // BULK-4: …and one tick column shared by the two "set a value" modes (relevance and
      // the decision), which are the same gesture over a different field.
      var valueSpec = valueApplySpec(adapter, ui);
      var colspan = cols.length + 1 + (applyMode ? 1 : 0) + (deleteMode ? 1 : 0) + (assignMode ? 1 : 0) + (valueSpec ? 1 : 0); // + leading expander (+ mode col)

      var applyHead = applyMode ? '<th class="apply-col" scope="col">' + applyHeadButton(project, dsId, ui, rows.length) + '</th>' : '';
      var assignHead = assignMode ? '<th class="dev-col" scope="col">' + assignHeadButton(project, dsId, ui, rows.length) + '</th>' : '';
      var valueHead = valueSpec ? '<th class="val-col" scope="col">' + valueHeadButton(project, dsId, ui, rows.length, adapter) + '</th>' : '';

      var colWidths = ui.colWidths || {};
      var head = '<th class="lead-col" scope="col" aria-label="expand"></th>' + cols.map(function (c) {
        var arrow = (sk && c.key === sk) ? ' <span class="arrow">' + (sdir === 'asc' ? '▲' : '▼') + '</span>' : '';
        var w = colWidths[c.key] || colDefaultWidth(c.key, dsId);
        var cls = c.key === 'diverges' ? ' class="div-col"' : '';   // DIV-1: a tick column, centred
        // SORT-1: the heading says what the NEXT click will do, because a third state is
        // not guessable from an arrow — nothing on screen would otherwise announce that
        // clicking again takes the rule away rather than flipping it back.
        return '<th data-col="' + esc(c.key) + '"' + cls + ' scope="col" title="' + esc(sortHint(ui, c.key)) +
          '" style="width:' + w + 'px">' + esc(c.label) + arrow +
          '<span class="col-resize" data-col-resize="' + esc(c.key) + '" title="Drag to resize"></span></th>';
      }).join('') + applyHead + assignHead + valueHead +
        (deleteMode ? '<th class="del-col" scope="col" title="Tick the items to delete, then click Delete selected">🗑 Delete</th>' : '');

      // FIL-1: a filter row directly beneath the headers — one dropdown per filterable
      // column, sitting under the column it filters so there is no doubt which is which.
      // Which columns get one is discovered from the adapter (App.ui.model), so nothing
      // here is dataset-specific.
      var filterable = {};
      App.ui.model.filterableColumns(project, dsId, adapter).forEach(function (f) { filterable[f.key] = f; });
      var active = (ui.colFilters || {});
      var anyActive = Object.keys(active).some(function (k) { return active[k]; });
      var filterRow = '<tr class="filter-row"><th class="lead-col">' +
        (anyActive ? '<button type="button" class="filter-clear" data-col-filter-clear="' + esc(dsId) + '" title="Clear every column filter">✕</button>' : '') +
        '</th>' +
        cols.map(function (c) {
          var f = filterable[c.key];
          if (!f) return '<th></th>';
          var cur = active[c.key] || '';
          return '<th><select class="col-filter' + (cur ? ' on' : '') + '" data-col-filter="' + esc(dsId) + '" data-col="' + esc(c.key) + '"' +
            ' aria-label="Filter by ' + esc(f.label) + '" title="Show only rows whose ' + esc(f.label) + ' matches">' +
            '<option value="">' + esc(c.label) + ': any</option>' +
            f.options.map(function (o) {
              return '<option value="' + esc(o.value) + '"' + (cur === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
            }).join('') + '</select></th>';
        }).join('') +
        (applyMode ? '<th></th>' : '') + (assignMode ? '<th></th>' : '') + (valueSpec ? '<th></th>' : '') + (deleteMode ? '<th></th>' : '') +
        '</tr>';

      /**
       * One cell, chosen by COLUMN KEY rather than by position — COL-1 means the set of
       * columns is no longer fixed, so the body cannot be "the adapter's cells, then the
       * three core ones" any more. Every column, the adapter's and the core ones alike,
       * is rendered from this one place, and the header, the filter row and the body all
       * walk the SAME `cols` list.
       */
      function cellHtml(colKey, r) {
        if (colKey === 'decision') {
          var iss = (opts.issues && opts.issues[dsId + '|' + r.item.key]) || [];
          // VF-7: a value that violates its declared format is invalid even when the
          // adapter is happy with it, and the reason is shown in the cell's title so
          // the operator is not left guessing why a row is tinted.
          var fIss = (App.completeness && App.completeness.formatIssues)
            ? App.completeness.formatIssues(adapter, r.item, project, captured) : [];
          var allIss = iss.concat(fIss);
          var invalid = allIss.some(function (i) { return i.severity === 'error'; });
          var why = invalid ? ' title="' + esc(allIss.map(function (i) { return i.message; }).join(' ')) + '"' : '';
          return '<td class="dcell' + (invalid ? ' invalid' : '') + '" data-ds="' + esc(dsId) + '" data-key="' + esc(r.item.key) + '"' + why + '>' +
            renderDecisionControl(adapter, dsId, r.item, captured, project) + '</td>';
        }
        if (colKey === 'controlRefs') {
          // Resolve control ids to titles for display (spec §18.3 CTL-5).
          var titles = (r.item.controlRefs || []).map(function (id) { return controlsById[id] ? controlsById[id].title : id; });
          // STAB-1: clamped — this is the cell that grows the instant you tick Apply.
          return '<td>' + clampCell(titles.join(', ')) + '</td>';
        }
        if (colKey === 'relevance') return relevanceCell(dsId, r.item);
        // DEV-1: tagged with its row key so a device tick can repaint just this cell — the
        // tick suppresses the full re-render (STAB-3), and the names here are exactly what
        // the tick changes.
        if (colKey === 'appliesTo') return '<td data-applies-cell="' + esc(r.item.key) + '">' + clampCell(r.appliesTo.join(', ')) + '</td>';   // STAB-1
        if (colKey === 'status') {
          // review-17 #3: the status badge is a toggle — clicking it flips the item
          // between decided (adopting what the value editor shows) and undecided.
          var statusAttrs = ' role="button" tabindex="0" data-status-toggle data-ds="' + esc(dsId) + '" data-key="' + esc(r.item.key) + '"';
          // HELD-1: three states, not two. A HELD item is undecided *and* still holds its
          // value, so it gets its own badge — otherwise you could not tell, at a glance,
          // which undecided rows are "never answered" and which are "answered, re-check me".
          return '<td>' + (r.item.held
            ? '<span class="badge held flip"' + statusAttrs + ' title="Flagged for review — the recorded value is kept. Click to accept it and mark this item decided.">review</span>'
            : r.item.status === 'decided'
              ? '<span class="badge decided flip"' + statusAttrs + ' title="Click to flag for review — the value is kept, the item just stops counting as decided">decided</span>'
              : '<span class="badge undecided flip"' + statusAttrs + ' title="Click to accept the value shown and mark this item decided">undecided</span>') + '</td>';
        }
        if (colKey === 'diverges') return divergesCell(dsId, r.item);   // DIV-1
        return '<td>' + esc(r.cells[colKey] == null ? '' : r.cells[colKey]) + '</td>';
      }

      var body = rows.map(function (r) {
        var isOpen = !!expanded[r.item.key];
        var lead = '<td><button class="expand-btn" data-expand-key="' + esc(r.item.key) + '" aria-expanded="' + isOpen + '" title="Edit details">' + (isOpen ? '▾' : '▸') + '</button></td>';
        // EDIT-1: mark the cells that are a way INTO the row's editor. The attributes go
        // on the <td> the handler will match, and the hint goes on its title so the
        // gesture is discoverable by hovering rather than by being told about it.
        var tds = cols.map(function (c) {
          var html = cellHtml(c.key, r);
          var tgt = cellEditTarget(adapter, c.key);
          if (!tgt) return html;
          return html.replace('<td', '<td class="ec" data-edit-col="' + esc(c.key) + '" data-key="' + esc(r.item.key) +
            '" title="' + esc(cellEditHint(tgt)) + '"');
        }).join('');
        if (applyMode) {
          // Checked iff the SELECTED control is already in this item's controlRefs
          // (so the box always reflects current membership).
          var checked = applyControlId && (r.item.controlRefs || []).indexOf(applyControlId) !== -1;
          // BULK-2: the whole cell is the hit target, not just the ~13px box. A <label>
          // filling the cell means a click anywhere in the column toggles it — and it
          // stays a real checkbox for keyboard and screen readers, which a click handler
          // bolted onto the <td> would not be.
          tds += '<td class="apply-cell"><label class="cell-check"><input type="checkbox" data-apply-check data-key="' + esc(r.item.key) + '"' + (checked ? ' checked' : '') + (applyControlId ? '' : ' disabled') + ' aria-label="apply the selected control to ' + esc(r.item.key) + '"></label></td>';
        }
        if (assignMode) {
          // DEV-1: ticked iff the row currently applies to the selected device — the
          // capture folded with the by-hand assignments, so the box reads the same source
          // as the "Applies to" column beside it. Same full-cell hit target as BULK-2.
          var applies = !!assignSet[r.item.key];
          var devTitle = !assignDc ? 'Pick a device in the Tools panel first'
            : !assignOk ? assignDc.name + ' has no capture for this register'
            : applies ? 'Applies to ' + assignDc.name + ' — untick to take it off this device'
              : 'Does not apply to ' + assignDc.name + ' — tick to assign it';
          tds += '<td class="dev-cell"><label class="cell-check" title="' + esc(devTitle) + '">' +
            '<input type="checkbox" data-device-check data-key="' + esc(r.item.key) + '"' + (applies ? ' checked' : '') +
            (assignOk ? '' : ' disabled') + ' aria-label="' + esc(r.item.key) + ' applies to ' + esc(assignDc ? assignDc.name : 'the selected device') + '"></label></td>';
        }
        if (valueSpec) {
          // BULK-4: ticked ⇔ this row already carries the chosen value. Unticking clears
          // the field, which is what makes the gesture reversible without reaching for
          // Undo. Same full-cell hit target as the other two tick columns (BULK-2).
          var has = valueSpec.value != null && valueSpec.read(r.item) === valueSpec.value;
          var vTitle = !valueSpec.value ? 'Pick a value in the Tools panel first'
            : has ? 'Untick to clear this item’s ' + valueSpec.label.toLowerCase()
              : 'Tick to set ' + valueSpec.label.toLowerCase() + ' to ' + valueSpec.value;
          tds += '<td class="val-cell"><label class="cell-check" title="' + esc(vTitle) + '">' +
            '<input type="checkbox" data-value-check data-key="' + esc(r.item.key) + '"' + (has ? ' checked' : '') +
            (valueSpec.value ? '' : ' disabled') + ' aria-label="set ' + esc(valueSpec.label) + ' ' + esc(valueSpec.value || '') + ' on ' + esc(r.item.key) + '"></label></td>';
        }
        var marked = deleteMode && !!deleteSel[r.item.key];
        if (deleteMode) {
          // BULK-2: same click-anywhere target as the apply column.
          tds += '<td class="del-cell"><label class="cell-check"><input type="checkbox" data-delete-check data-key="' + esc(r.item.key) + '"' + (marked ? ' checked' : '') + ' aria-label="delete ' + esc(r.item.key) + '"></label></td>';
        }
        var rowHtml = '<tr class="' + (r.status === 'decided' ? '' : 'undecided') + (marked ? ' del-marked' : '') + '">' + lead + tds + '</tr>';
        if (isOpen) rowHtml += renderDetailRow(dsId, r.item, colspan, opts.issues, controls, project, adapter, captured);
        return rowHtml;
      }).join('');

      if (!rows.length) body = '<tr><td colspan="' + colspan + '" class="muted">No matching items.</td></tr>';

      return '<table class="data resizable"><thead><tr>' + head + '</tr>' + filterRow + '</thead><tbody>' + body + '</tbody></table>';
    }

    App.ui = App.ui || {};
    App.ui.tables = {
      renderToolbar: renderToolbar, renderTableHtml: renderTableHtml, buildCapturedMap: buildCapturedMap,
      sortHint: sortHint,                                     // SORT-1: what the next heading click does
      renderAddBar: renderAddBar,   // CUS-2
      // BULK-3: shared with App.ui.app so a row tick can refresh the heading in place.
      applyHeadButton: applyHeadButton,
      // DEV-1: the device tick column's heading, refreshed in place for the same reason.
      assignHeadButton: assignHeadButton,
      // BULK-4: the shared relevance/decision tick column — its spec, its heading, the
      // rail's mode list, and which other mode is blocking a given one.
      valueApplySpec: valueApplySpec, valueHeadButton: valueHeadButton,
      enumDecisionField: enumDecisionField, PICK_MODES: PICK_MODES, blockedBy: blockedBy,
      // CTLSORT-1: how the rail's control list is ordered, grouped and tag-filtered.
      railControls: railControls, railGroups: railGroups, railSortId: railSortId,
      RAIL_SORTS: RAIL_SORTS, RAIL_TAG_NONE: RAIL_TAG_NONE,
      // EDIT-1: which cells are a way into the row editor, and what they focus.
      cellEditTarget: cellEditTarget, cellEditHint: cellEditHint,
      // VF-8: shared so the device/group OVERRIDE editors get the same format-driven
      // controls as the data table — a boolean must not be a textarea in one place and
      // a true/false picker in the other.
      renderValueEditor: renderValueEditor,
      relevanceBadge: relevanceBadge, relevanceClass: relevanceClass,
      // COL-1: the column set + what the picker is allowed to hide, shared with the
      // controller (the picker handlers, and the CSV export, which shows what the table shows).
      allColumns: allColumns, visibleColumns: visibleColumns, lockedColumnKey: lockedColumnKey,
      // COL-2: the columns a tab starts with hidden (Security Relevance, Diverges).
      DEFAULT_HIDDEN_COLS: DEFAULT_HIDDEN_COLS, defaultHiddenCols: defaultHiddenCols,
      // DIV-1/DIV-3: shared so a tick can repaint just the row's expander and its tooltip.
      detailRowHtml: detailRowHtml, divergesHint: divergesHint,
      undoTitle: undoTitle, redoTitle: redoTitle, UNDO_OFF_TITLE: UNDO_OFF_TITLE, REDO_OFF_TITLE: REDO_OFF_TITLE
    };
  })(App);
