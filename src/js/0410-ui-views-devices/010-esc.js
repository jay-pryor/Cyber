  /* =============================================================================
   * MODULE: App.ui.views.devices
   * PURPOSE: The Devices tab (spec §11.3, DOD-9). Lists device configs grouped by
   *          baseId (latest = active; older = superseded read-only history), and a
   *          read-only device-configuration view with one panel per dataset
   *          listing exactly the device's applicable DECIDED items (key/decision/ISM).
   * PURITY:  UI/DOM (render returns strings; no engine mutation)
   * DEPENDS: App.registry, App.store, App.ui.model, App.completeness, App.util.html
   * INVARIANTS: panels show exactly applicable ∩ decided; generation/readiness use
   *             the latest version only.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;
    var _dev = { selectedId: null, assignResults: {}, detailSearch: '', collapsed: {}, openControlId: null, deviationsFirst: false, openGroupId: null, groupAdd: { dsId: null, key: '' }, newGroupName: '', panelColWidths: {},
                 // NOTE-1: the device whose platform-notes page is open (null = not on it).
                 notesId: null };
    var _devSearchTimer = null;
    var _noteTimer = null;
    var _ctx = null;

    /** Register items applicable to a device for a dataset (pure; snapshot keys, or the
     *  whole register for a virtual dataset — CUS-1). */
    function applicable(project, deviceId, dsId) {
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return [];
      if (!App.registry.deviceHasDataset(project, dc, dsId)) return [];
      var ks = App.registry.applicableKeySet(project, dc, dsId);
      return (project.items[dsId] || []).filter(function (it) { return ks[it.key]; });
    }

    // Derive datasets from the PROJECT's platform (not the globally-active one),
    // so the view is correct even if active≠project platform (D-008).
    function datasets(project) { var p = App.registry.getPlatform(project.platformProfileId); return p ? p.datasets : []; }
    function decisionGet(adapter) {
      var col = adapter.columns.filter(function (c) { return c.key === 'decision'; })[0];
      return col && col.get ? col.get : function (it) { return it.decision ? JSON.stringify(it.decision) : ''; };
    }

    /** The grouped device list (spec §11.3). */
    function renderList(project) {
      if (!project || !project.deviceConfigs.length) {
        return '<div class="empty-state"><h2>Devices</h2><p>No device configurations yet — go to <strong>Onboard</strong>.</p></div>';
      }
      var latestIds = {}; App.ui.model.getLatestConfigs(project).forEach(function (c) { latestIds[c.id] = true; });
      // Group by baseId.
      var groups = {}, order = [];
      project.deviceConfigs.forEach(function (c) { if (!groups[c.baseId]) { groups[c.baseId] = []; order.push(c.baseId); } groups[c.baseId].push(c); });
      order.sort();

      var ds = datasets(project);
      function rowHtml(c, superseded) {
        var counts = ds.map(function (d) {
          var ap = applicable(project, c.id, d.id);
          var dec = ap.filter(function (it) { return it.status === 'decided'; }).length;
          return esc(d.label) + ' ' + dec + '/' + ap.length;
        }).join(' · ');
        var badge;
        if (superseded) badge = '<span class="badge superseded">superseded</span>';
        else {
          var r = App.completeness.deviceReadiness(project, c.id);
          badge = r.ready ? '<span class="badge decided">ready</span>' : '<span class="badge undecided">' + r.totalUndecided + ' undecided</span>';
        }
        // review-12 #1: flag devices that still have controls left unsatisfied. Shown on
        // the active version only (the state is per baseId, not per version).
        var unsatBadge = '';
        if (!superseded) {
          var un = unsatisfiedControls(project, c.baseId);
          if (un.length) {
            unsatBadge = ' <span class="badge unsatisfied dev-unsat" title="' + esc(un.map(function (x) { return x.title; }).join(', ')) + '">⚠ ' + un.length + ' control' + (un.length === 1 ? '' : 's') + ' unsatisfied</span>';
          }
        }
        return '<div class="dev-row' + (superseded ? ' superseded' : '') + '">' +
          '<span class="dev-name">' + esc(c.name) + '</span>' +
          '<span class="dev-meta">' + esc(c.model) + ' · ' + esc(c.firmware) + ' · v' + c.version + '</span>' +
          '<span class="spacer"></span>' +
          '<span class="counts">' + counts + '</span>' +
          badge + unsatBadge +
          ' <button data-device-view="' + esc(c.id) + '">View</button>' +
          // NOTE-1: the knowledge notes for this device, beside the thing they are about.
          // Kept per baseId, so every version of a device opens the same page — the notes
          // are about the DEVICE, not about one capture of it.
          ' <button data-device-notes="' + esc(c.id) + '"' +
            ' title="Platform notes — what has been learned about this device"' +
            '>Notes' + (App.store.deviceNotes(project, c.baseId) ? ' <span class="notes-dot" aria-label="notes written">•</span>' : '') + '</button>' +
          '</div>';
      }

      // A version-stack (all versions of one baseId), latest first.
      function stackHtml(baseId) {
        var members = groups[baseId].slice().sort(function (a, b) { return b.version - a.version; });
        return '<div class="dev-group">' + members.map(function (c) { return rowHtml(c, !latestIds[c.id]); }).join('') + '</div>';
      }

      // --- Device-group sections (spec §19.4) ---------------------------------
      // Map each present baseId to its group (if any).
      var groupOf = {}; (project.groups || []).forEach(function (g) { (g.deviceBaseIds || []).forEach(function (b) { groupOf[b] = g; }); });
      // All distinct baseIds present, name-ordered via their latest config name.
      var nameOf = {}; App.ui.model.getLatestConfigs(project).forEach(function (c) { if (nameOf[c.baseId] === undefined) nameOf[c.baseId] = c.name; });
      var allBases = order.slice().sort(function (a, b) { return (nameOf[a] || a) < (nameOf[b] || b) ? -1 : 1; });

      // review-6 #1: a toggle-able dropdown to add/remove a member device (pick a
      // device to add it; pick a current member to remove it). Members are also shown
      // as text so the current membership is clear at a glance.
      function memberSelect(g) {
        var inG = {}; (g.deviceBaseIds || []).forEach(function (b) { inG[b] = true; });
        return '<select class="grp-member-select" data-group-member-select data-group-id="' + esc(g.id) + '" aria-label="add or remove a device">' +
          '<option value="">+ / − device…</option>' +
          allBases.map(function (b) {
            return '<option value="' + esc(b) + '">' + (inG[b] ? '✓ ' : '') + esc(nameOf[b] || b) + (inG[b] ? ' — remove' : ' — add') + '</option>';
          }).join('') + '</select>';
      }
      function groupSection(g) {
        var members = allBases.filter(function (b) { return groupOf[b] && groupOf[b].id === g.id; });
        var stacks = members.length ? members.map(stackHtml).join('') : '<p class="muted" style="padding:6px 10px">No devices in this group yet.</p>';
        var nDev = App.overrides.groupDeviations(project, g.id).length;
        var memberNames = members.map(function (b) { return nameOf[b] || b; }).join(', ') || '(none)';
        var head = '<div class="dev-group-head">' +
          '<input class="grp-name" data-group-name data-group-id="' + esc(g.id) + '" value="' + esc(g.name) + '" aria-label="group name">' +
          '<span class="muted" style="font-size:12px">' + members.length + ' device' + (members.length === 1 ? '' : 's') + '</span>' +
          '<button data-group-deviations="' + esc(g.id) + '">Deviations (' + nDev + ')</button>' +
          '<button class="danger" data-group-remove="' + esc(g.id) + '">Delete group</button>' +
          '<div class="grp-members"><span class="muted" style="font-size:12px">Members: </span><span class="grp-member-names">' + esc(memberNames) + '</span>' +
            (allBases.length ? memberSelect(g) : '<span class="muted">no devices onboarded</span>') + '</div>' +
          '</div>';
        return '<section class="dev-group-section"><h3 class="grp-title">' + esc(g.name) + '</h3>' + head + stacks + '</section>';
      }

      var groupSections = (project.groups || []).slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }).map(groupSection).join('');
      var ungrouped = allBases.filter(function (b) { return !groupOf[b]; });
      var ungroupedHtml = ungrouped.length
        ? '<section class="dev-group-section"><h3 class="grp-title">Ungrouped</h3>' + ungrouped.map(stackHtml).join('') + '</section>'
        : '';
      var addGroup = '<div class="add-group"><input data-group-newname placeholder="New group name" value="' + esc(_dev.newGroupName || '') + '" aria-label="new group name"><button class="primary" data-action="add-group">Add group</button></div>';

      return '<div><h2>Devices</h2>' +
        '<p class="muted">Latest version is active for generation; older versions are read-only history. Group overrides apply to every device in the group (default → group → device).</p>' +
        addGroup + groupSections + ungroupedHtml +
        (_dev.openGroupId ? renderGroupModal(project, _dev.openGroupId) : '') +
        '</div>';
    }

    /** Applicable-key union across a group's member latest configs for a dataset. */
    function groupUnionKeys(project, g, dsId) {
      var set = {}, latest = App.ui.model.getLatestConfigs(project);
      (g.deviceBaseIds || []).forEach(function (b) {
        var c = latest.filter(function (x) { return x.baseId === b; })[0];
        if (c) App.registry.applicableKeys(project, c, dsId).forEach(function (k) { set[k] = true; });   // CUS-1
      });
      return Object.keys(set);
    }

    /** A schema-driven group-override editor, seeded with a decision (data-gov-* attrs).
     *  `dsId`/`key` are optional and only used to resolve the item's declared value
     *  format (VF-8) — the add-override form has no key chosen yet. */
    function govControl(adapter, decision, fieldPrefix, dsId, key) {
      var d = decision;
      return adapter.decisionSchema.map(function (f) {
        var common = fieldPrefix + ' data-gov-field="' + esc(f.name) + '" data-gov-kind="' + f.kind + '"';
        if (f.kind === 'enum') {
          var cur = d && d[f.name] != null ? d[f.name] : '';
          return '<select ' + common + ' aria-label="' + esc(f.name) + '"><option value="">—</option>' +
            f.options.map(function (o) { return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
        }
        if (f.kind === 'string' || f.kind === 'value-typed') {
          // VF-8: same format-driven editor as the data table and the device panels.
          var rawVal = d && (f.name in d) ? d[f.name] : '';
          var vtype = (d && d.type) ? d.type : (typeof rawVal === 'boolean' ? 'bool' : (typeof rawVal === 'number' ? (rawVal % 1 === 0 ? 'int' : 'float') : 'string'));
          var it = itemFor(dsId, key) || { key: key };
          var fmt = App.valueFormats ? ovFormat(dsId, it, rawVal, vtype) : null;
          return App.ui.tables.renderValueEditor(fmt, common + ' data-vtype="' + esc(vtype) + '"', rawVal);
        }
        if (f.kind === 'bool') {
          var on = !!(d && d[f.name]);
          return '<input type="checkbox" ' + common + (on ? ' checked' : '') + ' aria-label="' + esc(f.name) + '">';
        }
        return '';
      }).join(' ');
    }

    /** Group "Deviations" modal (spec §19.4 / OVR-6): view + edit/remove + add group overrides. */
    function renderGroupModal(project, groupId) {
      var g = (project.groups || []).filter(function (x) { return x.id === groupId; })[0];
      if (!g) return '';
      var sections = datasets(project).map(function (d) {
        var adapter = App.registry.getDataset(project.platformProfileId, d.id);
        var dispKey = adapter.displayKey || function (k) { return k; };
        var get = decisionGet(adapter);
        var ovMap = (g.overrides && g.overrides[d.id]) || {};
        var keys = Object.keys(ovMap).sort();
        var rows = keys.map(function (key) {
          var dV = (project.items[d.id] || []).filter(function (it) { return it.key === key; })[0];
          // review-6 #2: show the DEFAULT value alone (e.g. 0), not the raw decision JSON.
          var defText = dV && dV.decision != null ? String(get({ decision: dV.decision })) : '(undecided)';
          return '<tr><td>' + esc(dispKey(key)) + '</td><td>' + esc(defText) + '</td>' +
            '<td>' + govControl(adapter, ovMap[key], 'data-gov data-gov-ds="' + esc(d.id) + '" data-gov-key="' + esc(key) + '"', d.id, key) + '</td>' +
            '<td><button class="ov-revert" data-gov-remove data-ds="' + esc(d.id) + '" data-key="' + esc(key) + '">Remove</button></td></tr>';
        }).join('');
        var table = keys.length
          ? '<table><thead><tr><th>Key</th><th>Default</th><th>Deviation setting</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
          : '<div class="empty">No group overrides for ' + esc(d.label) + '.</div>';
        return '<div class="panel"><h3>' + esc(d.label) + ' (' + keys.length + ')</h3>' + table + '</div>';
      }).join('');

      // Add-override form: dataset select + a SEARCHABLE key input (review-6 #3) + editor + Set.
      var addDs = _dev.groupAdd.dsId || (datasets(project)[0] && datasets(project)[0].id);
      var addAdapter = App.registry.getDataset(project.platformProfileId, addDs);
      var dsSel = datasets(project).map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === addDs ? ' selected' : '') + '>' + esc(d.label) + '</option>'; }).join('');
      var ovKeys = (g.overrides && g.overrides[addDs]) || {};
      var addDispKey = (addAdapter && addAdapter.displayKey) || function (k) { return k; };
      // A <datalist> makes the (long) key list type-to-filter searchable natively.
      var keyOpts = groupUnionKeys(project, g, addDs).filter(function (k) { return !(k in ovKeys); }).sort()
        .map(function (k) { return '<option value="' + esc(k) + '">' + esc(addDispKey(k)) + '</option>'; }).join('');
      var addForm = '<div class="gov-add"><strong>Add override:</strong> ' +
        '<select data-gov-add-ds aria-label="dataset">' + dsSel + '</select> ' +
        '<input class="gov-add-key" data-gov-add-key list="gov-add-keylist" placeholder="type to search a key…" value="' + esc(_dev.groupAdd.key || '') + '" aria-label="key">' +
        '<datalist id="gov-add-keylist">' + keyOpts + '</datalist> ' +
        (addAdapter ? govControl(addAdapter, null, 'data-gov-add-field-ctl', addDs, _dev.groupAdd.key) : '') +
        ' <button class="primary" data-gov-add-set data-ds="' + esc(addDs) + '">Set</button></div>';

      return '<div class="modal-overlay" data-group-modal>' +
        '<div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="Group deviations for ' + esc(g.name) + '">' +
          '<div class="modal-head"><div><h3>' + esc(g.name) + ' — deviations from default</h3>' +
            '<div class="modal-sub">Group overrides apply to every member device (default → group → device).</div></div>' +
            '<button type="button" class="modal-close" data-group-modal-close aria-label="Close">×</button></div>' +
          '<div class="modal-body"><div class="panels">' + sections + '</div>' + addForm + '</div>' +
        '</div></div>';
    }

    /** Build a decision object from a NodeList of data-gov* controls; null if no value set. */
    function govDecision(controls) {
      var decision = {}, hasValue = false;
      Array.prototype.forEach.call(controls, function (c) {
        var field = c.getAttribute('data-gov-field'), kind = c.getAttribute('data-gov-kind');
        var fmtKind = c.getAttribute('data-fmt-kind');   // VF-8
        if (kind === 'bool') { decision[field] = c.checked; hasValue = true; }
        else if (fmtKind && App.valueFormats) {
          var r = App.valueFormats.parseInput({ kind: fmtKind }, c.value);
          if (!r.undecided) { decision[field] = r.ok ? r.value : c.value; hasValue = true; }
        }
        else if (kind === 'value-typed') { if (String(c.value) !== '') { decision[field] = coerceOv(c.value, c.getAttribute('data-vtype')); hasValue = true; } }
        else if (kind === 'enum') { if (c.value !== '') { decision[field] = c.value; hasValue = true; } }
        else { decision[field] = c.value; hasValue = true; } // string: '' is a valid value
      });
      return hasValue ? decision : null;
    }

    /** Coerce an override editor string to a typed JS value (mirrors the data-table coerce). */
    function coerceOv(str, type) {
      if (type === 'bool') { var l = String(str).trim().toLowerCase(); if (l === 'true' || l === '1') return true; if (l === 'false' || l === '0') return false; return str; }
      if (type === 'int') { var n = parseInt(str, 10); return isNaN(n) ? str : n; }
      if (type === 'float') { var f = parseFloat(str); return isNaN(f) ? str : f; }
      return str;
    }

    /** Look up a register item by dataset + key (for format resolution); null if absent. */
    function itemFor(dsId, key) {
      if (!dsId || !key) return null;
      var p = App.store.getProject();
      if (!p || !p.items || !p.items[dsId]) return null;
      return p.items[dsId].filter(function (i) { return i.key === key; })[0] || null;
    }

    /** A schema-driven override editor for one item, seeded with the effective decision (spec §19.5). */
    function renderOverrideControl(adapter, dsId, item, effDecision) {
      var d = effDecision;
      return adapter.decisionSchema.map(function (f) {
        var common = 'data-ov data-ov-ds="' + esc(dsId) + '" data-ov-key="' + esc(item.key) + '" data-ov-field="' + esc(f.name) + '" data-ov-kind="' + f.kind + '"';
        if (f.kind === 'enum') {
          var cur = d && d[f.name] != null ? d[f.name] : '';
          return '<select ' + common + ' aria-label="override ' + esc(f.name) + '"><option value="">—</option>' +
            f.options.map(function (o) { return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
        }
        if (f.kind === 'string' || f.kind === 'value-typed') {
          // VF-8: the override editor uses the SAME format-driven control as the data
          // table, so a boolean overrides via true/false and a list one-per-line.
          var rawVal = d && (f.name in d) ? d[f.name] : '';
          var vtype = (d && d.type) ? d.type : (typeof rawVal === 'boolean' ? 'bool' : (typeof rawVal === 'number' ? (rawVal % 1 === 0 ? 'int' : 'float') : 'string'));
          var fmt = ovFormat(dsId, item, rawVal, vtype);
          return App.ui.tables.renderValueEditor(fmt, common + ' data-vtype="' + esc(vtype) + '"', rawVal);
        }
        if (f.kind === 'bool') {
          var on = !!(d && d[f.name]);
          return '<input type="checkbox" ' + common + (on ? ' checked' : '') + ' aria-label="override ' + esc(f.name) + '">';
        }
        return '';
      }).join(' ');
    }

    /**
     * The value format in force for an override editor (VF-8). Resolved from the item's
     * declared format, falling back to the format inferred from the CAPTURED leaf —
     * not from the override value, which is normally empty (nothing is overridden yet)
     * and would otherwise infer "text" for every item.
     */
    function ovFormat(dsId, item, rawVal, vtype) {
      if (!App.valueFormats) return null;
      var project = App.store.getProject();
      var cap = capturedFor(project, dsId)[item.key];
      if (cap) return App.valueFormats.resolve(project, item, cap.type, cap.value);
      return App.valueFormats.resolve(project, item, vtype, rawVal);
    }

    /**
     * Captured defaults for one dataset, merged across the latest device configs and
     * memoised per render pass (the panels ask for the same map once per row).
     */
    var _capCache = { key: null, map: null };
    function capturedFor(project, dsId) {
      if (!project || !dsId) return {};
      var stamp = project.meta && project.meta.modifiedUtc;
      var ck = dsId + '|' + stamp + '|' + (project.deviceConfigs || []).length;
      if (_capCache.key === ck) return _capCache.map;
      var map = App.registry.capturedDefaults(project, dsId);
      _capCache = { key: ck, map: map };
      return map;
    }

