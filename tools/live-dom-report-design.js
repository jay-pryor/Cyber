/**
 * Live-DOM pass for the Report Design workspace: mounts the real app in jsdom and
 * drives the real wiring with real clicks, which the render-only self-tests cannot.
 */
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
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const q = sel => document.querySelector(sel);
const qa = sel => [...document.querySelectorAll(sel)];
function click(sel) {
  const el = typeof sel === 'string' ? q(sel) : sel;
  if (!el) { fail++; console.log('  ✗ nothing to click: ' + sel); return null; }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return el;
}
function setVal(sel, v) {
  const el = typeof sel === 'string' ? q(sel) : sel;
  if (!el) { fail++; console.log('  ✗ no field: ' + sel); return null; }
  el.value = v;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
  return el;
}
function check(sel, on) {
  const el = q(sel);
  if (!el) { fail++; console.log('  ✗ no checkbox: ' + sel); return null; }
  el.checked = on;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
  return el;
}

// ---- boot + a ready device ---------------------------------------------------
A.registry.registerPlatform(A.platforms.androidAdb);
A.ui.app.mount(document.getElementById('root'));

function snap(ds, raw) {
  const a = A.registry.getDataset('android-adb', ds), pr = a.parse(raw);
  const o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: ds, sha256: A.util.hash.sha256Hex(raw), keys: pr.keys };
  if (pr.values) o.values = pr.values;
  if (pr.template !== undefined) o.template = pr.template;
  return o;
}
A.store.init(A.store.empty('android-adb'));
A.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
  'android.packages': snap('android.packages', 'com.a\ncom.b'),
  'android.tactical': snap('android.tactical', '{"enabled":true,"count":3}') } });
A.store.setDecision('android.packages', 'com.a', { action: 'keep' });
A.store.setDecision('android.packages', 'com.b', { action: 'disable' });
// Decide EVERY tactical key (the adapter adds imsSettings leaves), so the device is
// actually ready and the Generate button is live.
const cap = A.registry.getDataset('android-adb', 'android.tactical')
  .capturedDefaults(A.store.getProject().deviceConfigs[0].snapshots['android.tactical']);
A.store.getProject().items['android.tactical'].forEach(it => {
  const c = cap[it.key];
  A.store.setDecision('android.tactical', it.key, { value: c ? c.value : '', type: c ? c.type : 'string' });
});

// ---- open the Generate tab, then the workspace -------------------------------
const genTab = qa('[data-tab]').find(b => /generate/i.test(b.textContent));
ok(!!genTab, 'the Generate tab exists');
click(genTab);
ok(!!q('[data-rd-open]'), 'the Reporting card offers the Report Design button');
ok(/Report Design/.test(q('[data-rd-open]').textContent), 'and names it');
click('[data-rd-open]');
ok(!!q('#rd-modal-host'), 'the workspace mounts');
ok(qa('.rd-row').length >= 6, 'the section list is populated: ' + qa('.rd-row').length);
ok(qa('.rd-level').length >= 6, 'every row has a heading-level picker');

// ---- pin a heading level -----------------------------------------------------
setVal('[data-rd-level="meta"]', '3');
ok(A.store.getProject().report.levels.meta === 3, 'the level reaches the project');
ok(!!q('#rd-modal-host'), 'and the workspace repaints in place rather than closing');

// ---- add a custom section and write in it ------------------------------------
click('[data-rd-add-section]');
const secId = A.store.getProject().report.sections[0].id;
ok(!!secId, 'a custom section was created');
ok(!!q('[data-rd-sec-title="' + secId + '"]'), 'and it opened in the Section pane');
setVal('[data-rd-sec-title="' + secId + '"]', 'Executive summary');
ok(A.store.getProject().report.sections[0].title === 'Executive summary', 'the heading saves');

click('[data-rd-addpart="para"]');
const partId = A.store.getProject().report.sections[0].parts[0].id;
setVal('[data-rd-text="' + partId + '"]', 'Hardened to 100% of the baseline.');
ok(A.store.getProject().report.sections[0].parts[0].text === 'Hardened to 100% of the baseline.', 'the prose saves verbatim');
ok(/Escaped for LaTeX/.test(q('#rd-modal-host').innerHTML), 'and the escape hint appears');

