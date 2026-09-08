  /* =============================================================================
   * MODULE: App.ui.views.formats  — VF-5 "Value formats" manager
   * PURPOSE: Create and edit the project's NAMED, REUSABLE value formats: a left
   *          list of formats, a right editor for the selected one, and — for the
   *          `options` kind — a table of allowed values each with a description of
   *          what it does. This is the surface behind "put in each string as a
   *          possible option and then also a description of what that option does".
   * PURITY:  render returns a string; wiring is registered by App.ui.app.
   * DEPENDS: App.store, App.valueFormats, App.util.html
   * INVARIANTS: renders only when open; every write goes through a store mutator so
   *             it participates in dirty-tracking and validation like any other edit.
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;

    // UI-only state: which format the editor is showing. Never persisted.
    var _fm = { open: false, selected: null, draftName: '' };

    /** Open the manager, optionally selecting a format (or 'new'). */
    function open(selectId) { _fm.open = true; _fm.selected = selectId || null; }
    function close() { _fm.open = false; _fm.selected = null; _fm.draftName = ''; }
    function isOpen() { return !!_fm.open; }

    /** The format the editor should show: the selected one, else the first. */
    function current(project) {
      var list = (project && project.valueFormats) || [];
      if (_fm.selected === 'new') return null;
      var sel = list.filter(function (f) { return f.id === _fm.selected; })[0];
      return sel || list[0] || null;
    }

    function kindSelect(cur) {
      return '<select data-fmt-kind-pick aria-label="Format kind">' +
        App.valueFormats.CUSTOM_KINDS.map(function (k) {
          return '<option value="' + esc(k.id) + '"' + (cur === k.id ? ' selected' : '') + ' title="' + esc(k.hint) + '">' + esc(k.label) + '</option>';
        }).join('') + '</select>';
    }

    /** The allowed-values table: one row per option, value + "what it does". */
    function optionsTable(fmt) {
      var opts = (fmt.options || []);
      var rows = opts.map(function (o, i) {
        return '<tr>' +
          '<td><input type="text" data-fmt-opt-value data-idx="' + i + '" value="' + esc(o.value) + '" aria-label="Allowed value ' + (i + 1) + '"></td>' +
          '<td><input type="text" data-fmt-opt-desc data-idx="' + i + '" value="' + esc(o.description || '') + '" placeholder="what this option does" aria-label="Description of ' + esc(o.value) + '"></td>' +
          '<td><button type="button" class="danger" data-fmt-opt-remove data-idx="' + i + '" title="Remove this option">Remove</button></td>' +
          '</tr>';
      }).join('');
      return '<table class="fmt-opts"><thead><tr><th>Allowed value</th><th>What it does</th><th></th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="3" class="muted">No options yet — add the first allowed value below.</td></tr>') + '</tbody></table>' +
        '<div class="fmt-add-row">' +
          '<input type="text" data-fmt-new-value placeholder="value, e.g. enable_both" aria-label="New allowed value">' +
          '<input type="text" data-fmt-new-desc placeholder="what it does, e.g. Both SIM slots active" aria-label="New option description">' +
          '<button type="button" data-fmt-opt-add>Add option</button>' +
        '</div>';
    }

    function editor(project, fmt) {
      if (!fmt) {
        return '<div class="fmt-editor"><h4>New value format</h4>' +
          '<p class="muted">Give the format a name, then choose what shape its values take. ' +
          'Once saved you can assign it to any item from that item&rsquo;s <strong>Value format</strong> picker.</p>' +
          '<div class="fmt-grid">' +
            '<label>Name</label><input type="text" data-fmt-new-name placeholder="e.g. 5G radio mode" value="' + esc(_fm.draftName || '') + '" aria-label="New format name">' +
            '<label>Kind</label>' + kindSelect('options') +
          '</div>' +
          '<div class="fmt-actions"><button type="button" class="primary" data-fmt-create>Create format</button></div>' +
          '</div>';
      }
      var used = App.valueFormats.usageCount(project, fmt.id);
      var body = '';
      if ((fmt.kind || 'options') === 'options') {
        body = '<h5>Allowed values</h5>' +
          '<p class="muted">Each value is offered in the item&rsquo;s dropdown, with its description beside it, and anything outside this list is rejected.</p>' +
          optionsTable(fmt);
      } else if (fmt.kind === 'number') {
        body = '<div class="fmt-grid">' +
          '<label>Minimum</label><input type="text" inputmode="decimal" data-fmt-min value="' + esc(fmt.min == null ? '' : fmt.min) + '" placeholder="(no minimum)" aria-label="Minimum">' +
          '<label>Maximum</label><input type="text" inputmode="decimal" data-fmt-max value="' + esc(fmt.max == null ? '' : fmt.max) + '" placeholder="(no maximum)" aria-label="Maximum">' +
          '</div>';
      } else if (fmt.kind === 'string') {
        body = '<div class="fmt-grid">' +
          '<label>Pattern</label><input type="text" data-fmt-pattern value="' + esc(fmt.pattern || '') + '" placeholder="optional regular expression" aria-label="Pattern">' +
          '</div>';
      } else {
        body = '<p class="muted">A list of strings, entered one per line on the item.</p>';
      }
      return '<div class="fmt-editor">' +
        '<div class="fmt-grid">' +
          '<label>Name</label><input type="text" data-fmt-name value="' + esc(fmt.name || '') + '" aria-label="Format name">' +
          '<label>Kind</label>' + kindSelect(fmt.kind || 'options') +
          '<label>Description</label><textarea data-fmt-desc placeholder="what this format is for" aria-label="Format description">' + esc(fmt.description || '') + '</textarea>' +
        '</div>' +
        '<div class="muted fmt-usage">Used by <strong>' + used + '</strong> item' + (used === 1 ? '' : 's') + '.</div>' +
        body +
        '<div class="fmt-actions">' +
          '<button type="button" class="danger" data-fmt-remove data-id="' + esc(fmt.id) + '" title="Delete this format; items using it fall back to the format inferred from their capture">Delete format</button>' +
        '</div>' +
        '</div>';
    }

    /** @returns {string} HTML for the modal, or '' when closed. */
    function render() {
      if (!_fm.open) return '';
      var project = App.store.getProject();
      if (!project) return '';
      var list = (project.valueFormats || []).slice().sort(function (a, b) {
        var an = a.name || a.id, bn = b.name || b.id;
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
      var fmt = current(project);
      var items = list.map(function (f) {
        var on = fmt && f.id === fmt.id && _fm.selected !== 'new';
        var n = App.valueFormats.usageCount(project, f.id);
        return '<button type="button" class="fmt-pick' + (on ? ' active' : '') + '" data-fmt-select="' + esc(f.id) + '">' +
          '<span class="fmt-pick-name">' + esc(f.name || f.id) + '</span>' +
          '<span class="fmt-pick-meta">' + esc(f.kind || 'options') + ' · ' + n + ' item' + (n === 1 ? '' : 's') + '</span>' +
          '</button>';
      }).join('');
      return '<div class="modal-overlay" data-fmt-modal>' +
        '<div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="Value formats">' +
          '<div class="modal-head"><h3>Value formats</h3>' +
            '<span class="modal-sub">Reusable shapes for decision values — assign one to any item from its Value format picker.</span>' +
            '<button type="button" class="modal-close" data-fmt-close aria-label="Close">×</button></div>' +
          '<div class="modal-body fmt-body">' +
            '<div class="fmt-list">' + items +
              '<button type="button" class="fmt-pick fmt-new' + (_fm.selected === 'new' ? ' active' : '') + '" data-fmt-select="new">+ New format</button>' +
            '</div>' +
            (_fm.selected === 'new' ? editor(project, null) : (fmt ? editor(project, fmt) : editor(project, null))) +
          '</div>' +
        '</div></div>';
    }

    App.ui = App.ui || {}; App.ui.views = App.ui.views || {};
    App.ui.views.formats = { render: render, open: open, close: close, isOpen: isOpen, _fm: _fm, current: current };
  })(App);
