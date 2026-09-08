    function secFolder() {
      return h(2, 'Project folder') +
        p('Connect the tool to a folder and it saves itself into that folder as you work. ' +
          'Put that folder in OneDrive and you also get version history and backup from a service your organisation already runs. ' +
          'This is optional — everything below is in addition to <strong>Save project</strong>, which keeps working exactly as before.') +
        h(3, 'Connecting') +
        ul([
          'Click <strong>Connect a folder</strong> in the banner and choose the project&rsquo;s folder. One project per folder.',
          'If the folder is ever <strong>moved, renamed, or re-synced</strong> by OneDrive, the tool says so plainly and asks you to choose it again. Nothing is lost when that happens — your work stays open, and <strong>Save project</strong> will download it.',
          'Every time you reopen the tool afterwards, you will see a <strong>Reconnect</strong> button. That is normal, not a fault: browsers remember the folder but deliberately drop write permission when they restart. One click restores it.',
          'Until you reconnect, the app is <strong>read-only</strong>. That is on purpose — it is the one moment where you might otherwise believe your edits were being saved when they were not.',
          'Not connected at all is a perfectly normal way to work. Nothing is locked, and <strong>Save project</strong> is still there.'
        ]) +
        h(3, 'What lands in the folder') +
        deftable(['Path', 'What it is'], [
          ['<code>project.json</code>', 'The project. Written 60 seconds after your last change, and at least every 3 minutes while you keep working.'],
          ['<code>Snapshots/</code>', 'Previous versions, taken at most once every 5 minutes, newest 40 kept — roughly three and a half hours of rollback.'],
          ['<code>Outputs/</code>', 'Generated scripts and reports, unpacked, under <code>Outputs/&lt;device&gt;/&lt;command&gt;/</code>. Nothing here is ever deleted by the app — housekeeping is yours.'],
          ['<code>project.corrupt-&hellip;.json</code>', 'A project file that could not be read, moved aside rather than overwritten.']
        ]) +
        h(3, 'Saving on demand') +
        p('<strong>Save to folder</strong> in the top bar writes straight away and restarts the timer, ' +
          'so you never have to wonder whether the last minute made it. It also takes a snapshot even if ' +
          'one is not due — a save you chose is a point worth being able to roll back to. ' +
          'If nothing has changed since the last write, it does nothing, because identical content is not a new version.') +
        note('The folder <strong>chip</strong> beside the project name is a button. Click it at any time for the folder&rsquo;s name, <strong>Change folder</strong> and <strong>Disconnect</strong> — you never need to disconnect to re-point the tool somewhere else.') +
        h(3, 'Rolling back') +
        p('<strong>Roll back</strong> in the top bar lists the snapshots newest first. Restoring one snapshots your current state first, so a rollback is itself undoable. ' +
          'For anything older than the snapshots go, use OneDrive&rsquo;s own version history on <code>project.json</code>.') +
        note('The save cadence is deliberately slow. OneDrive records a version every time the file changes and prunes the oldest once it hits its limit, so a save-every-keystroke design would burn hundreds of meaningless versions in an afternoon and push the ones worth keeping off the end of the list.') +
        h(3, 'Working offline') +
        ul([
          'Everything works offline — the tool reads and writes the local copy of the folder, and OneDrive syncs it when you are back on the network.',
          'Version history only appears once the folder has synced, so an offline session will not show new versions in SharePoint yet.',
          'Set the folder to <strong>Always keep on this device</strong> in OneDrive. Otherwise Files On-Demand can leave snapshots and outputs as placeholders that cannot be read while you are offline.'
        ]) +
        h(3, 'If the folder changes underneath you') +
        p('If <code>project.json</code> changed since this tool last wrote it — a second machine, a second tab, or a synced edit — the write is <strong>refused</strong> rather than allowed to overwrite. ' +
          'A banner offers three ways out, and none of them throws anything away: <strong>Keep mine</strong> snapshots their version first, ' +
          '<strong>Take theirs</strong> snapshots yours first, and <strong>Save mine separately</strong> downloads yours and leaves the folder alone.') +
        note('If two people save at the same moment, OneDrive itself may write a conflict copy beside the original, named something like project-yourname.json. The tool reports any such file and never touches it.');
    }

    function secReference() {
      return h(2, 'Reference') +
        h(3, 'Glossary') +
        deftable(['Term', 'Meaning'], [
          ['<strong>Item</strong>', 'One configuration entry in the register: a package or a tactical path.'],
          ['<strong>Key</strong>', 'An item\'s identity, e.g. a package name or <code>imsSettings.simSlot0.enabled</code>.'],
          ['<strong>Decision</strong>', 'What the item should be — an action for packages, a value for tactical.'],
          ['<strong>Divergence</strong>', 'A decision that knowingly departs from the guidelines. Flagged in the <em>Diverges from Guidelines</em> column and explained in the row&rsquo;s <em>Divergence Narrative</em>: what it departs from, and why.'],
          ['<strong>Tag</strong>', 'A free, multi-valued label on a control (e.g. <em>administrative</em>), separate from its single Type. Applied from the Control Manager&rsquo;s Tools panel.'],
          ['<strong>Value format</strong>', 'The shape a value is allowed to take (boolean, number, text, string list, JSON, or your own named set of options). Inferred from the capture unless you pick one; a value outside its format blocks completeness.'],
          ['<strong>Procedure</strong>', 'The steps for carrying out a manual action, written on the action&rsquo;s row. Carried into the Implementation runbook and the Procedure report.'],
          ['<strong>Platform notes</strong>', 'Rich-text knowledge kept per device (Devices → Notes) — quirks, gotchas, what to check next time. Stored in the project; never generated into output.'],
          ['<strong>Snapshot</strong>', 'What one capture contained for one dataset: the key list plus a hash of the file.'],
          ['<strong>Applicable</strong>', 'An item is applicable to a device when its key is in that device\'s snapshot.'],
          ['<strong>Decided / undecided</strong>', 'An item is decided when its decision is present and valid.'],
          ['<strong>Ready</strong>', 'A device is ready when every applicable item is decided. Generation requires it.'],
          ['<strong>Override</strong>', 'A device- or group-specific value that replaces the shared decision for one item.'],
          ['<strong>Effective decision</strong>', 'The value a device actually gets: default, then group override, then device override.'],
          ['<strong>Control</strong>', 'A requirement your configuration satisfies. Assigned to devices; referenced by items.'],
          ['<strong>Version</strong>', 'Each re-capture of a device creates a new version. The newest is active; older ones are read-only.']
        ]) +
        h(3, 'If something looks wrong') +
        deftable(['Symptom', 'What it usually is'], [
          ['An item vanished from a data tab',
           'It may be tagged IRRELEVANT, which is hidden by default — tick <strong>Include irrelevant</strong> in the toolbar. Otherwise check <em>Incomplete only</em>, the column filters and the search box.'],
          ['A column vanished from a data tab',
           'It has been unticked in the <strong>Columns</strong> bar above the table. Tick it again, or click <strong>All</strong>. Hiding is per tab and lasts for the session only.'],
          ['Generate is disabled',
           'The device is not ready. The page lists how many items are undecided in each dataset; <em>Incomplete only</em> in the data tab will find them.'],
          ['An import was refused',
           'The file\'s keys must match the device\'s applicable keys exactly. The drawer lists what was missing and what was extra.'],
          ['A decision will not take',
           'It is stored, but invalid — expand the row to see why. Invalid values keep the item undecided rather than being thrown away.'],
          ['Undo is greyed out',
           'The history is per table and per session: it holds only changes made in the table you are looking at, it is cleared when a project is loaded, and it does not survive a page reload. Edits elsewhere — Control Manager, Devices, Onboard — are not covered, so save often.'],
          ['A device shows unsatisfied controls',
           'Controls assigned to it have not been marked satisfied yet. Open the device and mark them once you are content they are met.']
        ]) +
        h(3, 'Good habits') +
        ul([
          'Save the project file whenever you finish a block of work, and keep it in the shared location.',
          'Write the rationale as you decide, not afterwards — it is what the report shows.',
          'Use groups for deviations that several devices share, and device overrides only for genuinely one-off cases.',
          'Re-capture a device after changing it, so the snapshot and the register stay honest.'
        ]) +
        h(3, 'For developers') +
        ul([
          'Append <code>#selftest</code> to the URL to run the embedded test suite. Everything must be green.',
          'A new dataset or platform is added by registering a profile and adapters — the core UI, tables, generation and reports are data-driven and need no changes.'
        ]);
    }

    var RENDERERS = {
      overview: secOverview, start: secStart, onboard: secOnboard, tables: secTables,
      custom: secCustom, devices: secDevices, controls: secControls, generate: secGenerate, design: secDesign,
      saving: secSaving, folder: secFolder, reference: secReference
    };

    function render(project) {
      var cur = RENDERERS[_help.section] ? _help.section : 'overview';
      var nav = SECTIONS.map(function (s) {
        return '<button type="button" class="help-nav-btn' + (s.id === cur ? ' active' : '') + '" data-help-sec="' + esc(s.id) + '"' +
          ' aria-current="' + (s.id === cur ? 'true' : 'false') + '">' + esc(s.label) + '</button>';
      }).join('');
      return '<div class="help">' +
        '<h2 class="help-title">Help</h2>' +
        '<nav class="help-nav" aria-label="Help sections">' + nav + '</nav>' +
        '<div class="help-body" id="help-body">' + RENDERERS[cur]() + '</div>' +
        '</div>';
    }

    function wire(ctx) {
      _ctx = ctx;
      App.util.dom.on(ctx.root, 'click', '[data-help-sec]', function (e, el) {
        _help.section = el.getAttribute('data-help-sec');
        ctx.refreshMain();
        var body = document.getElementById('help-body');
        if (body && body.scrollIntoView) body.scrollIntoView(true);
      });
    }

    App.ui = App.ui || {}; App.ui.views = App.ui.views || {};
    App.ui.views.help = { render: render, wire: wire, SECTIONS: SECTIONS, _help: _help };
  })(App);
