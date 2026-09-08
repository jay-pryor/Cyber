  /* =============================================================================
   * MODULE: App.docTemplates  — TPL-1..TPL-4: templates in and out, on their own
   * PURPOSE: Export and import section templates, formatting profiles and whole
   *          report templates as standalone files, independently of the project.
   *          Owns the merge rule: an import ADDS, never replaces wholesale, and
   *          every collision is a decision the operator makes (TPL-3).
   * PURITY:  parse/validate/plan are pure; apply() writes through App.docStore.
   * DEPENDS: App.docHost (getState/clock), App.docFormat, App.docStore, App.util.stable
   * INVARIANTS: importing never removes something the project already had. The worst
   *             an import can do to existing work is overwrite an entry the operator
   *             explicitly chose to replace.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* -------------------------------------------------------------------------
     * TPL-3: what counts as a conflict, and why it is the NAME.
     *
     * Ids are minted per project (docStore.nextId), so two projects that each added
     * three section templates both hold tpl1..tpl3 describing entirely different
     * things. Matching on id would therefore report collisions that are not real and
     * miss the one that is: two templates the operator would both call "Annex A".
     *
     * So conflicts are detected on the trimmed, case-folded NAME — the thing the
     * operator actually recognises — and ids are re-minted on the way in whenever
     * they would collide. Choosing "replace" keeps the EXISTING id and overwrites its
     * contents, because a formatting profile's id is what `report.formatId` points
     * at: replacing a profile must not silently switch the document back to Standard.
     * ---------------------------------------------------------------------- */

    var KINDS = {
      sections: {
        kind: 'ch-config-tool/section-templates',
        label: 'Section templates',
        file: 'section-templates',
        bag: 'sectionTemplates'
      },
      formats: {
        kind: 'ch-config-tool/formatting-profiles',
        label: 'Formatting profiles',
        file: 'formatting-profiles',
        bag: 'formats'
      },
      reports: {
        kind: 'ch-config-tool/report-templates',
        label: 'Report templates',
        file: 'report-templates',
        bag: 'reportTemplates'
      }
    };

    var FORMAT_VERSION = 1;

    function issue(sev, message, location) {
      return { category: 'validation', severity: sev, message: message, location: location };
    }
    function norm(name) { return String(name == null ? '' : name).trim().toLowerCase(); }
    function held(project, kindKey) {
      return ((project && project.report && project.report[KINDS[kindKey].bag]) || []).slice();
    }

    // ---- TPL-1: export -------------------------------------------------------

    /**
     * @param {Project} project @param {'sections'|'formats'|'reports'} kindKey
     * @param {string[]} [ids]  a subset; every entry when omitted
     * @returns {{name:string, text:string, count:number}}
     */
    function exportFile(project, kindKey, ids) {
      var K = KINDS[kindKey];
      var all = held(project, kindKey);
      var items = ids && ids.length ? all.filter(function (x) { return ids.indexOf(x.id) !== -1; }) : all;
      var payload = {
        kind: K.kind,
        version: FORMAT_VERSION,
        exportedUtc: App.docHost.get().clock.nowIso(),
        items: JSON.parse(JSON.stringify(items))
      };
      return {
        // stableStringify so two exports of the same templates are byte-identical
        // and can be diffed or checked into a repo (DOD-7's spirit, applied here).
        text: App.util.stable.stableStringify(payload),
        name: K.file + '.json',
        count: items.length
      };
    }

    // ---- TPL-2: parse + validate ---------------------------------------------

    function validParts(parts, loc, issues) {
      if (parts === undefined) return true;
      if (!Array.isArray(parts)) { issues.push(issue('error', 'parts must be an array.', loc)); return false; }
      var ok = true;
      parts.forEach(function (p, i) {
        var l = loc + '.parts[' + i + ']';
        if (!p || typeof p !== 'object') { issues.push(issue('error', 'A part must be an object.', l)); ok = false; return; }
        if (['para', 'table', 'rule', 'pagebreak'].indexOf(p.kind) === -1) {
          issues.push(issue('error', 'Unknown part kind "' + p.kind + '".', l)); ok = false; return;
        }
        if (p.kind === 'para' && p.text !== undefined && typeof p.text !== 'string') {
          issues.push(issue('error', 'A paragraph\'s text must be a string.', l)); ok = false;
        }
        if (p.kind === 'table') {
          if (!Array.isArray(p.header) || !p.header.length) { issues.push(issue('error', 'A table needs a header row.', l)); ok = false; }
          if (p.rows !== undefined && !Array.isArray(p.rows)) { issues.push(issue('error', 'A table\'s rows must be an array.', l)); ok = false; }
        }
      });
      return ok;
    }

    /** Per-kind structural check. Returns the cleaned item, or null when unusable. */
    function validItem(kindKey, raw, loc, issues) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push(issue('error', 'Each entry must be an object.', loc)); return null; }
      if (!raw.name || typeof raw.name !== 'string') { issues.push(issue('error', 'Each entry needs a name.', loc)); return null; }
      if (kindKey === 'formats') {
        var v = App.docFormat.validate(Object.assign({ id: raw.id || 'imported' }, raw), loc);
        v.issues.forEach(function (i) { issues.push(i); });
        return v.ok ? v.profile : null;
      }
      if (kindKey === 'sections') {
        if (!validParts(raw.parts, loc, issues)) return null;
        return { id: String(raw.id || ''), name: String(raw.name), title: String(raw.title || ''), parts: raw.parts || [] };
      }
      // reports
      if (raw.order !== undefined && !Array.isArray(raw.order)) { issues.push(issue('error', 'order must be an array.', loc)); return null; }
      if (raw.sections !== undefined && !Array.isArray(raw.sections)) { issues.push(issue('error', 'sections must be an array.', loc)); return null; }
      var sectionsOk = true;
      (raw.sections || []).forEach(function (s, i) {
        if (!s || typeof s !== 'object') { issues.push(issue('error', 'A section must be an object.', loc + '.sections[' + i + ']')); sectionsOk = false; return; }
        if (!validParts(s.parts, loc + '.sections[' + i + ']', issues)) sectionsOk = false;
      });
      if (!sectionsOk) return null;
      var out = {
        id: String(raw.id || ''), name: String(raw.name),
        order: (raw.order || []).map(String),
        levels: (raw.levels && typeof raw.levels === 'object') ? raw.levels : {},
        sections: raw.sections || []
      };
      if (raw.format) {
        var fv = App.docFormat.validate(Object.assign({ id: 'standard', name: raw.name }, raw.format), loc + '.format');
        if (fv.ok) out.format = fv.profile; else fv.issues.forEach(function (i) { issues.push(i); });
      }
      return out;
    }

    /**
     * Parse an exported file.
     * @param {string} text @param {'sections'|'formats'|'reports'} [expectKind]
     * @returns {{ok:boolean, kindKey:?string, items:Object[], issues:Issue[]}}
     */
    function parseImport(text, expectKind) {
      var issues = [], data;
      try { data = JSON.parse(String(text || '')); }
      catch (e) { return { ok: false, kindKey: null, items: [], issues: [issue('error', 'Not valid JSON: ' + (e && e.message), 'file')] }; }
      if (!data || typeof data !== 'object') return { ok: false, kindKey: null, items: [], issues: [issue('error', 'The file must contain an object.', 'file')] };

      var kindKey = Object.keys(KINDS).filter(function (k) { return KINDS[k].kind === data.kind; })[0] || null;
      if (!kindKey) {
        return { ok: false, kindKey: null, items: [], issues: [issue('error', 'Unrecognised file — "kind" is "' + data.kind + '". Expected one of: ' +
          Object.keys(KINDS).map(function (k) { return KINDS[k].kind; }).join(', ') + '.', 'kind')] };
      }
      if (expectKind && kindKey !== expectKind) {
        return { ok: false, kindKey: kindKey, items: [], issues: [issue('error', 'This is a ' + KINDS[kindKey].label.toLowerCase() +
          ' file. Import it from the ' + KINDS[kindKey].label + ' list instead.', 'kind')] };
      }
      if (!Array.isArray(data.items)) return { ok: false, kindKey: kindKey, items: [], issues: [issue('error', 'The file has no "items" array.', 'items')] };

      var items = [];
      data.items.forEach(function (raw, i) {
        var cleaned = validItem(kindKey, raw, 'items[' + i + ']', issues);
        if (cleaned) items.push(cleaned);
      });
      // A file with SOME usable entries still imports — the unusable ones are reported
      // rather than silently dropped, and the rest are not held hostage to them.
      return { ok: items.length > 0, kindKey: kindKey, items: items, issues: issues };
    }

    // ---- TPL-3: plan the merge -----------------------------------------------

    /**
     * Work out what an import would do, without doing it.
     * @returns {{kindKey:string, additions:Object[],
     *            conflicts:Array<{incoming:Object, existingId:string, existingName:string}>}}
     */
    function plan(project, kindKey, items) {
      var existing = held(project, kindKey);
      var byName = {};
      existing.forEach(function (x) { byName[norm(x.name)] = x; });
      var additions = [], conflicts = [];
      items.forEach(function (inc) {
        var hit = byName[norm(inc.name)];
        if (hit) conflicts.push({ incoming: inc, existingId: hit.id, existingName: hit.name });
        else additions.push(inc);
      });
      return { kindKey: kindKey, additions: additions, conflicts: conflicts };
    }

    /**
     * TPL-4: carry out a planned import.
     *
     * @param {{kindKey:string, additions:Object[], conflicts:Array}} pl
     * @param {Object<string,'replace'|'keep'>} decisions  keyed by the incoming NAME
     *        (normalised). A conflict with no decision defaults to 'keep' — silence
     *        must never overwrite the operator's own work.
     * @returns {{ok:boolean, added:number, replaced:number, kept:number, issues:Issue[]}}
     */
    function apply(pl, decisions) {
      if (!App.docHost.get().getState()) return { ok: false, added: 0, replaced: 0, kept: 0, issues: [issue('error', 'No project loaded.', 'project')] };
      decisions = decisions || {};
      var K = KINDS[pl.kindKey], bagName = K.bag;
      var added = 0, replaced = 0, kept = 0;

      App.docHost.get().commit(function (p) {
        p.report = p.report || {};
        var list = p.report[bagName] = (p.report[bagName] || []);

        function freshId(prefix) {
          var id = App.docStore.nextId(prefix, list);
          list.push({ id: id });                 // reserve, so a batch cannot collide
          list.pop();
          return id;
        }
        var prefix = pl.kindKey === 'formats' ? 'fmt' : pl.kindKey === 'sections' ? 'tpl' : 'rpt';

        pl.additions.forEach(function (inc) {
          var copy = JSON.parse(JSON.stringify(inc));
          var clash = list.some(function (x) { return x.id === copy.id; });
          if (!copy.id || clash) copy.id = freshId(prefix);
          list.push(copy);
          added++;
        });

        pl.conflicts.forEach(function (c) {
          if (decisions[norm(c.incoming.name)] !== 'replace') { kept++; return; }
          var copy = JSON.parse(JSON.stringify(c.incoming));
          // The EXISTING id is kept: report.formatId (and anything else pointing at
          // this entry) must survive a replacement.
          copy.id = c.existingId;
          var i = list.map(function (x) { return x.id; }).indexOf(c.existingId);
          if (i === -1) list.push(copy); else list[i] = copy;
          replaced++;
        });

        if (!list.length) delete p.report[bagName];
        if (!Object.keys(p.report).length) delete p.report;
      });

      return { ok: true, added: added, replaced: replaced, kept: kept, issues: [] };
    }

    App.docTemplates = {
      KINDS: KINDS, FORMAT_VERSION: FORMAT_VERSION,
      exportFile: exportFile, parseImport: parseImport, plan: plan, apply: apply,
      _norm: norm
    };
  })(App);
