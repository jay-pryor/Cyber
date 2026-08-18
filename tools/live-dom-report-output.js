/**
 * End-to-end pass for v2.4 (TW-1 · TBS-1 · CAP-1 · SEC-1 · NAM-1 · HUM-1 · EXC-1):
 * drive the REAL Report Design workspace in jsdom with real events, generate the
 * document, and assert on the markdown that comes out.
 *
 * Distinct from live-dom-report-design.js, which checks the workspace's WIRING. This
 * one checks the ARTIFACT: that a width dragged in the designer becomes proportional
 * dash counts, that shading reaches the document as the raw-LaTeX fences pandoc needs,
 * and that every grid row lines up with its border — the property whose absence made
 * pandoc silently drop a table's body (D-020).
 *
 * It also writes the .md to disk (path in argv[2], default /tmp/ch-report.md) so the
 * real pandoc + tectonic build can be run on it:
 *
 *   node tools/live-dom-report-output.js /tmp/ch-report.md
 *   pandoc /tmp/ch-report.md --pdf-engine=tectonic -o /tmp/ch-report.pdf
 */
const OUT = process.argv[2] || '/tmp/ch-report.md';
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => errs.push(e.message));
vc.on('error', (...a) => errs.push(a.join(' ')));

const dom = new JSDOM(fs.readFileSync('/workspaces/Cyber/ch-config-tool.html', 'utf8'), {
  runScripts: 'dangerously', url: 'file:///x', pretendToBeVisual: true, virtualConsole: vc,
});
const { window } = dom;
const { document } = window;
const A = window.App;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  X ' + m); } };
const q = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const click = s => { const e = typeof s === 'string' ? q(s) : s; if (!e) { fail++; console.log('  X no click target ' + s); return; } e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const setVal = (s, v) => { const e = q(s); if (!e) { fail++; console.log('  X no field ' + s); return; } e.value = v; e.dispatchEvent(new window.Event('change', { bubbles: true })); };
const check = (s, on) => { const e = q(s); if (!e) { fail++; console.log('  X no checkbox ' + s); return; } e.checked = on; e.dispatchEvent(new window.Event('change', { bubbles: true })); };

A.registry.registerPlatform(A.platforms.androidAdb);
A.ui.app.mount(document.getElementById('root'));

function snap(ds, raw) {
  const a = A.registry.getDataset('android-adb', ds), pr = a.parse(raw);
  const o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: ds, sha256: A.util.hash.sha256Hex(raw), keys: pr.keys };
  if (pr.values) o.values = pr.values;
  if (pr.template !== undefined) o.template = pr.template;
  return o;
}

// A capture with the shapes HUM-1 is about: an object list, a string list, an empty list.
const tacticalRaw = JSON.stringify({
  firewallRules: [
    { addressType: 'IPV4', direction: 'IN', portLocation: 'REMOTE', ruleType: 'DENY', portNumber: '443', ipAddress: '10.0.0.1' },
    { addressType: 'IPV4', direction: 'OUT', portLocation: 'LOCAL', ruleType: 'ALLOW', portNumber: '80', ipAddress: '10.0.0.2' }
  ],
  batteryWhitelist: ['io.sdsasolutions.tacticalsettings', 'com.example.other_app'],
  appInstallWhitelist: [],
  enabled: true
});

A.store.init(A.store.empty('android-adb'));
A.store.onboardDevice({ name: 'Dev One', model: 'SM-G990', firmware: 'F1', snapshots: {
  'android.packages': snap('android.packages', 'com.a\ncom.b\ncom.c'),
  'android.tactical': snap('android.tactical', tacticalRaw) } });
A.store.setDecision('android.packages', 'com.a', { action: 'keep' });
A.store.setDecision('android.packages', 'com.b', { action: 'disable' });
A.store.setDecision('android.packages', 'com.c', { action: 'remove' });
const cap = A.registry.getDataset('android-adb', 'android.tactical')
  .capturedDefaults(A.store.getProject().deviceConfigs[0].snapshots['android.tactical']);
A.store.getProject().items['android.tactical'].forEach(it => {
  const c = cap[it.key];
  A.store.setDecision('android.tactical', it.key, { value: c ? c.value : '', type: c ? c.type : 'string' });
});

