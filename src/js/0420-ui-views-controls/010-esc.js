  /* =============================================================================
   * MODULE: App.ui.views.controls
   * PURPOSE: The Control Manager tab (spec §18.3 CTL-1/CTL-4): view/add/edit/remove
   *          controls (title, type, description, assigned device configs). Decision
   *          assignment stays in the data tabs (CTL-5); this is the catalogue.
   * PURITY:  UI/DOM
   * DEPENDS: App.store, App.ui.model, App.util.{html,dom}
   * INVARIANTS: edits go through store CRUD; assignments reference device baseIds.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    var _add = { title: '', type: 'ISM', description: '' };
    var _newType = '';
    var _ctx = null;
    // review-4 #4: Control Manager is a searchable table with a per-row expander.
    // review-6 #4: per-column widths (drag-resizable), persisted in UI state.
    // review-13 #4: `deviceCols` is the set of device baseIds shown as checkbox columns
    // in the table. null = "not chosen yet" ⇒ every onboarded device gets a column, so
    // the feature is visible without hunting for it.
    var _cm = { search: '', expanded: {}, colWidths: {}, deviceCols: null,
                // TAG-2: the Control Manager's own tools rail, mirroring the data tabs'.
                tagMode: false, tagName: '', tagSearch: '', railCollapsed: false, newTag: '',
                // CMF-1: per-column value filters, the same affordance FIL-1 gives the data
                // tabs — a dropdown under the column it filters. Empty ⇒ "any".
                filters: {} };
    var _cmSearchTimer = null;
    var CM_COLS = [
      { key: 'title', label: 'Title', w: 200 },
      { key: 'type', label: 'Type', w: 120 },
      { key: 'tags', label: 'Tags', w: 160 },
      { key: 'applies', label: 'Applies to', w: 200 },
      { key: 'description', label: 'Description', w: 320 }
    ];

    /**
     * The controls the table is CURRENTLY SHOWING, in display order. Shared by the table,
     * the device-column header toggle and the tag bulk button, so "shown" means the same
     * thing to all three — the same guarantee BULK-1 makes on the data tabs.
     * @param {Project} project @returns {Control[]}
     */
    function shownControls(project) {
      var controls = (project.controls || []).slice().sort(function (a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; });
      // CMF-1: the column filters run BEFORE the search, so the search narrows whatever
      // the filters left — "ISM controls mentioning bluetooth" is filter + search, not a
      // special case. Both are what "shown" means to the bulk actions and the rail.
      controls = controls.filter(cmFilterPredicate());
      var q = (_cm.search || '').toLowerCase().trim();
      if (!q) return controls;
      return controls.filter(function (c) {
        return ((c.title || '') + ' ' + (c.type || '') + ' ' + (c.description || '') + ' ' + ((c.tags || []).join(' ')))
          .toLowerCase().indexOf(q) !== -1;
      });
    }

    /** CMF-1: the sentinel the "(none)" options carry — shared with the data tables. */
    function filterNone() { return (App.ui.model && App.ui.model.FILTER_NONE) || (String.fromCharCode(0xE000) + 'none'); }   // FIL-3: never a NUL - see ui.model

    /**
     * CMF-1: the row predicate for the active column filters. An absent/empty entry means
     * "any", so the default state filters nothing.
     * @returns {(c:Control)=>boolean}
     */
    function cmFilterPredicate() {
      var f = _cm.filters || {};
      var active = Object.keys(f).filter(function (k) { return f[k]; });
      if (!active.length) return function () { return true; };
      var NONE = filterNone();
      return function (c) {
        for (var i = 0; i < active.length; i++) {
          var key = active[i], want = f[key];
          if (key === 'type') {
            if ((c.type || '') !== want) return false;
          } else if (key === 'tags') {
            var tags = c.tags || [];
            if (want === NONE) { if (tags.length) return false; }
            else if (tags.indexOf(want) === -1) return false;
          } else if (key === 'applies') {
            // Matched on the device BASE id a control stores, not the name the cell shows
            // — renaming a device must not orphan the filter.
            var devs = c.assignedDeviceIds || [];
            if (want === NONE) { if (devs.length) return false; }
            else if (devs.indexOf(want) === -1) return false;
          }
        }
        return true;
      };
    }

    /**
     * CMF-1: which columns get a filter, and what they offer. Discovered from the project
     * (the types and tags actually in use, plus the ones only declared) rather than a
     * fixed list, so a new type or tag is filterable the moment it exists.
     * @param {Project} project
     * @returns {Object<string,{label:string,options:{value:string,label:string}[]}>}
     */
    function cmFilterColumns(project) {
      var NONE = filterNone();
      var types = App.store.knownControlTypes();
      var used = {}; (project.controls || []).forEach(function (c) { if (c.type) used[c.type] = true; });
      Object.keys(used).forEach(function (t) { if (types.indexOf(t) === -1) types.push(t); });
      var tags = App.store.knownControlTags();
      var out = {};
      out.type = { label: 'Type', options: types.slice().sort().map(function (t) { return { value: t, label: t }; }) };
      out.tags = { label: 'Tags', options: tags.map(function (t) { return { value: t, label: t }; }).concat([{ value: NONE, label: '(untagged)' }]) };
      var devs = allDevices(project).map(function (d) { return { value: d.baseId, label: d.name }; });
      out.applies = { label: 'Applies to', options: devs.concat([{ value: NONE, label: '(unassigned)' }]) };
      return out;
    }

    /** TAG-3 / TAG-2: are ALL the shown controls already carrying this device / tag? */
    function allShownHaveDevice(project, baseId) {
      var list = shownControls(project);
      return list.length > 0 && list.every(function (c) { return (c.assignedDeviceIds || []).indexOf(baseId) !== -1; });
    }
    function allShownHaveTag(project, tag) {
      var list = shownControls(project);
      return list.length > 0 && list.every(function (c) { return (c.tags || []).indexOf(tag) !== -1; });
    }

    function typeOptions(cur) {
      var opts = App.store.knownControlTypes(); // seed + user-added + types in use
      if (cur && opts.indexOf(cur) === -1) opts.push(cur);
      return opts.map(function (t) { return '<option value="' + esc(t) + '"' + (t === cur ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
    }

    function deviceCheckboxes(project, ctlId, assigned) {
      var set = {}; (assigned || []).forEach(function (b) { set[b] = true; });
      // One checkbox per distinct device baseId (latest config name shown).
      var latest = App.ui.model.getLatestConfigs(project), seen = {};
      // CMD-1: the layout lives in the stylesheet (.ctl-dev-opt), because the rule that
      // broke this — .detail-form input { width:100% } stretching the checkbox until the
      // name had one character per line — can only be beaten there, not by inline styles
      // on the label.
      return latest.map(function (c) {
        if (seen[c.baseId]) return ''; seen[c.baseId] = true;
        return '<label class="ctl-dev-opt">' +
          '<input type="checkbox" data-ctl-device="' + esc(ctlId) + '" data-baseid="' + esc(c.baseId) + '"' + (set[c.baseId] ? ' checked' : '') + '> ' +
          '<span>' + esc(c.name) + '</span></label>';
      }).join('') || '<span class="muted">No devices onboarded.</span>';
    }

    // ---- review-13 #4: per-device checkbox columns ----------------------------
    /** Every onboarded device, one entry per baseId, name-ordered. */
    function allDevices(project) {
      var seen = {}, out = [];
      App.ui.model.getLatestConfigs(project).forEach(function (c) {
        if (seen[c.baseId]) return;
        seen[c.baseId] = true; out.push({ baseId: c.baseId, name: c.name });
      });
      return out.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    }
    /** @returns {boolean} whether a device currently has a column (null ⇒ all shown). */
    function deviceColShown(baseId) { return _cm.deviceCols === null ? true : !!_cm.deviceCols[baseId]; }
    /** The devices that get their own column, in display order. */
    function deviceColumns(project) {
      return allDevices(project).filter(function (d) { return deviceColShown(d.baseId); });
    }

    /**
     * The "Device columns" picker: tick a device to give it a checkbox column in the
     * table below, so a control can be applied to / removed from that device in one
     * click instead of opening the row's dropdown.
     */
    function renderDeviceBar(project) {
      var devices = allDevices(project);
      if (!devices.length) return '';
      var boxes = devices.map(function (d) {
        return '<label class="cm-devcol-opt"><input type="checkbox" data-cm-devcol="' + esc(d.baseId) + '"' + (deviceColShown(d.baseId) ? ' checked' : '') + '> ' + esc(d.name) + '</label>';
      }).join('');
      var shown = deviceColumns(project).length;
      return '<div class="cm-devbar"><span class="cm-devbar-label">Device columns:</span>' + boxes +
        '<button data-cm-devcol-all>All</button><button data-cm-devcol-none>None</button>' +
        '<span class="muted" style="font-size:12px">' + shown + ' of ' + devices.length + ' shown — tick a cell to apply that control to that device.</span>' +
        '</div>';
    }

    /**
     * TAG-2: the Control Manager's sticky tools rail — the same affordance as the data
     * tabs' Apply Control Mode, for tags. Pick a tag, tick rows (or hit "Tag all N
     * shown"), and because the rail is `position:sticky` the picker is still there when
     * you are 60 controls down the list.
     */
    function renderTagRail(project) {
      if (!(project.controls || []).length) return '';
      if (_cm.railCollapsed) {
        return '<aside class="side-rail collapsed" data-side-rail>' +
          '<button type="button" class="rail-toggle" data-cm-rail-toggle title="Show the tools panel" aria-expanded="false">‹ Tools</button>' +
          '</aside>';
      }
      var tags = App.store.knownControlTags();
      var filter = String(_cm.tagSearch || '').toLowerCase();
      var shownTags = filter ? tags.filter(function (t) { return t.toLowerCase().indexOf(filter) !== -1; }) : tags;
      var counts = {};
      (project.controls || []).forEach(function (c) { (c.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });

      var modeBtn = '<button type="button" data-cm-tag-toggle' + (_cm.tagMode ? ' class="active"' : '') +
        ' title="' + (_cm.tagMode ? 'Leave tag mode' : 'Pick a tag, then tick controls to apply it') + '">' +
        (_cm.tagMode ? 'Exit tag mode' : 'Apply Tag Mode') + '</button>';

      var body = '';
      if (_cm.tagMode) {
        var shownCount = shownControls(project).length;
        var cards = shownTags.map(function (t) {
          var on = _cm.tagName === t;
          return '<button type="button" class="ctl-card' + (on ? ' active' : '') + '" data-cm-tag-pick="' + esc(t) + '" aria-pressed="' + on + '">' +
            '<span class="ctl-card-head"><span class="ctl-card-title">' + esc(t) + '</span>' +
            '<span class="ctl-card-type">' + (counts[t] || 0) + '</span></span>' +
            '<span class="ctl-card-desc">' + (counts[t] ? 'On ' + counts[t] + ' control' + (counts[t] === 1 ? '' : 's') + '.' : '<em>Not used yet.</em>') + '</span>' +
            '</button>';
        }).join('');
        var removing = _cm.tagName && allShownHaveTag(project, _cm.tagName);
        var bulk = '<button type="button" class="apply-all' + (removing ? ' danger' : '') + '" data-cm-tag-all' +
          (_cm.tagName && shownCount ? '' : ' disabled') +
          ' title="' + esc(!_cm.tagName ? 'Pick a tag first'
            : !shownCount ? 'No controls are shown'
            : removing ? 'Every control shown already has this tag — click to remove it from all ' + shownCount
            : 'Add this tag to all ' + shownCount + ' control(s) currently shown') + '">' +
          esc(removing ? 'Untag all ' + shownCount + ' shown' : 'Tag all ' + shownCount + ' shown') + '</button>';
        // "New tag" sits ABOVE the picker: with a long tag list the rail scrolls, and the
        // one control you cannot reach by scrolling is the one that creates the first tag.
        body =
          '<div class="rail-section">' +
            '<div class="rail-label">New tag</div>' +
            '<div class="cm-newtag"><input type="text" data-cm-tag-new placeholder="e.g. administrative" value="' + esc(_cm.newTag || '') + '" aria-label="New tag name">' +
            '<button type="button" data-cm-tag-add>Add</button></div>' +
          '</div>' +
          '<div class="rail-section">' +
            '<div class="rail-label">Tag to apply</div>' +
            '<input type="search" class="rail-search" data-cm-tag-search placeholder="Filter tags…" value="' + esc(_cm.tagSearch || '') + '" aria-label="Filter tags">' +
            '<div class="ctl-cards cm-tag-cards">' + (cards || '<p class="muted rail-empty">' + (tags.length ? 'No tag matches that filter.' : 'No tags yet — create one above.') + '</p>') + '</div>' +
            bulk +
            '<div class="muted apply-all-note">Acts on exactly what the table shows — narrow it with the search box first.</div>' +
            (_cm.tagName ? '<button type="button" class="danger" data-cm-tag-delete="' + esc(_cm.tagName) + '" title="Delete this tag everywhere it is used">Delete tag &ldquo;' + esc(_cm.tagName) + '&rdquo;</button>' : '') +
          '</div>';
      }
      return '<aside class="side-rail" data-side-rail>' +
        '<div class="rail-head"><span class="rail-title">Tools</span>' +
          '<button type="button" class="rail-toggle" data-cm-rail-toggle title="Hide the tools panel" aria-expanded="true">Hide ›</button></div>' +
        '<div class="rail-section rail-modes">' + modeBtn + '</div>' +
        body +
        '</aside>';
    }

    /** Comma-joined device names for a control's assigned baseIds (display only). */
    function deviceNames(project, assigned) {
      var byBase = {};
      App.ui.model.getLatestConfigs(project).forEach(function (c) { if (!byBase[c.baseId]) byBase[c.baseId] = c.name; });
      var names = (assigned || []).map(function (b) { return byBase[b] || b; });
      return names.length ? names.join(', ') : '';
    }

    /**
     * TAG-1: the tags a control carries, as badges. Clamped like Applies-to so tagging
     * never changes a row's height (STAB-1).
     */
    function tagsCellHtml(c) {
      var tags = c.tags || [], tagList = tags.join(', ');
      return '<span class="cell-clamp' + (tagList ? '' : ' muted') + '"' + (tagList ? ' title="' + esc(tagList) + '"' : '') + '>' +
        (tags.length ? tags.map(function (t) { return '<span class="badge tag">' + esc(t) + '</span>'; }).join(' ') : '—') + '</span>';
    }
    /** STAB-1: clamped — this is the cell that grows as you tick device columns. */
    function appliesCellHtml(project, c) {
      var applies = deviceNames(project, c.assignedDeviceIds);
      return '<span class="cell-clamp' + (applies ? '' : ' muted') + '"' + (applies ? ' title="' + esc(applies) + '"' : '') + '>' +
        (applies ? esc(applies) : '—') + '</span>';
    }

    // ---- STAB-3: surgical refreshes, for the checkbox handlers ------------------
    // Ticking a box must not move the page. These update exactly what the tick changed
    // and touch nothing above it, so every row keeps its position and its height.

    /** Run a store edit without the app's full re-render (see ctx.quietEdit). */
    function quietly(fn) {
      if (_ctx && _ctx.quietEdit) _ctx.quietEdit(fn); else fn();
    }
    /** Find one element by an exact data-attribute value (no selector escaping needed). */
    function byAttr(scope, attr, value) {
      if (!scope) return null;
      var all = scope.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < all.length; i++) if (all[i].getAttribute(attr) === value) return all[i];
      return null;
    }
    /** Repaint one control's Tags + Applies-to cells, and re-sync its device boxes. */
    function refreshRow(project, ctlId) {
      var host = document.getElementById('ctl-table-host'); if (!host) return;
      var row = byAttr(host, 'data-ctl-row', ctlId); if (!row) return;
      var c = (project.controls || []).filter(function (x) { return x.id === ctlId; })[0]; if (!c) return;
      var tags = row.querySelector('.ctl-tags-cell'); if (tags) tags.innerHTML = tagsCellHtml(c);
      var applies = row.querySelector('.ctl-applies-cell'); if (applies) applies.innerHTML = appliesCellHtml(project, c);
      // The column checkbox and the one in the row's dropdown are two views of the same
      // assignment — tick either and both must agree.
      var assigned = c.assignedDeviceIds || [];
      var boxes = host.querySelectorAll('[data-ctl-device]');
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].getAttribute('data-ctl-device') !== ctlId) continue;
        boxes[i].checked = assigned.indexOf(boxes[i].getAttribute('data-baseid')) !== -1;
      }
    }
    /** TAG-3: the device column heading reads "assign"/"remove" off the shown set. */
    function refreshDeviceHead(project, baseId) {
      var host = document.getElementById('ctl-table-host'); if (!host) return;
      var btn = byAttr(host, 'data-cm-dev-toggle', baseId); if (!btn) return;
      var dev = allDevices(project).filter(function (d) { return d.baseId === baseId; })[0];
      var name = (dev && dev.name) || baseId;
      var all = allShownHaveDevice(project, baseId);
      btn.className = 'cm-dev-head' + (all ? ' all-on' : '');
      btn.title = all ? 'Every control shown is assigned to ' + name + ' — click to remove it from all of them'
                      : 'Assign ' + name + ' to every control currently shown';
    }
    /**
     * Rebuild the rail in place (its tag counts and its bulk button both read the whole
     * table), keeping the tag list scrolled where it was — the rail is its own box, so
     * replacing it cannot shift the table beside it.
     */
    function refreshRail(project) {
      var rail = document.querySelector('.table-wrap [data-side-rail]'); if (!rail) return;
      var cards = rail.querySelector('.ctl-cards');
      var keep = cards ? cards.scrollTop : 0;
      var wrap = document.createElement('div');
      wrap.innerHTML = renderTagRail(project);
      if (!wrap.firstChild) return;
      rail.parentNode.replaceChild(wrap.firstChild, rail);
      var again = document.querySelector('.table-wrap [data-side-rail] .ctl-cards');
      if (again) again.scrollTop = keep;
    }

