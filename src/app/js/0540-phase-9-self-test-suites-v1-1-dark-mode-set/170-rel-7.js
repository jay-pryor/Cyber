    /** Session option state is shared across tests — put it back to its shipped default. */
    function rptReset() {
      var g = App.ui.views.generate._gen;
      // OPT-2: the include-maps live in the project now, so a reset of the SESSION block
      // is only the per-run fields — and SESS-1 moved those into the document module,
      // which owns them, so the reset goes through its API rather than over the top of
      // the property CH exposes them through.
      App.docSession.set({ subjectId: null, filename: '', tags: {} });
      // v2.2: open/closed, the selected section and the open pane belong to the
      // workspace module now, so a reset has to put those back too.
      App.ui.views.reportDesign.close();
      App.ui.views.reportDesign.select(null);
      App.ui.views.reportDesign.pane('section');
      return g;
    }

    T.suite('REL-7 "REPORTING" becomes "REPORT"', function (s) {
      s.test('the vocabulary carries REPORT and the translation is declared', function () {
        T.assertEqual(App.projectIo.RELEVANCE_OPTIONS.indexOf('REPORTING'), -1, 'the old name must be gone');
        T.assertEqual(App.projectIo.RELEVANCE_OPTIONS.indexOf('REPORT'), 3, 'REPORT keeps the slot, in severity order');
        T.assertEqual(App.projectIo.RELEVANCE_RENAMES.REPORTING, 'REPORT');
        // REL-8: REPORT stopped being parked in the same round. It is a report-scope tag,
        // not a reason to hide the item from the person making decisions.
        T.assertDeepEqual(App.projectIo.RELEVANCE_PARKED, ['IRRELEVANT'], 'IRRELEVANT is the only parked category');
      });
      s.test('REPORTING is no longer settable — only load and import translate it', function () {
        rptProject();
        T.assertEqual(App.store.setItemFields('android.packages', 'com.plain', { relevance: 'REPORTING' }).ok, false);
        T.assertEqual(App.store.setItemFields('android.packages', 'com.plain', { relevance: 'REPORT' }).ok, true);
      });
      s.test('a project saved with REPORTING still opens, translated and warned about', function () {
        rptProject();
        var raw = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        raw.items['android.packages'].filter(function (it) { return it.key === 'com.plain'; })[0].relevance = 'REPORTING';
        var res = App.projectIo.parseProject(JSON.stringify(raw));
        T.assert(res.ok, 'an older project must not fail to open: ' + JSON.stringify(res.issues));
        var byKey = {}; res.value.items['android.packages'].forEach(function (it) { byKey[it.key] = it; });
        T.assertEqual(byKey['com.plain'].relevance, 'REPORT', 'REPORTING must become REPORT');
        T.assertEqual(byKey['com.high'].relevance, 'HIGH', 'every other value is untouched');
        T.assert(res.issues.some(function (i) { return /renamed to "REPORT"/.test(i.message) && i.severity === 'warning'; }),
          'the rename must be reported, not silent');
        T.assertEqual(App.projectIo.validateSchema(res.value).filter(function (i) { return i.severity === 'error'; }).length, 0);
      });
      s.test('a decisions CSV written against the old word still imports', function () {
        ensureA();
        var a = App.registry.getDataset('android-adb', 'android.packages');
        var r = a.parseAssignment('package,action,description,rationale,relevance\ncom.a,keep,d,w,REPORTING');
        T.assertEqual(r.errors.length, 0, JSON.stringify(r.errors));
        T.assertEqual(r.assignments[0].fields.relevance, 'REPORT');
      });
    });

    T.suite('RPT-2 the report carries only the relevance categories you ask for', function (s) {
      s.test('with no options the engine filters nothing at all', function () {
        var dev = rptProject();
        var h = rptHtml(dev, undefined);
        ['com.high', 'com.rep', 'com.irr', 'com.plain'].forEach(function (k) {
          T.assert(h.indexOf(k) !== -1, k + ' must be in an unfiltered report');
        });
        T.assert(h.indexOf('Security Relevance filter') === -1, 'an unfiltered report must not claim to be filtered');
      });
      s.test('excluding a category drops exactly its items', function () {
        var dev = rptProject();
        var h = rptHtml(dev, { relevance: { IRRELEVANT: false } });
        T.assertEqual(h.indexOf('com.irr'), -1, 'the excluded item must be gone');
        ['com.high', 'com.rep', 'com.plain'].forEach(function (k) {
          T.assert(h.indexOf(k) !== -1, k + ' must survive the filter');
        });
      });
      /* The filter used to STATE itself in the document — "items marked REPORT,
       * IRRELEVANT were left out: 2 applicable items are not shown below" — as the last
       * paragraph of the "About this report" section. That section was removed on
       * request, and the note went with it: it had no other home, and a report that
       * does not describe its own composition has nowhere to describe its own filter
       * either. The filter still applies; it is simply no longer announced.
       * The counts behind it are still exported (relevanceCounts, below) and are what
       * the Report Design workspace shows the operator BEFORE they generate. */
      s.test('the filter narrows Control coverage too, not just the dataset tables', function () {
        var dev = rptProject();
        var cid = App.store.addControl({ title: 'Bloat', type: 'ISM', assignedDeviceIds: [dev] }).id;
        App.store.setItemFields('android.packages', 'com.irr', { controlRefs: [cid] });
        T.assert(rptHtml(dev, {}).indexOf('com.irr') !== -1, 'baseline: the control lists the item');
        var h = rptHtml(dev, { relevance: { IRRELEVANT: false } });
        T.assertEqual(h.indexOf('com.irr'), -1, 'a filtered-out item must not reappear under Control coverage');
      });
      s.test('relevanceCounts buckets every applicable item, unset included', function () {
        var dev = rptProject();
        var c = App.generate.relevanceCounts(App.store.getProject(), dev);
        T.assertEqual(c.HIGH, 1);
        T.assertEqual(c.REPORT, 1);
        T.assertEqual(c.IRRELEVANT, 1);
        T.assertEqual(c[App.generate.REL_UNSET], 1, 'the untagged item belongs to the unset bucket');
        T.assertEqual(App.generate.relevanceLabel(App.generate.REL_UNSET), '(not set)');
      });
      s.test('a filtered report is still byte-stable (DOD-7)', function () {
        var dev = rptProject();
        var o = { relevance: { IRRELEVANT: false } };
        T.assertEqual(rptHtml(dev, o), rptHtml(dev, o), 'two identical runs must produce identical bytes');
      });
    });

    T.suite('RPT-3 the report sections can be re-ordered, and it sticks', function (s) {
      s.test('blocks come out in platform order, each with a stable id', function () {
        var dev = rptProject();
        var p = App.store.getProject(), pl = App.registry.getPlatform('android-adb');
        var ids = App.generate.reportBlocks(p, pl, {}).map(function (b) { return b.id; });
        // TOC-1: the contents list is a block like any other, so it can be levelled,
        // reordered or switched off with everything else — and it starts first, which
        // is where a reader expects to find it.
        T.assertEqual(ids[0], 'toc');
        T.assertEqual(ids[1], 'meta');
        T.assertEqual(ids[ids.length - 2], 'control');
        T.assertEqual(ids[ids.length - 1], 'guidelines');
        T.assert(ids.indexOf('ds:android.packages') > 0, 'every dataset must be an orderable block: ' + ids.join(','));
        T.assertEqual(dev, 'rpt-m1');
      });
      s.test('a grouped dataset stays ONE block, carrying its groups', function () {
        rptProject();
        var b = App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'), {})
          .filter(function (x) { return x.id === 'ds:android.packages'; })[0];
        T.assert(b && b.groups && b.groups.length === 3, 'packages must carry its three report groups');
        T.assertEqual(b.included, true);
        // Turning every group off turns the block off.
        var off = App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'),
          { datasetSections: { 'android.packages': { keep: false, disable: false, remove: false } } })
          .filter(function (x) { return x.id === 'ds:android.packages'; })[0];
        T.assertEqual(off.included, false, 'a block with no group left in is not included');
      });
      s.test('a saved order moves the section in the document', function () {
        var dev = rptProject();
        var natural = rptHtml(dev, {});
        T.assert(natural.indexOf('{#sec-meta}') < natural.indexOf('{#sec-control}'),
          'baseline: meta precedes control coverage');
        App.store.setReportOrder(['control', 'meta']);
        var moved = rptHtml(dev, {});
        T.assert(moved.indexOf('{#sec-control}') < moved.indexOf('{#sec-meta}'),
          'the saved order must move the emitted section');
      });
      s.test('unlisted sections append; unknown ids are ignored', function () {
        rptProject();
        App.store.setReportOrder(['control', 'ds:no.such.dataset']);
        var ids = App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'), {})
          .map(function (b) { return b.id; });
        T.assertEqual(ids[0], 'control', 'a listed id leads');
        T.assertEqual(ids.indexOf('ds:no.such.dataset'), -1, 'a stale id must not conjure a section');
        T.assertEqual(ids.length, 7, 'nothing may be dropped: ' + ids.join(','));
        T.assertEqual(ids[1], 'toc', 'the unlisted ones follow in their natural order');
        T.assertEqual(ids[2], 'meta');
      });
      s.test('the order is saved with the project, and an empty one leaves no trace', function () {
        rptProject();
        App.store.setReportOrder(['control', 'meta']);
        var round = App.projectIo.parseProject(App.projectIo.serializeProject(App.store.getProject()));
        T.assert(round.ok, JSON.stringify(round.issues));
        T.assertDeepEqual(round.value.report.order, ['control', 'meta'], 'the arrangement must survive a save/load');
        T.assertEqual(App.projectIo.validateSchema(round.value).filter(function (i) { return i.severity === 'error'; }).length, 0);
        App.store.setReportOrder([]);
        var json = App.projectIo.serializeProject(App.store.getProject());
        T.assertEqual(json.indexOf('"report"'), -1, 'a reset order must serialise identically to never having set one');
      });
      s.test('a bad order is a schema error, not a silent shrug', function () {
        rptProject();
        var p = JSON.parse(App.projectIo.serializeProject(App.store.getProject()));
        p.report = { order: 'meta' };
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /report.order must be an array/.test(i.message); }));
        p.report = { nope: [] };
        T.assert(App.projectIo.validateSchema(p).some(function (i) { return /Unknown key "nope" in report/.test(i.message); }));
      });
    });

    T.suite('RPT-4 / RD-1 the Report Design workspace', function (s) {
      s.test('the Reporting card opens a workspace; the other commands keep their dropdown', function () {
        rptProject(); rptReset();
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-open/.test(html), 'Reporting must offer the workspace button');
        T.assert(/Report Design/.test(html), 'the button must name the workspace');
        T.assert(html.indexOf('data-gen-options-toggle="reporting"') === -1, 'and must not also offer the inline panel');
        T.assert(html.indexOf('data-gen-options-toggle="verification"') !== -1, 'the other commands are unchanged');
        T.assert(html.indexOf('data-rd-modal') === -1, 'the workspace stays closed until asked for');
      });
      s.test('opened, it is a full-screen dialog holding the ordered section list', function () {
        var dev = rptProject(); rptReset();
        App.ui.views.generate.openReportOptions();
        T.assertEqual(App.ui.views.generate.reportOptionsOpen(), true);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/class="modal-overlay overlay-full"/.test(html), 'the overlay must be the full-screen variant');
        T.assert(/class="modal modal-full" role="dialog" aria-modal="true"/.test(html), 'it must be a modal dialog');
        // Every block is a draggable, orderable, tickable row.
        App.generate.reportBlocks(App.store.getProject(), App.registry.getPlatform('android-adb'), App.ui.views.generate._gen.report)
          .forEach(function (b) {
            T.assert(html.indexOf('data-rd-block="' + b.id + '"') !== -1, 'no row for section ' + b.id);
            T.assert(html.indexOf('data-rd-up="' + b.id + '"') !== -1, 'no move-earlier control for ' + b.id);
            T.assert(html.indexOf('data-rd-down="' + b.id + '"') !== -1, 'no move-later control for ' + b.id);
            // DOC-1: every block carries a level picker, defaulting to automatic.
            T.assert(html.indexOf('data-rd-level="' + b.id + '"') !== -1, 'no heading-level picker for ' + b.id);
          });
        T.assert(/draggable="true"/.test(html), 'the rows must be draggable');
        T.assertEqual(dev, 'rpt-m1');
      });
      s.test('it offers every relevance category with a live count, IRRELEVANT off by default', function () {
        rptProject(); rptReset();
        App.ui.views.generate.openReportOptions();
        App.ui.views.reportDesign.pane('relevance');
        var html = App.ui.views.generate.render(App.store.getProject());
        App.generate.relevanceKeys().forEach(function (k) {
          T.assert(html.indexOf('data-rd-rel="' + k + '"') !== -1, 'no tick for relevance ' + k);
        });
        T.assert(/data-rd-rel="IRRELEVANT"(?! checked)/.test(html), 'IRRELEVANT must start excluded');
        T.assert(/data-rd-rel="HIGH" checked/.test(html), 'the rest must start included');
        T.assert(/1 item omitted by relevance/.test(html), 'the footer must own up to what the default drops');
      });
      s.test('the existing options are all still there, laid out inside the workspace', function () {
        rptProject(); rptReset();
        App.ui.views.generate.openReportOptions();
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-inc="meta"/.test(html), 'the meta section tick');
        T.assert(/data-rd-inc="control"/.test(html), 'the control coverage tick');
        T.assert(/data-rd-inc="toc"/.test(html), 'the contents tick');
        T.assert(/data-rd-ds-all="android.packages"/.test(html), 'a grouped dataset needs an all-groups tick');
        T.assert(/data-rd-inc-ds="android.tactical"/.test(html), 'the ungrouped dataset tick');
        // GEN-TAB: generation has its own pane now, and the footer button is gone —
        // naming the file and filling in the placeholders are part of generating, and
        // they are there.
        // (The Generate TAB behind the workspace has its own five command cards; what
        // this is about is the workspace's own footer.)
        var foot = html.slice(html.lastIndexOf('<div class="modal-foot">'));
        T.assert(!/data-generate-action/.test(foot), 'the workspace footer must no longer generate: ' + foot.slice(0, 300));
        App.ui.views.reportDesign.pane('generate');
        T.assert(/data-generate-action="reporting"/.test(App.ui.views.generate.render(App.store.getProject())),
          'and the workspace must be able to generate');
        App.ui.views.reportDesign.pane('section');
        // OPT-1: the group and column ticks live on the section ROW, behind the menu
        // button, so they can be changed without leaving whichever pane is open.
        App.ui.views.reportDesign._rd.optMenu = 'ds:android.packages';
        var pane = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-dsmap="datasetSections" data-rd-ds="android.packages" data-rd-key="keep"/.test(pane), 'the packages group ticks');
        App.ui.views.reportDesign._rd.optMenu = null;
        T.assert(/data-rd-dsmap="columns" data-rd-ds="android.packages"/.test(pane), 'the optional column ticks');
        // HDR-1: the classification banner has moved to the Header & Footer pane, which
        // is where it goes on the page and where everything else that prints on every
        // page is now decided.
        App.ui.views.reportDesign.pane('headerfooter');
        T.assert(/data-rd-classification/.test(App.ui.views.generate.render(App.store.getProject())), 'the OFFICIAL: Sensitive tick');
        App.ui.views.reportDesign.pane('section');
      });
      s.test('an unticked section shows no number, so the list reads as the document will', function () {
        rptProject(); rptReset();
        App.ui.views.reportDesign.open();
        // OPT-2: inclusion is a project decision now, so it is made through the store.
        App.docStore.setReportInclude('sections', 'meta', null, false, true);
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/<li class="ord-step rd-row off"[^>]*data-rd-block="meta"/.test(html), 'an excluded row must be marked off');
        T.assert(/<span class="ord-num">—<\/span>/.test(html), 'and must show a dash rather than hold a number');
        rptReset();
      });
      s.test('closed, it renders nothing at all', function () {
        rptProject(); rptReset();
        T.assertEqual(App.ui.views.generate._reportModal(App.store.getProject(), App.registry.getPlatform('android-adb')), '');
      });
    });

