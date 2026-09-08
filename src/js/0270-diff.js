  /* =============================================================================
   * MODULE: App.diff
   * PURPOSE: Triage a snapshot's keys against the register (spec §8.1): split into
   *          new (append as undecided) and existing (inherited). Keys present in the
   *          register but not the snapshot are simply not-applicable — no action.
   * PURITY:  pure
   * DEPENDS: (none)
   * INVARIANTS: input order of parsedKeys is preserved; duplicates collapsed.
   * ============================================================================= */
  (function (App) {
    'use strict';
    /**
     * @param {string[]|Set<string>} parsedKeys
     * @param {string[]|Set<string>} registerKeys
     * @returns {{newKeys:string[], existingKeys:string[]}}
     * @example App.diff.triage(['a','b'], ['a']) // {newKeys:['b'], existingKeys:['a']}
     */
    function triage(parsedKeys, registerKeys) {
      var reg = {}; (registerKeys.forEach ? registerKeys : Array.from(registerKeys)).forEach(function (k) { reg[k] = true; });
      var seen = {}, newKeys = [], existingKeys = [];
      (parsedKeys.forEach ? parsedKeys : Array.from(parsedKeys)).forEach(function (k) {
        if (seen[k]) return; seen[k] = true;
        if (reg[k]) existingKeys.push(k); else newKeys.push(k);
      });
      return { newKeys: newKeys, existingKeys: existingKeys };
    }
    App.diff = { triage: triage };
  })(App);
