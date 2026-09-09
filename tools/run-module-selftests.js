#!/usr/bin/env node
/**
 * CONF-1 / Task 13: run the document module's OWN suites, with no host application
 * present at all.
 *
 * Loads doc-designer.js — the module bundle, built from src/base/ and src/doc/ only —
 * into a bare page and runs whatever suites registered themselves. Nothing from
 * src/app/ is loaded, so a suite that quietly depended on CH's store, registry or UI
 * fails here rather than passing inside the tool and being called portable.
 *
 * Requires jsdom on the module path, exactly like tools/run-selftests.js.
 * Usage: node tools/run-module-selftests.js [/path/to/doc-designer.js]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) ||
  path.join(__dirname, '..', 'doc-designer.js'));
const js = fs.readFileSync(file, 'utf8');

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  runScripts: 'dangerously',
  url: 'file://' + file,
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const el = window.document.createElement('script');
el.textContent = js;
window.document.head.appendChild(el);

const App = window.App;
if (!App || !App.test) {
  console.error('FATAL: the module bundle did not evaluate — App.test is absent.');
  errors.forEach(e => console.error('  ' + e));
  process.exit(2);
}
// The module must be complete on its own: every one of these is what a host is
// handed, and an absent one means a fragment did not make it into the manifest.
const REQUIRED = ['md', 'doc', 'docFormat', 'docHost', 'docSession', 'docProviders',
                  'docBlocks', 'docGen', 'docStore', 'docTemplates', 'report'];
const missing = REQUIRED.filter(n => !App[n]);
if (missing.length) {
  console.error('FATAL: the module bundle is incomplete — missing App.' + missing.join(', App.'));
  process.exit(2);
}

App.test.run().then(res => {
  let failed = 0;
  for (const suite of res.suites) {
    const fails = suite.tests.filter(t => !t.ok);
    failed += fails.length;
    if (fails.length) {
      console.log('\x1b[31m✗ ' + suite.name + '\x1b[0m');
      fails.forEach(t => console.log('   FAIL  ' + t.name + '\n         ' + t.message));
    }
  }
  const total = res.suites.reduce((n, s) => n + s.tests.length, 0);
  console.log((failed ? '\x1b[31m' : '\x1b[32m') + (total - failed) + '/' + total +
    ' pass\x1b[0m  (' + res.suites.length + ' suites, ' + failed + ' failed) — module bundle, no host present');
  if (errors.length) { console.log('console errors:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(failed || errors.length ? 1 : 0);
}).catch(err => {
  console.error('FATAL: the suite run rejected — ' + (err && err.stack ? err.stack : err));
  process.exit(2);
});
