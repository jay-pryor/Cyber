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
// RTX-1: the prose boxes are contenteditable now, not textareas — type into them and
// let them blur, which is when they commit.
function typeIn(sel, text) {
  const el = typeof sel === 'string' ? q(sel) : sel;
  if (!el) { fail++; console.log('  ✗ no box: ' + sel); return null; }
  el.textContent = text;
  el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  return el;
}
/** Select a run of the box's first text node, so a toolbar button has something to act on. */
function selectIn(sel, from, len) {
  const el = typeof sel === 'string' ? q(sel) : sel;
  if (!el || !el.firstChild) { fail++; console.log('  ✗ nothing to select in: ' + sel); return null; }
  const r = document.createRange();
  r.setStart(el.firstChild, from); r.setEnd(el.firstChild, from + len);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  el.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  return el;
}
function caretEnd(sel) {
  const el = typeof sel === 'string' ? q(sel) : sel;
  if (!el) return null;
  A.ui.richText.placeCaret(el, A.ui.richText.fromNode(el).length, window);
  el.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
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
typeIn('[data-rd-text="' + partId + '"]', 'Hardened to 100% of the baseline.');
ok(A.store.getProject().report.sections[0].parts[0].text === 'Hardened to 100% of the baseline.', 'the prose saves verbatim');
ok(/Escaped for LaTeX/.test(q('#rd-modal-host').innerHTML), 'and the escape hint appears');

// ---- rich text: wrap a selection --------------------------------------------
selectIn('[data-rd-text="' + partId + '"]', 0, 8);   // "Hardened"
click('[data-rd-wrap="b"][data-rd-part="' + partId + '"]');
ok(/^\{\{b\}\}Hardened\{\{\/b\}\}/.test(A.store.getProject().report.sections[0].parts[0].text),
  'the Bold button wraps the selection: ' + A.store.getProject().report.sections[0].parts[0].text);

// ---- a table, filled in ------------------------------------------------------
click('[data-rd-addpart="table"]');
const tblId = A.store.getProject().report.sections[0].parts[1].id;
typeIn('[data-rd-cell="' + tblId + '"][data-rd-row="-1"][data-rd-col="0"]', 'Setting');
typeIn('[data-rd-cell="' + tblId + '"][data-rd-row="0"][data-rd-col="0"]', 'wifi_sleep_policy');
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
// REF-1: a target is a ROW now — its label, then a button per reading (Full / Number /
// Title), so the writer picks what the link says as well as what it points at.
click('[data-rd-ref-open="' + partId + '"]');
ok(!!q('.rd-refmenu'), 'the reference picker opens');
const row = qa('.rd-reftarget').find(r => /Control coverage/.test(r.textContent));
ok(!!row, 'Control coverage is offered as a link target');
ok(row && qa('button', row).length === 0 ? false : true, 'and offers its readings');
const target = row && row.querySelector('[data-rd-ref-pick="control"][data-rd-ref-tag="ref"]');
ok(!!target, 'with a Full reading to insert');
caretEnd('[data-rd-text="' + partId + '"]');
click(target);
ok(/\{\{ref:control\}\}/.test(A.store.getProject().report.sections[0].parts[0].text || A.store.getProject().report.sections[0].parts[1].text),
  'the reference token is inserted');

// REF-1: with text selected, the SELECTION becomes the link's words.
const before = A.store.getProject().report.sections[0].parts.map(p => p.text || '').join('');
// A word of plain prose, deliberately clear of the {{b}} pair earlier in the box.
// Selected in the DOM, then the menu is opened — the selection is recorded as token
// offsets on the way past, which is what lets it survive the menu's repaint (RTX-1).
const box2 = q('[data-rd-text="' + partId + '"]');
const run = [...box2.childNodes].find(n => n.nodeType === 3 && n.nodeValue.indexOf('baseline') !== -1);
if (run) {
  const r2 = document.createRange();
  const at = run.nodeValue.indexOf('baseline');
  r2.setStart(run, at); r2.setEnd(run, at + 8);
  const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r2);
  box2.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
}
click('[data-rd-ref-open="' + partId + '"]');
click(q('[data-rd-ref-pick="control"][data-rd-ref-tag="refn"]'));
const after = A.store.getProject().report.sections[0].parts.map(p => p.text || '').join('');
ok(/\{\{refn:control\}\}[\s\S]{1,20}\{\{\/ref\}\}/.test(after),
  'a selection is wrapped rather than replaced: ' + after.slice(0, 80));
