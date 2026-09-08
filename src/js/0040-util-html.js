  /* =============================================================================
   * MODULE: App.util.html
   * PURPOSE: HTML escaping and tiny string builders. ALL data-derived text written
   *          into HTML (tables, reports, generated docs) MUST pass through esc()
   *          to prevent markup corruption / injection (spec §10.3, §13.4).
   * PURITY:  pure (string -> string; no DOM)
   * DEPENDS: (none)
   * INVARIANTS: esc() is total over any input (coerces to string first).
   * ============================================================================= */
  (function (App) {
    'use strict';

    var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    /**
     * Escape text for safe insertion into HTML element content or quoted attributes.
     * @param {*} s  Coerced to string.
     * @returns {string}
     * @example App.util.html.esc('<a>') // '&lt;a&gt;'
     */
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch]; });
    }

    /**
     * Escape a value for use inside a double-quoted HTML attribute.
     * (Same as esc; provided as an explicit, intention-revealing alias.)
     * @param {*} s
     * @returns {string}
     */
    function attr(s) { return esc(s); }

    /**
     * Build an HTML element string from tag, attributes, and children.
     * Attribute values are escaped; children are NOT escaped (callers pass
     * already-escaped strings or nested el() output).
     * @param {string} tag
     * @param {Object<string,*>} [attrs]
     * @param {(string|string[])} [kids]
     * @returns {string}
     * @example App.util.html.el('span', {class:'x'}, esc(userText))
     */
    function el(tag, attrs, kids) {
      var a = '';
      if (attrs) {
        for (var k in attrs) {
          if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
          var v = attrs[k];
          if (v == null || v === false) continue;
          if (v === true) { a += ' ' + k; continue; }
          a += ' ' + k + '="' + attr(v) + '"';
        }
      }
      var inner = kids == null ? '' : (Array.isArray(kids) ? kids.join('') : kids);
      // Void elements get no closing tag.
      if (/^(br|hr|img|input|meta|link)$/i.test(tag)) return '<' + tag + a + '>';
      return '<' + tag + a + '>' + inner + '</' + tag + '>';
    }

    App.util = App.util || {};
    App.util.html = { esc: esc, attr: attr, el: el };
  })(App);
