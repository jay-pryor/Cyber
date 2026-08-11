#!/usr/bin/env node
/**
 * Requires jsdom on the module path (e.g. `npm i jsdom` in a scratch dir and run with
 * NODE_PATH pointing at its node_modules), because the repo itself has no dependencies.
 * Headless runner for ch-config-tool.html's embedded suite (rebuilt; the original
 * lived in a scratchpad that was lost — see progress-log 2026-06-xx).
 *
 * Loads the single file into jsdom with #selftest, lets the bootstrap render the
 * suite, then reports pass/fail. Exits non-zero on any failure.
 *
 * Usage: node run-selftests.js [/path/to/ch-config-tool.html] [--filter <substr>]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const args = process.argv.slice(2);
const fileArg = args.find(a => !a.startsWith('--')) || '/workspaces/Cyber/ch-config-tool.html';
const fi = args.indexOf('--filter');
const filter = fi !== -1 ? args[fi + 1] : null;

const file = path.resolve(fileArg);
const html = fs.readFileSync(file, 'utf8');

const vc = new VirtualConsole();
const consoleErrors = [];
vc.on('jsdomError', e => consoleErrors.push(e.message));
vc.on('error', (...a) => consoleErrors.push(a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'file://' + file + '#selftest',
  pretendToBeVisual: true,
  virtualConsole: vc,
});

const { window } = dom;
const App = window.App;

if (!App || !App.test) {
  console.error('FATAL: App.test not present — a script block threw during load.');
  consoleErrors.forEach(e => console.error('  ' + e));
  process.exit(2);
}

const res = App.test.run();

let shownFail = 0;
for (const suite of res.suites) {
  const fails = suite.tests.filter(t => !t.ok);
  if (filter && !suite.name.toLowerCase().includes(filter.toLowerCase())) {
    if (!fails.length) continue;
  }
  if (fails.length) {
    console.log(`\n\x1b[31m✗ ${suite.name}\x1b[0m`);
    for (const t of fails) {
      shownFail++;
      console.log(`   FAIL  ${t.name}`);
      console.log(
        String(t.error)
          .split('\n')
          .map(l => '         ' + l)
          .join('\n')
      );
    }
  } else if (filter) {
    console.log(`\x1b[32m✓ ${suite.name}\x1b[0m (${suite.tests.length})`);
  }
}

if (consoleErrors.length) {
  console.log('\nConsole errors during load:');
  consoleErrors.slice(0, 10).forEach(e => console.log('  ' + e));
}

const total = res.passed + res.failed;
const colour = res.failed ? '\x1b[31m' : '\x1b[32m';
console.log(
  `\n${colour}${res.passed}/${total} pass\x1b[0m  (${res.suites.length} suites, ${res.failed} failed)`
);
process.exit(res.failed ? 1 : 0);