ok(after.length > before.length, 'and nothing the author wrote was eaten');

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

// FNT-2: the body font. A sans package is the interesting one — it needs the
// \familydefault switch as well, or the setting does nothing to the body text.
ok(!!q('[data-rd-fmt="page.fontFamily"]'), 'the font selector is in the pane');
ok(!!q('[data-rd-fmt="page.fontFamily"] option[value="tgpagella"]'), 'and it lists the fonts');
setVal('[data-rd-fmt="page.fontFamily"]', 'tgheros');
ok(A.store.getProject().report.formats[0].page.fontFamily === 'tgheros', 'a font choice saves');
ok(q('[data-rd-fmt="page.fontFamily"]').value === 'tgheros', 'and the select repaints on the choice');

// CODE-1 / CAP-3 / TOC-2: the new page, caption and contents controls.
setVal('[data-rd-fmt="page.codeShade"]', '#eeeeee');
ok(A.store.getProject().report.formats[0].page.codeShade === '#eeeeee', 'a code shade saves');
click('[data-rd-fmt-clear="page.codeShade"]');
ok(A.store.getProject().report.formats[0].page.codeShade === '', 'and "No shade" clears it, which white would not');
setVal('[data-rd-fmt="page.codeShade"]', '#f2f2f2');
setVal('[data-rd-fmt="tables.captionPosition"]', 'above');
ok(A.store.getProject().report.formats[0].tables.captionPosition === 'above', 'the caption position saves');
setVal('[data-rd-fmt="tables.captionSkip"]', '6');
ok(String(A.store.getProject().report.formats[0].tables.captionSkip) === '6', 'the caption gap saves');
setVal('[data-rd-fmt="tables.captionPosition"]', 'below');
setVal('[data-rd-fmt="toc.entrySpacing"]', '3');
ok(String(A.store.getProject().report.formats[0].toc.entrySpacing) === '3', 'the contents spacing saves');

// ---- TTL-2: the title-block switch, on the Relevance pane's Document fieldset ----
click('[data-rd-pane="relevance"]');
ok(!!q('[data-rd-titleblock]'), 'the Document fieldset offers the title block');
ok(!q('[data-rd-titleblock]').checked, 'and it is off, so a hand-made title page is possible');
check('[data-rd-titleblock]', true);
ok(A.store.getProject().report.titleBlock === true, 'switching it on is a PROJECT decision');
check('[data-rd-titleblock]', false);
ok((A.store.getProject().report || {}).titleBlock === undefined, 'and off leaves no trace');
click('[data-rd-pane="formatting"]');

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
// TOC-1: the contents list is drawn from the headings the document turned out to have.
ok(!!q('.prv-toc'), 'the preview draws a contents list');
ok(/Control coverage/.test(q('.prv-toc').textContent), 'and it lists the sections');
ok(doc.innerHTML.indexOf('chContents') === -1, 'never the macro behind it');
// CAP-3: captions are numbered paragraphs, shown where the page will show them.
ok(/<div class="prv-caption"><strong>Table 1:<\/strong>/.test(doc.innerHTML), 'a caption is numbered and labelled');
ok(/wifi_sleep_policy/.test(doc.textContent), 'the hand-filled table cell is shown');
// FNT-2: the paper wears the chosen font, and everything on it inherits — which is
// the half of the feature a render-only test cannot see.
const paper = q('.rd-paper');
ok(!!paper && window.getComputedStyle(paper).fontFamily.indexOf('Helvetica') === 0,
  'the paper computes to the chosen font: ' + (paper && window.getComputedStyle(paper).fontFamily));
