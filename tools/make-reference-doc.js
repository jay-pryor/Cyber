/**
 * The reference document tools/build-pdf.sh converts, exercising the things that only a
 * built page can settle: a centred title page out of the contents, a header and footer
 * with a different first page, the classification banner, /[Tag] placeholders, table
 * title rows, and control mentions that have to arrive as real links.
 *
 * Usage: node tools/make-reference-doc.js [out.md]
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const vc = new VirtualConsole(); vc.on('jsdomError', e=>console.log('ERR',e.message));
const ROOT = require('path').resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(ROOT + '/ch-config-tool.html','utf8'),
  { runScripts:'dangerously', url:'file:///x', pretendToBeVisual:true, virtualConsole: vc });
const { window, window: { document } } = dom; const A = window.App;
A.registry.registerPlatform(A.platforms.androidAdb);
A.ui.app.mount(document.getElementById('root'));
function snap(ds, raw){ const a=A.registry.getDataset('android-adb',ds), pr=a.parse(raw);
  return { capturedUtc:'2026-01-01T00:00:00.000Z', sourceFilename:ds, sha256:'x', keys:pr.keys, template:pr.template }; }
A.store.init(A.store.empty('android-adb'));
A.store.onboardDevice({ name:'Galaxy S24', model:'SM-S921B', firmware:'UP1A',
  snapshots:{ 'android.packages': snap('android.packages', Array.from({length:6},(_,i)=>'com.vendor.app'+i).join('\n')) } });
const items = A.store.getProject().items['android.packages'];
items.forEach((it,i)=>A.store.setDecision('android.packages', it.key, {action:'remove'}));
['AHG-001','ISM-1416'].forEach(t=>A.store.addControl({title:t,type:'ASD',description:'Vendor applications must be removable.'}));
const cs = A.store.getProject().controls.map(c=>c.id);
items.forEach((it,i)=>A.store.setItemFields('android.packages', it.key,
  { controlRefs:[cs[i%2]], rationale:'Removed to satisfy AHG-001 and ISM-1416.' }));

// A centred TITLE PAGE, out of the contents, with line breaks and a trailing one.
const sec = A.docStore.addSection('CH Configuration Report /[Date]').id;
A.docStore.setBlockLevel(sec, 0);
A.docStore.setBlockFlag('centred', sec, true);
A.docStore.setBlockFlag('noToc', sec, true);
A.docStore.addPart(sec, 'para');
const pid = A.store.getProject().report.sections[0].parts[0].id;
A.docStore.updatePart(sec, pid, { text:
  'Prepared for {{b}}ACME Pty Ltd{{/b}}{{br}}{{br}}Issued /[Date]{{br}}{{br}}See {{refn:control}} for coverage.{{br}}' });
A.store.setReportOrder([sec,'toc','meta','ds:android.packages','ds:android.tactical','ds:android.custom','control','guidelines']);

// A header and footer, with a different first page.
const fid = A.docStore.addFormat('House', A.docFormat.standard()).id;
A.docStore.setFormatId(fid);
const f = JSON.parse(JSON.stringify(A.docFormat.resolve(A.store.getProject())));
f.headerFooter = { firstDifferent:true,
  // Deliberately hostile to LaTeX: `<`, `&`, `%`, `_`, `#`, `~` and a backslash all
  // reach the preamble verbatim, so this is the string that proves the escaper.
  header:{left:'<---- Security classification & 100% {safe}_x #1 ~ \\', centre:'', right:''},
  footer:{left:'', centre:'', right:'Page #page of #pages'},
  firstHeader:{left:'Title page', centre:'', right:''}, firstFooter:{left:'',centre:'',right:''} };
A.docStore.updateFormat(fid, f);

// TBL-1: a title row on each of the grouped register's tables, and a shaded header, so
// the merged spanning row is exercised — it is the construct that has been wrong three
// times and the one that only a built page can settle.
A.docStore.setTableText('ds:android.packages','remove','title','Packages removed from the build');
A.docStore.setTableText('ds:android.packages','keep','title','Packages kept');
A.docStore.setTableText('ds:android.packages','disable','title','Packages disabled for user 0');
A.docStore.setBlockTableStyle('ds:android.packages','head', true);
A.docStore.setBlockTableStyle('control','head', true);

/* SPC-1: a signature page — the case the whole feature exists for, and one only a built
 * page can settle. Its own page, its heading 70mm down it, a measured gap under the
 * paragraph, and a table whose rows are 22mm taller than their content so there is
 * somewhere to sign. */
const sig = A.docStore.addSection('Approval').id;
A.docStore.setBlockLevel(sig, 1);
A.docStore.setBlockFlag('pageBreak', sig, true);
A.docStore.setBlockSpace(sig, 70);
// D-063: out of the contents, at a level that starts a page, with a gap and a number.
// Proves on the page that `.unnumbered .unlisted` costs a heading none of those things —
// it still prints "6 Approval", still breaks, still comes down 70mm, and is not listed.
A.docStore.setBlockFlag('noToc', sig, true);
A.docStore.addPart(sig, 'para');
const sigParts = () => A.store.getProject().report.sections.filter(s => s.id === sig)[0].parts;
A.docStore.updatePart(sig, sigParts()[0].id, { text:
  'The configuration described in this report has been reviewed and is approved for deployment.' });
A.docStore.addPart(sig, 'space');
A.docStore.updatePart(sig, sigParts()[1].id, { height: 25 });
A.docStore.addPart(sig, 'table');
const sigTbl = sigParts()[2].id;
A.docStore.updatePart(sig, sigTbl, { rowHeight: 22, header:['Role','Name','Signature','Date'],
  rows:[['Approver','',''],['Reviewer','',''],['Prepared by','','']], align:['l','l','l','l'] });
A.docStore.setCell(sig, sigTbl, -1, 0, 'Role');
A.docStore.setCell(sig, sigTbl, 0, 1, 'A. Approver');
A.docStore.setCell(sig, sigTbl, 2, 1, 'C. Preparer');
A.docStore.setCell(sig, sigTbl, 2, 2, 'signed electronically');
// SPC-1: the third row is a statement of fact, not somewhere to sign, so it is unticked —
// which is what proves the height is per row rather than per table.
A.docStore.setRowTall(sig, sigTbl, 2, false);
A.docStore.setBlockTableStyle(sig, 'head', true);
A.store.setReportOrder(A.store.getProject().report.order.concat([sig]));

const dev = A.store.getProject().deviceConfigs[0].id;
A.util.clock.setClock(()=>new Date('2026-06-30T02:00:00.000Z'));
// CLS-1: the banner is a project decision now, set with the rest of the design.
A.docStore.setClassification(true);
const o = Object.assign({}, A.ui.views.generate.reportOptions(A.store.getProject()), { tags:{ Date:'30 June 2026' } });
const out = A.generate.buildReport(A.store.getProject(), dev, o);
const dest = process.argv[2] || 'report.md';
fs.writeFileSync(dest, out.text);
console.log('  wrote ' + dest + '; unfilled placeholders: ' + JSON.stringify(A.generate.findTags(out.text)));
