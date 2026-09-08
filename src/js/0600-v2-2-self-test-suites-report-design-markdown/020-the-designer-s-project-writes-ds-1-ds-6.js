    /* ===== SUITES: the designer's project writes (DS-1..DS-6) ===== */
    T.suite('DS the Report Design mutators write deterministic, canonical state', function (s) {
      s.test('ids are derived, never random — the same edits give the same project', function () {
        docProject();
        var a = App.docStore.addSection('One').id;
        var b = App.docStore.addSection('Two').id;
        T.assertEqual(a, 'sec1'); T.assertEqual(b, 'sec2');
        App.docStore.removeSection('sec1');
        T.assertEqual(App.docStore.addSection('Three').id, 'sec3', 'ids must not be reused after a delete');
      });
      s.test('a part id is unique across every section, so a table reference is unambiguous', function () {
        docProject();
        var s1 = App.docStore.addSection('One').id, s2 = App.docStore.addSection('Two').id;
        var p1 = App.docStore.addPart(s1, 'table').id;
        var p2 = App.docStore.addPart(s2, 'table').id;
        T.assert(p1 !== p2, 'two tables must never share an id: ' + p1 + ' / ' + p2);
      });
      s.test('a pinned level is stored; automatic is stored as absence', function () {
        docProject();
        App.docStore.setBlockLevel('meta', 3);
        T.assertEqual(App.store.getProject().report.levels.meta, 3);
        App.docStore.setBlockLevel('meta', null);
        T.assert(!App.store.getProject().report, 'back to automatic must leave no trace at all');
        T.assertEqual(App.docStore.setBlockLevel('meta', 9).ok, false, 'an impossible level is refused');
      });
      s.test('parts reorder, and the last column of a table cannot be deleted', function () {
        docProject();
        var sec = App.docStore.addSection('S').id;
        var p1 = App.docStore.addPart(sec, 'para').id;
        var p2 = App.docStore.addPart(sec, 'rule').id;
        App.docStore.movePart(sec, p2, -1);
        var ids = App.store.getProject().report.sections[0].parts.map(function (x) { return x.id; });
        T.assertDeepEqual(ids, [p2, p1]);
        var t = App.docStore.addPart(sec, 'table').id;
        App.docStore.removeColumn(sec, t, 0);
        App.docStore.removeColumn(sec, t, 0);
        var tbl = App.store.getProject().report.sections[0].parts.filter(function (x) { return x.id === t; })[0];
        T.assertEqual(tbl.header.length, 1, 'a table with no columns cannot render, so one always remains');
      });
      s.test('setCell grows the table rather than throwing on a short row', function () {
        docProject();
        var sec = App.docStore.addSection('S').id;
        var t = App.docStore.addPart(sec, 'table').id;
        App.docStore.setCell(sec, t, 3, 1, 'deep');
        var tbl = App.store.getProject().report.sections[0].parts[0];
        T.assertEqual(tbl.rows.length, 4);
        T.assertEqual(tbl.rows[3][1], 'deep');
      });
      s.test('a section template re-mints part ids when it is used', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.saveSectionTemplate(sec, 'Annex A');
        var made = App.docStore.useSectionTemplate('tpl1').id;
        var parts = App.store.getProject().report.sections.filter(function (x) { return x.id === made; })[0].parts;
        T.assertEqual(parts.length, 1);
        T.assert(parts[0].id !== 'part1', 'a copy must not share the original\'s table id: ' + parts[0].id);
      });
      s.test('deleting the profile in use falls back to Standard rather than dangling', function () {
        docProject();
        var id = App.docStore.addFormat('Temp').id;
        App.docStore.setFormatId(id);
        App.docStore.removeFormat(id);
        T.assertEqual(App.docFormat.resolve(App.store.getProject()).id, 'standard');
      });
      s.test('the whole design survives a save/load and stays byte-stable (DOD-2/DOD-7)', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'Body {{b}}text{{/b}} 50%' });
        App.docStore.setBlockLevel(sec, 2);
        App.docStore.addFormat('Mine');
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'a round trip must be byte-identical');
        T.assertEqual(App.projectIo.validateSchema(back.value).filter(function (i) { return i.severity === 'error'; }).length, 0);
        T.assertEqual(back.value.report.sections[0].parts[0].text, 'Body {{b}}text{{/b}} 50%',
          'the stored text keeps the author\'s characters — escaping happens on the way OUT');
      });
      s.test('a malformed design is a schema error, not a silent shrug', function () {
        docProject();
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        p.report = { levels: { meta: 9 } };
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /report\.levels/.test(i.location || ''); }));
        p.report = { sections: [{ id: 'a', parts: [{ id: 'p', kind: 'nope' }] }] };
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /Unknown part kind/.test(i.message); }));
        p.report = { sections: [{ id: 'a' }, { id: 'a' }] };
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /Duplicate section id/.test(i.message); }));
      });
    });

    /* ===== SUITES: templates in and out (TPL-1..TPL-4) ===== */
    T.suite('TPL importing templates adds; it never deletes', function (s) {
      function withTemplates() {
        docProject();
        var sec = App.docStore.addSection('Mine').id;
        App.docStore.saveSectionTemplate(sec, 'Annex A');
        return App.store.getProject();
      }
      function incoming(names) {
        return JSON.stringify({
          kind: 'ch-config-tool/section-templates', version: 1, exportedUtc: '2026-01-01T00:00:00.000Z',
          items: names.map(function (n, i) { return { id: 'tpl' + (i + 1), name: n, title: n, parts: [] }; })
        });
      }
      s.test('an export round-trips and is byte-stable', function () {
        withTemplates();
        App.util.clock.setClock(FIX);
        var a = App.docTemplates.exportFile(App.store.getProject(), 'sections');
        var b = App.docTemplates.exportFile(App.store.getProject(), 'sections');
        App.util.clock.resetClock();
        T.assertEqual(a.text, b.text, 'two exports of the same templates must be identical');
        T.assertEqual(a.name, 'section-templates.json');
        T.assertEqual(App.docTemplates.parseImport(a.text, 'sections').items.length, 1);
      });
      s.test('the wrong kind of file is refused by name, with a usable message', function () {
        var r = App.docTemplates.parseImport(JSON.stringify({ kind: 'ch-config-tool/formatting-profiles', items: [] }), 'sections');
        T.assertEqual(r.ok, false);
        T.assert(/formatting profiles file/.test(r.issues[0].message), r.issues[0].message);
        T.assertEqual(App.docTemplates.parseImport('not json', 'sections').ok, false);
      });
      s.test('names that do not collide are simply added', function () {
        withTemplates();
        var items = App.docTemplates.parseImport(incoming(['Annex B', 'Annex C']), 'sections').items;
        var plan = App.docTemplates.plan(App.store.getProject(), 'sections', items);
        T.assertEqual(plan.conflicts.length, 0);
        App.docTemplates.apply(plan, {});
        var names = App.store.getProject().report.sectionTemplates.map(function (t) { return t.name; }).sort();
        T.assertDeepEqual(names, ['Annex A', 'Annex B', 'Annex C'], 'the existing one must survive');
      });
      s.test('a colliding id is re-minted so nothing is overwritten by accident', function () {
        withTemplates();   // holds tpl1 "Annex A"
        var items = App.docTemplates.parseImport(incoming(['Annex B']), 'sections').items;  // also id tpl1
        App.docTemplates.apply(App.docTemplates.plan(App.store.getProject(), 'sections', items), {});
        var t = App.store.getProject().report.sectionTemplates;
        T.assertEqual(t.length, 2, 'an id clash must not eat the existing entry');
        T.assert(t[0].id !== t[1].id);
      });
      s.test('a name collision is a decision, and silence keeps YOUR copy', function () {
        withTemplates();
        var items = App.docTemplates.parseImport(incoming(['annex a']), 'sections').items;   // case-folded match
        var plan = App.docTemplates.plan(App.store.getProject(), 'sections', items);
        T.assertEqual(plan.conflicts.length, 1, 'the same name in different case is still the same name');
        var res = App.docTemplates.apply(plan, {});          // no decision given
        T.assertEqual(res.kept, 1); T.assertEqual(res.replaced, 0);
        T.assertEqual(App.store.getProject().report.sectionTemplates[0].name, 'Annex A', 'silence must never overwrite');
      });
      s.test('choosing replace overwrites the contents but keeps the existing id', function () {
        withTemplates();
        var items = App.docTemplates.parseImport(incoming(['Annex A']), 'sections').items;
        var plan = App.docTemplates.plan(App.store.getProject(), 'sections', items);
        var before = App.store.getProject().report.sectionTemplates[0].id;
        var res = App.docTemplates.apply(plan, { 'annex a': 'replace' });
        T.assertEqual(res.replaced, 1);
        var after = App.store.getProject().report.sectionTemplates;
        T.assertEqual(after.length, 1);
        // The id is what report.formatId (and anything else) points at, so replacing
        // an entry must not silently repoint every reference to it.
        T.assertEqual(after[0].id, before, 'replace must keep the existing id');
      });
      s.test('a formatting profile survives export and import intact', function () {
        docProject();
        var id = App.docStore.addFormat('Wide').id;
        App.docStore.updateFormat(id, { page: { paper: 'letter', marginLeft: '10mm' } });
        var text = App.docTemplates.exportFile(App.store.getProject(), 'formats').text;
        docProject();                                     // a fresh project
        var parsed = App.docTemplates.parseImport(text, 'formats');
        T.assert(parsed.ok, JSON.stringify(parsed.issues));
        App.docTemplates.apply(App.docTemplates.plan(App.store.getProject(), 'formats', parsed.items), {});
        var got = App.store.getProject().report.formats[0];
        T.assertEqual(got.name, 'Wide');
        T.assertEqual(got.page.paper, 'letter');
        T.assertEqual(got.page.marginLeft, '10mm');
      });
      s.test('a report template restores the arrangement, the levels and the sections', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.setBlockLevel('meta', 3);
        App.store.setReportOrder(['control', 'meta']);
        App.docStore.saveReportTemplate('House style');
        // Wreck it, then put it back.
        App.docStore.removeSection(sec);
        App.docStore.setBlockLevel('meta', null);
        App.store.setReportOrder([]);
        App.docStore.useReportTemplate('rpt1');
        var b = App.store.getProject().report;
        T.assertDeepEqual(b.order, ['control', 'meta']);
        T.assertEqual(b.levels.meta, 3);
        T.assertEqual(b.sections.length, 1);
        T.assertEqual(b.sections[0].title, 'Annex');
      });
    });

    /* ===== SUITES: the document the designer produces (RD-1..RD-7 · PRV-1) ===== */
    T.suite('RD a designed document generates as one .md', function (s) {
      s.test('a custom section appears, numbered, in the position it was ordered into', function () {
        docProject();
        var sec = App.docStore.addSection('Executive summary').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'The device was hardened.' });
        App.store.setReportOrder([sec, 'meta']);
        var md = reportMd();
        T.assert(/^# 1 Executive summary \{#sec-sec1\}$/m.test(md), 'the custom section must lead: ' + md.slice(md.indexOf('---\n\n'), 400));
        T.assert(md.indexOf('The device was hardened.') !== -1, 'its prose must travel');
      });
      s.test('a pinned level changes the heading and the numbering together', function () {
        docProject();
        var sec = App.docStore.addSection('Sub-note').id;
        App.docStore.setBlockLevel(sec, 2);
        App.store.setReportOrder(['meta', sec]);
        var md = reportMd();
        T.assert(/^## 1\.1 Sub-note \{#sec-sec1\}$/m.test(md), 'H2 with a child number expected: ' +
          (md.match(/^#+ .*Sub-note.*$/m) || ''));
      });
      s.test('a section with no heading becomes a paragraph under the one above it', function () {
        docProject();
        var sec = App.docStore.addSection('').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'A trailing remark.' });
        App.store.setReportOrder(['meta', sec]);
        var md = reportMd();
        T.assert(md.indexOf('A trailing remark.') !== -1);
        T.assert(!/^#+ .*\{#sec-sec1\}/m.test(md), 'an untitled section must emit no heading');
      });
      s.test('a cross-reference in a paragraph resolves to the live number', function () {
        docProject();
        var sec = App.docStore.addSection('Notes').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: 'See {{ref:control}} for coverage.' });
        var md = reportMd();
        T.assert(/See \[Section [\d.]+ — Control coverage\]\(#sec-control\) for coverage\./.test(md),
          'reference not resolved: ' + (md.match(/See .*/) || ''));
      });
      s.test('everything an author types is escaped on the way out, nothing on the way in', function () {
        docProject();
        var sec = App.docStore.addSection('Risk & cost').id;
        App.docStore.addPart(sec, 'para');
        App.docStore.updatePart(sec, 'part1', { text: '100% of $HOME had a_b' });
        T.assertEqual(App.store.getProject().report.sections[0].parts[0].text, '100% of $HOME had a_b',
          'the project keeps what was typed');
        var md = reportMd();
        T.assert(/100\\% of \\\$HOME had a\\_b/.test(md), 'the document escapes it: ' + (md.match(/100.*/) || ''));
        T.assert(/Risk \\& cost/.test(md), 'and so does the heading');
      });
      s.test('the whole document is byte-deterministic under a fixed clock (DOD-7)', function () {
        docProject();
        var sec = App.docStore.addSection('Annex').id;
        App.docStore.addPart(sec, 'table');
        App.docStore.setCell(sec, 'part1', 0, 0, 'x');
        App.docStore.addFormat('Mine');
        T.assertEqual(reportMd(), reportMd(), 'a designed document must be reproducible');
      });
      s.test('a formatting profile changes the emitted preamble', function () {
        docProject();
        var id = App.docStore.addFormat('Tight').id;
        // HDR-1: the page number is a header/footer SLOT now, so switching it off is
        // emptying the slot it sits in rather than picking "none" from a second list.
        App.docStore.updateFormat(id, { page: { marginTop: '5mm' }, toc: { include: false },
          headerFooter: { footer: { left: '', centre: '', right: '' } } });
        App.docStore.setFormatId(id);
        var md = reportMd();
        T.assert(/\n  - "top=5mm"/.test(md), 'the margin must reach the geometry list');
        T.assert(/\ntoc: false/.test(md), 'contents switched off');
        T.assert(md.indexOf('\\thepage') === -1, 'page numbers switched off');
      });
      s.test('switching numbering off removes the numbers from every heading', function () {
        docProject();
        var id = App.docStore.addFormat('Plain').id;
        App.docStore.updateFormat(id, { headings: { numbered: false } });
        App.docStore.setFormatId(id);
        var md = reportMd();
        T.assert(/^# Device Config Information \{#sec-meta\}$/m.test(md), 'headings should carry no number: ' +
          (md.match(/^#+ .*Device Config.*$/m) || ''));
      });
    });

    /* ===== SUITES: metadata rows, guideline deviations, centring, section preview ===== */
    T.suite('META-1 the provenance block is a chooseable list', function (s) {
      s.test('there is no Generated (UTC) row at all any more', function () {
        docProject();
        var dc = App.store.getProject().deviceConfigs[0];
        var ids = App.generate.metaFields(App.store.getProject(), dc, '2026-01-01T00:00:00.000Z').map(function (r) { return r.id; });
        T.assert(ids.indexOf('generated') !== -1, 'the AEST row stays');
        T.assertDeepEqual(ids.filter(function (i) { return /utc/i.test(i); }), [], 'no UTC row');
        T.assert(reportMd().indexOf('Generated (UTC)') === -1, 'and none in the document');
        // The exact instant is still machine-readable in the metadata block.
        T.assert(/\ngenerated-utc: "/.test(reportMd()), 'the UTC instant must stay in the YAML');
      });
      s.test('every row has a stable id, including one per snapshot', function () {
        docProject();
        var dc = App.store.getProject().deviceConfigs[0];
        var ids = App.generate.metaFields(App.store.getProject(), dc, '2026-01-01T00:00:00.000Z').map(function (r) { return r.id; });
        ['platform', 'device', 'model', 'firmware', 'version', 'generated', 'projectHash'].forEach(function (k) {
          T.assert(ids.indexOf(k) !== -1, 'missing row id: ' + k);
        });
        T.assert(ids.indexOf('snapshot:android.packages') !== -1, 'a snapshot row per dataset (DOD-11)');
      });
      s.test('switching a row off drops it from the document', function () {
        docProject();
        T.assert(/Project SHA-256/.test(reportMd()), 'present by default');
        App.docStore.setMetaField('projectHash', false);
        App.docStore.setMetaField('snapshot:android.packages', false);
        var md = reportMd();
        T.assert(md.indexOf('Project SHA-256') === -1, 'the project hash must be gone');
        T.assert(md.indexOf('android.packages snapshot SHA-256') === -1, 'and the snapshot hash');
        T.assert(/\|\s*Device\s*\|/.test(md), 'while the rest of the block stays');
      });
      s.test('the choice is saved with the project, and included costs nothing', function () {
        docProject();
        App.docStore.setMetaField('projectHash', false);
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assert(back.ok, JSON.stringify(back.issues));
        T.assertEqual(back.value.report.meta.projectHash, false);
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'byte-stable round trip');
        App.docStore.setMetaField('projectHash', true);
        T.assert(!App.store.getProject().report, 'switching it back on must leave no trace');
      });
      s.test('a bad meta map is a schema error', function () {
        docProject();
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        p.report = { meta: { projectHash: true } };   // only `false` is ever stored
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /must be false when present/.test(i.message); }));
      });
    });