const anyHead = q('.rd-paper .prv-h1, .rd-paper .prv-h2');
ok(anyHead && window.getComputedStyle(anyHead).fontFamily.indexOf('Helvetica') === 0,
  'and a heading inherits it rather than keeping the app font');

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
ok(/100\\% of the /.test(md), 'and escapes the percent');
// REF-1: the word that was selected when the reference was inserted is the link's text,
// and it points at the section that was picked rather than printing a token.
ok(/\[baseline\]\(#sec-control\)/.test(md), 'the wrapped selection became the link text: ' +
  (md.match(/.{0,40}baseline.{0,30}/) || ''));
ok(md.indexOf('{{ref') === -1 && md.indexOf('{{refn') === -1, 'and no raw token reaches the document');
ok(/^fontfamily: "tgheros"$/m.test(md), 'the chosen font reaches the YAML as a package name');
ok(/\\renewcommand\{\\familydefault\}\{\\sfdefault\}/.test(md), 'and a sans package switches the default family');
ok(/`wifi\\?_sleep\\?_policy`|wifi\\_sleep\\_policy/.test(md), 'the table cell is escaped');
ok(/\[Section [\d.]+ — Control coverage\]\(#sec-control\)/.test(md), 'the cross-reference resolved');
ok(/\\begin\{center\}/.test(md) && /\\end\{center\}/.test(md), 'the centred table is centred');
ok(/^\* \* \*$/m.test(md), 'the horizontal line is emitted');
ok(/\n  - "top=10mm"/.test(md), 'the formatting profile reached the front matter');
ok(md.indexOf('Generated (UTC)') === -1, 'no UTC row in the document');
ok(md.indexOf('Project SHA-256') === -1, 'the switched-off metadata row is gone');
ok(/^#+ [\d.]+ Deviations from Security Guidelines \{#sec-guidelines\}$/m.test(md), 'the guidelines section is in the document');
ok(/ASD says remove; kept for 50\\% of users/.test(md), 'with its narrative, escaped');

// ==============================================================================
// v2.4: header & footer, the Generate pane, and the paged preview
//
// All three are wiring the render-only suites cannot reach: a slot that writes into a
// formatting profile, a placeholder list read off a document that has to be built to
// draw the pane, and a pagination pass that only exists once the DOM is laid out.
// ==============================================================================
click('[data-rd-open]');
ok(!!q('#rd-modal-host'), 'the workspace re-opens');

// ---- HDR-1: the header and footer --------------------------------------------
click('[data-rd-pane="headerfooter"]');
ok(!!q('[data-rd-hf-set="header"][data-rd-hf-slot="centre"]'), 'the header offers three slots');
ok(!!q('[data-rd-hf-set="footer"][data-rd-hf-slot="right"]'), 'and so does the footer');
ok(!!q('[data-rd-classification]'), 'the OFFICIAL: Sensitive tick has moved here');
ok(!q('[data-rd-fmt="page.numberPosition"]'), 'and the old page-number picker is gone');
setVal('[data-rd-hf-set="header"][data-rd-hf-slot="left"]', 'CH Report');
setVal('[data-rd-hf-set="footer"][data-rd-hf-slot="right"]', 'Page #page of #pages');
ok(A.docFormat.resolve(A.store.getProject()).headerFooter.header.left === 'CH Report', 'a slot saves to the profile');
ok(!q('[data-rd-hf-set="firstHeader"]'), 'the first-page rows are hidden until asked for');
check('[data-rd-hf-first]', true);
ok(!!q('[data-rd-hf-set="firstHeader"][data-rd-hf-slot="centre"]'), 'and appear once they are');
check('[data-rd-classification]', true);
// CLS-1: a project decision now, not a session one — so it is in the file.
ok(A.store.getProject().report.classification === true, 'the banner is saved with the project');

const hfPre = A.docFormat.preamble(A.docFormat.resolve(A.store.getProject()), { classification: 'OFFICIAL: Sensitive' });
ok(/\\fancyhead\[L\]\{CH Report\}/.test(hfPre), 'the header slot reaches the preamble');
// Braced, because TeX eats the space after a control word — `\thepage of` printed
// "1of" in a built PDF, which is the only place that shows.
ok(/\\fancyfoot\[R\]\{Page \{\\thepage\} of \{\\pageref\{LastPage\}\}\}/.test(hfPre),
  'page and pages become the macros that print them: ' + (hfPre.match(/fancyfoot\[R\].*/) || ''));
ok(/\\usepackage\{lastpage\}/.test(hfPre), 'and lastpage is loaded because something asked for the total');
// Page 1 is an ordinary fancy page (no \maketitle), so a different first page is a
// style of its own that the BODY asks for — see the built-PDF finding behind it.
ok(/\\fancypagestyle\{chfirst\}\{\\fancyhf\{\}/.test(hfPre), 'a different first page gets its own style');
ok(/\\fancyhead\[C\]\{\\textbf\{OFFICIAL: Sensitive\}\}/.test(hfPre), 'the banner takes the free centre slot');

// ---- GEN-TAB: the filename and the placeholders ------------------------------
A.docStore.setBlockHeading('ds:android.packages', 'Packages as at /[Date]');
A.docStore.setTableText('ds:android.packages', 'keep', 'title', 'Kept, signed off by /[Author]');
click('[data-rd-pane="generate"]');
ok(!!q('[data-rd-filename]'), 'the Generate pane names the file');
ok(!!q('[data-rd-tag="Date"]'), 'a tag in a HEADING is listed');
ok(!!q('[data-rd-tag="Author"]'), 'a tag in a TABLE TITLE ROW is listed too');
ok(/data-generate-action="reporting"/.test(q('.rd-pane').innerHTML), 'and this is where generation happens');
setVal('[data-rd-filename]', 'CH Report M1');
setVal('[data-rd-tag="Date"]', '30 June 2026');
ok(/1 placeholder still to fill in/.test(q('.rd-pane').textContent), 'the unfilled one is counted: ' +
  (q('.rd-pane').textContent.match(/\d+ placeholders? still[^.]*/) || ''));

const gen = A.generate.buildReport(A.store.getProject(), 'dev-m1', A.ui.views.generate._gen.report);
ok(gen.name === 'CH Report M1.md', 'the download takes the name given: ' + gen.name);
ok(/Packages as at 30 June 2026/.test(gen.text), 'the filled tag is replaced everywhere it appears');
ok(A.generate.findTags(gen.text).join(',') === 'Author',
  'and an unfilled tag is left standing rather than blanked: ' + A.generate.findTags(gen.text));
ok(A.generate.docFilename('../../etc/passwd') === 'etc-passwd.md', 'a filename cannot carry a path');

// ---- PRV-4: the paged preview ------------------------------------------------
click('[data-rd-pane="preview"]');
ok(!!q('[data-rd-pageview]'), 'the preview offers a Pages toggle');
ok(!q('[data-prv-pages]'), 'off, it is the continuous sheet it has always been');
check('[data-rd-pageview]', true);
ok(!!q('[data-prv-pages]'), 'on, the document is laid out as sheets');
ok(qa('.rd-sheet').length >= 1, 'and there is at least one: ' + qa('.rd-sheet').length);
// jsdom reports every height as 0, so it cannot decide where the breaks fall — what it
// CAN check is that the running header and footer are drawn on the sheet, which is the
// half of this that is not a measurement.
ok(/OFFICIAL: Sensitive/.test(q('.rd-sheet').innerHTML), 'the banner prints on the sheet');
// The FIRST-page set, because that is what was asked for above — which is the whole
// point of the switch, and is why the running "CH Report" is NOT on page one.
ok(!/CH Report/.test(q('.rd-sheet-head').innerHTML),
  'page one uses its own header, not the running one: ' + q('.rd-sheet-head').innerHTML);
click('[data-rd-pane="headerfooter"]');
setVal('[data-rd-hf-set="firstHeader"][data-rd-hf-slot="left"]', 'Title page');
setVal('[data-rd-hf-set="firstFooter"][data-rd-hf-slot="right"]', '#page of #pages');
click('[data-rd-pane="preview"]');
ok(/Title page/.test(q('.rd-sheet-head').innerHTML), 'the first-page header slot prints in the top margin');
// SEC-4: the profile starts a page at every H1, so the preview now breaks there too —
// the total is whatever that comes to, and the point is that both numbers are real.
ok(/1 of \d+/.test(q('.rd-sheet-foot').textContent),
  'and page/pages resolve to real numbers in the footer: ' + q('.rd-sheet-foot').textContent);
// PRV-4: pagination is the one thing here that needs a LAYOUT, and jsdom has none — so
// one is supplied. Every row 20px, every other block 30px, which is enough for the
// splitter to have something real to divide.
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    if (this.tagName === 'TR') return 20;
    if (this.tagName === 'THEAD') return 24;
    // Anything CONTAINING a table is as tall as what is in it, at whatever depth — a
    // centred section wraps its table twice, and a stub that only knew about the
    // innermost wrapper reported 30px for a table sixty rows long.
    const rows = this.querySelectorAll('tbody tr').length;
    const heads = this.querySelectorAll('thead').length;
    if (rows || heads) return heads * 24 + rows * 20;
    return 30;
  },
});
// A table long enough to have to continue. The hand-authored one is the easiest to grow
// without disturbing the register the rest of this file asserts against.
for (let i = 0; i < 60; i++) A.docStore.addRow(secId, tblId);
const longRows = A.store.getProject().report.sections[0].parts
  .filter(p => p.id === tblId)[0].rows.length;
check('[data-rd-pageview]', false);
click('[data-rd-refresh-preview]');
check('[data-rd-pageview]', true);
const sheets = qa('.rd-sheet');
ok(sheets.length > 1, 'a document taller than a page is cut into several sheets: ' + sheets.length);
// Read the sheet off the host rather than assuming A4 at 25mm — this profile has been
// edited by the tests above, and a hard-coded number would be testing the wrong page.
const host = q('[data-prv-pages]');
const dim = k => Number(host.getAttribute('data-prv-' + k)) || 0;
const pageBody = dim('ph') - dim('mt') - dim('mb');
const overflowing = sheets.filter(s =>
  [...s.querySelector('.rd-sheet-body').children].reduce((a, k) => a + k.offsetHeight, 0) > pageBody);
ok(!overflowing.length, 'no sheet may hold more than a page: ' + overflowing.length + ' do');
// A table used to be moved whole into a fixed-height sheet and clipped at the edge, so
// most of its rows simply were not in the preview.
const tables = qa('.rd-sheet table');
ok(tables.length > qa('.rd-sheet').length - 1, 'the tables are present: ' + tables.length);
ok(tables.every(t => !!t.tHead), 'every continued part must repeat its header row');
// The 61-row table cannot fit on one page, so it must appear on more than one sheet with
// its rows shared between them — which is what "continues" means, as against being
// clipped at the page edge with the rest of its rows simply absent from the preview.
const wide = sheets.map(s => [...s.querySelectorAll('table')]
  .filter(t => t.tHead && /Setting/.test(t.tHead.textContent))
  .reduce((a, t) => a + t.querySelectorAll('tbody tr').length, 0));
const carrying = wide.filter(n => n > 0);
ok(carrying.length > 1, 'a long table must continue onto the next sheet: ' + JSON.stringify(wide));
ok(carrying.reduce((a, n) => a + n, 0) === longRows, 'and every one of its rows must survive the split: ' +
  carrying.reduce((a, n) => a + n, 0) + ' of ' + longRows);
// The navigator has to reach them. offsetTop is relative to the SHEET in page view, so
// the old arithmetic jumped to a position inside whichever page the target sat on.
const jump = qa('[data-prv-jump]').find(a => a.getAttribute('data-prv-jump'));
ok(!!jump && !!document.getElementById(jump.getAttribute('data-prv-jump')),
  'a navigator link points at something that is actually on a sheet');

check('[data-rd-pageview]', false);
ok(!q('[data-prv-pages]'), 'and switching it off returns the continuous view');

console.log(errs.length ? '\nConsole errors:\n  ' + errs.slice(0, 8).join('\n  ') : '');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
