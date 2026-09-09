#!/usr/bin/env node
/**
 * Does dist/doc-designer.css still dress the workspace?
 *
 * tools/build-dist.py decides what to extract by reading NAMES — the classes and ids the
 * module's code emits. This asks the question the other way round, from the rendered
 * page: it opens the real Report Design workspace in the real application, walks every
 * element in it, and for each one collects the selectors in CH's stylesheet that match.
 * Any selector that styles a workspace element and is NOT in the distributable is a rule
 * that would go missing in another project — which is the one failure mode a name-based
 * split cannot see in itself.
 *
 * Requires jsdom, like the other live-DOM passes.
 * Usage: node tools/check-dist-css.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => errs.push(e.message));
vc.on('error', (...a) => errs.push(a.join(' ')));

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'ch-config-tool.html'), 'utf8'), {
  runScripts: 'dangerously', url: 'file:///x', pretendToBeVisual: true, virtualConsole: vc,
});
const { window } = dom;
const { document } = window;
const A = window.App;

// The page boots on DOMContentLoaded, which jsdom fires after this file's top level.
async function main() {
  await new Promise(r => setTimeout(r, 0));
  if (!A.docHost.get()) { console.error('FATAL: the app did not boot — no document host.'); process.exit(2); }

  // A device ready enough for the workspace to have something to draw.
  if (!A.registry.hasPlatform('android-adb')) A.registry.registerPlatform(A.platforms.androidAdb);
  A.store.init(A.store.empty('android-adb'));
  const snap = (ds, raw) => {
    const a = A.registry.getDataset('android-adb', ds), pr = a.parse(raw);
    const o = { capturedUtc: '2026-01-01T00:00:00.000Z', sourceFilename: ds,
                sha256: A.util.hash.sha256Hex(raw), keys: pr.keys };
    if (pr.values) o.values = pr.values;
    if (pr.template !== undefined) o.template = pr.template;
    return o;
  };
  A.store.onboardDevice({ name: 'Dev', model: 'M1', firmware: 'F1', snapshots: {
    'android.packages': snap('android.packages', 'com.a\ncom.b'),
    'android.tactical': snap('android.tactical', '{"enabled":true,"count":3}') } });
  A.store.setDecision('android.packages', 'com.a', { action: 'keep' });
  A.store.setDecision('android.packages', 'com.b', { action: 'disable' });
  // A hand-authored section too, with a table and a paragraph in it: those parts have
  // their own editors, and their own rules in the stylesheet.
  const secId = A.docStore.addSection('Executive summary').id;
  A.docStore.addPart(secId, 'para');
  A.docStore.addPart(secId, 'table');

  // Every pane, so no part of the workspace goes unvisited.
  const seen = new Set();
  const RD = A.ui.views.reportDesign;
  RD.open();
  for (const pane of RD.PANES.map(p => (typeof p === 'string' ? p : p.id))) {
    RD.pane(pane);
    document.getElementById('root').innerHTML = RD.render(A.store.getProject());
    document.querySelectorAll('#rd-modal-host *').forEach(el => seen.add(el));
  }

  /** Top-level selectors of a stylesheet, paired with the text they came from. */
  function selectorsOf(css) {
    const out = [];
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /(^|\})\s*([^{}@][^{}]*?)\s*\{/g;
    let m;
    while ((m = re.exec(noComments))) {
      m[2].split(',').forEach(s => { const t = s.trim(); if (t) out.push(t); });
    }
    return out;
  }

  const appCss = [...fs.readFileSync(path.join(ROOT, 'ch-config-tool.html'), 'utf8')
    .matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const distCss = fs.readFileSync(path.join(ROOT, 'dist', 'doc-designer.css'), 'utf8');
  const inDist = new Set(selectorsOf(distCss));

  const missing = new Map();
  for (const sel of selectorsOf(appCss)) {
    if (inDist.has(sel)) continue;
    let hit = null;
    for (const el of seen) {
      try { if (el.matches(sel)) { hit = el; break; } } catch (e) { /* :hover &c. */ }
    }
    if (hit) missing.set(sel, hit.className || hit.tagName);
  }

  console.log('workspace elements walked: ' + seen.size +
    ' | selectors in the distributable: ' + inDist.size);
  if (missing.size) {
    console.log('\x1b[31m' + missing.size + ' rule(s) style the workspace but are NOT in dist/doc-designer.css:\x1b[0m');
    for (const [sel, where] of missing) console.log('   ' + sel + '   (matches: ' + where + ')');
    process.exit(1);
  }
  if (errs.length) { console.log('console errors:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('\x1b[32mevery rule that styles the workspace is in the distributable\x1b[0m');
}
main();
