  /* =============================================================================
   * MODULE: App.util.dom
   * PURPOSE: Thin DOM helpers + the download primitive. This is the ONLY util that
   *          touches the DOM / FileReader / downloads (spec §4.1, §7).
   * PURITY:  NOT pure (UI/IO) — kept tiny and dumb.
   * DEPENDS: (none)
   * INVARIANTS: download() uses Blob + object URL + <a download> (file://-safe);
   *             readFileText() resolves with text via FileReader (never fetch).
   * ============================================================================= */
  (function (App) {
    'use strict';

    /** Replace an element's children with the given HTML string. */
    function mount(elOrId, html) {
      var node = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      node.innerHTML = html;
      return node;
    }

    /** Remove all children of a node. */
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    /**
     * Delegated event binding helper.
     * @param {Element} root
     * @param {string} type
     * @param {string} selector
     * @param {(e:Event, matched:Element)=>void} handler
     */
    function on(root, type, selector, handler) {
      root.addEventListener(type, function (e) {
        var t = e.target;
        while (t && t !== root) {
          if (t.matches && t.matches(selector)) { handler(e, t); return; }
          t = t.parentNode;
        }
      });
    }

    /**
     * Trigger a browser download of a Blob under file://.
     * @param {Blob} blob
     * @param {string} filename
     * @returns {void}
     */
    function download(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick so the download has begun.
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /**
     * Read a File object to text via FileReader (no fetch; file://-safe).
     * @param {File} file
     * @returns {Promise<string>}
     */
    function readFileText(file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { reject(fr.error || new Error('read failed')); };
        fr.readAsText(file);
      });
    }

    App.util = App.util || {};
    App.util.dom = { mount: mount, clear: clear, on: on, download: download, readFileText: readFileText };
  })(App);
