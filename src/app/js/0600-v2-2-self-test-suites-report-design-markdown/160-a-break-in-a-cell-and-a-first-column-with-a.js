    T.suite('PRV-4 the preview can be laid out as pages', function (s) {
      s.test('off, it is the continuous sheet it has always been', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('preview');
        App.ui.views.reportDesign._rd.pages = false;
        var html = App.ui.views.generate.render(App.store.getProject());
        T.assert(/data-rd-pageview/.test(html), 'the toggle must be offered');
        T.assert(html.indexOf('data-prv-pages') === -1, 'and off means no sheets');
        App.ui.views.reportDesign.close();
      });

      s.test('on, the page metrics come from the profile rather than from a guess', function () {
        docProject();
        App.ui.views.reportDesign.open();
        App.ui.views.reportDesign.pane('preview');
        App.ui.views.reportDesign._rd.pages = true;
        var html = App.ui.views.generate.render(App.store.getProject());
        var m = App.docFormat.pageMetrics(App.docFormat.standard());
        T.assert(new RegExp('data-prv-ph="' + m.height + '"').test(html), 'the sheet height: ' + m.height);
        T.assert(new RegExp('data-prv-mt="' + m.top + '"').test(html), 'and the top margin the header sits in');
        App.ui.views.reportDesign._rd.pages = false;
        App.ui.views.reportDesign.close();
      });

      s.test('A4 at 25mm margins is the sheet the profile describes', function () {
        var m = App.docFormat.pageMetrics(App.docFormat.standard());
        T.assertEqual(m.width, 794, '210mm at 96dpi');
        T.assertEqual(m.height, 1123, '297mm at 96dpi');
        T.assertEqual(m.left, 94, '25mm at 96dpi');
        var a5 = App.docFormat.pageMetrics(App.docFormat.normalise({ id: 'p', name: 'P', page: { paper: 'a5' } }));
        T.assert(a5.height < m.height, 'and a smaller paper is a smaller sheet');
      });
    });

