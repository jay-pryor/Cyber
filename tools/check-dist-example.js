#!/usr/bin/env node
/**
 * dist/example.html is the instructions in executable form: if it stops working, the
 * README's steps are wrong and nobody finds out until they follow them. So it is run.
 *
 * Loads the page the way a browser would — from file://, pulling in dist/doc-designer.js
 * and dist/doc-designer.css beside it — opens the designer, generates the document, and
 * checks the roster actually came out the other end.
 *
 * Requires jsdom, like the other live-DOM passes.
 * Usage: node tools/check-dist-example.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'dist', 'example.html');
const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => errs.push(e.message));
vc.on('error', (...a) => errs.push(a.join(' ')));

const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously', resources: 'usable', url: 'file://' + file,
  pretendToBeVisual: true, virtualConsole: vc,
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); } };

setTimeout(() => {
  const { window } = dom, d = window.document, A = window.App;
  ok(!!A, 'doc-designer.js loaded and created the App global');
  ok(!!(A && A.docHost.get()), 'the example installed a valid host');
  ok(!!(A && A.ui && A.ui.views && A.ui.views.reportDesign), 'the designer is in the bundle');

  d.getElementById('design').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(!!d.getElementById('rd-modal-host'), 'the workspace mounts');
  ok(d.querySelectorAll('.rd-row').length >= 3, 'the section list is populated');
  ok(d.querySelectorAll('[data-rd-pane]').length >= 5, 'every pane is offered');

  d.getElementById('generate').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const out = d.getElementById('out').textContent;
  ok(/Ada Lovelace/.test(out), 'a declared row reached the document');
  ok((out.match(/^Table \d+:/gm) || []).length >= 3, 'the grouped section produced numbered tables');
  ok(/Platform/.test(out), 'the provenance section printed the subject metadata');
  ok(out.length > 1000, 'the document has substance (' + out.length + ' chars)');

  // The stylesheet has to be there too — a page that renders unstyled still "works".
  const css = fs.readFileSync(path.join(__dirname, '..', 'dist', 'doc-designer.css'), 'utf8');
  ok(/\.rd-layout\b/.test(css) && /--c-border/.test(css), 'the distributable stylesheet is present and complete');

  errs.forEach(e => { fail++; console.log('  \x1b[31m✗\x1b[0m console error: ' + e.split('\n')[0]); });
  console.log((fail ? '\x1b[31m' : '\x1b[32m') + (pass) + '/' + (pass + fail) +
    ' pass\x1b[0m  — dist/example.html, loaded as a browser would');
  process.exit(fail ? 1 : 0);
}, 300);
