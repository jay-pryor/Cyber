  /* =============================================================================
   * MODULE: App.valueFormats  — v2.1 (VF-1…VF-8)
   * PURPOSE: Declare and enforce the SHAPE a decision value must take, so a free-text
   *          box stops being the answer to every question. Four built-in kinds
   *          (bool / number / text / string list) need no configuration; a project may
   *          also define NAMED, REUSABLE custom formats — most importantly `options`,
   *          a closed set of allowed strings each carrying a description of what it
   *          does (e.g. `enable_both` → "Both SIM slots active"). Formats are a
   *          catalogue + a per-item reference, exactly like controls/controlRefs, so
   *          two keys that share a vocabulary (nr5gModeStateSimSlot0/1) share one
   *          definition instead of re-entering it.
   * PURITY:  pure — no DOM, no IO, no store access. Callers pass the project in.
   * DEPENDS: App.util.stable
   * INVARIANTS:
   *   * A format is ADVISORY about the editor and BINDING about validity: a value that
   *     does not satisfy its format fails validation, so the item is not complete and
   *     the device cannot reach ready (the answer to "what does 'required' mean").
   *   * Never blocks LOADING. An unresolvable formatRef degrades to the inferred
   *     built-in, so a project whose format was deleted still opens and still works.
   *   * `parseInput`/`display` are exact inverses for every kind, so an editor round
   *     trip cannot silently change a value.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var stable = App.util.stable.stableStringify;

    /**
     * The built-in kinds. `id` doubles as the value stored in `item.format`, so a
     * built-in never needs a catalogue entry. Order is the order shown in the picker.
     */
    var BUILTINS = [
      { id: 'bool',        name: 'Boolean (true/false)', kind: 'bool',        builtin: true, hint: 'Exactly true or false.' },
      { id: 'number',      name: 'Number',               kind: 'number',      builtin: true, hint: 'A numeric value, e.g. 1500.' },
      { id: 'string',      name: 'Text',                 kind: 'string',      builtin: true, hint: 'Any text. An empty box is a real value (a blank string).' },
      { id: 'stringArray', name: 'String list',          kind: 'stringArray', builtin: true, hint: 'A list of strings, one per line. An empty box is an empty list.' },
      // The escape hatch, and the pre-format behaviour: edit the raw JSON. Used
      // automatically for any leaf the four friendly kinds cannot represent without
      // changing its JSON type (e.g. an array of numbers), so type fidelity — which the
      // whole tactical rebuild depends on — is never silently traded for a nicer editor.
      { id: 'json',        name: 'JSON value (as captured)', kind: 'json',    builtin: true, hint: 'The raw JSON value. Used when a leaf cannot be edited as one of the simpler kinds without changing its type.' }
    ];
    var BUILTIN_BY_ID = {};
    BUILTINS.forEach(function (b) { BUILTIN_BY_ID[b.id] = b; });

    /** The kinds a CUSTOM format may declare. 'options' is the described-enum case. */
    var CUSTOM_KINDS = [
      { id: 'options', label: 'Custom options', hint: 'A closed list of allowed values, each with a description.' },
      { id: 'number',  label: 'Number',         hint: 'A number, optionally bounded by min/max.' },
      { id: 'string',  label: 'Text',           hint: 'Free text, optionally matched against a pattern.' },
      { id: 'stringArray', label: 'String list', hint: 'A list of strings, one per line.' }
    ];

    /**
     * The captured JS type of a leaf → the built-in that fits it. This is what an item
     * with no explicit format uses, so the 106 booleans, 12 string lists and 7 numbers
     * in a real Knox capture get the right editor with zero configuration (VF-2).
     *
     * NOTE the tactical flattener reports numbers as `int`/`float` (it distinguishes
     * them for JSON-type fidelity), not `number` — both map to the numeric editor.
     * @param {string} capturedType  'bool'|'int'|'float'|'number'|'array'|'string'|'null'
     * @returns {string} a built-in format id
     */
    function inferId(capturedType, capturedValue) {
      if (capturedType === 'bool') return 'bool';
      if (capturedType === 'int' || capturedType === 'float' || capturedType === 'number') return 'number';
      if (capturedType === 'array') {
        // A list of strings (or an empty one) gets the friendly one-per-line editor.
        // Anything else — [1,2,3], [true,false] — would come back as strings through a
        // text editor and change the emitted JSON, so it stays raw JSON.
        if (!Array.isArray(capturedValue)) return 'stringArray';
        return capturedValue.every(function (v) { return typeof v === 'string'; }) ? 'stringArray' : 'json';
      }
      if (capturedType === 'null') return 'json';
      // FW-1: a captured leaf may now BE a JSON structure — a list of objects, which the
      // tactical flattener stops splitting into positional keys. Without this it fell
      // through to `string`, and the text editor would have stored the rule list back as
      // a STRING: a firewall that no longer loads, from an editor that looked fine.
      if (capturedType === 'json') return 'json';
      return 'string';
    }

    /** @param {Project} project @param {string} id @returns {Object|null} custom format */
    function findCustom(project, id) {
      if (!project || !id) return null;
      var list = project.valueFormats;
      if (!Array.isArray(list)) return null;
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
      return null;
    }

    /**
     * The format actually in force for one item: its explicit `format` if that resolves,
     * otherwise the built-in inferred from the captured leaf type. Always returns a
     * usable format — a dangling ref degrades rather than breaking the row.
     * @param {Project} project
     * @param {RegisterItem} item
     * @param {string} [capturedType]  from the adapter's capturedDefaults
     * @returns {{id, name, kind, builtin, options?, description?, hint?, resolved:boolean, inferred:boolean}}
     */
    function resolve(project, item, capturedType, capturedValue) {
      var want = item && item.format;
      if (want) {
        if (BUILTIN_BY_ID[want]) return copy(BUILTIN_BY_ID[want], true, false);
        var c = findCustom(project, want);
        if (c) {
          return {
            id: c.id, name: c.name || c.id, kind: c.kind || 'options', builtin: false,
            options: (c.options || []).slice(), description: c.description || '',
            min: c.min, max: c.max, pattern: c.pattern, resolved: true, inferred: false
          };
        }
        // Dangling: fall through to the inferred built-in, but SAY it is dangling so the
        // UI can flag it rather than pretending the item has no format.
        var fb = copy(BUILTIN_BY_ID[inferId(capturedType, capturedValue)], false, true);
        fb.danglingRef = want;
        return fb;
      }
      return copy(BUILTIN_BY_ID[inferId(capturedType, capturedValue)], true, true);
    }
    function copy(b, resolved, inferred) {
      return { id: b.id, name: b.name, kind: b.kind, builtin: true, hint: b.hint, resolved: resolved, inferred: inferred };
    }

    /**
     * Does `value` satisfy `fmt`? Returns [] when it does.
     * @param {Object} fmt  from resolve()
     * @param {*} value     the decision's value (already a JS value, not editor text)
     * @param {string} [location]
     * @returns {Issue[]}
     */
    function validate(fmt, value, location) {
      function err(msg, fix) {
        return [{ category: 'validation', severity: 'error', message: msg, location: location || '', fix: fix }];
      }
      if (!fmt) return [];
      switch (fmt.kind) {
        case 'json':
          return []; // any JSON value is acceptable — this kind exists to preserve, not constrain
        case 'bool':
          if (typeof value !== 'boolean') return err('Value must be true or false.', 'Pick true or false.');
          return [];
        case 'number':
          if (typeof value !== 'number' || !isFinite(value)) return err('Value must be a number.', 'Enter a numeric value, e.g. 1500.');
          if (typeof fmt.min === 'number' && value < fmt.min) return err('Value must be at least ' + fmt.min + '.');
          if (typeof fmt.max === 'number' && value > fmt.max) return err('Value must be at most ' + fmt.max + '.');
          return [];
        case 'stringArray':
          if (!Array.isArray(value)) return err('Value must be a list of strings.', 'Enter one item per line.');
          for (var i = 0; i < value.length; i++) {
            if (typeof value[i] !== 'string') return err('List entry ' + (i + 1) + ' must be text.');
          }
          return [];
        case 'options':
          var allowed = (fmt.options || []).map(function (o) { return o.value; });
          if (!allowed.length) return []; // a format with no options yet constrains nothing
          if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
            return err('Value must be one of: ' + allowed.join(', ') + '.', 'Pick one of the allowed options.');
          }
          return [];
        case 'string':
        default:
          if (typeof value !== 'string') return err('Value must be text.');
          if (fmt.pattern) {
            var re; try { re = new RegExp(fmt.pattern); } catch (e) { return []; } // a bad pattern must not brick the item
            if (!re.test(value)) return err('Value does not match the required pattern ' + fmt.pattern + '.');
          }
          return [];
      }
    }

    /**
     * Render a stored value as the text an editor shows. Inverse of parseInput.
     * @param {Object} fmt @param {*} value @returns {string}
     */
    function display(fmt, value) {
      if (value === undefined || value === null) return '';
      var kind = fmt ? fmt.kind : 'string';
      if (kind === 'json') return typeof value === 'string' ? value : stable(value);
      if (kind === 'stringArray') {
        return Array.isArray(value) ? value.join('\n') : String(value);
      }
      if (kind === 'bool') return value === true ? 'true' : value === false ? 'false' : '';
      if (kind === 'number') return typeof value === 'number' ? String(value) : String(value);
      if (typeof value === 'string') return value;
      return stable(value);
    }

    /**
     * Turn editor text into the stored JS value for this format. Inverse of display.
     * `blank` distinguishes the two meanings an empty box can have per kind:
     *   text        -> '' (a real blank value, review-16 #1)
     *   string list -> [] (a real empty list — a dozen Knox whitelists are exactly this)
     *   bool/number/options -> UNDECIDED (there is nothing sensible to mean)
     * @param {Object} fmt @param {string} raw
     * @returns {{ok:boolean, value?:*, undecided?:boolean, issues:Issue[]}}
     */
    function parseInput(fmt, raw) {
      var kind = fmt ? fmt.kind : 'string';
      var text = raw == null ? '' : String(raw);
      var trimmed = text.trim();
      if (kind === 'json') {
        if (trimmed === '') return { ok: true, undecided: true, issues: [] };
        try { return { ok: true, value: JSON.parse(trimmed), issues: [] }; }
        catch (e) {
          return { ok: false, issues: [{ category: 'validation', severity: 'error',
            message: 'Value must be valid JSON: ' + e.message, location: '', fix: 'Check the brackets, commas and quotes.' }] };
        }
      }
      if (kind === 'bool') {
        if (trimmed === '') return { ok: true, undecided: true, issues: [] };
        if (trimmed === 'true') return { ok: true, value: true, issues: [] };
        if (trimmed === 'false') return { ok: true, value: false, issues: [] };
        return { ok: false, issues: validate(fmt, trimmed) };
      }
      if (kind === 'number') {
        if (trimmed === '') return { ok: true, undecided: true, issues: [] };
        var n = Number(trimmed);
        if (trimmed === '' || isNaN(n) || !isFinite(n)) return { ok: false, issues: validate(fmt, trimmed) };
        var iss = validate(fmt, n);
        return iss.length ? { ok: false, issues: iss } : { ok: true, value: n, issues: [] };
      }
      if (kind === 'stringArray') {
        // One entry per line; blank lines dropped so a trailing newline is not an entry.
        var arr = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l !== ''; });
        return { ok: true, value: arr, issues: [] };
      }
      if (kind === 'options') {
        if (trimmed === '') return { ok: true, undecided: true, issues: [] };
        var iss2 = validate(fmt, trimmed);
        return iss2.length ? { ok: false, issues: iss2 } : { ok: true, value: trimmed, issues: [] };
      }
      // text: an empty box is a REAL blank value (review-16 #1), never "undecided".
      var iss3 = validate(fmt, text);
      return iss3.length ? { ok: false, issues: iss3 } : { ok: true, value: text, issues: [] };
    }

    /**
     * Every format offered by the picker for one project: the built-ins, then the
     * project's custom formats sorted by name.
     * @param {Project} project @returns {Object[]}
     */
    function list(project) {
      var custom = ((project && project.valueFormats) || []).slice().sort(function (a, b) {
        var an = (a.name || a.id), bn = (b.name || b.id);
        return an < bn ? -1 : an > bn ? 1 : 0;
      }).map(function (c) {
        return { id: c.id, name: c.name || c.id, kind: c.kind || 'options', builtin: false,
                 options: (c.options || []).slice(), description: c.description || '' };
      });
      return BUILTINS.map(function (b) { return copy(b, true, false); }).concat(custom);
    }

    /** How many register items reference this format id (for the manager + delete guard). */
    function usageCount(project, formatId) {
      var n = 0;
      Object.keys((project && project.items) || {}).forEach(function (dsId) {
        (project.items[dsId] || []).forEach(function (it) { if (it && it.format === formatId) n++; });
      });
      return n;
    }

    /** The description attached to one allowed option value ('' when none/not an enum). */
    function optionDescription(fmt, value) {
      if (!fmt || fmt.kind !== 'options') return '';
      var o = (fmt.options || []).filter(function (x) { return x.value === value; })[0];
      return (o && o.description) || '';
    }

    App.valueFormats = {
      BUILTINS: BUILTINS, CUSTOM_KINDS: CUSTOM_KINDS,
      inferId: inferId, resolve: resolve, validate: validate,
      display: display, parseInput: parseInput, list: list,
      usageCount: usageCount, optionDescription: optionDescription, findCustom: findCustom
    };
  })(App);