// ---- EXC-1: a control cycled to Satisfied with Exception ---------------------
const baseId = A.store.getProject().deviceConfigs[0].baseId;
const ctl = A.store.addControl({ title: 'ISM-1234 Bluetooth', type: 'ISM', description: 'No Bluetooth.', assignedDeviceIds: [baseId] });
A.store.setItemFields('android.packages', 'com.b', { controlRefs: [ctl.id] });
let st = A.store.controlDeviceState(A.store.getProject().controls[0], baseId);
ok(st === 'unsatisfied', 'a new control starts unsatisfied, got ' + st);
st = A.projectIo.nextControlState(st); A.store.setControlDeviceState(ctl.id, baseId, st);
ok(st === 'satisfied', 'one click -> satisfied, got ' + st);
st = A.projectIo.nextControlState(st); A.store.setControlDeviceState(ctl.id, baseId, st);
ok(st === 'exception', 'two clicks -> exception, got ' + st);
ok(A.projectIo.nextControlState(st) === 'unsatisfied', 'three clicks -> back to unsatisfied');
A.store.setControlDeviceJustification(ctl.id, baseId, 'Bluetooth radio is disabled in firmware; the stack package cannot be removed on this build.');

// ---- open the workspace ------------------------------------------------------
const genTab = qa('[data-tab]').find(b => /generate/i.test(b.textContent));
click(genTab);
click('[data-rd-open]');
ok(!!q('#rd-modal-host'), 'the workspace mounts');

// ---- NAM-1 + SEC-1 + TBS-1 on a GENERATED section ---------------------------
click('[data-rd-select="ds:android.tactical"]');
ok(!!q('[data-rd-sec-name="ds:android.tactical"]'), 'a generated section offers a name field');
setVal('[data-rd-sec-name="ds:android.tactical"]', 'Knox');
// RTX-1: the introduction is a contenteditable now — type into it and let it blur.
{ const box = q('[data-rd-intro="ds:android.tactical"]');
  if (!box) { fail++; console.log('  \u2717 no introduction box'); }
  else {
    box.textContent = 'The Knox tactical policy below was captured from the device and reviewed line by line.';
    box.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  } }
check('[data-rd-tstyle="head"][data-rd-block="ds:android.tactical"]', true);
check('[data-rd-tstyle="firstColumn"][data-rd-block="ds:android.tactical"]', true);
const bag = A.store.getProject().report;
ok(bag.names['ds:android.tactical'] === 'Knox', 'the name reaches the project');
ok(/captured from the device/.test(bag.intros['ds:android.tactical']), 'the introduction reaches the project');
ok(bag.tableStyles['ds:android.tactical'].head === true, 'header styling reaches the project');
ok(/>Knox</.test(q('#rd-modal-host').innerHTML), 'the section list shows the NAME');

// Show the tactical Value column. OPT-1 put the ticks behind the menu on the section
// ROW, so the menu has to be opened first — which is the point of the change: it can be
// opened from whichever pane you are on.
click('[data-rd-optmenu="ds:android.tactical"]');
ok(!!q('.rd-optmenu'), 'the options menu opens on the row');
check('.rd-optmenu [data-rd-dsmap="columns"][data-rd-ds="android.tactical"][data-rd-key="value"]', true);
ok(!!q('.rd-optmenu'), 'and stays open while you tick through it');
click('[data-rd-optmenu="ds:android.tactical"]');

// ---- TW-1: a custom section with a 60/20/20 table ---------------------------
click('[data-rd-add-section]');
const secId = A.store.getProject().report.sections[0].id;
setVal('[data-rd-sec-title="' + secId + '"]', 'Residual risks');
click('[data-rd-addpart="table"]');
const tid = A.store.getProject().report.sections[0].parts[0].id;
click('[data-rd-addcol="' + tid + '"]');
// RTX-2: a cell is a rich box now, so it is typed into and blurred like a paragraph.
function cellIn(row, col, text) {
  const el = q(`[data-rd-cell="${tid}"][data-rd-row="${row}"][data-rd-col="${col}"]`);
  if (!el) { fail++; console.log('  \u2717 no cell ' + row + ',' + col); return; }
  el.textContent = text;
  el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
}
cellIn(-1, 0, 'Risk');
cellIn(-1, 1, 'Owner');
cellIn(-1, 2, 'Due');
cellIn(0, 0, 'The Bluetooth stack package cannot be uninstalled on this firmware build, so it is disabled for user 0 instead and re-checked at each capture.');
cellIn(0, 1, 'J. Pryor');
cellIn(0, 2, '2026-09-30');
check(`[data-rd-part-flag="styleHead"][data-rd-part="${tid}"]`, true);
check(`[data-rd-part-flag="styleFirstColumn"][data-rd-part="${tid}"]`, true);

