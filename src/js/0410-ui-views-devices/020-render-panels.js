    /**
     * The device-configuration panels (spec §11.3 / §19.5, DOD-9 amended). Each panel
     * is collapsible (review-5 #1) and filtered by the search term (review-3 #6).
     *  - LATEST version: lists every APPLICABLE item showing its EFFECTIVE decision
     *    (default→group→device), a divergence class/marker (OVR-4), an inline override
     *    editor (writes via store.setDeviceOverride, OVR-8) and a Revert affordance.
     *  - SUPERSEDED version: read-only (effective decision only).
     */
    function renderPanels(project, deviceId, search) {
      var q = (search || '').toLowerCase().trim();
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      var isLatest = !!dc && App.ui.model.getLatestConfigs(project).some(function (c) { return c.id === deviceId; });
      var clsOrder = { device: 0, group: 1, 'default': 2 };
      return datasets(project).map(function (d) {
        var adapter = App.registry.getDataset(project.platformProfileId, d.id);
        var get = decisionGet(adapter);
        var dispKey = adapter.displayKey || function (k) { return k; };
        var appItems = applicable(project, deviceId, d.id);
        var rows = appItems.map(function (it) {
          var eff = App.overrides.effectiveItem(project, d.id, it, deviceId);
          var cls = App.overrides.classify(project, d.id, it, deviceId);
          var hasOv = !!(dc && dc.overrides && dc.overrides[d.id] && Object.prototype.hasOwnProperty.call(dc.overrides[d.id], it.key));
          return { it: it, eff: eff, disp: dispKey(it.key), dec: eff.decision != null ? String(get(eff)) : '', cls: cls, hasOv: hasOv };
        }).filter(function (r) {
          if (!q) return true;
          return (r.disp + ' ' + r.dec + ' ' + (r.it.description || '')).toLowerCase().indexOf(q) !== -1;
        });
        rows.sort(function (a, b) {
          if (_dev.deviationsFirst && clsOrder[a.cls] !== clsOrder[b.cls]) return clsOrder[a.cls] - clsOrder[b.cls];
          return a.it.key < b.it.key ? -1 : a.it.key > b.it.key ? 1 : 0;
        });
        var bodyRows = rows.map(function (r) {
          var rowCls = r.cls === 'group' ? 'dev-diverge-group' : r.cls === 'device' ? 'dev-diverge-device' : '';
          var marker = r.cls === 'group' ? '<span class="diverge-tag group" title="Differs from default via a group override">group</span>'
            : r.cls === 'device' ? '<span class="diverge-tag device" title="Differs from the inherited value via this device&#39;s override">device</span>' : '';
          var decCell = '<td>' + (r.dec ? esc(r.dec) : '<span class="muted">—</span>') + ' ' + marker + '</td>';
          if (!isLatest) return '<tr class="' + rowCls + '"><td>' + esc(r.disp) + '</td>' + decCell + '</tr>';
          var editor = '<div class="ov-edit">' + renderOverrideControl(adapter, d.id, r.it, r.eff.decision) +
            (r.hasOv ? ' <button type="button" class="ov-revert" data-ov-revert data-ds="' + esc(d.id) + '" data-key="' + esc(r.it.key) + '" title="Revert to the inherited value">Revert</button>' : '') + '</div>';
          return '<tr class="' + rowCls + '"><td>' + esc(r.disp) + '</td>' + decCell + '<td>' + editor + '</td></tr>';
        }).join('');
        // review-8 #3: fixed-layout, drag-resizable columns keyed PER dataset (so a long
        // value no longer squishes the Override column, and each panel can be sized
        // independently).
        var panelCols = isLatest
          ? [{ key: 'key', label: 'Key', w: 220 }, { key: 'effective', label: 'Effective', w: 170 }, { key: 'override', label: 'Override', w: 220 }]
          : [{ key: 'key', label: 'Key', w: 260 }, { key: 'effective', label: 'Effective', w: 220 }];
        var pcw = (_dev.panelColWidths && _dev.panelColWidths[d.id]) || {};
        var headCols = panelCols.map(function (c) {
          var w = pcw[c.key] || c.w;
          return '<th data-dev-col scope="col" style="width:' + w + 'px">' + esc(c.label) +
            '<span class="col-resize" data-dev-col-resize="' + esc(d.id) + '|' + c.key + '" title="Drag to resize"></span></th>';
        }).join('');
        var body = rows.length
          ? '<table class="dev-panel-table"><thead><tr>' + headCols + '</tr></thead><tbody>' + bodyRows + '</tbody></table>'
          : '<div class="empty">' + (q ? 'No matching applicable items.' : 'No applicable items.') + '</div>';
        var note = '<div class="panel-note">' + rows.length + (q ? ' matching' : '') + ' of ' + appItems.length + ' applicable</div>';
        var collapsed = !!_dev.collapsed[d.id];
        var caret = collapsed ? '▸' : '▾';
        return '<div class="panel' + (collapsed ? ' collapsed' : '') + '">' +
          '<h3><button type="button" class="panel-toggle" data-panel-toggle="' + esc(d.id) + '" aria-expanded="' + (!collapsed) + '"><span class="caret">' + caret + '</span> ' + esc(d.label) + '</button></h3>' +
          note + body + '</div>';
      }).join('');
    }

    /**
     * Controls assigned to this device, each a button that opens a modal listing the
     * exact items (per dataset) applicable to BOTH this device and that control —
     * i.e. what is done to satisfy that control here (review-5 #1).
     */
    function renderDeviceControls(project, deviceId) {
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return '';
      var controls = (project.controls || []).filter(function (c) {
        return (c.assignedDeviceIds || []).indexOf(dc.baseId) !== -1;
      }).sort(function (a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; });
      var inner;
      if (!controls.length) {
        inner = '<p class="muted">No controls are assigned to this device. Assign controls to devices in the <strong>Control Manager</strong> tab.</p>';
      } else {
        inner = '<div class="ctl-applies-list">' + controls.map(function (c) {
          var n = countControlItems(project, deviceId, c.id);
          // review-12 #1: the state is per DEVICE (keyed by baseId) — a control added to
          // a device starts 'unsatisfied' and is flipped manually here. The toggle sits
          // OUTSIDE the control button (buttons cannot nest).
          var state = App.store.controlDeviceState(c, dc.baseId);
          var decided = App.projectIo.controlStateDecided(state);
          // JUS-2: the state is now shown here but CHANGED in the control's modal — the
          // decision belongs next to the evidence for it (the items that satisfy the
          // control) and next to the justification box, not on a summary row where you
          // can mark something satisfied without having looked at anything.
          var why = App.store.controlDeviceJustification(c, dc.baseId);
          // REV-2: the justification is NOT echoed here. It is prose — often a sentence or
          // three — and putting it on the summary row squeezed the control button to fit
          // it, so the rows no longer lined up and the button you actually click got
          // smaller the more you had written. It belongs with the evidence, in the modal.
          // What stays is the state, plus the "no justification" flag, which is a warning
          // rather than content: it says something is MISSING and is a fixed width.
          return '<div class="ctl-applies-row">' +
            '<button type="button" class="ctl-applies-item" data-control-open="' + esc(c.id) + '">' +
              '<span class="ctl-applies-title">' + esc(c.title) + '</span>' +
              '<span class="muted">' + esc(c.type) + '</span>' +
              '<span class="ctl-applies-count">' + n + ' item' + (n === 1 ? '' : 's') + '</span></button>' +
            // REV-2: the badges share a holder sized to their content, so the space the
            // justification used to take goes back to the button rather than being
            // reserved for nothing.
            '<span class="ctl-applies-state">' +
              '<span class="badge ' + esc(state) + '" data-control-state="' + esc(c.id) + '">' + esc(App.projectIo.controlStateLabel(state)) + '</span>' +
              (decided && !why ? '<span class="badge nojust" title="' + (state === 'exception'
                ? 'An exception with no justification recorded — the departure is the thing a reader needs explained. Open the control to record one.'
                : 'Marked satisfied with no justification recorded \u2014 open the control to record one') + '">no justification</span>' : '') +
            '</span>' +
            '</div>';
        }).join('') + '</div>';
      }
      var unsat = unsatisfiedControls(project, dc.baseId).length;
      var summary = controls.length
        ? '<p class="muted" style="font-size:12px">' + (unsat
            ? '<span class="badge unsatisfied">' + unsat + ' unsatisfied</span> of ' + controls.length + ' assigned control(s) on this device.'
            : 'All ' + controls.length + ' assigned control(s) are settled on this device \u2014 satisfied, or satisfied with an exception.') + '</p>'
        : '';
      return '<div class="dev-controls"><h3>Controls applying to this device</h3>' +
        '<p class="muted" style="font-size:12px">Click a control to see exactly which packages and tactical items satisfy it on this device. Each control carries its own state per device \u2014 <strong>Unsatisfied</strong>, <strong>Satisfied</strong>, or <strong>Satisfied with Exception</strong> where it is met in substance but not in the form the guideline states. Newly added controls start unsatisfied.</p>' +
        summary + inner + '</div>';
    }

    /**
     * Controls assigned to a device (by baseId) that are NOT marked satisfied there
     * (review-12 #1). Drives the Devices-list indicator and the detail-view summary.
     * @returns {Control[]}
     */
    function unsatisfiedControls(project, baseId) {
      return (project.controls || []).filter(function (c) {
        // EXC-1: an exception is a DECISION, so it does not sit in the "still to look
        // at" pile. What it is instead — a departure needing a justification — is the
        // report's business, and the report says so.
        return (c.assignedDeviceIds || []).indexOf(baseId) !== -1 &&
          !App.projectIo.controlStateDecided(App.store.controlDeviceState(c, baseId));
      });
    }

    /** Count items applicable to a device that reference a given control (all datasets). */
    function countControlItems(project, deviceId, controlId) {
      return datasets(project).reduce(function (sum, d) {
        return sum + applicable(project, deviceId, d.id).filter(function (it) {
          return (it.controlRefs || []).indexOf(controlId) !== -1;
        }).length;
      }, 0);
    }

    /**
     * Modal: for one control + device, a read-only list per dataset of the items applicable
     * to the device that reference the control (review-5 #1). Closed via the × button
     * or a backdrop click.
     */
    function renderControlModal(project, deviceId, controlId) {
      var control = (project.controls || []).filter(function (c) { return c.id === controlId; })[0];
      if (!control) return '';
      var lists = datasets(project).map(function (d) {
        var adapter = App.registry.getDataset(project.platformProfileId, d.id);
        var get = decisionGet(adapter);
        var dispKey = adapter.displayKey || function (k) { return k; };
        var items = applicable(project, deviceId, d.id).filter(function (it) {
          return (it.controlRefs || []).indexOf(controlId) !== -1;
        }).sort(function (a, b) { return a.key < b.key ? -1 : 1; });
        // CTLM-1: Key and Decision ONLY. The panels sit side by side in a grid, and a
        // third column pushed each table past its track — a package key is one long
        // unbreakable token, so the table could not shrink and Packages ran underneath
        // Tactical. Status was also the least useful column here: this list exists to
        // show what satisfies the control, and an item with no decision shows an empty
        // Decision, which says "undecided" just as plainly.
        var rows = items.map(function (it) {
          return '<tr><td>' + esc(dispKey(it.key)) + '</td><td>' + esc(it.decision ? String(get(it)) : '') + '</td></tr>';
        }).join('');
        var body = items.length
          ? '<table class="ctl-items"><thead><tr><th>Key</th><th>Decision</th></tr></thead><tbody>' + rows + '</tbody></table>'
          : '<div class="empty">No items reference this control on this device.</div>';
        return '<div class="panel"><h3>' + esc(d.label) + ' (' + items.length + ')</h3>' + body + '</div>';
      }).join('');
      // JUS-1/JUS-2: the satisfaction decision and its justification live HERE, under the
      // evidence, so marking a control satisfied is something you do having just looked at
      // what satisfies it — and the reason is captured at the same moment.
      var dc0 = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      var baseId = dc0 ? dc0.baseId : '';
      var state = App.store.controlDeviceState(control, baseId);
      var decided = App.projectIo.controlStateDecided(state);
      var next = App.projectIo.nextControlState(state);
      var why = App.store.controlDeviceJustification(control, baseId);
      /* EXC-1: one button that CYCLES, rather than three that have to be told apart.
       * The three states are a progression — nothing decided, decided, decided with a
       * documented departure — and a single control that steps through them is the
       * shape the operator asked for. The button says where the next click lands, so
       * the cycle is readable without having to know the order in advance. */
      var decision =
        '<div class="ctl-decide">' +
          '<div class="ctl-decide-head">' +
            '<span>Status on <strong>' + esc(dc0 ? dc0.name : '') + '</strong>:</span> ' +
            '<span class="badge ' + esc(state) + '">' + esc(App.projectIo.controlStateLabel(state)) + '</span>' +
            '<button type="button" class="' + (decided ? '' : 'primary') + '" data-control-state-toggle="' + esc(control.id) + '" data-state="' + esc(next) + '"' +
              ' title="Click to cycle: Unsatisfied \u2192 Satisfied \u2192 Satisfied with Exception">' +
              'Mark ' + esc(App.projectIo.controlStateLabel(next).toLowerCase()) + '</button>' +
          '</div>' +
          '<label class="ctl-just-label" for="ctl-just">Justification \u2014 why the decisions above satisfy this control on this device, and what the exception is if there is one</label>' +
          '<textarea id="ctl-just" class="ctl-just" data-control-justification="' + esc(control.id) + '"' +
            ' placeholder="e.g. Bluetooth is disabled by policy and the three Bluetooth packages are removed; no operational need on this fleet."' +
            ' aria-label="Justification">' + esc(why) + '</textarea>' +
          (decided && !why ? '<div class="ctl-just-warn">' + (state === 'exception'
            ? 'This control is marked as satisfied with an exception and no justification is recorded. The exception is exactly what a reader needs explained \u2014 the report will show it as unjustified.'
            : 'This control is marked satisfied with no justification recorded. The report will show it as unjustified.') + '</div>' : '') +
          '<div class="muted ctl-just-note">Saved as you type (on blur). It is carried into the generated report and the control report as the evidence for this decision.</div>' +
        '</div>';
      return '<div class="modal-overlay" data-control-modal>' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Actions satisfying control ' + esc(control.title) + '">' +
          '<div class="modal-head">' +
            '<div><h3>' + esc(control.title) + '</h3>' +
            '<div class="modal-sub">' + esc(control.type) + (control.description ? ' · ' + esc(control.description) : '') + '</div></div>' +
            '<button type="button" class="modal-close" data-control-modal-close aria-label="Close">×</button>' +
          '</div>' +
          '<div class="modal-body">' + decision + '<div class="panels">' + lists + '</div></div>' +
        '</div>' +
      '</div>';
    }

    function renderDetail(project, deviceId) {
      var dc = project.deviceConfigs.filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return '<div class="empty-state">Device not found. <button data-device-back>Back</button></div>';
      var isLatest = App.ui.model.getLatestConfigs(project).some(function (c) { return c.id === deviceId; });
      var banner = isLatest ? '' : '<div class="superseded-banner">Superseded version — read-only history. Generation and readiness use the latest version.</div>';

      // Legend (OVR-4): yellow = group override, orange = device override.
      var legend = '<div class="diverge-legend"><span class="swatch group"></span> Group override <span class="swatch device"></span> Device override</div>';
      // "Deviations first" pin toggle (OVR-5), UI-state only.
      var pin = '<label class="dev-pin"><input type="checkbox" data-dev-deviations-first' + (_dev.deviationsFirst ? ' checked' : '') + '> Deviations first</label>';
      // review-7 #1: collapse/expand every panel at once.
      var dsList = datasets(project);
      var allCollapsed = dsList.length > 0 && dsList.every(function (d) { return _dev.collapsed[d.id]; });
      var collapseAll = '<button class="dev-collapse-all" data-dev-collapse-all>' + (allCollapsed ? 'Expand all' : 'Collapse all') + '</button>';

      return '<div>' +
        '<button data-device-back>← Devices</button>' +
        '<div class="dev-detail-head" style="margin-top:10px">' +
          '<h2 style="margin:0">' + esc(dc.name) + '</h2>' +
          '<span class="dev-meta">' + esc(dc.model) + ' · ' + esc(dc.firmware) + ' · v' + dc.version + ' · onboarded ' + esc(dc.onboardedUtc.slice(0, 10)) + '</span>' +
          (isLatest ? legend : '') +
        '</div>' +
        banner +
        '<div class="dev-detail-tools">' +
          '<input class="dev-search" type="search" data-dev-search placeholder="Filter this device\'s items…" value="' + esc(_dev.detailSearch || '') + '" aria-label="Filter device items">' +
          (isLatest ? pin : '') +
          collapseAll +
        '</div>' +
        (isLatest ? '<p class="muted" style="font-size:12px;margin:4px 0">Decisions shown are <strong>effective</strong> (default → group → device). Edit a value to set a <strong>device override</strong>; matching the inherited value reverts it. Group overrides are managed from the Devices list.</p>' : '') +
        '<div class="panels" id="dev-panels">' + renderPanels(project, deviceId, _dev.detailSearch) + '</div>' +
        renderDeviceControls(project, deviceId) +
        (isLatest ? renderAssignSection(project, deviceId) : '') +
        (_dev.openControlId ? renderControlModal(project, deviceId, _dev.openControlId) : '') +
        '</div>';
    }

    /** "Set decisions from files" controls — one per dataset (spec §18.2). */
    function renderAssignSection(project, deviceId) {
      var blocks = datasets(project).map(function (d) {
        var adapter = App.registry.getDataset(project.platformProfileId, d.id);
        if (!adapter || typeof adapter.parseAssignment !== 'function') return '';
        var res = _dev.assignResults[d.id];
        var resHtml = '';
        if (res) {
          resHtml = '<div class="assign-result ' + (res.ok ? 'success' : 'error') + '">' +
            res.issues.map(function (i) { return '<div class="' + esc(i.severity) + '">' + esc(i.message) + (i.location ? ' [' + esc(i.location) + ']' : '') + '</div>'; }).join('') + '</div>';
        }
        return '<div class="assign-block">' +
          '<strong>' + esc(d.label) + '</strong>' +
          '<div class="muted" style="font-size:12px;margin:2px 0 4px">' + esc(adapter.assignmentHint || '') + '</div>' +
          '<input type="file" data-assign-file="' + esc(d.id) + '" aria-label="Set ' + esc(d.label) + ' decisions from file">' +
          resHtml +
          '</div>';
      }).join('');
      if (!blocks) return '';
      return '<div class="assign-section">' +
        '<h3>Set decisions from files</h3>' +
        '<p class="muted" style="font-size:12px">Applies decisions for this device\'s applicable keys. The file must contain <strong>exactly</strong> those keys (no more, no less) or it is refused with the differences listed. Note: decisions are shared across all devices that have a given key (unified-decision model).</p>' +
        '<p class="muted" style="font-size:12px">The Packages CSV may carry two <strong>optional</strong> extra columns after the required ones: <code>rationale</code> (fills each item\'s Rationale box) and <code>relevance</code> (fills the Security Relevance column — <code>HIGH</code>, <code>MEDIUM</code>, <code>LOW</code>, <code>REPORT</code>, <code>IRRELEVANT</code>, or blank). Items imported as REPORT or IRRELEVANT are hidden from the data tables until their toggle is switched on.</p>' +
        blocks +
        '</div>';
    }

    // =========================================================================
    // NOTE-1: General Platform Notes — a page per device for the knowledge that is not
    // a decision on any one register key.
    //
    // Everything else in this tool is structured: a key, a value, a control, a status.
    // That is exactly right for the decisions, and exactly wrong for what surrounds
    // them — "this firmware silently re-enables the package on reboot", "the Knox tray
    // has to be sealed before the passcode takes", "ask the vendor about X next time".
    // Before this page there was nowhere to put any of it, so it lived in someone's
    // notebook and left with them.
    //
    // It is RICH text (bold, italics, bullets, headings) because that is what notes
    // are: lists and emphasis, not a paragraph of plain prose. Storing HTML means it
    // has to be sanitised — on the way in AND on the way out, because a project file
    // can be hand-edited between the two. Hence scrubNotes() below, an allowlist walk
    // that keeps the structural tags and strips every attribute: no style, no event
    // handlers, no src. There is no way to author a link or an image here, so there is
    // nothing to preserve on the way back.
    // =========================================================================

    /** The only elements a note may contain. Everything else is unwrapped, not dropped. */
    var NOTE_TAGS = { P: 1, DIV: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1, H3: 1, H4: 1, BLOCKQUOTE: 1, CODE: 1, PRE: 1 };
    /** Elements whose CONTENT is not prose either — removed outright, children and all. */
    var NOTE_DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1, TEMPLATE: 1 };

    function scrubNode(n) {
      var parent = n.parentNode;
      if (!parent) return;
      if (n.nodeType === 3) return;                       // text survives verbatim
      if (n.nodeType !== 1) { parent.removeChild(n); return; }   // comments, CDATA, …
      var tag = String(n.tagName || '').toUpperCase();
      if (NOTE_DROP[tag]) { parent.removeChild(n); return; }
      // Depth-first: children are cleaned BEFORE this node may be unwrapped, so
      // unwrapping can never re-parent something that was not itself checked.
      Array.prototype.slice.call(n.childNodes).forEach(scrubNode);
      while (n.attributes.length) n.removeAttribute(n.attributes[0].name);
      if (!NOTE_TAGS[tag]) {
        while (n.firstChild) parent.insertBefore(n.firstChild, n);
        parent.removeChild(n);
      }
    }
    /**
     * @param {string} html @returns {string} the same notes with only allowed markup.
     *
     * Parsed through DOMParser rather than by assigning innerHTML to a detached <div>:
     * the result is an INERT document, so an `<img src=x onerror=…>` arriving in a
     * hand-edited project file never starts a load — and therefore never runs — even
     * for the instant before it is stripped.
     */
    function scrubNotes(html) {
      var src = String(html == null ? '' : html);
      var body;
      if (typeof window !== 'undefined' && window.DOMParser) {
        body = new window.DOMParser().parseFromString('<body>' + src + '</body>', 'text/html').body;
      } else {
        body = document.createElement('div');
        body.innerHTML = src;
      }
      Array.prototype.slice.call(body.childNodes).forEach(scrubNode);
      return body.innerHTML;
    }

    var NOTE_TOOLS = [
      { cmd: 'bold', label: 'B', title: 'Bold (Ctrl+B)', style: 'font-weight:700' },
      { cmd: 'italic', label: 'I', title: 'Italic (Ctrl+I)', style: 'font-style:italic' },
      { cmd: 'underline', label: 'U', title: 'Underline (Ctrl+U)', style: 'text-decoration:underline' },
      { cmd: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
      { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
      { cmd: 'formatBlock', arg: '<h3>', label: 'Heading', title: 'Make this line a heading' },
      { cmd: 'formatBlock', arg: '<p>', label: 'Body', title: 'Make this line ordinary body text' },
      { cmd: 'removeFormat', label: 'Clear', title: 'Strip formatting from the selection' }
    ];

