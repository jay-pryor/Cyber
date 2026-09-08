    /** CTLSORT-1: the order selector + the tag filter, above the rail's text filter. */
    function renderRailControlTools(dsId, ui, all) {
      var cur = railSortId(ui);
      var sortSel = '<select class="rail-select" data-rail-sort="' + esc(dsId) + '" aria-label="Order the control list">' +
        RAIL_SORTS.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (cur === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>';
        }).join('') + '</select>';
      // Tags come from the controls actually in this project — an empty vocabulary means
      // no filter to offer, so the selector is left out rather than shown always-empty.
      var tags = {}; (all || []).forEach(function (c) { (c.tags || []).forEach(function (t) { if (t) tags[t] = true; }); });
      var names = Object.keys(tags).sort();
      var tagSel = '';
      if (names.length) {
        var curTag = ui.railTag || '';
        tagSel = '<select class="rail-select' + (curTag ? ' on' : '') + '" data-rail-tag="' + esc(dsId) + '" aria-label="Filter the control list by tag">' +
          '<option value="">any tag</option>' +
          names.map(function (t) {
            return '<option value="' + esc(t) + '"' + (curTag === t ? ' selected' : '') + '>' + esc(t) + '</option>';
          }).join('') +
          '<option value="' + esc(RAIL_TAG_NONE) + '"' + (curTag === RAIL_TAG_NONE ? ' selected' : '') + '>(untagged)</option>' +
          '</select>';
      }
      return '<div class="rail-sort">' + sortSel + tagSel + '</div>';
    }

    /**
     * SP-1/SP-2: the sticky right-hand rail. `position:sticky` inside the table wrapper
     * keeps it in view while a long register scrolls, which is the whole point — the
     * control you are bulk-assigning is reachable from row 400 without scrolling back
     * to row 1. Collapsible, because on a narrow screen the table matters more.
     *
     * SP-3: the control picker here is a real scrollable LIST, not the old
     * `<input list>` + `<datalist>`. A datalist can only ever show the value, so the
     * control's description — the thing that tells you what the control actually means
     * while you assign it — had nowhere to go. Each entry now shows title, type and
     * description, and the whole list is filterable.
     */
    function renderSideRail(dsId, ui, controls, btns, project) {
      if (ui.railCollapsed) {
        return '<aside class="side-rail collapsed" data-side-rail>' +
          '<button type="button" class="rail-toggle" data-rail-toggle="' + esc(dsId) + '" title="Show the tools panel" aria-expanded="false">‹ Tools</button>' +
          '</aside>';
      }
      var list = (controls || []).slice();
      var shownList = railControls(list, ui);
      var picker = '';
      if (ui.applyMode) {
        if (!list.length) {
          picker = '<p class="muted rail-empty">No controls yet — add them in Control Manager.</p>';
        } else {
          var options = railGroups(shownList, ui).map(function (g) {
            return (g.label ? '<div class="ctl-group">' + esc(g.label) + '</div>' : '') +
              g.items.map(function (c) {
                var on = ui.applyControlId === c.id;
                return '<button type="button" class="ctl-card' + (on ? ' active' : '') + '" data-rail-control="' + esc(c.id) + '" data-ds="' + esc(dsId) + '"' +
                  ' aria-pressed="' + on + '">' +
                  '<span class="ctl-card-head"><span class="ctl-card-title">' + esc(c.title) + '</span>' +
                  (c.type ? '<span class="ctl-card-type">' + esc(c.type) + '</span>' : '') + '</span>' +
                  '<span class="ctl-card-desc">' + (c.description ? esc(c.description) : '<em>No description — add one in Control Manager.</em>') + '</span>' +
                  '</button>';
              }).join('');
          }).join('');
          picker =
            '<div class="rail-section">' +
              '<div class="rail-label">Control to apply</div>' +
              renderRailControlTools(dsId, ui, list) +
              '<input type="search" class="rail-search" data-rail-search="' + esc(dsId) + '" placeholder="Filter controls…" value="' + esc(ui.railSearch || '') + '" aria-label="Filter controls">' +
              '<div class="ctl-cards">' + (options || '<p class="muted rail-empty">No control matches that filter.</p>') + '</div>' +
              '<div class="muted rail-count">' + shownList.length + ' of ' + list.length + ' shown</div>' +
              (btns.applyTo || '') +
            '</div>';
        }
      }
      return '<aside class="side-rail" data-side-rail>' +
        '<div class="rail-head">' +
          '<span class="rail-title">Tools</span>' +
          '<button type="button" class="rail-toggle" data-rail-toggle="' + esc(dsId) + '" title="Hide the tools panel" aria-expanded="true">Hide ›</button>' +
        '</div>' +
        '<div class="rail-section rail-modes">' + btns.modeBtns + btns.deleteBtn + '</div>' +
        '<div class="rail-section rail-history">' + btns.undoBtn + '</div>' +
        picker +
        renderDevicePicker(dsId, ui, project, btns) +
        renderValuePicker(dsId, btns) +
        '</aside>';
    }

    /**
     * BULK-4: the rail's value picker — the third sibling of the control and device
     * pickers, serving both the relevance and the decision mode from one spec.
     *
     * A flat row of chips rather than the tall cards those two use: a relevance or an
     * action is a single word from a closed list of three to five, with nothing to
     * describe. Cards would be four lines of whitespace each and would push the list
     * below the fold on a short rail.
     * @param {string} dsId @param {Object} btns
     * @returns {string} HTML, or '' when no value mode is armed
     */
    function renderValuePicker(dsId, btns) {
      var spec = btns.valueSpec;
      if (!spec) return '';
      var chips = spec.options.map(function (o) {
        var on = spec.value === o.value;
        return '<button type="button" class="val-chip' + (on ? ' active' : '') + '" data-rail-value="' + esc(o.value) + '" data-ds="' + esc(dsId) + '"' +
          ' aria-pressed="' + on + '" title="' + esc('Set ' + spec.label + ' to ' + o.value + ' on the rows you tick') + '">' + o.html + '</button>';
      }).join('');
      return '<div class="rail-section">' +
        '<div class="rail-label">' + esc(spec.railLabel) + '</div>' +
        '<div class="val-chips">' + (chips || '<p class="muted rail-empty">This register offers no fixed values to apply.</p>') + '</div>' +
        // Unticking a row clears the field, so say so — otherwise the only way back from a
        // wrong bulk set looks like Undo, and it is not the only way.
        '<div class="muted rail-count">Unticking a row clears its ' + esc(spec.label.toLowerCase()) + '.</div>' +
        (btns.valueTo || '') +
        '</div>';
    }

    /**
     * DEV-1: the rail's device picker — the twin of the control picker above it, and a
     * real list rather than a dropdown for the same reason: a device is chosen by what it
     * IS (model, firmware, whether it even carries this register), not by its name alone.
     *
     * A device with no capture for this dataset is listed but not selectable, with the
     * reason on the card. Hiding it would leave the operator wondering where the device
     * went; offering it would produce ticks that change nothing downstream.
     * @param {string} dsId @param {Object} ui @param {?Project} project @param {Object} btns
     * @returns {string} HTML
     */
    function renderDevicePicker(dsId, ui, project, btns) {
      if (!ui.assignMode) return '';
      var latest = project ? App.ui.model.getLatestConfigs(project) : [];
      if (!latest.length) {
        return '<div class="rail-section"><div class="rail-label">Device</div>' +
          '<p class="muted rail-empty">No devices yet — onboard one first.</p></div>';
      }
      var list = latest.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      var cards = list.map(function (dc) {
        var carries = App.registry.deviceHasDataset(project, dc, dsId);
        var on = ui.assignDeviceId === dc.id;
        var n = carries ? App.registry.applicableKeys(project, dc, dsId).length : 0;
        var meta = [dc.model, dc.firmware].filter(function (x) { return x; }).join(' · ');
        return '<button type="button" class="ctl-card' + (on ? ' active' : '') + '" data-rail-device="' + esc(dc.id) + '" data-ds="' + esc(dsId) + '"' +
          (carries ? '' : ' disabled') + ' aria-pressed="' + on + '"' +
          ' title="' + esc(carries ? dc.name + ' — ' + n + ' item(s) in this register apply to it' : dc.name + ' has no capture for this register') + '">' +
          '<span class="ctl-card-head"><span class="ctl-card-title">' + esc(dc.name) + '</span>' +
          '<span class="ctl-card-type">' + esc(carries ? n + ' apply' : 'no capture') + '</span></span>' +
          '<span class="ctl-card-desc">' + (meta ? esc(meta) : '<em>No model or firmware recorded.</em>') + '</span>' +
          '</button>';
      }).join('');
      return '<div class="rail-section">' +
        '<div class="rail-label">Device to assign to</div>' +
        '<div class="ctl-cards">' + cards + '</div>' +
        '<div class="muted rail-count">' + list.length + ' active device(s)</div>' +
        (btns.assignTo || '') +
        '</div>';
    }

    /** Merge each latest snapshot's captured defaults into one {key:{value,type}} map.
     *  Delegates to registry.capturedDefaults so the table and device readiness resolve
     *  an item's value format from exactly the same evidence — two copies of this merge
     *  is what let a hand-assigned item read decided here and undecided on Devices. */
    function buildCapturedMap(project, dsId) {
      return App.registry.capturedDefaults(project, dsId);
    }

    var MIN_COL_WIDTH = 60; // px (review-2 #4)
    /** Sensible default column widths (px) by column key; resized widths override.
     *  `dsId` is accepted (and passed by the caller) so a dataset can be given its
     *  own default without touching the call site — none needs one today. */
    function colDefaultWidth(key, dsId) {
      // review-15: descriptions are long prose, so Description starts 3× wider.
      switch (key) {
        case 'key': return 240;
        case 'description': return 660;
        case 'decision': return 280;
        case 'controlRefs': return 180;
        case 'relevance': return 150;
        case 'appliesTo': return 160;
        case 'status': return 100;
        case 'diverges': return 180;
        default: return 160;
      }
    }

    // ---- the column set, and COL-1 column hiding -------------------------------
    /**
     * The core (dataset-independent) columns every dataset gets, after its own. Kept in
     * ONE place because three callers need the same list in the same order: the table,
     * the column picker and the CSV export.
     * DIV-1 adds "Diverges from Guidelines" here rather than in each adapter, for the
     * same reason Security Relevance lives here — it is a property of a decision, not of
     * a dataset, so a new dataset gets it without a core edit.
     */
    function coreColumns() {
      return [
        { key: 'relevance', label: 'Security Relevance' },
        { key: 'appliesTo', label: 'Applies to' },
        // COL-2: Diverges sits BEFORE Status. Status is the row's verdict and reads best
        // last; the divergence tick is an attribute of the decision, so it belongs with
        // the other attributes rather than hanging off the end past the verdict.
        { key: 'diverges', label: 'Diverges from Guidelines' },
        { key: 'status', label: 'Status' }
      ];
    }
    /**
     * COL-2: the columns a data tab starts with HIDDEN.
     *
     * Both are real, and both are occasional: most rows never diverge, and Security
     * Relevance is set in passes rather than row by row. Shown by default they cost two
     * columns of width on every table for a value that is usually empty — so they start
     * off and are one tick away in the Columns bar. This is view state only: nothing
     * about the item changes, and the column picker says "6 of 8 shown" so the choice is
     * visible rather than a mystery.
     */
    var DEFAULT_HIDDEN_COLS = { relevance: true, diverges: true };
    /** A fresh copy — callers store it in per-dataset UI state and mutate it. */
    function defaultHiddenCols() {
      var out = {};
      Object.keys(DEFAULT_HIDDEN_COLS).forEach(function (k) { out[k] = true; });
      return out;
    }
    /** Every column a dataset shows, in display order, before any COL-1 hiding. */
    function allColumns(adapter) {
      return ((adapter && adapter.columns) || []).map(function (c) { return { key: c.key, label: c.label }; })
        .concat(coreColumns());
    }
    /**
     * COL-1: the one column that can never be hidden — the dataset's FIRST, which is its
     * key (Package on Packages, Path on Tactical). It is the row's identity and what the
     * generated output acts on; a table of anonymous rows is not a view of anything.
     * Read off the adapter rather than named here, so a new dataset needs no core edit.
     */
    function lockedColumnKey(adapter) {
      var first = ((adapter && adapter.columns) || [])[0];
      return first ? first.key : null;
    }
    /**
     * COL-1: the columns actually rendered — everything except those ticked off in
     * `ui.hiddenCols`. The locked key column survives even if it somehow appears there.
     * @param {DatasetAdapter} adapter @param {Object} ui @returns {{key:string,label:string}[]}
     */
    function visibleColumns(adapter, ui) {
      var locked = lockedColumnKey(adapter), hidden = (ui && ui.hiddenCols) || {};
      return allColumns(adapter).filter(function (c) { return c.key === locked || !hidden[c.key]; });
    }

    // ---- EDIT-1: opening a cell for editing --------------------------------------
    // The prose a row carries — its Description, its Control Refs, its name — is SHOWN in
    // the table and EDITED in the row expander, and the only way in was the ▸ button at
    // the far left of the row. On a wide table that is a long way from the cell you are
    // reading, and it is not obvious that the text you are looking at is editable at all.
    //
    // So the cell itself is now the way in: Ctrl+click (or double-click) any text cell to
    // open that row's editor with THAT field focused and selected. It is deliberately not
    // a plain click — a plain click still selects text, sorts nothing and opens nothing,
    // which is what you want while reading 400 rows.

    /** Columns that are ALREADY an editor in the cell — never hijacked. */
    var INLINE_EDITED = { decision: true, relevance: true, status: true, diverges: true, appliesTo: true };
    /** Column key -> the control to focus inside the opened expander. */
    var CELL_EDIT_TARGETS = {
      description: { sel: '[data-field-edit="description"]', label: 'Description' },
      controlRefs: { sel: '[data-control-search]', label: 'Control Refs' }
    };
    /**
     * EDIT-1: what Ctrl+click on this column's cell should do.
     * `null` ⇒ nothing (the cell is its own editor). A target with `sel: null` ⇒ open the
     * row but focus nothing, which is the honest answer for a captured key: the row has
     * fields worth opening, but the key itself is evidence and cannot be typed over.
     * @param {?DatasetAdapter} adapter @param {string} colKey
     * @returns {?{sel:?string, label:?string}}
     */
    function cellEditTarget(adapter, colKey) {
      if (INLINE_EDITED[colKey]) return null;
      if (CELL_EDIT_TARGETS[colKey]) return CELL_EDIT_TARGETS[colKey];
      if (colKey === lockedColumnKey(adapter)) {
        return (adapter && adapter.userCreatable) ? { sel: '[data-rename-key]', label: 'Name' } : { sel: null, label: null };
      }
      return { sel: null, label: null };
    }
    /** The hover text that makes EDIT-1 discoverable — it is a hidden gesture otherwise. */
    function cellEditHint(target) {
      return target && target.label
        ? 'Ctrl+click (or double-click) to edit the ' + target.label + ' of this row'
        : 'Ctrl+click (or double-click) to open this row for editing';
    }

    /**
     * STAB-1: render cell text clamped to a fixed height, with the full value on the
     * element's title. Used for the cells that GROW when a checkbox is ticked, so a tick
     * never changes a row's height and never shifts the rows below it.
     * @param {string} text @returns {string} HTML
     */
    function clampCell(text) {
      var t = String(text == null ? '' : text);
      // The span is emitted even when EMPTY: its min-height makes an empty cell exactly as
      // tall as a one-line cell, so the very first tick — which turns '' into one name —
      // does not change the row height either.
      return '<span class="cell-clamp"' + (t ? ' title="' + esc(t) + '"' : '') + '>' + esc(t) + '</span>';
    }

    function ctrl(dsId, key, field, kind, extra) {
      return 'data-decision data-ds="' + esc(dsId) + '" data-key="' + esc(key) + '" data-field="' + esc(field) + '" data-kind="' + kind + '"' + (extra || '');
    }

    /**
     * VF-8: the editor for one item's VALUE, chosen by its resolved value format.
     * This is what replaces "every value is a textarea": a boolean gets true/false, a
     * number gets a numeric box, a custom-options format gets a real <select> whose
     * entries carry the description of what each option does, and a string list gets a
     * one-per-line box. `data-fmt-kind` tells the commit path how to read it back, so
     * parse/serialise stay in App.valueFormats and never leak into DOM handling.
     * @param {Object} fmt   from App.valueFormats.resolve
     * @param {string} attrs the shared data-* attribute string from ctrl()
     * @param {*} value      the value to show (decision value, else captured default)
     * @returns {string} HTML
     */
    function renderValueEditor(fmt, attrs, value) {
      var VF = App.valueFormats;
      var shown = VF ? VF.display(fmt, value) : (typeof value === 'string' ? value : App.util.stable.stableStringify(value));
      var kindAttr = ' data-fmt-kind="' + esc(fmt ? fmt.kind : 'string') + '"';
      if (fmt && fmt.kind === 'bool') {
        return '<select ' + attrs + kindAttr + ' class="val-edit val-bool" aria-label="value">' +
          '<option value=""' + (shown === '' ? ' selected' : '') + '>—</option>' +
          '<option value="true"' + (shown === 'true' ? ' selected' : '') + '>true</option>' +
          '<option value="false"' + (shown === 'false' ? ' selected' : '') + '>false</option>' +
          '</select>';
      }
      if (fmt && fmt.kind === 'options') {
        var opts = (fmt.options || []);
        // An options format with nothing defined yet must not trap the operator in an
        // empty dropdown — fall back to a text box until the format has options.
        if (!opts.length) {
          return '<textarea ' + attrs + kindAttr + ' rows="1" class="val-edit" aria-label="value">' + esc(shown) + '</textarea>';
        }
        var known = opts.some(function (o) { return o.value === shown; });
        return '<select ' + attrs + kindAttr + ' class="val-edit val-options" aria-label="value">' +
          '<option value=""' + (shown === '' ? ' selected' : '') + '>—</option>' +
          opts.map(function (o) {
            var label = o.description ? (o.value + ' — ' + o.description) : o.value;
            return '<option value="' + esc(o.value) + '"' + (shown === o.value ? ' selected' : '') +
              (o.description ? ' title="' + esc(o.description) + '"' : '') + '>' + esc(label) + '</option>';
          }).join('') +
          // Keep an off-vocabulary captured value visible and selected rather than
          // silently snapping it to the first option — it is exactly the mismatch the
          // operator needs to SEE and fix (VF-7).
          (!known && shown !== '' ? '<option value="' + esc(shown) + '" selected>' + esc(shown) + ' (not an allowed value)</option>' : '') +
          '</select>';
      }
      if (fmt && fmt.kind === 'number') {
        return '<input type="text" inputmode="decimal" ' + attrs + kindAttr + ' class="val-edit val-number" value="' + esc(shown) + '" aria-label="value">';
      }
      var kind = fmt ? fmt.kind : 'string';
      var rows = 1;
      // FW-1: a JSON value is now a real structure to edit — the firewall rule list is
      // one leaf holding every rule — so it gets room, sized to the value, exactly as a
      // string list does. A nine-field rule object in a one-row box is not an editor.
      if (kind === 'stringArray') rows = Math.max(2, Math.min(8, shown.split('\n').length + 1));
      else if (kind === 'json') rows = Math.max(2, Math.min(12, Math.ceil(shown.length / 60) + 1));
      var cls = kind === 'stringArray' ? ' val-list' : (kind === 'json' ? ' val-json' : '');
      return '<textarea ' + attrs + kindAttr + ' rows="' + rows + '" class="val-edit' + cls + '"' +
        (kind === 'stringArray' ? ' placeholder="one entry per line"' : '') +
        (kind === 'json' ? ' placeholder="JSON value"' : '') +
        ' aria-label="value">' + esc(shown) + '</textarea>';
    }