// Drag: docStore is what the mousedown handler ends in, so exercise the same call.
A.docStore.setWidth(secId, tid, 0, 0.60);
A.docStore.setWidth(secId, tid, 1, 0.20);
const w = A.store.getProject().report.sections[0].parts[0].widths;
ok(w && w.length === 3, 'widths stored, got ' + JSON.stringify(w));
ok(Math.abs(w[0] - 0.6) < 0.001 && Math.abs(w[1] - 0.2) < 0.001 && Math.abs(w[2] - 0.2) < 0.001,
  'widths are 60/20/20, got ' + JSON.stringify(w));

// ---- CCOL-1 + TW-2: Control coverage columns and widths ---------------------
click('[data-rd-select="control"]');
click('[data-rd-optmenu="control"]');
const ccols = qa('.rd-optmenu [data-rd-dsmap="columns"][data-rd-ds="control"]').map(e => e.getAttribute('data-rd-key'));
click('[data-rd-optmenu="control"]');
ok(ccols.join(',') === 'type,description,status,items,justification', 'Control coverage offers its optional columns: ' + ccols);
// COL-3: Type and Items ship OFF, so the strip has four slots until they are asked for.
ok(qa('.rd-widthbar .rd-wseg').length === 4, 'the strip shows the columns the table will have: ' + qa('.rd-widthbar .rd-wseg').length);
['type', 'items'].forEach(c => A.docStore.setReportInclude('columns', 'control', c, true, false));
A.ui.views.reportDesign.refresh();
ok(qa('.rd-widthbar .rd-wseg').length === 6, 'the width strip stands in for the generated table: ' + qa('.rd-widthbar .rd-wseg').length);
ok(qa('.rd-widthbar [data-rd-colresize]').length === 5, 'a six-column strip has five draggable edges');
const CCW = [[0, 0.20], [1, 0.08], [2, 0.22], [3, 0.14], [4, 0.16], [5, 0.20]];
CCW.forEach(([i, w]) => A.docStore.setBlockWidth('control', 6, i, w, true));
ok(Math.abs(A.docStore.widthTotal(A.store.getProject().report.tableWidths.control).total - 100) < 0.6,
  'a typed set that adds up is not flagged');
// Over-commit it, check the flag, then put it back.
A.docStore.setBlockWidth('control', 6, 0, 0.60, true);
A.ui.views.reportDesign.refresh();
ok(/rd-wflag/.test(q('#rd-modal-host').innerHTML), 'an over-committed set must be flagged in red');
ok(!!q('.rd-wflag') && /more than the page has/.test(q('.rd-wflag').textContent), 'and must say what will happen');
A.docStore.setBlockWidth('control', 6, 0, 0.20, true);
A.ui.views.reportDesign.refresh();
ok(!q('.rd-wflag'), 'and the flag clears when it adds up again');

// TW-3: a set that does not fill the page makes a NARROWER table, not a stretched one.
[[0, 0.2], [1, 0.2], [2, 0.2]].forEach(([i, w]) => A.docStore.setBlockWidth('control', 6, i, w, true));
[3, 4, 5].forEach(i => A.docStore.setBlockWidth('control', 6, i, 0.05, true));
A.ui.views.reportDesign.refresh();
ok(!!q('.rd-wnote') && /of the page width, centred/.test(q('.rd-wnote').textContent),
  'under 100% is an outcome, not a fault: ' + (q('.rd-wnote') || {}).textContent);
CCW.forEach(([i, w]) => A.docStore.setBlockWidth('control', 6, i, w, true));

