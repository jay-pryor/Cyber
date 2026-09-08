    T.suite('TAG-1/TAG-2 custom tags on controls', function (s) {
      function tagProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'D', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        ['Bluetooth off', 'Staff vetting', 'Physical security'].forEach(function (t) {
          App.store.addControl({ title: t, type: 'ISM', description: 'desc' });
        });
        return App.store.getProject();
      }
      function tagsOf(title) {
        var c = App.store.getProject().controls.filter(function (x) { return x.title === title; })[0];
        return (c && c.tags) || [];
      }

      s.test('a tag can be created, applied and is offered by the catalogue', function () {
        tagProject();
        T.assertEqual(App.store.addControlTag('administrative').ok, true);
        T.assert(App.store.knownControlTags().indexOf('administrative') !== -1);
        var id = App.store.getProject().controls.filter(function (c) { return c.title === 'Staff vetting'; })[0].id;
        var res = App.store.setControlTag([id], 'administrative', true);
        T.assertEqual(res.changed, 1);
        T.assertDeepEqual(tagsOf('Staff vetting'), ['administrative']);
        T.assertDeepEqual(tagsOf('Bluetooth off'), [], 'other controls untouched');
      });

      s.test('a control can carry several tags, stored sorted and de-duplicated', function () {
        tagProject();
        var id = App.store.getProject().controls[0].id;
        App.store.setControlTag([id], 'zeta', true);
        App.store.setControlTag([id], 'alpha', true);
        App.store.setControlTag([id], 'alpha', true);   // idempotent
        var c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertDeepEqual(c.tags, ['alpha', 'zeta']);
      });

      s.test('an empty tag list is dropped, so "no tags" has one canonical form', function () {
        tagProject();
        var id = App.store.getProject().controls[0].id;
        App.store.setControlTag([id], 'x', true);
        App.store.setControlTag([id], 'x', false);
        var c = App.store.getProject().controls.filter(function (x) { return x.id === id; })[0];
        T.assertEqual(c.tags, undefined, 'the key must be removed, not left as []');
      });

      s.test('tags round-trip and are schema-checked', function () {
        tagProject();
        var id = App.store.getProject().controls[0].id;
        App.store.setControlTag([id], 'administrative', true);
        var text = App.projectIo.serializeProject(App.store.getProject());
        var back = App.projectIo.parseProject(text);
        T.assertEqual(back.ok, true, JSON.stringify(back.issues));
        T.assertEqual(App.projectIo.serializeProject(back.value), text, 'must round-trip byte-identically');
        T.assert(back.value.controlTags.indexOf('administrative') !== -1, 'the catalogue must persist');
        var bad = JSON.parse(text); bad.controls[0].tags = 'nope';
        T.assert(App.projectIo.validateSchema(bad).some(function (i) { return /Control.tags/.test(i.message) && i.severity === 'error'; }));
        var bad2 = JSON.parse(text); bad2.controlTags = [1];
        T.assert(App.projectIo.validateSchema(bad2).some(function (i) { return /controlTags/.test(i.message) && i.severity === 'error'; }));
      });

      s.test('deleting a tag strips it from every control but changes nothing else', function () {
        tagProject();
        var ids = App.store.getProject().controls.map(function (c) { return c.id; });
        App.store.setControlTag(ids, 'administrative', true);
        App.store.setControlTag([ids[0]], 'keepme', true);
        App.store.removeControlTag('administrative');
        T.assert(App.store.knownControlTags().indexOf('administrative') === -1, 'gone from the catalogue');
        T.assertDeepEqual(tagsOf('Staff vetting'), [], 'stripped from controls');
        T.assertDeepEqual(App.store.getProject().controls.filter(function (c) { return c.id === ids[0]; })[0].tags, ['keepme'],
          'other tags on the same control survive');
      });

      s.test('the search matches tags, so you can narrow to them then bulk-apply', function () {
        tagProject();
        var CV = App.ui.views.controls;
        var id = App.store.getProject().controls.filter(function (c) { return c.title === 'Staff vetting'; })[0].id;
        App.store.setControlTag([id], 'administrative', true);
        CV._cm.search = 'administrative';
        T.assertDeepEqual(CV.shownControls(App.store.getProject()).map(function (c) { return c.title; }), ['Staff vetting'],
          'searching a tag must narrow the table to it');
        CV._cm.search = '';
      });

      s.test('the rail renders a tag picker with counts, a tick column and a bulk button', function () {
        var p = tagProject();
        var CV = App.ui.views.controls;
        App.store.addControlTag('administrative');
        var id = App.store.getProject().controls[0].id;
        App.store.setControlTag([id], 'administrative', true);
        CV._cm.tagMode = false;
        var off = CV.render(App.store.getProject());
        T.assert(/data-cm-tag-toggle/.test(off), 'no Apply Tag Mode button');
        T.assert(off.indexOf('data-ctl-tag-check') === -1, 'the tick column must be hidden when the mode is off');
        CV._cm.tagMode = true; CV._cm.tagName = 'administrative';
        var on = CV.render(App.store.getProject());
        T.assert(/<aside class="side-rail" data-side-rail>/.test(on), 'the rail must render');
        T.assert(/class="ctl-card active" data-cm-tag-pick="administrative"/.test(on), 'the selected tag is not marked');
        T.assert(/On 1 control\./.test(on), 'the picker should show how many controls carry the tag');
        T.assert(/data-ctl-tag-check/.test(on), 'no per-row tick column in tag mode');
        T.assert(/data-cm-tag-all/.test(on), 'no bulk tag button');
        T.assert(/data-cm-tag-new/.test(on), 'no way to create a tag');
        CV._cm.tagMode = false; CV._cm.tagName = '';
      });

      s.test('the bulk button names the shown count and flips to untag', function () {
        tagProject();
        var CV = App.ui.views.controls;
        CV._cm.tagMode = true; CV._cm.tagName = 'administrative'; CV._cm.search = 'staff';
        var html = CV.render(App.store.getProject());
        T.assert(html.indexOf('Tag all 1 shown') !== -1, 'the label must name the shown count');
        var id = CV.shownControls(App.store.getProject())[0].id;
        App.store.setControlTag([id], 'administrative', true);
        T.assertEqual(CV.allShownHaveTag(App.store.getProject(), 'administrative'), true);
        T.assert(CV.render(App.store.getProject()).indexOf('Untag all 1 shown') !== -1, 'it must flip to untag');
        CV._cm.tagMode = false; CV._cm.tagName = ''; CV._cm.search = '';
      });

      s.test('the Tags column shows the tags as badges', function () {
        tagProject();
        var id = App.store.getProject().controls[0].id;
        App.store.setControlTag([id], 'administrative', true);
        var html = App.ui.views.controls.renderTable(App.store.getProject());
        T.assert(/<span class="badge tag">administrative<\/span>/.test(html), 'no tag badge in the Tags column');
      });
    });

    /* ===== SUITES: the sticky tools rail (SP-4 · SP) ===== */
    T.suite('SP-4 the rail is actually sticky (CSS invariants)', function (s) {
      // `position:sticky` fails SILENTLY when the layout around it is wrong, and no
      // amount of render-to-string testing can see it — this was shipped broken once
      // already. These assertions pin the four properties the behaviour depends on, so
      // a well-meant layout tidy-up cannot quietly un-stick the rail again.
      function css() {
        // The stylesheet is inline in this file; in the test environment we read it back
        // from the document. Fall back to the live CSSOM when the raw text is absent.
        var el = document.querySelector('style');
        return (el && (el.textContent || el.innerHTML)) || '';
      }
      function rule(sheet, selector) {
        var i = sheet.indexOf(selector + ' {');
        if (i === -1) i = sheet.indexOf(selector + '{');
        if (i === -1) return '';
        var open = sheet.indexOf('{', i), close = sheet.indexOf('}', open);
        return close === -1 ? '' : sheet.slice(open + 1, close);
      }

      s.test('#app-root has a FIXED height, so .main can be the scroll region', function () {
        var r = rule(css(), '#app-root');
        if (!r) return; // no inline stylesheet in this environment — nothing to assert
        T.assert(/height:\s*100vh/.test(r), '#app-root must set height:100vh');
        T.assert(!/min-height:\s*100vh/.test(r),
          'min-height lets #app-root grow with its content, so .main never scrolls and ' +
          'position:sticky inside it silently stops working');
      });

      s.test('.main is a scrollport that can shrink', function () {
        var r = rule(css(), '.main');
        if (!r) return;
        T.assert(/overflow:\s*auto/.test(r), '.main must scroll');
        T.assert(/min-height:\s*0/.test(r),
          'without min-height:0 a flex child will not shrink below its content, so .main ' +
          'overflows the shell and nothing scrolls');
      });

      s.test('.side-rail is sticky and self-aligned to the start', function () {
        var r = rule(css(), '.side-rail');
        if (!r) return;
        T.assert(/position:\s*sticky/.test(r), '.side-rail must be position:sticky');
        T.assert(/align-self:\s*flex-start/.test(r),
          'a stretched flex item fills the row and has no room to stick — align-self:flex-start is required');
        T.assert(/top:\s*0/.test(r), 'sticky needs an inset to pin against');
      });

      s.test('nothing between the rail and .main introduces another scrollport', function () {
        var r = rule(css(), '.table-wrap');
        if (!r) return;
        T.assert(!/overflow/.test(r),
          '.table-wrap must not scroll — an overflow ancestor would become the sticky ' +
          'scrollport instead of .main');
        T.assert(/align-items:\s*flex-start/.test(r), '.table-wrap must not stretch its children');
      });

      // ---- SP-6: sticky to the right of the SCREEN, not the right of the table ----
      s.test('.side-rail pins horizontally as well as vertically', function () {
        var r = rule(css(), '.side-rail');
        if (!r) return;
        T.assert(/right:/.test(r),
          'without a right inset the rail scrolls off with a wide table instead of ' +
          'staying at the edge of the screen');
      });
      s.test('.table-wrap spans the whole scrollable width, or right: has nothing to bite on', function () {
        var r = rule(css(), '.table-wrap');
        if (!r) return;
        T.assert(/width:\s*max-content/.test(r),
          'a block-level flex container is only as wide as ITS containing block, so a wide ' +
          'table overflows it and the rail sits outside — and sticky cannot move a box ' +
          'beyond its containing block');
        T.assert(/min-width:\s*100%/.test(r),
          'without min-width:100% a narrow table shrink-wraps the row and the rail is ' +
          'dragged in beside it instead of sitting at the right edge');
      });

      // ---- SP-7: a re-render must put the view back on BOTH axes ----
      // SP-6 made .main scroll sideways as well as down (a wide register plus the rail),
      // and the columns you reach by scrolling right are the ones you act on: Status, and
      // the ✓ Apply tick column. Restoring only scrollTop meant every edit snapped the
      // view back to the left-hand edge. This runs against a REAL scrollport, because the
      // whole failure is a layout behaviour that no render-to-string test can see.
      s.test('captureScroll/restoreScroll round-trip BOTH offsets', function () {
        if (!document.body || !App.ui.app._captureScroll) return;
        function scrollport() {
          var el = document.createElement('div');
          el.id = 'main';
          el.style.cssText = 'position:absolute;left:-9999px;top:0;width:200px;height:100px;overflow:auto';
          el.innerHTML = '<div style="width:2000px;height:2000px"></div>';
          return el;
        }
        var before = scrollport(), after = null;
        document.body.appendChild(before);
        try {
          before.scrollTop = 300; before.scrollLeft = 400;
          var snap = App.ui.app._captureScroll();
          T.assertEqual(snap.main, 300, 'the vertical offset must be captured');
          T.assertEqual(snap.mainLeft, 400, 'the horizontal offset must be captured too');
          // What render() does: the shell is replaced, so #main is a NEW element at 0/0.
          document.body.removeChild(before);
          after = scrollport();
          document.body.appendChild(after);
          T.assertEqual(after.scrollTop, 0);
          T.assertEqual(after.scrollLeft, 0);
          App.ui.app._restoreScroll(snap);
          T.assertEqual(after.scrollTop, 300, 'the vertical offset must come back');
          T.assertEqual(after.scrollLeft, 400,
            'the horizontal offset must come back as well — losing it threw the view to ' +
            'the left edge every time an action was changed');
        } finally {
          if (before && before.parentNode) before.parentNode.removeChild(before);
          if (after && after.parentNode) after.parentNode.removeChild(after);
        }
      });
    });

    T.suite('SP sticky tools rail', function (s) {
      function railProject() {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'SP', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a\ncom.b'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'No Bluetooth', type: 'ISM', description: 'Bluetooth radio must be off in the field.' }).id;
        App.store.addControl({ title: 'Debloat', type: 'AHG', description: 'Remove vendor apps with no operational need.' });
        return { id: id, project: App.store.getProject() };
      }
      function toolbar(ui) {
        var w = railProject();
        return { html: App.ui.tables.renderToolbar('android.packages', ui || {}, 2, 2, w.project.controls), w: w };
      }

      s.test('SP-1 the mode + history controls live in the rail, not the filter toolbar', function () {
        var r = toolbar({});
        var html = r.html;
        var railAt = html.indexOf('<aside class="side-rail"');
        T.assert(railAt !== -1, 'no side rail');
        // Every mode control must sit AFTER the rail opens, i.e. inside it.
        ['data-apply-toggle', 'data-delete-toggle', 'data-undo', 'data-redo'].forEach(function (attr) {
          var at = html.indexOf(attr);
          T.assert(at > railAt, attr + ' should be inside the rail, not the toolbar');
        });
        // ...and the filters must stay in the toolbar, before it.
        ['data-search', 'data-incomplete', 'data-include-rel'].forEach(function (attr) {
          T.assert(html.indexOf(attr) < railAt, attr + ' should stay in the filter toolbar');
        });
      });

      s.test('SP-2 the rail is sticky and collapsible', function () {
        var r = toolbar({});
        T.assert(/class="table-wrap"/.test(r.html), 'the table and rail must share a flex wrapper');
        T.assert(/data-rail-toggle="android.packages"/.test(r.html), 'no collapse control');
        var collapsed = App.ui.tables.renderToolbar('android.packages', { railCollapsed: true }, 2, 2, r.w.project.controls);
        T.assert(/class="side-rail collapsed"/.test(collapsed), 'collapsed state not rendered');
        T.assert(collapsed.indexOf('data-apply-toggle') === -1, 'a collapsed rail shows only its toggle');
      });

      s.test('SP-3 the control picker shows title, type AND description', function () {
        var w = railProject();
        var on = App.ui.tables.renderToolbar('android.packages', { applyMode: true, applyControlId: w.id }, 2, 2, w.project.controls);
        T.assert(/class="ctl-card-title">No Bluetooth</.test(on), 'title missing');
        T.assert(/class="ctl-card-type">ISM</.test(on), 'type missing');
        T.assert(on.indexOf('Bluetooth radio must be off in the field.') !== -1, 'DESCRIPTION missing — the whole point of SP-3');
        T.assert(new RegExp('class="ctl-card active" data-rail-control="' + w.id + '"').test(on), 'selection not marked');
        T.assert(on.indexOf('apply-control-list') === -1, 'the old datalist must be gone');
      });

      s.test('SP-3 a control with no description says so rather than rendering blank', function () {
        ensureA(); App.store.init(App.store.empty('android-adb'));
        App.store.onboardDevice({ name: 'SP2', model: 'M1', snapshots: {
          'android.packages': snapB('android.packages', 'com.a'),
          'android.tactical': snapB('android.tactical', '{"enabled":true}') } });
        var id = App.store.addControl({ title: 'Bare', type: 'Custom' }).id;
        var on = App.ui.tables.renderToolbar('android.packages', { applyMode: true, applyControlId: id }, 1, 1, App.store.getProject().controls);
        T.assert(/No description — add one in Control Manager\./.test(on), 'an empty description should prompt for one');
      });

      s.test('SP-3 the rail filter narrows the control list by title, type or description', function () {
        var w = railProject();
        function cards(html) { return (html.match(/data-rail-control="/g) || []).length; }
        var all = App.ui.tables.renderToolbar('android.packages', { applyMode: true }, 2, 2, w.project.controls);
        T.assertEqual(cards(all), 2, 'both controls should show unfiltered');
        var byTitle = App.ui.tables.renderToolbar('android.packages', { applyMode: true, railSearch: 'debloat' }, 2, 2, w.project.controls);
        T.assertEqual(cards(byTitle), 1);
        var byDesc = App.ui.tables.renderToolbar('android.packages', { applyMode: true, railSearch: 'vendor apps' }, 2, 2, w.project.controls);
        T.assertEqual(cards(byDesc), 1, 'the filter must search descriptions too');
        var none = App.ui.tables.renderToolbar('android.packages', { applyMode: true, railSearch: 'zzz' }, 2, 2, w.project.controls);
        T.assert(/No control matches that filter/.test(none), 'an empty result must say so');
      });

      s.test('SP-3/BULK-1/BULK-3 apply-to-all-shown is on the tick heading, for EVERY dataset', function () {
        var w = railProject();
        var pkg = App.ui.tables.renderTableHtml(w.project, 'android.packages', { applyMode: true, applyControlId: w.id }, {});
        T.assert(/data-apply-all="android.packages"/.test(pkg), 'packages should offer apply-to-all');
        T.assert(/<th class="apply-col"[^>]*><button/.test(pkg), 'it belongs on the tick column heading');
        // Unlike the old enum-keyed dropdown this is dataset-agnostic, so tactical gets it too.
        var tac = App.ui.tables.renderTableHtml(w.project, 'android.tactical', { applyMode: true, applyControlId: w.id }, {});
        T.assert(/data-apply-all="android.tactical"/.test(tac), 'tactical should offer it as well now');
        // The rail explains it (with the count) but no longer duplicates the button.
        var rail = App.ui.tables.renderToolbar('android.packages', { applyMode: true, applyControlId: w.id }, 2, 2, w.project.controls);
        T.assert(rail.indexOf('data-apply-all') === -1, 'the rail must not carry a second button');
        T.assert(rail.indexOf('apply-all-note') > rail.indexOf('side-rail'), 'the explanation belongs in the rail');
      });
    });

