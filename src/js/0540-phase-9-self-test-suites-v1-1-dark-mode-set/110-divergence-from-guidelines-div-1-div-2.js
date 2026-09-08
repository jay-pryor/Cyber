    /* ===== SUITES: divergence from guidelines (DIV-1/DIV-2) ===== */
    T.suite('DIV-1/DIV-2 diverges from guidelines + the narrative behind it', function (s) {
      function divProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'Dev', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        return App.store.getProject();
      }
      function item(dsId, key) {
        return App.store.getProject().items[dsId].filter(function (i) { return i.key === key; })[0];
      }

      s.test('the column is core, so EVERY dataset gets it without an adapter edit', function () {
        var p = divProject();
        ['android.packages', 'android.tactical'].forEach(function (ds) {
          var html = App.ui.tables.renderTableHtml(p, ds, {}, {});
          T.assert(/<th data-col="diverges" class="div-col"[^>]*>Diverges from Guidelines/.test(html),
            ds + ' has no Diverges column');
          T.assert(/<td class="div-cell"><label class="cell-check"/.test(html),
            ds + ' must give the tick a full-cell hit target, like the other tick columns (BULK-2)');
        });
      });

      s.test('the tick reflects the item, and flags a flag with nothing behind it', function () {
        divProject();
        var plain = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(!/data-diverges[^>]*checked/.test(plain), 'nothing diverges by default');
        T.assert(plain.indexOf('div-nonarr') === -1, 'and nothing is flagged');

        App.store.setItemFields('android.packages', 'com.a', { diverges: true });
        var ticked = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(/data-diverges data-ds="android.packages" data-key="com.a" checked/.test(ticked), 'the tick must follow the item');
        T.assert(/<td class="div-cell div-nonarr">/.test(ticked),
          'ticked with no narrative is a GAP, and must be shown as one (as JUS-3 does for justifications)');
        T.assert(/no Divergence Narrative recorded yet/.test(ticked), 'the hover must say what is missing');

        App.store.setItemFields('android.packages', 'com.a', { divergenceNarrative: 'Departs from ISM-1234 because the radio is needed.' });
        var full = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', {}, {});
        T.assert(full.indexOf('div-nonarr') === -1, 'with a narrative recorded the flag is no longer a gap');
        T.assert(/title="Departs from ISM-1234 because the radio is needed."/.test(full),
          'the narrative belongs on the hover, so it is readable without opening the row');
      });

      s.test('the narrative box exists ONLY while the item is flagged', function () {
        divProject();
        var ui = { expanded: { 'com.a': true } };
        var off = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
        T.assert(/data-detail-key="com.a"/.test(off), 'the row should be expanded for this test');
        T.assert(off.indexOf('<label>Divergence Narrative</label>') === -1, 'an un-flagged item must not carry an empty narrative box');
        T.assert(off.indexOf('data-field-edit="divergenceNarrative"') === -1, 'nor the field behind it');

        App.store.setItemFields('android.packages', 'com.a', { diverges: true });
        var on = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
        T.assert(/<label>Divergence Narrative<\/label>/.test(on), 'ticking the column must produce the box');
        T.assert(/data-field-edit="divergenceNarrative" data-ds="android.packages" data-key="com.a"/.test(on),
          'the box must commit through the ordinary field-edit path');
        T.assert(/WHICH guideline it departs from/.test(on), 'the placeholder must ask for all three things');
        T.assert(/Flagged as diverging with nothing recorded yet/.test(on), 'an empty box must say why it is there');

        App.store.setItemFields('android.packages', 'com.a', { divergenceNarrative: 'Because X.' });
        var written = App.ui.tables.renderTableHtml(App.store.getProject(), 'android.packages', ui, {});
        T.assert(/>Because X\.<\/textarea>/.test(written), 'the narrative must render in the box');
        T.assert(written.indexOf('Flagged as diverging with nothing recorded yet') === -1, 'the prompt goes once it is answered');
      });

      s.test('unticking keeps the narrative — a mis-click must not cost a paragraph', function () {
        divProject();
        App.store.setItemFields('android.packages', 'com.a', { diverges: true, divergenceNarrative: 'Written once.' });
        App.store.setItemFields('android.packages', 'com.a', { diverges: false });
        T.assertEqual(item('android.packages', 'com.a').diverges, undefined, 'the flag is gone');
        T.assertEqual(item('android.packages', 'com.a').divergenceNarrative, 'Written once.', 'the words are not');
        App.store.setItemFields('android.packages', 'com.a', { diverges: true });
        T.assertEqual(item('android.packages', 'com.a').divergenceNarrative, 'Written once.', 'and they come back with the tick');
        // Emptying the box IS an erasure, and leaves no empty string behind.
        App.store.setItemFields('android.packages', 'com.a', { divergenceNarrative: '' });
        T.assertEqual('divergenceNarrative' in item('android.packages', 'com.a'), false, 'an emptied box must unset the field, not store ""');
      });

      s.test('absent means "does not diverge" — the file carries no false', function () {
        divProject();
        App.store.setItemFields('android.packages', 'com.a', { diverges: true });
        App.store.setItemFields('android.packages', 'com.a', { diverges: false });
        var text = App.projectIo.serializeProject(App.store.getProject());
        T.assert(text.indexOf('"diverges"') === -1, 'the canonical form has no diverges:false, exactly as HELD-1 has no held:false');
      });

      s.test('it round-trips byte-identically, and a false is refused on load', function () {
        divProject();
        App.store.setItemFields('android.packages', 'com.b', { diverges: true, divergenceNarrative: 'Line one.\nLine two.' });
        var text = App.projectIo.serializeProject(App.store.getProject());
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, true, JSON.stringify(res.issues));
        var it = res.value.items['android.packages'].filter(function (i) { return i.key === 'com.b'; })[0];
        T.assertEqual(it.diverges, true);
        T.assertEqual(it.divergenceNarrative, 'Line one.\nLine two.');
        T.assertEqual(App.projectIo.serializeProject(res.value), text, 'divergence must survive a round-trip unchanged');

        var bad = JSON.parse(text);
        bad.items['android.packages'][0].diverges = false;
        var res2 = App.projectIo.parseProject(JSON.stringify(bad));
        T.assertEqual(res2.ok, false, 'diverges:false must be refused — absent is the only way to say "it does not"');
        T.assert(res2.issues.some(function (i) { return /diverges/.test(i.message) && i.severity === 'error'; }));

        var bad2 = JSON.parse(text);
        bad2.items['android.packages'][0].divergenceNarrative = 42;
        T.assertEqual(App.projectIo.parseProject(JSON.stringify(bad2)).ok, false, 'a non-string narrative must be refused');
      });

      s.test('a project written before this existed still loads, and diverges nowhere', function () {
        divProject();
        var text = App.projectIo.serializeProject(App.store.getProject());
        T.assert(text.indexOf('diverges') === -1, 'the fixture must be free of the new fields');
        var res = App.projectIo.parseProject(text);
        T.assertEqual(res.ok, true, 'an older project must open untouched: ' + JSON.stringify(res.issues));
        T.assertEqual(res.value.items['android.packages'].filter(function (i) { return i.diverges; }).length, 0);
      });

      s.test('DIV-3 one open expander can be re-rendered on its own', function () {
        var p = divProject();
        App.store.setItemFields('android.packages', 'com.a', { diverges: true });
        var html = App.ui.tables.detailRowHtml(App.store.getProject(), 'android.packages', 'com.a', {}, {});
        T.assert(/^<tr class="detail-row" data-detail-key="com.a">/.test(html),
          'the fragment must be the addressable detail row itself, so a tick can swap it in place');
        T.assert(/Divergence Narrative/.test(html));
        T.assertEqual(App.ui.tables.detailRowHtml(App.store.getProject(), 'android.packages', 'nope', {}, {}), '',
          'an unknown key must produce nothing rather than throwing');
      });

      s.test('DIV: the narrative reaches the REPORT, and nothing else (v2.2)', function () {
        divProject();
        App.store.setItemFields('android.packages', 'com.a', { diverges: true, divergenceNarrative: 'DIVERGENCE-MARKER-TEXT' });
        App.store.setDecision('android.packages', 'com.a', { action: 'remove' });
        App.store.setDecision('android.packages', 'com.b', { action: 'keep' });
        var p = App.store.getProject();
        var devId = p.deviceConfigs[0].id;
        // v2.2 (GUIDE-1) deliberately crosses the old scope boundary: the whole point
        // of flagging a divergence is that it is reported. The SCRIPTS still know
        // nothing about it — a narrative is prose for a reader, not an instruction.
        T.assert(App.generate.buildReport(p, devId).text.indexOf('DIVERGENCE-MARKER-TEXT') !== -1,
          'the narrative belongs in the report');
        var scripts = JSON.stringify([
          App.generate.buildImplementation(p, devId).files,
          App.generate.buildVerification(p, devId).files
        ]);
        T.assert(scripts.indexOf('DIVERGENCE-MARKER-TEXT') === -1, 'but never in a generated script');
      });

      s.test('the Help manual documents it', function () {
        var H = App.ui.views.help;
        H._help.section = 'tables';
        var html = H.render(null);
        T.assert(/Diverges from Guidelines/.test(html), 'the column must be in the Columns table');
        T.assert(/Recording a divergence/.test(html), 'there must be a section saying how to use it');
        T.assert(/Divergence Narrative/.test(html));
        T.assert(/not<\/em> yet carried into the generated report/.test(html),
          'the manual must say where it does NOT travel — that boundary is the surprising part');
        T.assert(/Columns<\/strong> \(the bar above the table\)/.test(html), 'the column picker must be documented too');
        T.assert(/always shown/.test(html), 'and the fact that the key column cannot be hidden');
        H._help.section = 'reference';
        T.assert(/Divergence/.test(H.render(null)), 'the glossary should carry the term');
        H._help.section = H.SECTIONS[0].id;
      });
    });

