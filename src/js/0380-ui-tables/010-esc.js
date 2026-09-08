  /* =============================================================================
   * MODULE: App.ui.tables
   * PURPOSE: Render a data-driven data-table tab to an HTML string (spec §11.2).
   *          Columns come from adapter.columns plus computed "Applies to"/"Status".
   *          NO hardcoded dataset branching — fully data-driven.
   * PURITY:  render returns a string (pure); escaping via App.util.html.esc.
   * DEPENDS: App.registry, App.ui.model, App.util.html
   * INVARIANTS: every cell value passes through esc(); undecided rows flagged.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;

    // review-13 #3: one source of truth for the Undo/Redo button tooltips (the toolbar
    // renders them; App.ui.app re-syncs them in place after a suppressed re-render).
    var UNDO_OFF_TITLE = 'Nothing to undo yet — no change has been made in this table this session';
    var REDO_OFF_TITLE = 'Nothing to redo — redo becomes available after an undo';
    function undoTitle(label) { return 'Undo the ' + (label || 'last change') + ' — restores this table to its state just before that change'; }
    function redoTitle(label) { return 'Redo the ' + (label || 'undone change'); }

    /**
     * COL-1: the column picker. One tick per column, sitting above the table it governs,
     * so hiding a column is where the columns are rather than buried in a settings menu.
     * The dataset's key column is shown as a locked chip rather than an unticked box: it
     * is not a choice you are being denied, it is not a choice at all.
     *
     * `adapter` is optional — without it (older callers, and the toolbar tests) no bar is
     * rendered and every column stays visible.
     * @param {string} dsId @param {Object} ui @param {DatasetAdapter} [adapter]
     * @returns {string} HTML
     */
    function renderColumnBar(dsId, ui, adapter) {
      if (!adapter) return '';
      var locked = lockedColumnKey(adapter);
      var all = allColumns(adapter);
      var hidden = (ui && ui.hiddenCols) || {};
      var lockedCol = all.filter(function (c) { return c.key === locked; })[0];
      var boxes = all.filter(function (c) { return c.key !== locked; }).map(function (c) {
        return '<label class="col-vis-opt"><input type="checkbox" data-col-vis="' + esc(c.key) + '" data-ds="' + esc(dsId) + '"' +
          (hidden[c.key] ? '' : ' checked') + ' aria-label="Show the ' + esc(c.label) + ' column"> ' + esc(c.label) + '</label>';
      }).join('');
      var nShown = visibleColumns(adapter, ui || {}).length;
      return '<div class="col-visbar">' +
        '<span class="col-visbar-label">Columns:</span>' +
        // The key column reads as a plain "always shown" chip rather than a box you are
        // not allowed to untick — it is not a choice being denied, it is not a choice.
        (lockedCol ? '<span class="col-vis-fixed" title="' + esc(lockedCol.label) +
          ' identifies the row and is what the generated output acts on, so it is always shown.">' +
          esc(lockedCol.label) + ' &middot; always shown</span>' : '') +
        boxes +
        '<button type="button" data-col-vis-all="' + esc(dsId) + '" title="Show every column">All</button>' +
        '<button type="button" data-col-vis-none="' + esc(dsId) + '" title="Hide everything except ' + esc(lockedCol ? lockedCol.label : 'the key') + '">None</button>' +
        '<span class="muted col-vis-count" style="font-size:12px">' + nShown + ' of ' + all.length +
        ' shown — hiding a column also clears its filter.</span>' +
        '</div>';
    }

    /**
     * CUS-2: the create-a-row bar, for datasets whose items are AUTHORED rather than
     * captured. Nothing is rendered for Packages/Tactical — a row there without a
     * capture behind it would never be applicable to any device, so the absence of this
     * bar is the honest answer rather than a missing feature.
     *
     * The name is the only thing asked for. Everything else (description, the action
     * itself, control refs, rationale, rollback) is edited in the row the moment it
     * exists, which is where those boxes already live for every other dataset — a
     * six-field creation dialog would be a second, divergent editor for the same item.
     * @param {string} dsId @param {Object} ui @param {?DatasetAdapter} adapter
     * @returns {string} HTML
     */
    function renderAddBar(dsId, ui, adapter) {
      if (!adapter || !adapter.userCreatable) return '';
      var noun = adapter.newItemNoun || 'item';
      var err = (ui && ui.addError) ? '<div class="add-item-error" role="alert">' + esc(ui.addError) + '</div>' : '';
      return '<div class="add-item-bar">' +
        '<label class="add-item-label" for="add-item-' + esc(dsId) + '">New ' + esc(noun) + '</label>' +
        '<input type="text" id="add-item-' + esc(dsId) + '" class="add-item-key" data-add-item-key="' + esc(dsId) + '"' +
          ' placeholder="Name it — e.g. Knox tactical passcode" value="' + esc((ui && ui.addKey) || '') + '"' +
          ' aria-label="Name of the new ' + esc(noun) + '">' +
        '<button type="button" class="primary" data-add-item="' + esc(dsId) + '"' +
          ' title="Add this ' + esc(noun) + ' to the register, then fill in the action, control and rationale on its row">+ Add ' + esc(noun) + '</button>' +
        '<span class="muted add-item-hint">' + esc(adapter.newItemHint || '') + '</span>' +
        err +
        '</div>';
    }

    /** The adapter's ENUM primary decision field, if it declares one (DOD-11: found, not
     *  named). Today only packages has one — action: keep/disable/remove. */
    function enumDecisionField(adapter) {
      return ((adapter && adapter.decisionSchema) || []).filter(function (f) { return f.kind === 'enum'; })[0] || null;
    }

    /**
     * BULK-4: the rail's "pick a thing, then tick the rows" MODES, declared rather than
     * hand-wired. Each owns the same tick column, so they are mutually exclusive; the
     * blocking messages between them are generated from `name` below.
     *
     * `offered(adapter)` is how a mode stays out of a table it cannot act on. The decision
     * mode is offered only where the adapter declares an ENUM primary decision field,
     * because "pick one of these" is the only decision shape a picker can bulk-apply —
     * a free-text or typed value needs a different control, and guessing one here would
     * be worse than not offering it. Discovered from decisionSchema, never a dataset id.
     */
    var PICK_MODES = [
      { id: 'apply', flag: 'applyMode', pick: 'applyControlId', attr: 'data-apply-toggle',
        label: 'Apply Control Mode', exit: 'Exit control mode', name: 'Apply Control Mode',
        hint: 'Bulk-assign a control to many items via row checkboxes',
        offered: function () { return true; } },
      { id: 'assign', flag: 'assignMode', pick: 'assignDeviceId', attr: 'data-assign-toggle',
        label: 'Assign to Device', exit: 'Exit device mode', name: 'Assign to Device Mode',
        hint: 'Choose a device, then tick which items apply to it',
        offered: function () { return true; } },
      { id: 'relevance', flag: 'relevanceMode', pick: 'relevanceValue', attr: 'data-relevance-toggle',
        label: 'Apply Security Relevance', exit: 'Exit relevance mode', name: 'Apply Security Relevance Mode',
        hint: 'Choose a Security Relevance, then tick the items to set it on',
        offered: function () { return true; } },   // relevance is a core column, on every dataset
      { id: 'decision', flag: 'decisionMode', pick: 'decisionValue', attr: 'data-decision-toggle',
        label: 'Apply Decision', exit: 'Exit decision mode', name: 'Apply Decision Mode',
        hint: 'Choose a decision, then tick the items to set it on',
        offered: function (adapter) { return !!enumDecisionField(adapter); } }
    ];
    /** Delete is a mode too, but it ARMS rather than picking, so it is not in PICK_MODES. */
    var DELETE_MODE_NAME = 'Delete Mode';

    /**
     * BULK-4: "which other mode is in the way", as the message its button should show.
     * @param {Object} ui @param {string} id  the mode being rendered
     * @returns {?string} null when nothing blocks it
     */
    function blockedBy(ui, id) {
      if (id !== 'delete' && ui.deleteMode) return 'Finish or cancel ' + DELETE_MODE_NAME + ' first';
      var other = PICK_MODES.filter(function (m) { return m.id !== id && ui[m.flag]; })[0];
      return other ? 'Exit ' + other.name + ' first' : null;
    }

    /**
     * BULK-4: the two "set a value on many rows" modes — Security Relevance and the
     * decision itself — described as ONE thing, because they are one thing: choose a
     * value in the rail, tick the rows that should carry it. Only the value list and the
     * field being written differ, so they share the tick column, the heading action, the
     * plan helper and the wiring.
     *
     * Returns null when neither mode is armed (or the decision mode is armed on a dataset
     * that has no enum decision, which the button should already have prevented).
     *
     * @param {DatasetAdapter} adapter @param {Object} ui
     * @returns {?{mode:string, field:string, label:string, railLabel:string, value:?string,
     *             options:Array<{value:string,html:string}>, read:function(RegisterItem):string}}
     */
    function valueApplySpec(adapter, ui) {
      ui = ui || {};
      if (ui.relevanceMode) {
        return {
          mode: 'relevance', field: 'relevance',
          label: 'Relevance', railLabel: 'Security Relevance to apply',
          value: ui.relevanceValue || null,
          options: App.projectIo.RELEVANCE_OPTIONS.map(function (v) {
            return { value: v, html: relevanceBadge(v) };
          }),
          read: function (it) { return it.relevance || ''; }
        };
      }
      if (ui.decisionMode) {
        var f = enumDecisionField(adapter);
        if (!f) return null;
        return {
          mode: 'decision', field: f.name,
          label: f.label || f.name, railLabel: 'Decision to apply',
          value: ui.decisionValue || null,
          options: (f.options || []).map(function (v) {
            return { value: v, html: '<span class="badge">' + esc(v) + '</span>' };
          }),
          read: function (it) {
            return (it.decision && it.decision[f.name] != null) ? String(it.decision[f.name]) : '';
          }
        };
      }
      return null;
    }

    /**
     * Render the toolbar (search/incomplete/count) for a dataset tab.
     * Kept separate from the table body so the search input is NOT re-rendered on
     * keystroke (preserves focus); only #table-host updates.
     */
    function renderToolbar(dsId, ui, total, shown, controls, undo, adapter, project) {
      var deleteMode = !!ui.deleteMode, assignMode = !!ui.assignMode;
      // BULK-4: the bulk modes are mutually exclusive (they own the same tick column), so
      // every one of them is disabled while another is armed and says which to leave.
      // Declared and generated rather than hand-wired: there were three, there are now
      // five, and the pairwise "which message does THIS button show" logic was already
      // the messiest thing in this function at three.
      var modeBtns = PICK_MODES.filter(function (m) { return m.offered(adapter); }).map(function (m) {
        var on = !!ui[m.flag];
        return '<button ' + m.attr + '="' + esc(dsId) + '"' + (on ? ' class="active"' : '') + (blockedBy(ui, m.id) ? ' disabled' : '') +
          ' title="' + esc(blockedBy(ui, m.id) || m.hint) + '">' + esc(on ? m.exit : m.label) + '</button>';
      }).join('');
      // review-12 #2: "Delete Items" is the odd one out — it ARMS rather than picking, so
      // it keeps its own button (danger styling, a live count, and a Cancel beside it).
      var selCount = Object.keys(ui.deleteSel || {}).filter(function (k) { return (ui.deleteSel || {})[k]; }).length;
      var deleteBlocked = blockedBy(ui, 'delete');
      var deleteBtn = '<button data-delete-toggle="' + esc(dsId) + '"' + (deleteMode ? ' class="active danger"' : ' class="danger"') + (deleteBlocked ? ' disabled' : '') +
        ' title="' + esc(deleteBlocked || (deleteMode ? 'Delete every ticked item' : 'Tick rows, then click again to delete them')) + '">' +
        (deleteMode ? 'Delete selected (' + selCount + ')' : 'Delete Items') + '</button>' +
        (deleteMode ? '<button data-delete-cancel="' + esc(dsId) + '" title="Leave Delete Mode without deleting anything">Cancel</button>' : '');
      // UNDO-1: undo + redo of the last ACTION in THIS dataset — any action, not just the
      // bulk modes: a decision, a rationale, a rename, a delete, a whole apply run. One
      // action is one click of Undo regardless of how many rows it touched. Both buttons
      // are greyed out until there is something to step to.
      var canUndo = !!(undo && undo.canUndo), canRedo = !!(undo && undo.canRedo);
      var undoBtn = '<button data-undo="' + esc(dsId) + '"' + (canUndo ? '' : ' disabled') +
        ' title="' + esc(canUndo ? undoTitle(undo.label) : UNDO_OFF_TITLE) + '">↶ Undo</button>' +
        '<button data-redo="' + esc(dsId) + '"' + (canRedo ? '' : ' disabled') +
        ' title="' + esc(canRedo ? redoTitle(undo.redoLabel) : REDO_OFF_TITLE) + '">↷ Redo</button>';
      // BULK-1 (amended by BULK-3): applying the selected control to EVERY ROW CURRENTLY
      // SHOWN — whatever the search box and filters have narrowed the table to — is done
      // by clicking the "✓ Apply" heading above the tick column; renderTableHtml owns
      // that button. The rail used to carry a second button saying the same thing, which
      // meant the bulk action lived nowhere near the column it fills. What stays here is
      // the EXPLANATION: a clickable column heading is not self-evident, and the count is
      // what makes clicking it safe to trust.
      // The note deliberately carries NO count: this toolbar is not re-rendered while you
      // type in the search box (that would steal focus), so any number here would go
      // stale the moment the table narrowed. The heading itself is part of the table, so
      // its count is always the one that will be acted on.
      // DEV-1: the same explanation for the device column's heading.
      var assignToHtml = '';
      if (ui.assignMode) {
        assignToHtml = '<div class="muted apply-all-note">' + (ui.assignDeviceId
          ? 'Tick rows one at a time, or click the <strong>✓ Assign</strong> heading at the top of the tick column to make <strong>every row the table is showing</strong> apply to this device. Narrow the table with the search box and the column filters first.'
          : 'Choose a device above, then tick the rows that apply to it — or use the <strong>✓ Assign</strong> column heading for everything the table is currently showing.') +
          '</div>';
      }
      var applyToHtml = '';
      if (ui.applyMode && (controls || []).length) {
        applyToHtml = '<div class="muted apply-all-note">' + (ui.applyControlId
          ? 'Tick rows one at a time, or click the <strong>✓ Apply</strong> heading at the top of the tick column to apply this control to <strong>every row the table is showing</strong> in one go — the heading says how many. Narrow the table with the search box and the column filters first.'
          : 'Choose a control above, then tick rows — or click the <strong>✓ Apply</strong> column heading to apply it to everything the table is currently showing.') +
          '</div>';
      }
      // BULK-4: the same explanation again for the shared value column's heading. One
      // sentence covers both modes because the gesture is genuinely the same.
      var valueSpec = valueApplySpec(adapter, ui);
      var valueToHtml = '';
      if (valueSpec) {
        valueToHtml = '<div class="muted apply-all-note">' + (valueSpec.value
          ? 'Tick rows one at a time, or click the <strong>✓ Set</strong> heading at the top of the tick column to give <strong>every row the table is showing</strong> this ' + esc(valueSpec.label.toLowerCase()) + '. Narrow the table with the search box and the column filters first.'
          : 'Choose a value above, then tick the rows to set it on — or use the <strong>✓ Set</strong> column heading for everything the table is currently showing.') +
          '</div>';
      }
      // REL-8: one Include toggle per PARKED category, generated from the vocabulary
      // rather than listed here — so the toolbar follows RELEVANCE_PARKED and cannot
      // drift from the filter. Off (the default) the table hides that category; on, it
      // is shown ALONGSIDE everything else rather than instead of it.
      var on = ui.includeRelevance || [];
      var parked = App.projectIo.RELEVANCE_PARKED;
      function includeToggle(value) {
        var active = on.indexOf(value) !== -1;
        return '<label class="rel-view ' + relevanceClass(value) + (active ? ' active' : '') + '"><input type="checkbox" data-include-rel="' + esc(value) + '"' + (active ? ' checked' : '') +
          ' title="Also show items marked ' + esc(value) + ' (hidden by default)"> Include ' + esc(value.toLowerCase()) + '</label>';
      }
      var parkedToggles = parked.map(includeToggle).join('');
      var hidden = parked.filter(function (v) { return on.indexOf(v) === -1; });
      var parkedNote = hidden.length
        ? '<span class="muted">' + hidden.map(esc).join(' &amp; ') + ' items are hidden.</span>'
        : '<span class="muted">Every item is in view.</span>';
      // FIL-1: never let the table look mysteriously short — say what is narrowing it.
      var cf = ui.colFilters || {};
      var cfKeys = Object.keys(cf).filter(function (k) { return cf[k]; });
      var filterNote = cfKeys.length
        ? '<span class="muted filter-note">' + cfKeys.length + ' column filter' + (cfKeys.length === 1 ? '' : 's') +
          ' active <button type="button" class="filter-clear" data-col-filter-clear="' + esc(dsId) + '" title="Clear every column filter">clear</button></span>'
        : '';

      // v2.1 (SP-1): the MODE controls (Apply Control Mode, Delete Items, Undo/Redo)
      // and the control picker no longer live in this toolbar — they moved to the
      // sticky side rail below, so changing the selected control no longer means
      // scrolling a 438-row table back to the top. Everything here is a FILTER.
      var railCollapsed = !!ui.railCollapsed;
      return '' +
        '<div class="toolbar">' +
        '<input class="grow" type="search" placeholder="Search key or description…" data-search="' + esc(dsId) + '" value="' + esc(ui.search || '') + '" aria-label="Search items">' +
        '<label><input type="checkbox" data-incomplete="' + esc(dsId) + '"' + (ui.incompleteOnly ? ' checked' : '') + '> Incomplete only</label>' +
        parkedToggles +
        '<span class="muted">' + esc(shown) + ' of ' + esc(total) + ' shown</span>' + parkedNote + filterNote +
        '</div>' +
        // CUS-2: the "add" bar for a hand-authored register (Custom Security Actions).
        // It sits ABOVE the table rather than in the tools rail, because the rail is the
        // bulk-edit surface and is identical on every data tab — creating a row is not a
        // mode you enter, it is a thing you do to this table, so it belongs over it.
        renderAddBar(dsId, ui, adapter) +
        // COL-1: OUTSIDE .toolbar on purpose — updateShownCount() addresses the row count
        // as the toolbar's first .muted, and the column count must not steal that place.
        renderColumnBar(dsId, ui, adapter) +
        '<div class="table-wrap' + (railCollapsed ? ' rail-collapsed' : '') + '">' +
          '<div id="table-host"></div>' +
          renderSideRail(dsId, ui, controls, { modeBtns: modeBtns, deleteBtn: deleteBtn, undoBtn: undoBtn,
            applyTo: applyToHtml, assignTo: assignToHtml, valueTo: valueToHtml, valueSpec: valueSpec }, project) +
        '</div>';
    }

    /**
     * CTLSORT-1: how the rail's control list is ordered. `az` is the default and is what
     * the picker always did; `type` clusters each framework's controls together (all ISM,
     * then all AHG) with a heading per group, for working through one at a time.
     *
     * Tag is deliberately NOT an ordering. A control may carry SEVERAL tags, so grouping
     * by tag would list the same control under each of them — the same card appearing
     * three times in a picker whose whole job is "choose one". As a FILTER the same
     * information narrows the list without duplicating anything, so that is what it is.
     */
    var RAIL_SORTS = [
      { id: 'az', label: 'A→Z' },
      { id: 'type', label: 'By type' }
    ];
    /** The tag filter's "no tag at all" option — shares FIL-3's private-use sentinel so
     *  an empty <select> value can still mean "any tag". */
    var RAIL_TAG_NONE = App.ui.model.FILTER_NONE;

    function railSortId(ui) {
      var want = (ui && ui.railSort) || 'az';
      return RAIL_SORTS.some(function (s) { return s.id === want; }) ? want : 'az';
    }
    function byTitle(a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; }

    /**
     * CTLSORT-1: the rail's control list — the text filter, the tag filter and the chosen
     * order, applied together. Pure, so the picker and its count cannot disagree.
     * @param {Control[]} controls @param {Object} ui
     * @returns {Control[]}
     */
    function railControls(controls, ui) {
      ui = ui || {};
      var out = (controls || []).slice();
      var filter = String(ui.railSearch || '').toLowerCase();
      if (filter) {
        out = out.filter(function (c) {
          return (c.title || '').toLowerCase().indexOf(filter) !== -1 ||
                 (c.description || '').toLowerCase().indexOf(filter) !== -1 ||
                 (c.type || '').toLowerCase().indexOf(filter) !== -1;
        });
      }
      var tag = ui.railTag || '';
      if (tag === RAIL_TAG_NONE) out = out.filter(function (c) { return !(c.tags || []).length; });
      else if (tag) out = out.filter(function (c) { return (c.tags || []).indexOf(tag) !== -1; });
      out.sort(byTitle);
      if (railSortId(ui) === 'type') {
        // Sort by type FIRST but keep the title order within it — a stable sort would do,
        // and comparing the title as a tie-break says so rather than relying on it.
        out.sort(function (a, b) {
          var at = a.type || '', bt = b.type || '';
          return at < bt ? -1 : at > bt ? 1 : byTitle(a, b);
        });
      }
      return out;
    }

    /**
     * CTLSORT-1: the same list broken into rendered groups. One unlabelled group for the
     * A→Z order; one labelled group per type otherwise.
     * @returns {Array<{label:?string, items:Control[]}>}
     */
    function railGroups(list, ui) {
      if (railSortId(ui) !== 'type') return list.length ? [{ label: null, items: list }] : [];
      var groups = [], last = null;
      list.forEach(function (c) {
        var t = c.type || '(no type)';
        if (!last || last.label !== t) { last = { label: t, items: [] }; groups.push(last); }
        last.items.push(c);
      });
      return groups;
    }

