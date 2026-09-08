  /* =============================================================================
   * MODULE: App.ui.views.help
   * PURPOSE: In-app manual (spec §11, Phase 8; rewritten review-15). One section per
   *          area of the app, reached from a section strip so no single page is a
   *          wall of text. Content is generated from the LIVE registry/vocabularies
   *          where possible (dataset labels, capture instructions, relevance options)
   *          so the manual cannot drift from the app it documents.
   * PURITY:  UI/DOM (render returns a string; wire only switches the visible section)
   * DEPENDS: App.registry, App.projectIo, App.util.html
   * ============================================================================= */
  (function (App) {
    'use strict';
    var esc = App.util.html.esc;

    // Section state is UI-only and survives re-renders (never written to a project).
    var _help = { section: 'overview' };
    var _ctx = null;

    var SECTIONS = [
      { id: 'overview', label: 'Overview' },
      { id: 'start', label: 'Getting started' },
      { id: 'onboard', label: 'Onboarding' },
      { id: 'tables', label: 'Data tables' },
      { id: 'custom', label: 'Custom actions' },
      { id: 'devices', label: 'Devices & groups' },
      { id: 'controls', label: 'Controls' },
      { id: 'generate', label: 'Generating output' },
      { id: 'design', label: 'Report Design' },
      { id: 'saving', label: 'Saving & recovery' },
      { id: 'folder', label: 'Project folder' },
      { id: 'reference', label: 'Reference' }
    ];

    // ---- small builders (keep the prose readable in source) -------------------
    function h(level, text) { return '<h' + level + '>' + text + '</h' + level + '>'; }
    function p(text) { return '<p>' + text + '</p>'; }
    function ul(items) { return '<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'; }
    function ol(items) { return '<ol>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ol>'; }
    function note(text) { return '<div class="help-note">' + text + '</div>'; }
    function pre(text) { return '<pre class="help-pre mono">' + esc(text) + '</pre>'; }
    /** A two-column definition table — the clearest shape for "term ⇒ meaning". */
    function deftable(headers, rows) {
      return '<table class="help-table"><thead><tr>' +
        headers.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table>';
    }

    // ---- live facts pulled from the app itself --------------------------------
    function platform() { return App.registry.getActivePlatform(); }
    function datasets() { var pf = platform(); return pf ? pf.datasets : []; }
    /** CUS-1: the datasets that actually take a capture file — what Onboard asks for. */
    function capturedDatasets() { return datasets().filter(function (d) { return !App.registry.isVirtualDataset(d); }); }
    function datasetNames() {
      var names = capturedDatasets().map(function (d) { return '<strong>' + esc(d.label) + '</strong>'; });
      return names.length ? names.join(', ') : 'the data tabs';
    }
    function relevanceList() { return App.projectIo.RELEVANCE_OPTIONS.join(', '); }

    // =========================================================================
    // Sections
    // =========================================================================
    function secOverview() {
      return h(2, 'What this tool is') +
        p('The CH Config Tool turns <strong>captured device configuration</strong> into <strong>hardening decisions</strong>, ' +
          'and turns those decisions into the <strong>scripts, config files and reports</strong> that implement, verify and document them.') +
        p('It is a single HTML file. It runs from a local copy (double-click it), it never contacts a device or the network, ' +
          'and it never runs anything on a device itself — you capture files from the device elsewhere, feed them in here, and run the output elsewhere.') +
        h(3, 'The five ideas behind everything else') +
        deftable(['Idea', 'What it means for you'], [
          ['<strong>The project file is the truth</strong>',
           'All your work lives in one downloaded <code>.json</code>. The app only holds a copy in memory. Save it, keep it somewhere shared, and load it next time.'],
          ['<strong>Capture, then decide</strong>',
           'Onboarding records what a device <em>currently</em> has (a snapshot). Deciding records what it <em>should</em> have. The two are kept separate, so you always know which is which.'],
          ['<strong>Decide once, reuse everywhere</strong>',
           'A decision belongs to a configuration item (a package, a setting, a tactical path) — not to a device. Every device that has that item inherits the decision. Where a device or a group genuinely differs, you record an <em>override</em>.'],
          ['<strong>Nothing is silent</strong>',
           'Bad input is never dropped. Parse and validation problems appear in the Activity / Errors drawer at the bottom, with a location, and the app keeps working.'],
          ['<strong>Same input, same output</strong>',
           'Generating twice from the same project produces byte-identical files, so outputs can be diffed and audited.']
        ]) +
        h(3, 'The tabs, in the order you normally use them') +
        deftable(['Tab', 'What it is for'], [
          ['<strong>Onboard</strong>', 'Add a device by supplying its captured files. Also used to re-capture an existing device later.'],
          ['<strong>' + (datasets().length ? datasets().map(function (d) { return esc(d.label); }).join(' / ') : 'The data tabs') + '</strong>',
           'One tab per dataset. This is where you record decisions, descriptions, rationale and control links.'],
          ['<strong>Devices</strong>', 'Every onboarded device and its versions; device groups; what each device will actually get; per-device overrides; bulk decision import.'],
          ['<strong>Control Manager</strong>', 'The catalogue of controls (the requirements your decisions satisfy) and which devices they apply to.'],
          ['<strong>Generate</strong>', 'Produce the Implementation, Verification, Reporting and Control-report bundles for one device.'],
          ['<strong>Help</strong>', 'This manual.']
        ]) +
        note('The number on a data tab is how many items in that dataset are still <strong>undecided</strong>.');
    }

    function secStart() {
      return h(2, 'Getting started') +
        h(3, 'If someone has already made a project') +
        ol([
          'Click <strong>Load project</strong> in the top bar and choose the <code>.json</code>.',
          'Work in the tabs as needed.',
          'Click <strong>Save project</strong>, confirm the file name, and put the downloaded file back where it came from.'
        ]) +
        h(3, 'If you are starting from nothing') +
        ol([
          'Go to <strong>Onboard</strong>.',
          'Give the device a <strong>name</strong> (required), plus model and firmware.',
          'Attach one captured file per dataset (' + datasetNames() + '). The <strong>Onboard</strong> button stays disabled until every file parses and a name is present.',
          'Click <strong>Onboard</strong>. The app creates the project, records a hashed snapshot per dataset, and adds every new item as <em>undecided</em>.',
          'Open each data tab and record decisions. The tab badge counts down as you go.',
          'Go to <strong>Generate</strong>, pick the device, and produce the bundles you need.',
          '<strong>Save project</strong> before you close the tab.'
        ]) +
        note('You do not have to finish in one sitting. Save the project file and pick it up later — the app also keeps a local draft as crash insurance (see <em>Saving &amp; recovery</em>).');
    }

    function secOnboard() {
      var pf = platform();
      var capture = pf ? pf.captureInstructions : '';
      return h(2, 'Onboarding a device') +
        p('Onboarding is how a device enters the project. You supply one captured file per <em>captured</em> dataset ' +
          '(<strong>Custom Security Actions</strong> takes none — see <em>Custom actions</em>); the app parses each one, ' +
          'stores a <strong>snapshot</strong> (the exact list of keys it saw, plus a SHA-256 of the file), and adds any key it has not seen before as a new undecided item.') +
        h(3, 'What the app records') +
        deftable(['Recorded', 'Why it matters'], [
          ['The device <strong>name</strong>, model and firmware', 'The name plus model form the device identity, so keep them consistent between captures of the same device.'],
          ['A <strong>snapshot</strong> per captured dataset', 'Defines which items are <em>applicable</em> to that device. Everything else — readiness, generation, the device panels — is driven by this. Custom Security Actions have no snapshot and apply to every device.'],
          ['A <strong>SHA-256</strong> of each captured file', 'Lets the app tell whether a later capture is genuinely different.'],
          ['New items, as <strong>undecided</strong>', 'Existing items keep the decisions you already made; nothing is silently overwritten.']
        ]) +
        h(3, 'Capture formats for ' + esc(pf ? pf.label : 'the active platform')) +
        p('Capture these outside the tool, then attach the files:') +
        pre(capture) +
        h(3, 'Re-capturing a device later') +
        p('Onboard the same device again with the same name and model. The app compares the new captures with the current ones:') +
        ul([
          'If every file is identical, nothing happens — a re-onboard is a no-op.',
          'If anything changed, a <strong>new version</strong> of that device configuration is created. The new version is the active one; the previous version is kept as read-only history.',
          'Keys that disappeared from the capture are <strong>not</strong> deleted from the register — they simply stop being applicable to the new version.'
        ]) +
        h(3, 'Triage') +
        p('After each onboard the Activity drawer reports, per dataset, how many keys were new and how many already existed. ' +
          'That tells you at a glance how much new decision work a capture created.') +
        note('<strong>Knox tactical — <code>imsSettings</code>.</strong> A Knox export only carries <code>imsSettings</code> once it has been touched, ' +
          'so the block is <em>optional</em> in the JSON you upload. If it is missing, the tool adds the default ' +
          '(<code>imsSettings.simSlot0.enabled</code> and <code>imsSettings.simSlot1.enabled</code>, both <code>false</code>) and notes it in the Activity drawer, ' +
          'so the per-SIM IMS toggle is always there to decide and is always present in the emitted <code>tactical.json</code>. ' +
          'If the upload does carry the block, its values are used as captured. The same applies to the tactical import on the Devices tab. ' +
          'A project made <em>before</em> the tool modelled this setting is completed when you <strong>load</strong> it: the two slots are added to each device\'s ' +
          'applicable keys and appear in the Tactical tab as undecided, and the Activity drawer lists exactly what was added.') +
        note('<strong>Knox tactical — <code>firewallRules</code>.</strong> The rule list is <em>one</em> item holding <em>all</em> the rules, not one item per rule. ' +
          'The number of rules in a capture therefore does not matter: zero rules and nine rules are the same single ' +
          '<code>firewallRules</code> row, so two devices with different rule counts still share one register and a decisions import is never refused over a count. ' +
          'Its value is edited as JSON — the complete list to apply — and is written back into the emitted <code>tactical.json</code> exactly as given. ' +
          'A project made before this change is converted on <strong>load</strong>: the old per-rule-per-field rows (<code>firewallRules[0].ruleType</code> and friends) ' +
          'are replaced by the single row, and the Activity drawer lists what went.') +
        note('<strong>Knox tactical — <code>usbInterfaces</code>.</strong> The USB host interface block is an <em>exhaustive</em> list. ' +
          'Wherever a capture carries the block, any class it does not mention is added as <code>false</code> — the closed position — so all nine ' +
          '(<code>AUD, CDC, COM, HID, MAS, MIS, STI, VEN, WIR</code>) are always there to decide and are always in the emitted document. ' +
          'A capture with no block at all is left alone: the tool will not invent a USB policy Knox never exported.');
    }

    function secTables() {
      return h(2, 'The data tabs') +
        p('Each data tab lists every item in that dataset with the decision you have recorded. ' +
          'The columns come from the dataset itself, so they differ slightly per tab, but the shape is always the same.') +
        h(3, 'Columns') +
        deftable(['Column', 'Meaning'], [
          ['<strong>Key</strong> (Package / Key / Path)', 'The item\'s identity. This is what the generated output acts on.'],
          ['<strong>Description</strong>', 'Your plain-language note about what the item is. Shown in the report.'],
          ['<strong>Action / Value</strong>', 'The decision itself, edited in place. On Packages, choosing <strong>—</strong> clears the decision. On Tactical the editor matches the item&rsquo;s <strong>value format</strong> (see below): true/false for a boolean, a numeric box for a number, one-per-line for a list, a dropdown for a defined set of options, and a text box otherwise. Where the editor is free text, an <em>empty</em> box is a real decision — "set this key to blank" — and the <strong>clear</strong> button beside it is what returns the item to undecided.'],
          ['<strong>Control Refs</strong>', 'Which controls this item helps satisfy. Edited in the row expander or with Apply Control Mode.'],
          ['<strong>Security Relevance</strong>', 'Optional tag: ' + esc(relevanceList()) + '. May be left blank. <em>Hidden by default</em> — tick it in the Columns bar.'],
          ['<strong>Applies to</strong>', 'Which devices currently have this item in their snapshot. Custom Security Actions have no snapshot, so they apply to every device — see <em>Custom actions</em>.'],
          ['<strong>Status</strong>', '<span class="badge decided">decided</span> once the decision is complete and valid, <span class="badge undecided">undecided</span> if it has never been answered, or <span class="badge held">review</span> if it holds a value you have flagged to come back to. ' +
            'The badge is also a <strong>switch</strong> — click it to flip the item (see below).'],
          ['<strong>Diverges from Guidelines</strong>', 'A tick for a decision that <em>knowingly departs</em> from the guidelines you are working to. Ticking it makes a <strong>Divergence Narrative</strong> box appear in that row&rsquo;s expander, which is where the departure is explained. See <em>Recording a divergence</em> below.']
        ]) +
        h(3, 'Recording a divergence') +
        p('Some decisions are deliberately not what the guidelines say. That is a legitimate outcome — but only if the reasoning is written down, because a bare exception is indistinguishable from a mistake.') +
        ol([
          'Tick the item&rsquo;s box in the <strong>Diverges from Guidelines</strong> column. Clicking anywhere in the cell works, not just the small box.',
          'Open the row with <strong>▸</strong>. A <strong>Divergence Narrative</strong> box is now there — it exists only while the box is ticked.',
          'Write three things: <strong>how</strong> the decision departs from the guidelines, <strong>which</strong> guideline it departs from, and <strong>why</strong> that choice was made.'
        ]) +
        ul([
          'A row ticked with nothing written is <strong>tinted</strong>, and the cell&rsquo;s tooltip says so. A flag on its own records that something is unusual without saying what — that is a gap, not a record, so it is shown as one.',
          'Hovering a ticked cell shows the narrative, so the reasoning is readable without opening the row.',
          '<strong>Unticking does not delete what you wrote.</strong> The narrative is kept and reappears if you tick again — a mis-click cannot cost you a paragraph. To erase it, clear the box itself.'
        ]) +
        note('<strong>Where this does and does not travel.</strong> The divergence flag and its narrative are recorded in the <strong>project file</strong> — they are saved, loaded and round-tripped like any other field. They are <em>not</em> yet carried into the generated report, the control report or the CSV export. If you need them in a generated document, say so and they can be added.') +
        h(3, 'Editing an item') +
        ul([
          'Edit the decision directly in its cell. Changes save into the in-memory project immediately (the unsaved dot appears in the top bar).',
          'To blank a value — for example to empty a comma-separated list like <code>bluetooth,wifi</code> — clear the box and click away. The item stays <span class="badge decided">decided</span> and the generated command sets the key to an empty string. Use <strong>clear</strong> instead if you meant "I have not decided this yet".',
          '<strong>Click the Status badge to flip the item.</strong> Clicking <span class="badge undecided">undecided</span> accepts whatever the value box is already showing — on Tactical that is the <em>captured</em> value, so one click means "the value on the device is my decision". ' +
            'On Packages, where nothing is selected yet, it records <code>keep</code>, the no-change action.',
          '<strong>Flagging something for review keeps your answer.</strong> Clicking <span class="badge decided">decided</span> does <em>not</em> wipe the value — it moves the item to <span class="badge held">review</span>: your choice is recorded exactly as you left it, but the item stops counting as decided, so it shows as outstanding and the device cannot be generated until you come back to it. Click the badge again to accept the same value and return it to <span class="badge decided">decided</span>. ' +
            'Editing the value also clears the flag, because editing <em>is</em> reviewing. ' +
            'If you actually want to throw the answer away, use <strong>clear</strong> beside the value box — that is the difference between the two.',
          'Click the <strong>▸</strong> at the start of a row to expand it. The expander holds the <strong>Description</strong>, the <strong>Control Refs</strong> checklist, the <strong>Rationale</strong> (with a one-click "not required for device use-case" preset), the <strong>Rollback</strong> note, the <strong>Divergence Narrative</strong> (only when the row is flagged as diverging) and the <strong>Value format</strong> picker.',
          '<strong>Ctrl+click a cell to edit what it shows.</strong> Ctrl+click (or double-click) the <strong>Description</strong> cell and the row opens with the Description box focused and its text selected, ready to type over. The same works on the <strong>Control Refs</strong> cell (it opens the checklist with its filter box focused) and, on Custom Security Actions, on the <strong>Action Name</strong> cell (the rename box). On any other cell the row simply opens. A cell you can open this way outlines when you hover it. A plain click still selects text, so reading is unaffected.',
          'If a decision is invalid, the cell is tinted and the reason is listed in the expander (and in the cell&rsquo;s tooltip). The value is still stored — invalid simply means "not complete yet".'
        ]) +
        h(3, 'Value formats') +
        p('A value format declares what shape an item&rsquo;s value is allowed to take. It does two things: it gives you the <em>right editor</em> instead of a free-text box, and it makes a wrong value <em>impossible to miss</em> — a value outside its format is an error, so the item is not complete and the device cannot reach ready until it is fixed.') +
        p('<strong>You do not have to configure anything.</strong> Every item starts on the format inferred from what the device actually reported, so a boolean leaf already shows true/false and a number already shows a numeric box. The picker only matters when you want to be stricter than the capture.') +
        deftable(['Format', 'What it accepts'], [
          ['<strong>Boolean</strong>', 'Exactly <code>true</code> or <code>false</code>, chosen from a dropdown.'],
          ['<strong>Number</strong>', 'A numeric value. A custom number format may also set a minimum and maximum.'],
          ['<strong>Text</strong>', 'Any text. An empty box is a real value (a blank string). A custom text format may also require a pattern.'],
          ['<strong>String list</strong>', 'A list of strings, entered <strong>one per line</strong>. An empty box means an empty list — which is what most of the Knox whitelists are.'],
          ['<strong>JSON value</strong>', 'The raw JSON, used automatically for anything the simpler kinds cannot represent without changing its type (for example a list of numbers). Editing it as text would silently turn <code>[1,2]</code> into <code>["1","2"]</code>, which would change what gets uploaded — so the tool keeps it as JSON instead.'],
          ['<strong>Your own formats</strong>', 'A named set of allowed values, each with a description of what it does. The item then offers a dropdown reading <code>value — what it does</code>.']
        ]) +
        h(3, 'Defining your own format') +
        p('Open a row, then click <strong>Manage…</strong> beside the Value format picker. Give the format a name, choose <strong>Custom options</strong>, and add each allowed value together with a short description of what that option does. Save, then assign the format to any item from its picker.') +
        p('Formats are <strong>named and reusable</strong> on purpose: two keys that take the same vocabulary — the two per-SIM 5G mode keys, for example — should share one definition, so you write the options and their descriptions once and both keys stay in step.') +
        ul([
          'A value the device reported that is <em>not</em> in your list stays visible, marked <em>(not an allowed value)</em>, rather than being quietly snapped to a legal one. That mismatch is exactly what you need to see.',
          'The manager shows how many items use each format, so you know what a change affects.',
          'Deleting a format does not touch any decision: the items that used it simply fall back to the format inferred from their capture.'
        ]) +
        h(3, 'Finding things') +
        deftable(['Control', 'Effect'], [
          ['<strong>Search</strong>', 'Filters by key and description.'],
          ['<strong>Incomplete only</strong>', 'Shows just the items that are still undecided.'],
          ['<strong>Reporting only</strong> / <strong>Irrelevant only</strong>',
           '<strong>REPORT</strong> means "not a hardening decision, but carry it into the report anyway" — those items sit in the table with everything else. <strong>IRRELEVANT</strong> means "not security-significant at all"; it is the one <em>parked</em> category, hidden by default so the working view stays on items that still need a decision. Tick <strong>Include irrelevant</strong> to bring them into the table <em>alongside</em> the rest, not instead of it. The Report options panel leaves IRRELEVANT out of the generated report by default.'],
          ['<strong>Column filters</strong>',
           'The row of dropdowns under the headings filters by <em>value</em>: Action, Security Relevance, <strong>Control Refs</strong>, Applies to and Status each get one, sitting under the column it filters. Control Refs is how you see <em>every action assigned to one control</em> — pick the control by name, and the table lists exactly what carries it; <code>(none assigned)</code> lists the items carrying no control at all. They <strong>compose</strong> — with each other and with the search box — so &ldquo;packages being removed whose name contains bluetooth&rdquo; is Action = <code>remove</code> plus a search for <code>bluetooth</code>. An active filter is highlighted, the toolbar says how many are on, and <strong>clear</strong> resets them. Everything that acts on &ldquo;what is shown&rdquo; — the ✓ Apply heading, Export CSV — honours them.'],
          ['<strong>Column headers</strong>', 'Click to sort. Each header cycles through three states — <strong>ascending</strong>, then <strong>descending</strong>, then <strong>off</strong>, which takes the sorting rule away and puts the rows back in register order (the order they were captured in). Security Relevance sorts by severity (HIGH first), not alphabetically. <strong>Diverges from Guidelines</strong> sits immediately before <strong>Status</strong> — it is an attribute of the decision, and Status is the verdict, which reads last.'],
          ['<strong>Column edges</strong>', 'Drag to resize. Widths are remembered for the session.'],
          ['<strong>Columns</strong> (the bar above the table)',
           'Untick a column to hide it, so a wide table can be narrowed to the few columns you are actually working in. <strong>All</strong> and <strong>None</strong> do the obvious. ' +
           'The <em>first</em> column — <strong>Package</strong> on Packages, <strong>Path</strong> on Tactical — is the item&rsquo;s identity and what the generated output acts on, so it is always shown and appears as a locked chip rather than a box. ' +
           'Hiding a column also <strong>clears that column&rsquo;s filter</strong>: a filter you cannot see is a table that is mysteriously short. What is hidden is remembered for the session and is never written to the project file — it is a view, not data. ' +
           '<strong>Security Relevance</strong> and <strong>Diverges from Guidelines</strong> start <em>hidden</em>: both are occasional, and shown by default they cost two columns of width on every row for a value that is usually empty. Tick either to bring it back.']
        ]) +
        h(3, 'Bulk tools (the Tools panel)') +
        p('The bulk tools live in the <strong>Tools</strong> panel pinned to the right of the table. It <em>stays in place while you scroll</em>, so on a register hundreds of rows long you can change the control you are assigning without scrolling back to the top. <strong>Hide ›</strong> collapses it when you want the full width for the table.') +
        deftable(['Tool', 'How to use it'], [
          ['<strong>Apply Control Mode</strong>',
           'Click it, then pick a control from the list in the panel — each entry shows the control&rsquo;s <strong>name, type and description</strong>, so you can tell what it means as you assign it. With a control selected, tick rows to attach it (unticking detaches it); clicking anywhere in the tick column works, not just on the small box. Clicking the selected control again deselects it.'],
          ['Ordering and narrowing that list',
           'Three controls sit above it. The <strong>order</strong> dropdown is <strong>A→Z</strong> by default, or <strong>By type</strong> to cluster each framework&rsquo;s controls together (all ISM, then all AHG, alphabetical inside each) under a heading that stays put as you scroll. The <strong>tag</strong> dropdown narrows the list to controls carrying one of your tags, or to the untagged ones; it appears only once something in the project is tagged. Tag is a filter rather than an order because a control can carry several tags, and grouping by tag would list the same card once per tag. The <strong>text box</strong> matches name, type or description. All three compose, none of them touches the project, and re-ordering never drops the control you already picked.'],
          ['<strong>✓ Apply all N</strong> (the tick column heading)',
           'The fastest way to work. Narrow the table with the <strong>search box</strong> and the column filters first — say <code>bluetooth</code> — then click the <strong>heading of the tick column itself</strong> to attach the selected control to <em>every row the table is showing</em>, in one go. The heading names the count it will act on, and it acts on exactly what you can see, so every filter counts (search, column filters, Incomplete only, the parked toggles). If all the shown rows already have that control, the heading turns into <strong>✕ Remove all N</strong>, so the same click takes it back off.'],
          ['<strong>Assign to Device</strong>',
           'The same gesture as Apply Control Mode, for <em>devices</em> instead of controls: click it, pick a device from the panel, then tick which rows apply to that device. A tick makes the item applicable to it — it appears in that device&rsquo;s <strong>Applies to</strong> cell, counts towards its readiness, and is generated for it. Unticking takes it off. A device with no capture for this register is listed but not selectable, with the reason on its card.'],
          ['<strong>✓ Assign all N</strong> (the device tick column heading)',
           'The device twin of <strong>✓ Apply all N</strong>, and it behaves identically: narrow the table first, then click the heading to assign <em>every row the table is showing</em> to the selected device. When all the shown rows already apply to it, the heading becomes <strong>✕ Remove all N</strong> and the same click takes them off.'],
          ['<strong>Apply Security Relevance</strong>',
           'The same gesture again, for the <strong>Security Relevance</strong> column: click it, pick a value from the row of chips in the panel, then tick the rows to give it to them. Unticking a row <em>clears</em> its relevance back to unset, so a wrong tick undoes itself without reaching for Undo.'],
          ['<strong>Apply Decision</strong>',
           'And the same for the <strong>decision itself</strong>: pick <code>keep</code>, <code>disable</code> or <code>remove</code>, then tick the rows. Ticking decides the item; unticking clears the decision and returns the row to <em>undecided</em>. This button only appears on a register whose decision is a choice from a fixed list — the Tactical register holds a typed value rather than a choice, so there is nothing a picker could apply there.'],
          ['<strong>✓ Set all N</strong> (the value tick column heading)',
           'The third twin of <strong>✓ Apply all N</strong>: narrow the table first, then click the heading to give <em>every row the table is showing</em> the picked relevance or decision. When they all already have it, the heading becomes <strong>✕ Clear all N</strong> and the same click clears them. One click of Undo takes the whole run back.'],
          ['<strong>Delete Items</strong>',
           'Click to arm Delete Mode, tick the rows to remove, then click <strong>Delete selected</strong> to action them, or <strong>Cancel</strong> to back out. Deleting also removes any device or group override that pointed at the deleted item. The capture snapshots are untouched, so re-onboarding the same file brings the item back.'],
          ['<strong>Undo</strong> / <strong>Redo</strong>',
           'Step back and forward through <em>every</em> change made in this table — a decision, a Status flip, a rationale or description, a Security Relevance, a control tick, a rename, an add, a delete, a bulk apply. Each click of Undo takes back one whole action, however many rows that action touched: apply a control to ten shown rows in one click and one Undo removes it from all ten; ticking three rows by hand with the same control selected also counts as one. Up to 20 steps are kept per table, they are per table (Packages and Tactical have their own histories), both buttons are greyed out when there is nothing to step to, and the history is cleared when you load a project.']
        ]) +
        note('The bulk modes are mutually exclusive — arming one disables the rest, since they all own the same tick column. A disabled button says which mode to leave first.') +
        h(3, 'Which devices an action applies to') +
        p('Normally this is decided <em>for</em> you and correctly: a Packages or Tactical item applies to the devices whose capture contained that key, and a Custom Security Action applies to every device in the project. ' +
          'That is what the capture proves, and it is what the <strong>Applies to</strong> column shows.') +
        p('<strong>Assign to Device</strong> is for the cases where what you know differs from what the capture happened to contain — a package you want decided on a device that did not report it, or a hand-written action that is genuinely irrelevant to one device in the fleet. ' +
          'The capture itself is never edited: the tick is recorded as a separate adjustment on top of it, is saved in the project file, and is undoable like any other change. ' +
          'Assigning an item back to exactly what its capture said removes the adjustment entirely, so a tick-then-untick leaves nothing behind.') +
        note('Taking an item off a device does <em>not</em> delete any device override you recorded for it. The override goes dormant and comes back if you re-assign the item — un-assigning is a statement about what applies, not an instruction to discard work.') +
        h(3, 'Export CSV') +
        p('<strong>Export CSV</strong> in the top bar downloads the current data tab exactly as it is shown — same visible columns, same filters, same sort order. ' +
          'Hide a column and it is left out of the export too. The one exception is <strong>Diverges from Guidelines</strong>, which is not exported yet (see <em>Recording a divergence</em>).');
    }

    function secCustom() {
      return h(2, 'Custom Security Actions') +
        p('Packages and Tactical can only ever hold what a capture reported. A great deal of real hardening is not in either file — ' +
          'setting a <strong>Knox tactical passcode</strong>, sealing a SIM tray, a documented physical or procedural step. ' +
          'The <strong>Custom Security Actions</strong> tab is where those live, so they are decided, controlled and reported like everything else ' +
          'instead of living in someone\'s notes.') +
        h(3, 'How it differs from the other data tabs') +
        deftable(['', 'Custom Security Actions'], [
          ['<strong>Where the rows come from</strong>', 'You write them. There is no capture file and no Onboard slot for this tab.'],
          ['<strong>Applies to</strong>', 'Every device in the project by default — there is no snapshot that could say otherwise. Where an action does not belong on one device at all, untick it there with <strong>Assign to Device</strong> in the Tools panel; where it applies but with a different value, set a <strong>device override</strong> on the Devices tab, exactly as you would for a package.'],
          ['<strong>The Action box</strong>', 'Free text, deliberately. It is the one box in the tool with no vocabulary behind it, because the whole point is the things nobody could list in advance. There is no value-format picker here.'],
          ['<strong>The Procedure box</strong>', 'The steps for doing it, in the row&rsquo;s <strong>▸</strong> panel. Only the tabs whose work is done by hand have one — a package removal&rsquo;s procedure <em>is</em> the generated adb line. It travels into the Implementation runbook and into the <strong>Procedure report</strong>.'],
          ['<strong>What is generated</strong>', 'A runbook — <code>custom-actions.txt</code> in the Implementation bundle and <code>custom-actions.verify.txt</code> in the Verification bundle. Neither is a script: the tool cannot know how to perform an action it did not define, so it prints the step, its procedure, its rationale and its rollback for a person to carry out and evidence.']
        ]) +
        h(3, 'Adding one') +
        ol([
          'Open the <strong>Custom Security Actions</strong> tab and type a short name in the <strong>New custom action</strong> box — e.g. <em>Knox tactical passcode</em>. Press Enter or click <strong>+ Add custom action</strong>.',
          'The row appears <span class="badge undecided">undecided</span> with its <strong>▸</strong> panel already open.',
          'Write the <strong>Action</strong> in the row: what has to be done. An empty Action keeps the row undecided — there is no step in "do nothing".',
          'Write the <strong>Procedure</strong> in the panel: the steps someone follows to carry the action out — what to open, what to set, and how to tell it worked. One step per line.',
          'Fill in <strong>Description</strong>, <strong>Rationale</strong> and <strong>Rollback</strong> in the panel, and tick the <strong>Control Refs</strong> the action satisfies.',
          'Set <strong>Security Relevance</strong> and, if it departs from the guidelines, tick <strong>Diverges from Guidelines</strong> and write the narrative.'
        ]) +
        note('The <strong>name is the identity</strong> of the action — it is what the report, the manifest and any overrides are keyed by. ' +
          'You can still rename it from the row\'s <strong>▸</strong> panel; the decision and any device or group overrides move with it.') +
        h(3, 'Everything else is the same') +
        p('The tools panel is nearly identical to the Packages tab — <strong>Apply Control Mode</strong>, <strong>Assign to Device</strong>, ' +
          '<strong>Apply Security Relevance</strong>, <strong>Delete Items</strong>, ' +
          '<strong>Undo</strong>/<strong>Redo</strong> and the control picker all work here, as do the search box, the column filters, ' +
          'the column picker, sorting and <strong>Export CSV</strong>. Undecided custom actions count towards the tab badge and block ' +
          '<strong>Generate</strong> for every device, exactly like an undecided package.') +
        h(3, 'In the report') +
        p('A <strong>Custom Security Actions</strong> section lists Action Name, Description, Action, Control, Rationale and Rollback — ' +
          'each column can be dropped from <strong>Options</strong> on the Generate tab, and the whole section can be omitted. ' +
          'The actions also appear in <strong>Control coverage</strong> and in the standalone <strong>Control report</strong>, ' +
          'alongside the packages and tactical items that satisfy the same control.');
    }

    function secDevices() {
      return h(2, 'Devices &amp; groups') +
        h(3, 'The device list') +
        p('Devices are grouped by identity, newest version first. Each row shows the decided/applicable count per dataset and a status badge:') +
        deftable(['Badge', 'Meaning'], [
          ['<span class="badge decided">ready</span>', 'Every item applicable to this device is decided — it can be generated.'],
          ['<span class="badge undecided">n undecided</span>', 'That many applicable items still need a decision. Generation is blocked until they are done.'],
          ['<span class="badge superseded">superseded</span>', 'An older version, kept as read-only history.'],
          ['<span class="badge unsatisfied">⚠ n controls unsatisfied</span>', 'Controls assigned to this device that you have not yet marked as satisfied. Hover it to see which.']
        ]) +
        h(3, 'Inside a device') +
        p('Click <strong>View</strong> to open a device. You get one collapsible panel per dataset, listing exactly the items applicable to that device with their <strong>effective</strong> decision.') +
        p('"Effective" means the decision after inheritance, which resolves in this order:') +
        pre('default (the item\'s own decision)\n  → group override (if the device is in a group that overrides this item)\n    → device override (if this device overrides it)') +
        ul([
          'A row that differs from the inherited value is tinted and tagged <span class="diverge-tag group">group</span> or <span class="diverge-tag device">device</span>.',
          'Edit the value in the <strong>Override</strong> column to set a device override; setting it back to the inherited value clears the override, and <strong>Revert</strong> does the same in one click.',
          '<strong>Deviations first</strong> pins overridden items to the top. <strong>Collapse all</strong> folds every panel. The filter box searches within this device only.'
        ]) +
        h(3, 'Controls on this device') +
        p('Below the panels, every control assigned to this device is listed with its own state \u2014 <strong>Unsatisfied</strong>, <strong>Satisfied</strong>, or <strong>Satisfied with Exception</strong>. ' +
          'A control starts <em>Unsatisfied</em> when it is assigned. The state is per device and survives re-capturing.') +
        p('Click the <strong>control</strong> itself to open it. The pop-up lists the items on this device that satisfy it — <strong>key and decision</strong>, one panel per dataset — and underneath sits the decision itself: ' +
          'a <strong>Justification</strong> box and the state button. They are deliberately in there rather than on the summary row \u2014 ' +
          'you mark a control satisfied having just looked at what satisfies it, and you record why at the same moment.') +
        p('The button <strong>cycles</strong>: one click moves Unsatisfied \u2192 Satisfied, another moves Satisfied \u2192 Satisfied with Exception, and a third returns to Unsatisfied. ' +
          'The button always says where the next click lands, so you never have to know the order in advance.') +
        p('<strong>Satisfied with Exception</strong> is for a control met in substance but not in the form the guideline states \u2014 the package cannot be uninstalled on this build, so it is disabled instead. ' +
          'It counts as <em>decided</em>: it does not sit in the \u201cstill unsatisfied\u201d count, because it is not something left to look at. What it is instead \u2014 a documented departure \u2014 is the report\u2019s business, and the report says so.') +
        ul([
          'The justification is free text, saved when you click away, and stored per control <em>per device</em>. It is not echoed on the summary row — that row is for the state, and the text would only squeeze the button you click to read it.',
          'It is carried into the generated <strong>report</strong> (a Status and Justification column in Control coverage) and the <strong>control report</strong>, so the reasoning travels with the evidence.',
          'A control marked satisfied \u2014 with or without an exception \u2014 and no justification is flagged: in the pop-up, on the list row, and in the report, which prints <em>No justification recorded</em> rather than leaving it blank. An unexplained <em>exception</em> is the worst of the three to leave blank, since the departure is exactly what a reader needs told.'
        ]) +
        h(3, 'Platform notes') +
        p('<strong>Notes</strong> beside <strong>View</strong> opens a page per device for the knowledge that is not a decision on any one item — ' +
          'a firmware quirk, why a model behaves differently, what to check next time, what to ask the vendor. ' +
          'It takes rich text: <strong>bold</strong>, <em>italics</em>, underline, bulleted and numbered lists and headings, from the toolbar above the box.') +
        ul([
          'It saves as you type and again when you click away — there is no Save button, and the dot in the top bar tells you the project has unsaved changes as usual.',
          'Notes are kept <strong>per device</strong>, not per capture, so re-onboarding a device keeps everything written about it. Every version of a device opens the same page.',
          'A device that has notes shows a dot on its <strong>Notes</strong> button in the list.',
          'They are stored in the project file and travel with it. They are not carried into any generated output — the reports are for decisions and evidence.'
        ]) +
        h(3, 'Device groups') +
        p('A group holds several devices that should share a deviation. Add a group in the Devices list, then use the group\'s dropdown to add or remove members ' +
          '(a device can be in one group at a time). <strong>Deviations</strong> opens the group\'s override editor, where you can add, change or remove a group-level value per item.') +
        h(3, 'Setting decisions from a file') +
        p('At the bottom of a device you can import decisions in bulk, one file per dataset. The file must cover <strong>exactly</strong> the keys applicable to that device — ' +
          'no more, no fewer — or it is refused and the differences are listed. Nothing is applied partially: an import either fully applies or changes nothing.') +
        deftable(['Dataset', 'Accepted file'], [
          ['<strong>Packages</strong>', '<code>package,action,description</code> CSV, optionally followed by <code>rationale</code> and then <code>relevance</code>.'],
          ['<strong>Tactical</strong>', 'The tactical JSON document, in the same shape as the capture.'],
          ['<strong>Custom Security Actions</strong>', 'No bulk import — there is no capture format to import from. Author them on their own tab.']
        ]) +
        ul([
          '<code>rationale</code> fills each item\'s Rationale box.',
          '<code>relevance</code> fills the Security Relevance column. Accepted values: ' + esc(relevanceList()) + ', or blank to clear. Case does not matter.',
          'The two optional columns must appear in that order, named exactly.'
        ]) +
        note('Decisions are shared across every device that has the same key. If you need one device to differ, use an override rather than a second import.');
    }

