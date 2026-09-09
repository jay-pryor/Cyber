    // ======================================================================
    // wiring
    //
    // wire(ctx) binds every event handler in the workspace. It used to be one
    // 680-line function — the whole thing in one body, on the line-cap allowlist
    // because no file boundary can cut a function in half. It is now five
    // per-concern helpers, one per fragment beside this one, each handed the same
    // small bag of shared closures. Nothing else changed: the handlers were moved
    // verbatim, in the order they were registered.
    // ======================================================================

    /** The closures every wiring helper needs: the delegation root, the DOM helper,
     *  and the project accessor. Everything else a handler reaches for — dirty,
     *  repaint, quietly, logIssues, the drag state — is declared at the module's
     *  own level and already in scope in every fragment of this block. */
    function wireHelpers(ctx) {
      return {
        ctx: ctx,
        dom: App.util.dom,
        P: function () { return App.docHost.get().getState(); }
      };
    }

    function wire(ctx) {
      _ctx = ctx;
      var h = wireHelpers(ctx);
      wireShell(h);
      wireSections(h);
      wireText(h);
      wireTables(h);
      wireFormatting(h);
    }