// ---- TTL-1 + NAM-2 + CAP-2: a title, a reworded heading, a centred caption ---
setVal('[data-rd-level="meta"]', String(A.doc.TITLE_LEVEL));
ok(A.store.getProject().report.levels.meta === A.doc.TITLE_LEVEL, 'the title level reaches the project');
click('[data-rd-select="guidelines"]');
if (q('[data-rd-sec-heading="guidelines"]')) {
  setVal('[data-rd-sec-heading="guidelines"]', 'Departures from the fleet default');
  ok(A.store.getProject().report.headings.guidelines === 'Departures from the fleet default', 'a generated heading is editable');
} else { ok(false, 'no heading box on a generated section'); }
// The caption-centring switch lives on the profile, which must be duplicated first.
A.docStore.addFormat('House', A.docFormat.standard());
A.docStore.setFormatId('fmt1');
const house = A.docFormat.list(A.store.getProject()).filter(f => f.id === 'fmt1')[0];
house.tables.captionCentre = true;
// FNT-1: three sizes — document 11pt, table body 9pt, table header 12pt.
house.tables.fontSize = '9';
house.tables.headFontSize = '12';
A.docStore.updateFormat('fmt1', house);
const live = A.docFormat.resolve(A.store.getProject());
ok(live.tables.captionCentre === true, 'the caption-centring switch saves');
ok(live.tables.fontSize === '9' && live.tables.headFontSize === '12', 'the table font sizes save');

// ---- round trip through the project file ------------------------------------
const ser = A.projectIo.serializeProject(A.store.getProject());
const re = A.projectIo.parseProject(ser);
ok(re.ok, 'the project reparses: ' + JSON.stringify((re.issues || []).slice(0, 3)));
ok(A.projectIo.serializeProject(re.value) === ser, 'serialize is idempotent');
// Compared with a tolerance, not byte-for-byte: the file rounds to four places on
// purpose (two operators dragging to the same place must write the same bytes), so the
// stored value and the live one differ in the last bit of a float.
const rw = re.value.report.sections[0].parts[0].widths;
ok(rw.length === w.length && rw.every((x, i) => Math.abs(x - w[i]) < 0.0002), 'widths survive the round trip: ' + JSON.stringify(rw));
ok(re.value.schemaVersion === 4, 'schemaVersion is 4, got ' + re.value.schemaVersion);

// ---- generate ----------------------------------------------------------------
const devId = A.store.getProject().deviceConfigs[0].id;
const out = A.generate.buildReport(A.store.getProject(), devId, A.ui.views.generate._gen.report);
ok(out && out.text, 'the report generated');
fs.writeFileSync(OUT, out.text);

// determinism: the same project generates the same bytes
A.util.clock.setClock(() => new Date('2026-08-10T00:00:00.000Z'));
const a1 = A.generate.buildReport(A.store.getProject(), devId, A.ui.views.generate._gen.report).text;
const a2 = A.generate.buildReport(A.store.getProject(), devId, A.ui.views.generate._gen.report).text;
ok(a1 === a2, 'generation is byte-deterministic');
A.util.clock.resetClock();