// ---- rich text: wrap a selection --------------------------------------------
const ta = q('[data-rd-text="' + partId + '"]');
ta.selectionStart = 0; ta.selectionEnd = 8;   // "Hardened"
click('[data-rd-wrap="b"][data-rd-part="' + partId + '"]');
ok(/^\{\{b\}\}Hardened\{\{\/b\}\}/.test(A.store.getProject().report.sections[0].parts[0].text),
  'the Bold button wraps the selection: ' + A.store.getProject().report.sections[0].parts[0].text);

// ---- a table, filled in ------------------------------------------------------
click('[data-rd-addpart="table"]');
const tblId = A.store.getProject().report.sections[0].parts[1].id;
setVal('[data-rd-cell="' + tblId + '"][data-rd-row="-1"][data-rd-col="0"]', 'Setting');
setVal('[data-rd-cell="' + tblId + '"][data-rd-row="0"][data-rd-col="0"]', 'wifi_sleep_policy');
click('[data-rd-addrow="' + tblId + '"]');
click('[data-rd-addcol="' + tblId + '"]');
const tbl = A.store.getProject().report.sections[0].parts[1];
ok(tbl.header[0] === 'Setting', 'a header cell saves');
ok(tbl.rows[0][0] === 'wifi_sleep_policy', 'a body cell saves');
ok(tbl.rows.length === 2 && tbl.header.length === 3, 'add row/column work: ' + tbl.rows.length + 'x' + tbl.header.length);
setVal('[data-rd-align="' + tblId + '"][data-rd-col="0"]', 'c');
ok(A.store.getProject().report.sections[0].parts[1].align[0] === 'c', 'column alignment saves');
check('[data-rd-part-flag="centre"][data-rd-part="' + tblId + '"]', true);
ok(A.store.getProject().report.sections[0].parts[1].centre === true, 'centring saves');

// ---- a rule, and part reordering --------------------------------------------
click('[data-rd-addpart="rule"]');
ok(A.store.getProject().report.sections[0].parts.length === 3, 'a horizontal line is a part');
click('[data-rd-part-up][data-rd-part-up="' + tblId + '"]');
ok(A.store.getProject().report.sections[0].parts[0].id === tblId, 'a part moves up');

// ---- a cross-reference -------------------------------------------------------
click('[data-rd-ref-open="' + partId + '"]');
ok(!!q('.rd-refmenu'), 'the reference picker opens');
const target = qa('[data-rd-ref-pick]').find(b => /Control coverage/.test(b.textContent));
ok(!!target, 'Control coverage is offered as a link target');
const taNow = q('[data-rd-text="' + partId + '"]');
taNow.selectionStart = taNow.selectionEnd = taNow.value.length;
click(target);
ok(/\{\{ref:control\}\}/.test(A.store.getProject().report.sections[0].parts[0].text || A.store.getProject().report.sections[0].parts[1].text),
  'the reference token is inserted');

// ---- v2.3: per-section preview, centring, metadata rows, guidelines -----------
A.store.setItemFields('android.packages', 'com.b',
  { diverges: true, description: 'Vendor launcher', divergenceNarrative: 'ASD says remove; kept for 50% of users.' });
click('[data-rd-pane="section"]');
// the guidelines section only exists once something diverges
ok(!!q('[data-rd-block="guidelines"]'), 'the guidelines section appears once something is flagged');
click('[data-rd-select="guidelines"]');
ok(/rd-secprev/.test(q('#rd-modal-host').innerHTML), 'a generated section previews in its own tab');
ok(/Vendor launcher/.test(q('.rd-secprev').textContent), 'and the preview carries the flagged item');
ok(/ASD says remove/.test(q('.rd-secprev').textContent), 'and its narrative');
ok(/Packages/.test(q('.rd-secprev').textContent), 'grouped by register');
ok(!/Tactical/.test(q('.rd-secprev').textContent), 'a register with nothing flagged is left out');

check('[data-rd-centre="guidelines"]', true);
ok(A.store.getProject().report.centred.guidelines === true, 'a generated section can be centred');

click('[data-rd-select="meta"]');
ok(!!q('[data-rd-meta="projectHash"]'), 'the metadata block offers its row picker');
ok(!q('[data-rd-meta="generatedUtc"]'), 'and has no UTC row to pick');
check('[data-rd-meta="projectHash"]', false);
ok(A.store.getProject().report.meta.projectHash === false, 'a metadata row switches off');
ok(/rd-secprev/.test(q('#rd-modal-host').innerHTML), 'the metadata block previews too');
ok(!/Project SHA-256/.test(q('.rd-secprev').textContent), 'and the preview drops the row immediately');

