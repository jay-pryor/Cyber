  /* =============================================================================
   * MODULE: App.adapters.android
   * PURPOSE: The Android (ADB) dataset adapters (spec Appendix B) + the two-layer
   *          shell-escaping helpers + tactical path/flatten/rebuild utilities.
   *          ALL Android/format-specific knowledge lives here; the rest of the app
   *          is platform-blind (spec §5, §5.4). No literal dataset-id branching
   *          exists outside this file.
   * PURITY:  pure (parse/generate are pure functions over plain data; no DOM/IO)
   * DEPENDS: App.util.html (esc, for report fragments), App.util.stable
   * INVARIANTS:
   *   * Keys / package tokens are charset-restricted at parse so ONLY values ever
   *     need shell escaping (spec §9, Appendix B).
   *   * Every data-derived value sent to the device shell is quoted through BOTH
   *     the PowerShell and POSIX layers — total over arbitrary bytes.
   *   * Tactical preserves JSON types; arrays of scalars are whole leaves.
   * ============================================================================= */
  (function (App) {
    'use strict';

    var esc = App.util.html.esc;
    var stableStringify = App.util.stable.stableStringify;

    // ---- review-12 #4: OPTIONAL trailing assignment-CSV columns -----------------
    // The packages decision CSV accepts two further columns after its required ones:
    // "rationale" (free text → the item's Rationale box) and "relevance" (→ the
    // Security Relevance column). Either may be omitted, but they must appear in
    // this order and be named exactly.
    var OPTIONAL_ASSIGN_COLS = ['rationale', 'relevance'];

    /**
     * Validate a decision-CSV header that is `required` followed by 0..2 optional cols.
     * @param {string[]} header  trimmed header cells
     * @param {string[]} required
     * @returns {{ok:boolean, extras:string[], expected:string}}
     */
    function checkAssignHeader(header, required) {
      var out = { ok: false, extras: [], expected: required.join(',') + '[,' + OPTIONAL_ASSIGN_COLS.join('[,') + ']]' };
      if (!header || header.length < required.length || header.length > required.length + OPTIONAL_ASSIGN_COLS.length) return out;
      for (var i = 0; i < required.length; i++) if (header[i] !== required[i]) return out;
      for (var j = required.length; j < header.length; j++) {
        if (header[j] !== OPTIONAL_ASSIGN_COLS[j - required.length]) return out;
        out.extras.push(header[j]);
      }
      out.ok = true;
      return out;
    }

    /**
     * Read the optional trailing cells of a data row into an assignment `fields` patch.
     * A relevance cell is upper-cased and validated against the closed vocabulary;
     * an empty cell explicitly CLEARS the field.
     * @returns {{fields:Object, error:?string}}
     */
    function readOptionalAssignFields(row, firstOptionalIndex, extras) {
      var fields = {}, error = null;
      extras.forEach(function (name, n) {
        var raw = row[firstOptionalIndex + n];
        if (raw === undefined) return;                     // short row: column simply absent
        if (name === 'rationale') { fields.rationale = String(raw); return; }
        var rel = String(raw).trim().toUpperCase();
        // REL-1: a CSV written against the old vocabulary still imports — the retired
        // name is translated, exactly as it is when an older project file is loaded.
        if ((App.projectIo.RELEVANCE_RENAMES || {})[rel]) rel = App.projectIo.RELEVANCE_RENAMES[rel];
        if (rel !== '' && App.projectIo.RELEVANCE_OPTIONS.indexOf(rel) === -1) {
          error = 'Invalid relevance "' + String(raw).trim() + '" (expected empty, ' + App.projectIo.RELEVANCE_OPTIONS.join(', ') + ').';
          return;
        }
        fields.relevance = rel;
      });
      return { fields: fields, error: error };
    }

    /** Resolve an item's control ids to control titles via ctx.project.controls (§18.3). */
    function controlTitles(refs, ctx) {
      var by = {}; ((ctx && ctx.project && ctx.project.controls) || []).forEach(function (c) { by[c.id] = c.title; });
      return (refs || []).map(function (r) { return by[r] || r; }).join(', ');
    }

    // ---- Injection-safety: two-layer shell quoting (spec Appendix B, MUST) -----
    /**
     * PowerShell single-quoted literal: wrap in ' … ', double embedded single quotes.
     * @param {*} s @returns {string}
     */
    function psSingleQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
    /**
     * POSIX-shell single-quoted literal: wrap in ' … ', replace each ' with '\'' .
     * @param {*} s @returns {string}
     */
    function shSingleQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

    // ---- Tactical path helpers (spec §8.2) -------------------------------------
    /**
     * Parse a dotted/bracketed path into segments.
     * @param {string} path e.g. 'radios[0].mode'
     * @returns {Array<{key?:string,index?:number}>}
     */
    function parsePath(path) {
      var segs = [], re = /([^.\[\]]+)|\[(\d+)\]/g, m;
      while ((m = re.exec(path)) !== null) {
        if (m[2] !== undefined) segs.push({ index: parseInt(m[2], 10) });
        else segs.push({ key: m[1] });
      }
      return segs;
    }
    function segKey(s) { return s.key !== undefined ? s.key : s.index; }

    /** Set a value at a path within obj, creating intermediate containers. */
    function setAtPath(obj, segs, value) {
      var cur = obj;
      for (var i = 0; i < segs.length - 1; i++) {
        var k = segKey(segs[i]);
        if (cur[k] === undefined || cur[k] === null) cur[k] = (segs[i + 1].index !== undefined) ? [] : {};
        cur = cur[k];
      }
      cur[segKey(segs[segs.length - 1])] = value;
    }
    /** Read a value at a path (undefined if any segment is missing). */
    function getAtPath(obj, segs) {
      var cur = obj;
      for (var i = 0; i < segs.length; i++) { if (cur == null) return undefined; cur = cur[segKey(segs[i])]; }
      return cur;
    }
    // A `policyList` (spec/review-3 #3) is an array of {name, checked} objects where
    // `name` is the policy identity and `checked` is its (boolean) setting.
    function isPolicyObj(o) { return o && typeof o === 'object' && !Array.isArray(o) && ('name' in o) && ('checked' in o); }
    function isPolicyArray(arr) { return Array.isArray(arr) && arr.length > 0 && arr.every(isPolicyObj); }

    // ---- imsSettings: a per-SIM-slot toggle that is OPTIONAL in the upload -------
    // (review-17 #4) Knox tactical exports omit `imsSettings` unless it has been
    // touched, but the per-slot IMS toggle is still a real, decidable setting. So:
    //  - the PARSER injects the default block when the uploaded document has no
    //    `imsSettings` at all (so it is optional whether the JSON carries it), and
    //  - the FLATTENER keys it by SLOT, not by array index:
    //      imsSettings.simSlot0.enabled
    //    because `simSlotId` is the slot's identity, not a decision — exactly as
    //    `policyList`'s `name` is (review-3 #3). Rebuild mirrors both rules and
    //    re-creates the block on a template that predates it.
    var IMS_KEY = 'imsSettings';
    /** `[<base>.]imsSettings.simSlot<N>.enabled` -> [ , base, N ] */
    var IMS_KEY_RE = /^(?:(.*)\.)?imsSettings\.simSlot(\d+)\.enabled$/;
    /** The Samsung default: both SIM slots present, IMS disabled. */
    function imsDefaultBlock() { return [{ enabled: false, simSlotId: 0 }, { enabled: false, simSlotId: 1 }]; }
    function isImsObj(o) {
      return o && typeof o === 'object' && !Array.isArray(o) &&
        ('enabled' in o) && typeof o.simSlotId === 'number';
    }
    function isImsArray(arr) { return Array.isArray(arr) && arr.length > 0 && arr.every(isImsObj); }
    /**
     * Add the default `imsSettings` block to a tactical document that omits it.
     * A document that already carries the key is left alone — whatever its shape —
     * so a Knox export is never second-guessed.
     * @param {*} doc mutated in place
     * @returns {boolean} true if the default block was injected
     */
    function ensureImsSettings(doc) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
      if (Object.prototype.hasOwnProperty.call(doc, IMS_KEY)) return false;
      doc[IMS_KEY] = imsDefaultBlock();
      return true;
    }

    // ---- firewallRules: ONE decision, however many rules there are (FW-1) --------
    // A firewall rule is an OBJECT, and a list of them used to flatten positionally —
    // `firewallRules[0].addressType`, `firewallRules[0].direction`, … nine keys per
    // rule. Three things were wrong with that. The rule's identity became its position,
    // so inserting a rule renamed every rule after it. The key set depended on how many
    // rules a given capture happened to have, so two devices with different rule counts
    // had different applicable keys and a decisions import was refused. And no single
    // field of a rule is a decision anyone makes — you decide the RULE SET.
    //
    // So the whole list is one leaf, typed `json`, whose value is the complete set of
    // rules to apply. The count then genuinely does not matter: zero rules and nine
    // rules are the same one key, and rebuild writes the array back wholesale.
    var FIREWALL_KEY = 'firewallRules';
    /** `[<base>.]firewallRules` — the leaf whose value is the whole rule list. */
    function isFirewallKey(key) {
      return key === FIREWALL_KEY || (typeof key === 'string' && key.length > FIREWALL_KEY.length &&
        key.slice(-(FIREWALL_KEY.length + 1)) === '.' + FIREWALL_KEY);
    }

    // ---- usbInterfaces: an EXHAUSTIVE list of host interfaces (USB-1) ------------
    // The USB host interface block is all-or-nothing in a Knox export: either every
    // interface class is listed or the block is absent. But "absent" and "listed as
    // false" are the same posture and must not be two different registers, and a
    // partially-written block would leave interfaces silently undecided — which for a
    // deny-list is the dangerous direction to be silent in. So wherever the block
    // exists, it is completed to the full set (missing classes default to `false`,
    // the closed position). A document with no block at all is left alone: inventing
    // a USB policy Knox never exported would be putting words in the device's mouth.
    var USB_KEY = 'usbInterfaces';
    /** The Knox USB host interface classes, in export order. */
    var USB_CODES = ['AUD', 'CDC', 'COM', 'HID', 'MAS', 'MIS', 'STI', 'VEN', 'WIR'];
    /**
     * Complete every `usbInterfaces` block in a document to the full class list.
     * @param {*} doc mutated in place
     * @returns {string[]} the leaf paths that were added (empty when nothing to do)
     */
    function ensureUsbInterfaces(doc) {
      var added = [];
      (function walk(node, path) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], path + '[' + i + ']'); return; }
        Object.keys(node).forEach(function (k) {
          var v = node[k], childPath = path ? path + '.' + k : k;
          if (k === USB_KEY && v && typeof v === 'object' && !Array.isArray(v)) {
            USB_CODES.forEach(function (code) {
              if (!Object.prototype.hasOwnProperty.call(v, code)) { v[code] = false; added.push(childPath + '.' + code); }
            });
            return;   // its members are the leaves; nothing below them to walk
          }
          walk(v, childPath);
        });
      })(doc, '');
      return added;
    }

    function isScalar(v) { return v === null || typeof v !== 'object'; }
    function jsType(v) {
      if (v === null) return 'null';
      if (typeof v === 'boolean') return 'bool';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
      return 'string';
    }

    /**
     * Flatten a tactical JSON document into leaf items (spec §8.2).
     * Rules: objects recurse (.key); arrays whose elements are ALL scalars (or
     * empty) are WHOLE leaves; arrays containing objects/arrays recurse ([i]);
     * scalars (incl. null) are leaves. JSON types are preserved.
     * @param {*} doc
     * @returns {Array<{key:string,value:*,type:string}>}
     */
    function flattenTactical(doc) {
      var leaves = [];
      (function walk(node, path) {
        if (isScalar(node)) { leaves.push({ key: path, value: node, type: jsType(node) }); return; }
        if (Array.isArray(node)) {
          // FW-1: a list of OBJECTS is one leaf, not one key per element per field.
          // Positional keys (`x[0].y`) made the element's index its identity, so the key
          // set depended on how many elements a capture happened to contain — which is
          // exactly what made firewall rules unusable across devices. `firewallRules` is
          // typed json even when EMPTY, so a device with no rules edits the same shape
          // as a device with nine.
          if (isFirewallKey(path)) { leaves.push({ key: path, value: node, type: 'json' }); return; }
          if (node.length === 0 || node.every(isScalar)) { leaves.push({ key: path, value: node, type: 'array' }); return; }
          leaves.push({ key: path, value: node, type: 'json' });
          return;
        }
        // plain object
        var keys = Object.keys(node);
        for (var j = 0; j < keys.length; j++) {
          var k = keys[j], childPath = path ? path + '.' + k : k;
          // policyList special-case (review-3 #3): one leaf per policy, keyed (for
          // STORAGE/ROUTING) by `…policyList.<name>` and valued by `checked` (e.g.
          // {name:'Disable Bluetooth', checked:false} -> key 'policyList.Disable
          // Bluetooth' = false). Rebuild mirrors this. The `policyList.` segment is a
          // stable internal identity; it is stripped for DISPLAY only via
          // `tactical.displayKey` (review-4 #1) so it never collides with sibling
          // keys nor breaks already-saved projects.
          if (k === 'policyList' && isPolicyArray(node[k])) {
            node[k].forEach(function (pol) { leaves.push({ key: childPath + '.' + pol.name, value: pol.checked, type: jsType(pol.checked) }); });
            continue;
          }
          // imsSettings special-case (review-17 #4): one leaf per SIM slot, keyed by
          // simSlotId and valued by `enabled`, so the slot id is never a decision.
          if (k === IMS_KEY && isImsArray(node[k])) {
            node[k].forEach(function (ims) {
              leaves.push({ key: childPath + '.simSlot' + ims.simSlotId + '.enabled', value: ims.enabled, type: jsType(ims.enabled) });
            });
            continue;
          }
          walk(node[k], childPath);
        }
      })(doc, '');
      return leaves;
    }

    /**
     * Strip the `policyList.` segment from a tactical key for DISPLAY only
     * (review-4 #1): `policyList.Disable Bluetooth` -> `Disable Bluetooth`, and a
     * nested `foo.policyList.Bar` -> `foo.Bar`. The STORED/routed key keeps the
     * segment, so this is purely cosmetic and never affects rebuild, storage, or
     * already-saved projects. Idempotent on keys without the segment.
     * @param {string} key
     * @returns {string}
     */
    function stripPolicyPrefix(key) {
      if (typeof key !== 'string') return key;
      if (key.indexOf('policyList.') === 0) return key.slice('policyList.'.length);
      var m = key.indexOf('.policyList.');
      if (m >= 0) return key.slice(0, m) + '.' + key.slice(m + '.policyList.'.length);
      return key;
    }

    /**
     * Rebuild a tactical document by applying decided values onto a deep clone of
     * the template (spec §8.2). Untouched keys/types/nesting/arrays are preserved.
     * @param {*} template
     * @param {RegisterItem[]} items  Only non-null decisions are applied.
     * @returns {*} the rebuilt document object
     */
    function rebuildTacticalDoc(template, items) {
      var doc = JSON.parse(JSON.stringify(template));
      items.forEach(function (it) {
        if (!it.decision || !Object.prototype.hasOwnProperty.call(it.decision, 'value')) return;
        // policyList items (review-3 #3): set the matching policy's `checked` by name.
        var arrPath = null, polName = null;
        if (it.key.indexOf('policyList.') === 0) { arrPath = 'policyList'; polName = it.key.slice('policyList.'.length); }
        else { var mk = it.key.indexOf('.policyList.'); if (mk >= 0) { arrPath = it.key.slice(0, mk) + '.policyList'; polName = it.key.slice(mk + '.policyList.'.length); } }
        if (arrPath !== null) {
          var arr = getAtPath(doc, parsePath(arrPath));
          if (Array.isArray(arr)) { var pol = arr.filter(function (p) { return p && p.name === polName; })[0]; if (pol) { pol.checked = it.decision.value; return; } }
        }
        // imsSettings items (review-17 #4): set the matching slot's `enabled`, creating
        // the block/slot when the template predates it (the key is optional on upload).
        var imsM = IMS_KEY_RE.exec(it.key);
        if (imsM) {
          var imsPath = imsM[1] ? imsM[1] + '.' + IMS_KEY : IMS_KEY;
          var slot = parseInt(imsM[2], 10);
          var imsArr = getAtPath(doc, parsePath(imsPath));
          if (!Array.isArray(imsArr)) { imsArr = []; setAtPath(doc, parsePath(imsPath), imsArr); }
          var ent = imsArr.filter(function (x) { return x && x.simSlotId === slot; })[0];
          if (ent) ent.enabled = it.decision.value;
          else {
            imsArr.push({ enabled: it.decision.value, simSlotId: slot });
            imsArr.sort(function (a, b) { return (a.simSlotId || 0) - (b.simSlotId || 0); });
          }
          return;
        }
        setAtPath(doc, parsePath(it.key), it.decision.value);
      });
      return doc;
    }

    // ===========================================================================
    // android.packages
    // ===========================================================================
    var PKG_TOKEN_RE = /^[A-Za-z0-9._]+$/;

