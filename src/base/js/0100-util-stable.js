  /* =============================================================================
   * MODULE: App.util.stable
   * PURPOSE: Deterministic JSON serialization (spec §8.6). The single canonical
   *          stringifier used for the project file, manifests, and tactical artifact.
   * PURITY:  pure
   * DEPENDS: (none)
   * INVARIANTS:
   *   * Object keys sorted ascending; undefined-valued keys omitted (JSON parity).
   *   * Array ORDER IS PRESERVED — callers that need item-sorting (e.g. project
   *     RegisterItem arrays) sort BEFORE calling. This preserves tactical template
   *     array order, which is semantically significant (spec §8.2).
   *   * 2-space indent, '\n' newlines, no trailing whitespace.
   * ============================================================================= */
  (function (App) {
    'use strict';

    function ser(v, indent) {
      if (v === null || v === undefined) return 'null';
      var t = typeof v;
      if (t === 'number') return isFinite(v) ? String(v) : 'null';
      if (t === 'boolean') return v ? 'true' : 'false';
      if (t === 'string') return JSON.stringify(v); // delegates correct string escaping
      var ni = indent + '  ';
      if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        var parts = [];
        for (var i = 0; i < v.length; i++) parts.push(ni + ser(v[i], ni));
        return '[\n' + parts.join(',\n') + '\n' + indent + ']';
      }
      if (t === 'object') {
        var keys = [];
        for (var k in v) {
          if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
          if (v[k] === undefined) continue; // mirror JSON.stringify: drop undefined values
          keys.push(k);
        }
        keys.sort();
        if (keys.length === 0) return '{}';
        var oparts = [];
        for (var j = 0; j < keys.length; j++) {
          oparts.push(ni + JSON.stringify(keys[j]) + ': ' + ser(v[keys[j]], ni));
        }
        return '{\n' + oparts.join(',\n') + '\n' + indent + '}';
      }
      return 'null'; // functions/symbols -> null (JSON parity in arrays)
    }

    /**
     * Deterministically stringify a JSON-compatible value.
     * @param {*} value
     * @returns {string}
     * @example App.util.stable.stableStringify({b:1,a:2}) // '{\n  "a": 2,\n  "b": 1\n}'
     */
    function stableStringify(value) { return ser(value, ''); }

    App.util = App.util || {};
    App.util.stable = { stableStringify: stableStringify };
  })(App);
