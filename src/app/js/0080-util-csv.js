  /* =============================================================================
   * MODULE: App.util.csv
   * PURPOSE: Deterministic CSV export of a table (spec §7, §11.1 Export CSVs).
   * PURITY:  pure (string output)
   * DEPENDS: (none)
   * INVARIANTS: RFC-4180-style quoting; \r\n row endings; stable column order.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * Quote a single CSV field if it contains comma, quote, CR or LF.
     * @param {*} v
     * @returns {string}
     */
    function csvField(v) {
      var s = String(v == null ? '' : v);
      if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    /**
     * Render rows to CSV using the given columns.
     * @param {Object[]} rows
     * @param {{key:string,label:string,get?:(row:Object)=>*}[]} columns
     * @returns {string}
     * @example App.util.csv.toCsv([{a:1}], [{key:'a',label:'A'}]) // 'A\r\n1'
     */
    function toCsv(rows, columns) {
      var lines = [];
      lines.push(columns.map(function (c) { return csvField(c.label); }).join(','));
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        lines.push(columns.map(function (c) {
          var val = c.get ? c.get(row) : row[c.key];
          return csvField(val);
        }).join(','));
      }
      return lines.join('\r\n');
    }

    /**
     * Minimal RFC-4180 CSV parser (quotes, escaped "", embedded commas/newlines).
     * @param {string} text
     * @returns {string[][]} rows of fields
     */
    function parseCsv(text) {
      var s = String(text), rows = [], row = [], field = '', i = 0, inQ = false, started = false;
      while (i < s.length) {
        var c = s[i];
        if (inQ) {
          if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
          field += c; i++; continue;
        }
        if (c === '"') { inQ = true; started = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; started = true; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; started = false; i++; continue; }
        field += c; started = true; i++;
      }
      if (started || field !== '' || row.length) { row.push(field); rows.push(row); }
      return rows;
    }

    App.util = App.util || {};
    App.util.csv = { toCsv: toCsv, parseCsv: parseCsv };
  })(App);
