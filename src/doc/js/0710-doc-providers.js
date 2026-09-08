  /* =============================================================================
   * MODULE: App.docProviders — the declarative half of the section contract
   * PURPOSE: Turn a section PROVIDER — a declaration of rows, a key column and
   *          columns — into rendered markdown, so a host that only wants a table
   *          does not have to write the code that draws one. A provider may still
   *          supply render() for anything a table cannot express.
   * PURITY:  pure. No DOM, no I/O, no clock.
   * DEPENDS: App.report
   * INVARIANTS: renderSection is the ONLY path from a provider to markdown, so a
   *             declared section and a hand-rendered one cannot come to disagree
   *             about captioning, styling or column widths.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * @param {Object} provider  a section provider: {label, keyColumn, columns,
     *                           groups?, render?}
     * @param {Array}  rows      the rows this section is to show
     * @param {Object} ctx       render context, passed to every column getter
     * @param {Object} opts      caption / style / width options from the block
     * @returns {{body: string, children: Array}}
     */
    function renderSection(provider, rows, ctx, opts) {
      if (!provider) return { body: '', children: [] };

      // The escape hatch, and the reason it stays: control coverage groups by control
      // and sub-groups by dataset, which buildSection's single grouping axis cannot
      // express. Declaring columns covers the ordinary case, not every case.
      if (typeof provider.render === 'function') {
        return normalise(provider.render(rows || [], ctx || {}, opts || {}));
      }

      var key = provider.keyColumn ||
        { id: '_key', label: 'Key', get: function (r) { return r.key; } };
      return normalise(App.report.buildSection(
        provider.label, key, provider.columns || [],
        rows || [], opts || {}, ctx || {}, provider.groups || null
      ));
    }

    /* buildSection already returns {body, children} — '' plus children when grouped,
     * a table plus [] when not. A hand-written render() is somebody else's code, so
     * it is held to the same shape here rather than everywhere downstream. */
    function normalise(out) {
      if (out == null) return { body: '', children: [] };
      if (typeof out === 'string') return { body: out, children: [] };
      return { body: out.body || '', children: out.children || [] };
    }

    App.docProviders = { renderSection: renderSection };
  }(App));