const md = out.text;
ok(/^# Device Config Information \{#sec-meta\}$/m.test(md), 'a title section carries no number');
ok(/^# 1 /m.test(md), 'and the section after it is still 1');
// TTL-3: a title wears its own styling, switched on around that one heading.
ok(/\\chTitleStyle\n```\n\n# Device Config Information/.test(md), 'the title styling is switched on for it');
ok(md.indexOf('\\chSectionStyle') !== -1, 'and off again afterwards');
ok(/\\newcommand\{\\chTitleStyle\}\{\\titleformat/.test(md), 'and the macro itself is in the preamble');
// CAP-3: a caption is an ordinary numbered paragraph between two macros now, so
// centring it is \centering rather than a captionsetup undoing LaTeX's own rules.
ok(/\\newcommand\{\\chCaptionOpen\}\{[^\n]*\\centering\}/.test(md), 'the caption-centring preamble is emitted');
ok(/^Table 1: /m.test(md) && /^Table 2: /m.test(md), 'captions carry their own numbers');
ok(!/^: \S/m.test(md), 'no pandoc caption markers survive');
ok(/chTblBodyFont\}\{\\fontsize\{9pt\}/.test(md) && /chTblHeadFont\}\{\\fontsize\{12pt\}/.test(md),
  'the three font sizes reach the document');
ok(/Tactical \{#sec-ds-android-tactical\}/.test(md), 'the HEADING is still Tactical, not the name Knox');
ok(md.indexOf('captured from the device') !== -1, 'the introduction is in the document');
ok(md.indexOf(A.md.HEAD_SHADE_OPEN) !== -1, 'the header-shade fence is emitted');
ok(md.indexOf(A.md.COL_SHADE) !== -1, 'the first-column shade span is emitted');
ok(/1\\\. addressType: IPV4/.test(md), 'firewall rules print as numbered records, not JSON');
ok(md.indexOf('"addressType"') === -1, 'no raw JSON quoting left in the report');
ok(/io\.sdsasolutions\.tacticalsettings/.test(md), 'the whitelist entries are printed');
ok(/\(none\)/.test(md), 'an empty list reads as (none)');
// A grid cell wraps, so the label can straddle two source lines. The preview
// reassembles cells column-aware, which is what makes it the right thing to assert on.
const shown = A.ui.mdPreview.toHtml(md).html;
ok(/Satisfied\s+with\s+Exception/.test(shown), 'the exception state reaches the report');
ok(/: Residual risks/.test(md), 'the custom table took the section heading as its caption');
ok(!/: Table \d/.test(md), 'no caption carries a number LaTeX also supplies');

// The 60/20/20 border row.
const border = md.split('\n').find(l => /^\+[-:]+\+[-:]+\+[-:]+\+$/.test(l) && l.length > 90);
ok(!!border, 'a three-column grid border exists');
if (border) {
  const segs = border.slice(1, -1).split('+').map(s => (s.length + 1) / border.length);
  ok(Math.abs(segs[0] - 0.6) < 0.02 && Math.abs(segs[1] - 0.2) < 0.02 && Math.abs(segs[2] - 0.2) < 0.02,
    'the dash counts are proportional to 60/20/20, got ' + segs.map(x => x.toFixed(3)).join('/'));
  // Every row of every GRID table must be exactly as wide as its border, or pandoc
  // reads the block as a paragraph rather than as a table.
  let cur = null, misaligned = 0, grids = 0;
  md.split('\n').forEach(l => {
    if (/^\+[-=:+]+$/.test(l) && l.length > 3) { if (cur === null) { grids++; cur = l.length; } else if (l.length !== cur) misaligned++; }
    else if (/^\|/.test(l)) { if (cur !== null && l.length !== cur) misaligned++; }
    else cur = null;
  });
  ok(grids >= 2 && misaligned === 0, 'every grid row lines up with its border (' + grids + ' grids, ' + misaligned + ' misaligned)');
}

// ---- RD-9: a custom section previews on its own tab -------------------------
A.ui.views.reportDesign.select(secId);
A.ui.views.reportDesign.refresh();
const secHtml = q('#rd-modal-host').innerHTML;
ok(/rd-secprev/.test(secHtml), 'a hand-authored section must preview like a generated one');
ok(/Bluetooth stack package/.test(q('.rd-secprev').innerHTML), 'and show its own content');
ok(/Table \d+:/.test(q('.rd-secprev').innerHTML), 'numbered as it will be numbered');
ok(/prv-shade-head/.test(q('.rd-secprev').innerHTML), 'and styled as it will be styled');

// ---- the preview renders the same document ----------------------------------
const prv = A.ui.mdPreview.toHtml(md);
ok(/prv-shade-head/.test(prv.html), 'the preview marks the shaded header');
ok(/prv-shade-col/.test(prv.html), 'the preview marks the shaded first column');
const cols = (prv.html.match(/<col style="width:([\d.]+)%">/g) || []).map(x => Number(/([\d.]+)/.exec(x)[1]));
ok(cols.some(c => Math.abs(c - 60) < 2), 'the preview carries a ~60% colgroup: ' + cols.join(','));
ok(/<strong>Table 1:<\/strong>/.test(prv.html), 'the preview numbers the captions');
ok(!/Raw LaTeX/.test(prv.html), 'the shading fences are not shown as raw LaTeX');

console.log(errs.length ? 'JSDOM ERRORS:\n' + errs.join('\n') : '(no jsdom errors)');
console.log('wrote ' + OUT);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
