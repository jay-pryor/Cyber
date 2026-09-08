  /* =============================================================================
   * MODULE: App.ui.model
   * PURPOSE: PURE view-model helpers shared by the UI views: latest-version
   *          resolution, applicability map, and search/sort/filter of table rows.
   *          Kept pure so the table logic is unit-testable without the DOM.
   * PURITY:  pure
   * DEPENDS: (reads plain project data + an adapter's columns)
   * INVARIANTS: never mutates inputs; "latest" = config not referenced by any
   *             supersedesId (per the version-integrity invariant).
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** @param {Project} project @returns {DeviceConfig[]} latest version per baseId */
    function getLatestConfigs(project) {
      var referenced = {};
      project.deviceConfigs.forEach(function (c) { if (c.supersedesId) referenced[c.supersedesId] = true; });
      return project.deviceConfigs.filter(function (c) { return !referenced[c.id]; });
    }

    /** @returns {boolean} true if deviceId is a latest (active) config */
    function isLatest(project, deviceId) {
      return getLatestConfigs(project).some(function (c) { return c.id === deviceId; });
    }

    /**
     * Map of item key -> [device names] whose latest snapshot for dsId has the key.
     * @returns {Object<string,string[]>}
     */
    function computeAppliesTo(project, dsId) {
      var map = {};
      getLatestConfigs(project).forEach(function (c) {
        // CUS-1: a virtual dataset has no snapshot to read — its items apply to every
        // device, so applicableKeys hands back the whole register for each one.
        App.registry.applicableKeys(project, c, dsId).forEach(function (k) { (map[k] = map[k] || []).push(c.name); });
      });
      return map;
    }

    /** @returns {number} count of not-decided items in a dataset */
    function countIncomplete(project, dsId) {
      return (project.items[dsId] || []).filter(function (it) { return it.status !== 'decided'; }).length;
    }

    // review-12 #3 / review-14: sort Security Relevance by SEVERITY (HIGH → MEDIUM →
    // LOW → REPORT → IRRELEVANT → unset), not alphabetically — alphabetical
    // would put IRRELEVANT above MEDIUM.
    var RELEVANCE_RANK = { HIGH: '1', MEDIUM: '2', LOW: '3', REPORT: '4', IRRELEVANT: '5' };

    /**
     * REL-8: the row predicate for the parked-category view.
     *
     * The toggles ADD rather than replace: `includeRelevance` lists the parked categories
     * the operator has switched on, and an item is hidden only when its category is
     * parked and not in that list. Everything else is always shown.
     *
     * It used to be an "only" filter — ticking Irrelevant showed *nothing but* irrelevant
     * items. That answers a question nobody was asking: the point of the toggle is "let me
     * also see the ones I parked", not "hide the work". Reviewing them against the rest of
     * the table is the whole reason to look.
     *
     * @param {{includeRelevance?:string[]}} ui
     * @returns {(row:{item:RegisterItem})=>boolean}
     */
    function relevanceViewFilter(ui) {
      var on = (ui && ui.includeRelevance) || [];
      var parked = App.projectIo.RELEVANCE_PARKED;
      return function (r) {
        var v = r.item.relevance || '';
        return parked.indexOf(v) === -1 || on.indexOf(v) !== -1;
      };
    }

    /**
     * SORT-1: the sort key in force, and the difference between "nothing said" and
     * "nothing sorted".
     *
     * An absent key (null/undefined) means the caller has no opinion, and gets the
     * historical default — the register's own key. An EMPTY STRING is an opinion: no
     * sorting rule at all, leave the rows in the order the register holds them.
     * @param {{sortKey?:string}} ui @returns {string} '' when sorting is off
     */
    function sortKeyOf(ui) {
      var sk = ui ? ui.sortKey : null;
      return sk == null ? 'key' : String(sk);
    }

    /** SORT-1: sorting off. Exported so a caller can say so without writing a bare ''. */
    var SORT_NONE = '';

    /**
     * SORT-1: the three states a column heading cycles through — ascending, descending,
     * off.
     *
     * A two-state toggle can only ever leave the table sorted by SOMETHING. Sort by
     * Action to gather the removals, and there is then no way back to the order the
     * register holds — which is the capture order, the one view in which a device's own
     * file reads straight down the page, and the order every other column's ties already
     * fall back to. The third click takes the rule away rather than picking a different
     * one.
     *
     * Clicking a DIFFERENT heading still starts that column at ascending: the cycle
     * belongs to the column, not to the table.
     *
     * Pure, and shared by the click handler and the heading's tooltip, so what the header
     * promises and what the click does cannot drift apart.
     * @param {{sortKey?:string,sortDir?:string}} ui @param {string} col
     * @returns {{sortKey:string, sortDir:string}}
     */
    function nextSort(ui, col) {
      if (sortKeyOf(ui) !== col) return { sortKey: col, sortDir: 'asc' };
      if (((ui && ui.sortDir) || 'asc') === 'asc') return { sortKey: col, sortDir: 'desc' };
      return { sortKey: SORT_NONE, sortDir: 'asc' };
    }

    function sortValue(r, key) {
      if (key === 'appliesTo') return r.appliesTo.join(',');
      if (key === 'status') return r.status;
      if (key === 'relevance') return RELEVANCE_RANK[r.item.relevance] || '6';
      if (Object.prototype.hasOwnProperty.call(r.cells, key)) return String(r.cells[key] == null ? '' : r.cells[key]);
      return String(r.item[key] == null ? '' : r.item[key]);
    }

    /**
     * Build display rows for a dataset, applying search/sort/incomplete filters.
     * @param {Project} project
     * @param {string} dsId
     * @param {DatasetAdapter} adapter
     * @param {{search?:string,sortKey?:string,sortDir?:string,incompleteOnly?:boolean,includeRelevance?:string[]}} ui
     * @returns {Array<{item:RegisterItem, appliesTo:string[], status:string, cells:Object}>}
     */
    /**
     * FIL-1: the filterable columns for a dataset, discovered from the adapter — never a
     * hardcoded list, so a new dataset (or a new decision field) gets filters for free.
     *  - the enum decision field (packages' Action) → its schema options
     *  - Security Relevance → the shared vocabulary, plus an explicit "not set"
     *  - Applies to        → the devices that actually have items in this dataset
     *  - Status            → decided / undecided / flagged for review (HELD-1)
     * @param {Project} project @param {string} dsId @param {DatasetAdapter} adapter
     * @returns {{key:string,label:string,options:{value:string,label:string}[]}[]}
     */
    /**
     * FIL-3: the sentinel every "(none)" / "(not set)" filter option carries.
     *
     * It has to survive being written into an `<option value>` and read back off the DOM.
     * That rules out U+0000: the HTML parser rewrites a NUL to U+FFFD, so the value coming
     * back from the select never equalled the one written, every "(none)" filter fell
     * through to the "must equal this id" branch, and the table came back empty. A
     * private-use codepoint round-trips unchanged and still cannot collide with a control
     * id, a relevance option or a decision value — which was the point of using NUL.
     * Built numerically so the character never appears literally in this file.
     */
    var FILTER_NONE = String.fromCharCode(0xE000) + 'none';

    function filterableColumns(project, dsId, adapter) {
      var out = [];
      var enumField = ((adapter && adapter.decisionSchema) || []).filter(function (f) { return f.kind === 'enum'; })[0];
      if (enumField) {
        out.push({ key: 'decision', label: labelForColumn(adapter, 'decision') || 'Action', field: enumField.name,
          options: (enumField.options || []).map(function (o) { return { value: o, label: o }; })
            .concat([{ value: FILTER_NONE, label: '(not set)' }]) });
      }
      out.push({ key: 'relevance', label: 'Security Relevance',
        options: App.projectIo.RELEVANCE_OPTIONS.map(function (o) { return { value: o, label: o }; })
          .concat([{ value: FILTER_NONE, label: '(not set)' }]) });
      // FIL-2: Control Refs — "show me every action assigned to this control", which is how
      // you review a control's coverage in the register itself rather than in the Control
      // Manager. The vocabulary is the project's controls by TITLE (what the cell shows)
      // while the value is the id (what the item stores), so renaming a control cannot
      // orphan the filter. Every control is offered, not just the ones already used in this
      // dataset: "nothing here is assigned to it" is a legitimate — and useful — answer.
      var ctls = ((project && project.controls) || []).slice()
        .sort(function (a, b) { return a.title < b.title ? -1 : a.title > b.title ? 1 : 0; });
      if (ctls.length) {
        out.push({ key: 'controlRefs', label: labelForColumn(adapter, 'controlRefs') || 'Control Refs',
          options: ctls.map(function (c) { return { value: c.id, label: c.title }; })
            .concat([{ value: FILTER_NONE, label: '(none assigned)' }]) });
      }
      var devs = [];
      getLatestConfigs(project || { deviceConfigs: [] }).forEach(function (c) {
        if (App.registry.deviceHasDataset(project, c, dsId)) devs.push({ value: c.name, label: c.name });   // CUS-1
      });
      devs.sort(function (a, b) { return a.value < b.value ? -1 : a.value > b.value ? 1 : 0; });
      if (devs.length) out.push({ key: 'appliesTo', label: 'Applies to', options: devs });
      out.push({ key: 'status', label: 'Status', options: [
        { value: 'decided', label: 'decided' },
        { value: 'undecided', label: 'undecided' },
        { value: 'held', label: 'review (value kept)' }
      ] });
      return out;
    }
    /** The adapter's own label for a column key, when it has one. */
    function labelForColumn(adapter, key) {
      var c = ((adapter && adapter.columns) || []).filter(function (x) { return x.key === key; })[0];
      return c ? c.label : null;
    }

    /**
     * FIL-1: a row predicate for the active per-column filters (`ui.colFilters`).
     * An absent/empty entry means "any", so the default state filters nothing.
     */
    function colFilterPredicate(adapter, ui) {
      var f = (ui && ui.colFilters) || {};
      var active = Object.keys(f).filter(function (k) { return f[k]; });
      if (!active.length) return function () { return true; };
      var enumField = ((adapter && adapter.decisionSchema) || []).filter(function (x) { return x.kind === 'enum'; })[0];
      return function (r) {
        for (var i = 0; i < active.length; i++) {
          var key = active[i], want = f[key];
          if (key === 'decision') {
            var v = (r.item.decision && enumField) ? r.item.decision[enumField.name] : undefined;
            if (want === FILTER_NONE) { if (v !== undefined && v !== null && v !== '') return false; }
            else if (v !== want) return false;
          } else if (key === 'relevance') {
            var rel = r.item.relevance || '';
            if (want === FILTER_NONE) { if (rel !== '') return false; }
            else if (rel !== want) return false;
          } else if (key === 'controlRefs') {
            // FIL-2: matched on the control ID the item stores, not the title the cell
            // renders — the same reason CTL-5 resolves ids to titles for display only.
            var refs = r.item.controlRefs || [];
            if (want === FILTER_NONE) { if (refs.length) return false; }
            else if (refs.indexOf(want) === -1) return false;
          } else if (key === 'appliesTo') {
            if ((r.appliesTo || []).indexOf(want) === -1) return false;
          } else if (key === 'status') {
            // HELD-1: "review" is its own state — a held item is undecided AND holds a value.
            var st = r.item.held ? 'held' : (r.status === 'decided' ? 'decided' : 'undecided');
            if (st !== want) return false;
          }
        }
        return true;
      };
    }

    function filterSortRows(project, dsId, adapter, ui) {
      ui = ui || {};
      var appliesTo = computeAppliesTo(project, dsId);
      var rows = (project.items[dsId] || []).map(function (it) {
        var cells = {};
        adapter.columns.forEach(function (c) { cells[c.key] = c.get ? c.get(it) : it[c.key]; });
        cells.relevance = it.relevance || ''; // review-12 #3: Security Relevance (may be empty)
        return { item: it, appliesTo: appliesTo[it.key] || [], status: it.status, cells: cells };
      });
      // review-14: REPORT/IRRELEVANT items are PARKED — hidden from the working view
      // unless their toggle is on, in which case ONLY those categories are listed.
      rows = rows.filter(relevanceViewFilter(ui));
      if (ui.incompleteOnly) rows = rows.filter(function (r) { return r.status !== 'decided'; });
      // FIL-1: per-column value filters. They COMPOSE — with each other, with the search
      // box, with Incomplete-only and with the parked toggles — so "removed packages whose
      // name contains bluetooth" is filter + search, not a special case. Applied before the
      // search so the search narrows whatever the filters left.
      rows = rows.filter(colFilterPredicate(adapter, ui));
      var q = (ui.search || '').toLowerCase().trim();
      if (q) rows = rows.filter(function (r) {
        return (r.item.key + ' ' + (r.item.description || '')).toLowerCase().indexOf(q) !== -1;
      });
      // SORT-1: no key means no sorting rule — the rows stay in the order the register
      // holds them, which is the order they were captured in. Not a sort by nothing: the
      // tiebreak on key is skipped too, or "off" would just be another sort by key.
      var sk = sortKeyOf(ui);
      if (sk) {
        var dir = ui.sortDir === 'desc' ? -1 : 1;
        rows.sort(function (a, b) {
          var av = sortValue(a, sk), bv = sortValue(b, sk);
          if (av < bv) return -dir; if (av > bv) return dir;
          // stable tiebreak on key
          return a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0;
        });
      }
      return rows;
    }

    App.ui = App.ui || {};
    /**
     * BULK-1: the plan for "apply this control to everything currently shown".
     *
     * Shared by the button's LABEL and the button's ACTION so the two can never disagree
     * about what "shown" means — the label promises a count, and the click must act on
     * exactly that set. `removing` mirrors RV9-1: when every shown row already carries the
     * control, the click takes it away instead of being a no-op.
     * @param {Project} project @param {string} dsId @param {Object} ui  per-dataset UI state
     * @param {string} controlId
     * @returns {{items:RegisterItem[], removing:boolean, changing:number}}
     */
    function applyAllShownPlan(project, dsId, ui, controlId) {
      var adapter = project ? App.registry.getDataset(project.platformProfileId, dsId) : null;
      if (!project || !adapter || !controlId) return { items: [], removing: false, changing: 0 };
      var items = filterSortRows(project, dsId, adapter, ui || {}).map(function (r) { return r.item; });
      var have = items.filter(function (it) { return (it.controlRefs || []).indexOf(controlId) !== -1; }).length;
      var removing = items.length > 0 && have === items.length;
      return { items: items, removing: removing, changing: removing ? have : items.length - have };
    }

    /**
     * DEV-1: the set of keys currently applicable to one device for one dataset — the
     * capture folded with the by-hand assignments (registry DEV-1). This is what the tick
     * column reads, so the box and the "Applies to" cell beside it cannot disagree.
     * @param {Project} project @param {string} dsId @param {?string} deviceId
     * @returns {Object<string,boolean>}
     */
    function deviceAppliesSet(project, dsId, deviceId) {
      if (!project || !deviceId) return {};
      var dc = (project.deviceConfigs || []).filter(function (c) { return c.id === deviceId; })[0];
      if (!dc) return {};
      return App.registry.applicableKeySet(project, dc, dsId);
    }

    /**
     * DEV-1: the plan for "assign everything currently shown to the selected device" —
     * the device-column twin of applyAllShownPlan, and it works the same way: when every
     * shown row already applies to the device, the click takes them all off instead of
     * being a no-op. Shared by the heading's LABEL and its ACTION so the count promised
     * and the set acted on cannot drift apart.
     * @param {Project} project @param {string} dsId @param {Object} ui @param {string} deviceId
     * @returns {{items:RegisterItem[], removing:boolean, changing:number}}
     */
    function assignAllShownPlan(project, dsId, ui, deviceId) {
      var adapter = project ? App.registry.getDataset(project.platformProfileId, dsId) : null;
      if (!project || !adapter || !deviceId) return { items: [], removing: false, changing: 0 };
      var ks = deviceAppliesSet(project, dsId, deviceId);
      var items = filterSortRows(project, dsId, adapter, ui || {}).map(function (r) { return r.item; });
      var have = items.filter(function (it) { return ks[it.key]; }).length;
      var removing = items.length > 0 && have === items.length;
      return { items: items, removing: removing, changing: removing ? have : items.length - have };
    }

    /**
     * BULK-4: the plan for "set the selected VALUE on every row currently shown" — the
     * third sibling of applyAllShownPlan/assignAllShownPlan, and it behaves identically:
     * when every shown row already carries the value the click CLEARS it from all of them
     * instead of being a no-op, and the same helper feeds both the heading's label and its
     * action so the count promised and the set acted on cannot drift apart.
     *
     * `read` returns a row's current value for whichever field is being set (relevance,
     * or the adapter's enum decision field), which is what keeps this ignorant of both.
     *
     * @param {Project} project @param {string} dsId @param {Object} ui
     * @param {function(RegisterItem):string} read @param {?string} value
     * @returns {{items:RegisterItem[], removing:boolean, changing:number}}
     */
    function valueAllShownPlan(project, dsId, ui, read, value) {
      var adapter = project ? App.registry.getDataset(project.platformProfileId, dsId) : null;
      if (!project || !adapter || !read || value == null || value === '') return { items: [], removing: false, changing: 0 };
      var items = filterSortRows(project, dsId, adapter, ui || {}).map(function (r) { return r.item; });
      var have = items.filter(function (it) { return read(it) === value; }).length;
      var removing = items.length > 0 && have === items.length;
      return { items: items, removing: removing, changing: removing ? have : items.length - have };
    }

    App.ui.model = {
      getLatestConfigs: getLatestConfigs, isLatest: isLatest,
      // DEV-1: manual device assignment (the device tick column + its heading action).
      deviceAppliesSet: deviceAppliesSet, assignAllShownPlan: assignAllShownPlan,
      // BULK-4: bulk relevance / bulk decision (one shared tick column).
      valueAllShownPlan: valueAllShownPlan,
      computeAppliesTo: computeAppliesTo, countIncomplete: countIncomplete,
      filterSortRows: filterSortRows, relevanceViewFilter: relevanceViewFilter,
      applyAllShownPlan: applyAllShownPlan,
      // FIL-1: per-column value filters.
      filterableColumns: filterableColumns, colFilterPredicate: colFilterPredicate,
      FILTER_NONE: FILTER_NONE,
      // SORT-1: the three-state column sort (ascending → descending → off).
      sortKeyOf: sortKeyOf, nextSort: nextSort, SORT_NONE: SORT_NONE
    };
  })(App);
