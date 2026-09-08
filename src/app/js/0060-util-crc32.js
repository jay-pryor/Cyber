  /* =============================================================================
   * MODULE: App.util.crc32  — VENDORED CRC-32
   * PURPOSE: Standard table-based CRC-32 used by the ZIP writer (spec §17.C.2).
   * PURITY:  pure
   * DEPENDS: (none)
   * INVARIANTS: crc32 returns an unsigned 32-bit integer.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /* BEGIN VENDORED ----------------------------------------------------------
     * CRC-32 (IEEE 802.3), standard table-based. Public-domain reference.
     * Polynomial 0xEDB88320 (reflected). */
    var TABLE = (function () {
      var t = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        t[n] = c >>> 0;
      }
      return t;
    })();

    /**
     * CRC-32 of a byte array.
     * @param {Uint8Array|number[]} bytes
     * @returns {number} unsigned 32-bit
     */
    function crc32(bytes) {
      var crc = 0xFFFFFFFF;
      for (var i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ TABLE[(crc ^ bytes[i]) & 0xFF];
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    /* END VENDORED ----------------------------------------------------------- */

    App.util = App.util || {};
    App.util.crc32 = { crc32: crc32 };
  })(App);
