    /**
     * The controls table (review-4 #4): one row per control with Title/Type editable
     * inline, an Applies-to and a wrapping Description column, and a per-row expander
     * (dropdown) holding the editable description, the device-assignment multi-select,
     * and the Remove button. Filtered by the toolbar search term.
     */
    function renderTable(project) {
      var controls = (project.controls || []).slice();
      if (!controls.length) return '<p class="muted">No controls yet — add one above, or they are created automatically when migrating a v1 project.</p>';
      var filtered = shownControls(project);
      // review-6 #4: data-driven headers with drag-to-resize handles + stored widths.
      // review-13 #4: plus one checkbox column per device selected in the picker.
      var colWidths = _cm.colWidths || {};
      var devCols = deviceColumns(project);
      function th(key, label, w, extraClass) {
        return '<th data-cm-col="' + key + '" scope="col"' + (extraClass ? ' class="' + extraClass + '"' : '') + ' style="width:' + (colWidths[key] || w) + 'px">' + esc(label) +
          '<span class="col-resize" data-cm-col-resize="' + key + '" title="Drag to resize"></span></th>';
      }
      // TAG-3: the device NAME in the header is a button that toggles the whole column
      // across the shown controls — onboard a device, search for the controls it needs,
      // and assign them all in one click. It reads "remove" when they all already have it.
      function devTh(d) {
        var all = allShownHaveDevice(project, d.baseId);
        var w = colWidths['dev:' + d.baseId] || 110;
        return '<th data-cm-col="dev:' + esc(d.baseId) + '" scope="col" class="cm-dev-col" style="width:' + w + 'px">' +
          '<button type="button" class="cm-dev-head' + (all ? ' all-on' : '') + '" data-cm-dev-toggle="' + esc(d.baseId) + '"' +
          ' title="' + esc(all ? 'Every control shown is assigned to ' + d.name + ' — click to remove it from all of them'
                              : 'Assign ' + d.name + ' to every control currently shown') + '">' + esc(d.name) + '</button>' +
          '<span class="col-resize" data-cm-col-resize="dev:' + esc(d.baseId) + '" title="Drag to resize"></span></th>';
      }
      var tagCol = _cm.tagMode ? '<th class="cm-tag-col" scope="col" title="Tick to apply the selected tag">✓ Tag</th>' : '';
      var head = '<tr><th class="lead-col" aria-label="expand"></th>' +
        CM_COLS.map(function (c) { return th(c.key, c.label, c.w); }).join('') +
        devCols.map(devTh).join('') + tagCol + '</tr>';
      var colspan = 1 + CM_COLS.length + devCols.length + (_cm.tagMode ? 1 : 0);
      // CMF-1: the filter row, directly beneath the headers and under the column each one
      // filters — the same shape (and the same classes) as the data tabs' FIL-1 row, so
      // filtering works the same way wherever you are in the tool.
      var filterable = cmFilterColumns(project);
      var activeF = _cm.filters || {};
      var anyF = Object.keys(activeF).some(function (k) { return activeF[k]; });
      var filterRow = '<tr class="filter-row"><th class="lead-col">' +
        (anyF ? '<button type="button" class="filter-clear" data-cm-filter-clear title="Clear every column filter">✕</button>' : '') +
        '</th>' +
        CM_COLS.map(function (c) {
          var f = filterable[c.key];
          if (!f) return '<th></th>';
          var cur = activeF[c.key] || '';
          return '<th><select class="col-filter' + (cur ? ' on' : '') + '" data-cm-filter="' + esc(c.key) + '"' +
            ' aria-label="Filter by ' + esc(f.label) + '" title="Show only controls whose ' + esc(f.label) + ' matches">' +
            '<option value="">' + esc(c.label) + ': any</option>' +
            f.options.map(function (o) {
              return '<option value="' + esc(o.value) + '"' + (cur === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
            }).join('') + '</select></th>';
        }).join('') +
        devCols.map(function () { return '<th></th>'; }).join('') + (_cm.tagMode ? '<th></th>' : '') +
        '</tr>';
      var body = filtered.map(function (c) {
        var open = !!_cm.expanded[c.id];
        var lead = '<td><button class="expand-btn" data-ctl-expand="' + esc(c.id) + '" aria-expanded="' + open + '" title="Edit / remove">' + (open ? '▾' : '▸') + '</button></td>';
        // STAB-3: the row is addressable so a checkbox tick can refresh just these two
        // cells instead of re-rendering the tab under the pointer.
        var row = '<tr data-ctl-row="' + esc(c.id) + '">' + lead +
          '<td><input type="text" data-ctl-field="title" data-ctl-id="' + esc(c.id) + '" value="' + esc(c.title) + '" aria-label="title"></td>' +
          '<td><select data-ctl-field="type" data-ctl-id="' + esc(c.id) + '" aria-label="type">' + typeOptions(c.type) + '</select></td>' +
          '<td class="ctl-tags-cell">' + tagsCellHtml(c) + '</td>' +
          '<td class="ctl-applies-cell">' + appliesCellHtml(project, c) + '</td>' +
          '<td class="ctl-desc-cell">' + esc(c.description || '') + '</td>' +
          // review-13 #4: one checkbox per shown device — ticking assigns this control
          // to it (and seeds its per-device Unsatisfied state), unticking un-assigns.
          devCols.map(function (d) {
            var on = (c.assignedDeviceIds || []).indexOf(d.baseId) !== -1;
            // BULK-2: same full-cell hit target as the data tables' Apply/Delete columns —
            // the cell-filling <label> is what a click lands on, so ticking a control onto a
            // device no longer means hitting a 13px box in a wide column.
            return '<td class="cm-dev-cell"><label class="cell-check"><input type="checkbox" data-ctl-device="' + esc(c.id) + '" data-baseid="' + esc(d.baseId) + '"' + (on ? ' checked' : '') +
              ' aria-label="Apply ' + esc(c.title) + ' to ' + esc(d.name) + '"></label></td>';
          }).join('') +
          // TAG-2: the per-row tick column, shown only while Apply Tag Mode is on.
          (_cm.tagMode
            ? '<td class="cm-tag-cell"><label class="cell-check"><input type="checkbox" data-ctl-tag-check data-ctl-id="' + esc(c.id) + '"' +
              (_cm.tagName && (c.tags || []).indexOf(_cm.tagName) !== -1 ? ' checked' : '') + (_cm.tagName ? '' : ' disabled') +
              ' aria-label="Apply the selected tag to ' + esc(c.title) + '"></label></td>'
            : '') +
          '</tr>';
        if (open) {
          // review-4 #4: the dropdown holds the wide wrapping description editor, the
          // device assignment, and the Remove button. The leading "\n" is sacrificial
          // (HTML drops one leading newline in <textarea>), preserving a leading newline.
          row += '<tr class="detail-row"><td colspan="' + colspan + '"><div class="detail-form">' +
            '<label>Description</label>' +
            '<textarea class="ctl-desc" data-ctl-field="description" data-ctl-id="' + esc(c.id) + '" placeholder="Description" aria-label="description">\n' + esc(c.description || '') + '</textarea>' +
            '<label>Applies to</label>' +
            '<div class="ctl-devices">' + deviceCheckboxes(project, c.id, c.assignedDeviceIds) + '</div>' +
            '<label>Manage</label>' +
            '<div class="ctl-detail-actions"><button class="danger" data-ctl-remove="' + esc(c.id) + '">Remove control</button></div>' +
            '</div></td></tr>';
        }
        return row;
      }).join('');
      if (!filtered.length) body = '<tr><td colspan="' + colspan + '" class="muted">No matching controls.</td></tr>';
      // CMF-1: never let the table look mysteriously short — say what is narrowing it.
      var nF = Object.keys(activeF).filter(function (k) { return activeF[k]; }).length;
      var count = '<div class="muted" style="font-size:12px;margin-bottom:4px">' + filtered.length + ' of ' + controls.length + ' shown' +
        (nF ? ' · ' + nF + ' column filter' + (nF === 1 ? '' : 's') + ' active <button type="button" class="filter-clear" data-cm-filter-clear title="Clear every column filter">clear</button>' : '') +
        '</div>';
      return count + '<table class="data ctl-table resizable"><thead>' + head + filterRow + '</thead><tbody>' + body + '</tbody></table>';
    }

    function render(project) {
      if (!project) return '<div class="empty-state"><h2>Control Manager</h2><p>Load a project or onboard a device first.</p></div>';

      var addForm = '<div class="ctl-add">' +
        '<h3>Add control</h3>' +
        '<input type="text" data-ctl-add="title" placeholder="Title" value="' + esc(_add.title) + '" style="min-width:220px">' +
        '<select data-ctl-add="type">' + typeOptions(_add.type) + '</select>' +
        '<input type="text" data-ctl-add="description" placeholder="Description" value="' + esc(_add.description) + '" style="min-width:260px">' +
        '<button class="primary" data-action="ctl-add">Add</button>' +
        '</div>';

      // Add-type + import-CSV tools (review-3 #5a/#5b).
      var tools = '<div class="ctl-tools">' +
        '<div class="ctl-add-type">' +
          '<input type="text" data-ctl-newtype placeholder="New type name" value="' + esc(_newType) + '" style="min-width:160px">' +
          '<button data-action="ctl-add-type">Add type</button>' +
          '<span class="muted" style="font-size:12px">Known: ' + esc(App.store.knownControlTypes().join(', ')) + '</span>' +
        '</div>' +
        '<div class="ctl-import">' +
          '<button data-action="ctl-import">Import controls (CSV)…</button>' +
          '<span class="muted" style="font-size:12px">Columns must be exactly: <code>title,type,description</code></span>' +
          '<input type="file" data-ctl-import-file accept=".csv,text/csv" class="visually-hidden" aria-hidden="true">' +
        '</div></div>';

      // review-4 #3: the add-type + import tools sit to the RIGHT of the title, not beneath it.
      // review-4 #4: a searchable table (search box outside #ctl-table-host so it keeps focus).
      var toolbar = '<div class="ctl-toolbar"><input type="search" class="ctl-search" data-ctl-search placeholder="Search controls (title / type / tag / description)…" value="' + esc(_cm.search) + '" aria-label="Search controls"></div>';
      // review-10 #2: no max-width cap so the table can span the full screen width
      // when columns are widened (the .main content area is already full-width).
      return '<div>' +
        '<div class="ctl-header"><h2>Control Manager</h2>' + tools + '</div>' +
        '<p class="muted">Controls are the requirements an item satisfies. Assign controls to items from the data tabs (Control Refs); assign them to <strong>devices</strong> with the per-device columns below (or by clicking a device&rsquo;s column heading to do every control shown at once).</p>' +
        addForm +
        toolbar +
        renderDeviceBar(project) +
        '<div class="table-wrap' + (_cm.railCollapsed ? ' rail-collapsed' : '') + '">' +
          '<div id="ctl-table-host">' + renderTable(project) + '</div>' +
          renderTagRail(project) +
        '</div>' +
        '</div>';
    }

    function wire(ctx) {
      _ctx = ctx;
      var dom = App.util.dom;
      // review-6 #4: drag-to-resize the Control Manager columns (persist to _cm.colWidths).
      dom.on(ctx.root, 'mousedown', '[data-cm-col-resize]', function (e, el) {
        e.preventDefault(); e.stopPropagation();
        var col = el.getAttribute('data-cm-col-resize');
        var th = el; while (th && th.tagName !== 'TH') th = th.parentNode;
        if (!th) return;
        var startX = e.clientX, startW = th.offsetWidth;
        function onMove(ev) { th.style.width = Math.max(60, startW + (ev.clientX - startX)) + 'px'; }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
          _cm.colWidths = _cm.colWidths || {};
          _cm.colWidths[col] = Math.max(60, startW + (ev.clientX - startX));
        }
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      });
      dom.on(ctx.root, 'input', '[data-ctl-add]', function (e, el) { _add[el.getAttribute('data-ctl-add')] = el.value; });
      dom.on(ctx.root, 'change', 'select[data-ctl-add="type"]', function (e, el) { _add.type = el.value; });
      dom.on(ctx.root, 'click', '[data-action="ctl-add"]', function () {
        var res = App.store.addControl({ title: _add.title, type: _add.type, description: _add.description });
        if (res.ok) { _add = { title: '', type: 'ISM', description: '' }; } else { App.ui.activity.logIssues(res.issues, 'Add control'); }
        ctx.refreshMain();
      });
      // Search the controls table — re-render ONLY the table host so the box keeps focus.
      dom.on(ctx.root, 'input', '[data-ctl-search]', function (e, el) {
        var val = el.value;
        if (_cmSearchTimer) clearTimeout(_cmSearchTimer);
        _cmSearchTimer = setTimeout(function () {
          _cm.search = val;
          var project = App.store.getProject();
          var host = document.getElementById('ctl-table-host');
          if (host) host.innerHTML = renderTable(project);
          // TAG-2: the rail's bulk button names the SHOWN count and flips between
          // tag/untag, both of which the search changes — so it has to be re-rendered
          // with the table or it will promise a number it is not going to act on.
          // (Re-rendered in place, not via refreshMain, so the search box keeps focus.)
          refreshRail(project);
        }, 150);
      });
      // ---- CMF-1: the column filters --------------------------------------------
      // Only the table host is re-rendered, exactly like the search box above: the rail
      // is rebuilt too, because its bulk button names the SHOWN count and a filter
      // changes it — a button promising "Tag all 40 shown" after a filter cut the table
      // to 6 would act on a set nobody chose.
      dom.on(ctx.root, 'change', '[data-cm-filter]', function (e, el) {
        var key = el.getAttribute('data-cm-filter');
        _cm.filters = _cm.filters || {};
        if (el.value) _cm.filters[key] = el.value; else delete _cm.filters[key];
        var project = App.store.getProject();
        var host = document.getElementById('ctl-table-host');
        if (host) host.innerHTML = renderTable(project);
        refreshRail(project);
      });
      dom.on(ctx.root, 'click', '[data-cm-filter-clear]', function () {
        _cm.filters = {};
        var project = App.store.getProject();
        var host = document.getElementById('ctl-table-host');
        if (host) host.innerHTML = renderTable(project);
        refreshRail(project);
      });
      // Per-row dropdown (expander) — re-render only the table host.
      dom.on(ctx.root, 'click', '[data-ctl-expand]', function (e, el) {
        var id = el.getAttribute('data-ctl-expand');
        if (_cm.expanded[id]) delete _cm.expanded[id]; else _cm.expanded[id] = true;
        var host = document.getElementById('ctl-table-host');
        if (host) host.innerHTML = renderTable(App.store.getProject());
      });
      dom.on(ctx.root, 'change', '[data-ctl-field]', function (e, el) {
        var patch = {}; patch[el.getAttribute('data-ctl-field')] = el.value;
        App.store.updateControl(el.getAttribute('data-ctl-id'), patch);
      });
      // review-13 #4: which devices get their own checkbox column. Only the table host
      // is re-rendered so the picker itself (and its focus) is untouched.
      dom.on(ctx.root, 'change', '[data-cm-devcol]', function (e, el) {
        var project = App.store.getProject();
        if (_cm.deviceCols === null) { // materialise the implicit "all" before editing it
          _cm.deviceCols = {};
          allDevices(project).forEach(function (d) { _cm.deviceCols[d.baseId] = true; });
        }
        var baseId = el.getAttribute('data-cm-devcol');
        if (el.checked) _cm.deviceCols[baseId] = true; else delete _cm.deviceCols[baseId];
        var host = document.getElementById('ctl-table-host');
        if (host) host.innerHTML = renderTable(project);
      });
      dom.on(ctx.root, 'click', '[data-cm-devcol-all]', function () { _cm.deviceCols = null; ctx.refreshMain(); });
      dom.on(ctx.root, 'click', '[data-cm-devcol-none]', function () { _cm.deviceCols = {}; ctx.refreshMain(); });
      // Assignment checkbox — shared by the row dropdown and the per-device columns.
      // STAB-3: no full re-render. The box is already in its new state; refresh the two
      // cells and the column heading that actually changed, and leave the page still.
      dom.on(ctx.root, 'change', '[data-ctl-device]', function (e, el) {
        var id = el.getAttribute('data-ctl-device'), baseId = el.getAttribute('data-baseid');
        var project = App.store.getProject();
        var c = (project.controls || []).filter(function (x) { return x.id === id; })[0]; if (!c) return;
        var set = (c.assignedDeviceIds || []).filter(function (b) { return b !== baseId; });
        if (el.checked) set.push(baseId);
        quietly(function () { App.store.updateControl(id, { assignedDeviceIds: set }); });
        var after = App.store.getProject();
        refreshRow(after, id);
        refreshDeviceHead(after, baseId);
      });
      // ---- TAG-3: the device column header toggles the whole column, over the SHOWN set
      dom.on(ctx.root, 'click', '[data-cm-dev-toggle]', function (e, el) {
        var baseId = el.getAttribute('data-cm-dev-toggle');
        var project = App.store.getProject();
        var list = shownControls(project);
        if (!list.length) return;
        var removing = allShownHaveDevice(project, baseId);
        var res = App.store.setControlsDevice(list.map(function (c) { return c.id; }), baseId, !removing);
        var dev = allDevices(project).filter(function (d) { return d.baseId === baseId; })[0];
        App.ui.activity.log({ severity: 'info',
          message: (removing ? 'Removed' : 'Assigned') + ' device "' + ((dev && dev.name) || baseId) + '" ' +
            (removing ? 'from' : 'to') + ' ' + res.changed + ' of the ' + list.length + ' control(s) shown' +
            (_cm.search ? ' (search: "' + _cm.search + '")' : '') + '.' });
      });

      // ---- TAG-2: the tools rail -------------------------------------------------
      dom.on(ctx.root, 'click', '[data-cm-rail-toggle]', function () { _cm.railCollapsed = !_cm.railCollapsed; ctx.refreshMain(); });
      dom.on(ctx.root, 'click', '[data-cm-tag-toggle]', function () {
        _cm.tagMode = !_cm.tagMode;
        if (!_cm.tagMode) _cm.tagName = '';   // leaving clears the selection; the tags stay
        ctx.refreshMain();
      });
      dom.on(ctx.root, 'click', '[data-cm-tag-pick]', function (e, el) {
        var t = el.getAttribute('data-cm-tag-pick');
        _cm.tagName = (_cm.tagName === t) ? '' : t;   // click the active one to deselect
        ctx.refreshMain();
      });
      dom.on(ctx.root, 'input', '[data-cm-tag-search]', function (e, el) {
        var pos = el.selectionStart;
        _cm.tagSearch = el.value;
        ctx.refreshMain();
        var again = document.querySelector('[data-cm-tag-search]');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
      });
      dom.on(ctx.root, 'input', '[data-cm-tag-new]', function (e, el) { _cm.newTag = el.value; });
      dom.on(ctx.root, 'click', '[data-cm-tag-add]', function () {
        var name = String(_cm.newTag || '').trim();
        var res = App.store.addControlTag(name);
        App.ui.activity.logIssues(res.issues, 'Tag');
        if (res.ok) { _cm.newTag = ''; _cm.tagName = name; }
        ctx.refreshMain();
      });
      // STAB-3: same as the device boxes — repaint the row's badges and the rail (whose
      // tag counts and bulk button read the whole table), not the tab.
      dom.on(ctx.root, 'change', '[data-ctl-tag-check]', function (e, el) {
        if (!_cm.tagName) return;
        var id = el.getAttribute('data-ctl-id'), res;
        quietly(function () { res = App.store.setControlTag([id], _cm.tagName, el.checked); });
        App.ui.activity.logIssues(res.issues, 'Tag');
        var after = App.store.getProject();
        refreshRow(after, id);
        refreshRail(after);
      });
      dom.on(ctx.root, 'click', '[data-cm-tag-all]', function () {
        if (!_cm.tagName) return;
        var project = App.store.getProject();
        var list = shownControls(project);
        if (!list.length) return;
        var removing = allShownHaveTag(project, _cm.tagName);
        var res = App.store.setControlTag(list.map(function (c) { return c.id; }), _cm.tagName, !removing);
        App.ui.activity.log({ severity: 'info',
          message: (removing ? 'Removed' : 'Applied') + ' tag "' + _cm.tagName + '" ' + (removing ? 'from' : 'to') + ' ' +
            res.changed + ' of the ' + list.length + ' control(s) shown' +
            (_cm.search ? ' (search: "' + _cm.search + '")' : '') + '.' });
      });
      dom.on(ctx.root, 'click', '[data-cm-tag-delete]', function (e, el) {
        var t = el.getAttribute('data-cm-tag-delete');
        if (!window.confirm('Delete the tag "' + t + '"? It is removed from every control that carries it. Nothing else about those controls changes.')) return;
        App.ui.activity.logIssues(App.store.removeControlTag(t).issues, 'Tag');
        _cm.tagName = '';
        ctx.refreshMain();
      });

      dom.on(ctx.root, 'click', '[data-ctl-remove]', function (e, el) {
        var res = App.store.removeControl(el.getAttribute('data-ctl-remove'));
        App.ui.activity.logIssues(res.issues);
        ctx.refreshMain();
      });
      // Add a control type manually (review-3 #5a).
      dom.on(ctx.root, 'input', '[data-ctl-newtype]', function (e, el) { _newType = el.value; });
      dom.on(ctx.root, 'click', '[data-action="ctl-add-type"]', function () {
        var res = App.store.addControlType(_newType);
        App.ui.activity.logIssues(res.issues);
        if (res.ok) _newType = '';
        ctx.refreshMain();
      });
      // Import controls from CSV (review-3 #5b).
      dom.on(ctx.root, 'click', '[data-action="ctl-import"]', function () {
        var inp = ctx.root.querySelector('[data-ctl-import-file]'); if (inp) inp.click();
      });
      dom.on(ctx.root, 'change', '[data-ctl-import-file]', function (e, el) {
        var file = el.files[0]; if (!file) return;
        App.util.dom.readFileText(file).then(function (text) {
          var rows = App.util.csv.parseCsv(text);
          if (!rows.length) { App.ui.activity.log({ severity: 'error', message: 'Control CSV import: empty file.' }); return; }
          var header = rows[0].map(function (h) { return String(h).trim(); });
          if (header.length !== 3 || header[0] !== 'title' || header[1] !== 'type' || header[2] !== 'description') {
            App.ui.activity.log({ severity: 'error', message: 'Control CSV import refused: the header row must be exactly "title,type,description".', location: 'line 1' });
            ctx.refreshMain(); return;
          }
          var list = [];
          for (var i = 1; i < rows.length; i++) {
            var r = rows[i]; if (r.length === 1 && String(r[0]).trim() === '') continue;
            if (r.length < 3 || !String(r[0]).trim()) { App.ui.activity.log({ severity: 'warning', message: 'Control CSV: skipped malformed row ' + (i + 1) + '.' }); continue; }
            list.push({ title: String(r[0]).trim(), type: String(r[1]).trim(), description: String(r[2]) });
          }
          var res = App.store.importControls(list);
          App.ui.activity.logIssues(res.issues);
          ctx.refreshMain();
        }).catch(function (err) { App.ui.activity.log({ severity: 'error', message: 'Control CSV read failed: ' + (err && err.message) }); });
      });
    }

    App.ui = App.ui || {}; App.ui.views = App.ui.views || {};
    App.ui.views.controls = { render: render, wire: wire, renderTable: renderTable, _cm: _cm,
      shownControls: shownControls, allShownHaveDevice: allShownHaveDevice, allShownHaveTag: allShownHaveTag,
      // CMF-1: the filter vocabulary + predicate, exposed so the rules are testable
      // without synthesising a change event on a <select>.
      cmFilterColumns: cmFilterColumns, cmFilterPredicate: cmFilterPredicate };
  })(App);