// ---- formatting pane ---------------------------------------------------------
click('[data-rd-pane="formatting"]');
ok(!!q('[data-rd-fmt-active]'), 'the formatting pane renders');
ok(q('.rd-fmt-body').hasAttribute('disabled'), 'the built-in profile is not editable');
window.prompt = () => 'House';
click('[data-rd-fmt-new]');
ok((A.store.getProject().report.formats || []).length === 1, 'Duplicate makes a new profile');
ok(!q('.rd-fmt-body').hasAttribute('disabled'), 'and the copy IS editable');
setVal('[data-rd-fmt="page.marginTop"]', '10mm');
ok(A.store.getProject().report.formats[0].page.marginTop === '10mm', 'a margin edit saves');
check('[data-rd-fmt-bool="headings.numbered"]', false);
ok(A.store.getProject().report.formats[0].headings.numbered === false, 'a heading switch saves');
check('[data-rd-fmt-bool="headings.numbered"]', true);

// ---- templates pane ----------------------------------------------------------
click('[data-rd-pane="templates"]');
ok(!!q('[data-rd-import="sections"]') && !!q('[data-rd-import="formats"]') && !!q('[data-rd-import="reports"]'),
  'all three catalogues offer import');
window.prompt = () => 'House style';
click('[data-rd-rpt-save]');
ok((A.store.getProject().report.reportTemplates || []).length === 1, 'the whole design saves as a template');

// ---- preview -----------------------------------------------------------------
click('[data-rd-pane="preview"]');
const doc = q('#rd-preview-doc');
ok(!!doc, 'the preview pane renders');
ok(/Executive summary/.test(doc.innerHTML), 'the custom section is in it');
ok(/<strong>Hardened<\/strong>/.test(doc.innerHTML), 'the bold token rendered as emphasis');
ok(/100% of the baseline/.test(doc.textContent), 'the escaped percent reads back as a percent');
ok(doc.innerHTML.indexOf('\\%') === -1, 'and the backslash is not shown to the reader');
ok(qa('.rd-nav').length > 3, 'the outline rail is populated');
ok(/wifi_sleep_policy/.test(doc.textContent), 'the hand-filled table cell is shown');

// ---- generate ----------------------------------------------------------------
let downloaded = null;
A.util.dom.download = (blob, name) => { downloaded = name; };
click('[data-generate-action="reporting"]');
ok(downloaded && /^dev-m1-reporting-\d{8}T\d{6}Z\.md$/.test(downloaded), 'Generate downloads one .md: ' + downloaded);

// ---- close -------------------------------------------------------------------
click('[data-rd-close]');
ok(!q('#rd-modal-host'), 'the workspace closes');

// ---- the generated document itself -------------------------------------------
const md = A.generate.buildReport(A.store.getProject(), 'dev-m1', A.ui.views.generate._gen.report).text;
ok(/\*\*Hardened\*\*/.test(md), 'the .md carries the bold');
ok(/100\\% of the baseline/.test(md), 'and escapes the percent');
ok(/`wifi\\?_sleep\\?_policy`|wifi\\_sleep\\_policy/.test(md), 'the table cell is escaped');
ok(/\[Section [\d.]+ — Control coverage\]\(#sec-control\)/.test(md), 'the cross-reference resolved');
ok(/\\begin\{center\}/.test(md) && /\\end\{center\}/.test(md), 'the centred table is centred');
ok(/^\* \* \*$/m.test(md), 'the horizontal line is emitted');
ok(/\n  - "top=10mm"/.test(md), 'the formatting profile reached the front matter');
ok(md.indexOf('Generated (UTC)') === -1, 'no UTC row in the document');
ok(md.indexOf('Project SHA-256') === -1, 'the switched-off metadata row is gone');
ok(/^#+ [\d.]+ Deviations from Security Guidelines \{#sec-guidelines\}$/m.test(md), 'the guidelines section is in the document');
ok(/ASD says remove; kept for 50\\% of users/.test(md), 'with its narrative, escaped');

console.log(errs.length ? '\nConsole errors:\n  ' + errs.slice(0, 8).join('\n  ') : '');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
