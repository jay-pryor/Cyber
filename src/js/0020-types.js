  /* =============================================================================
   * MODULE: App.types
   * PURPOSE: Central home for the JSDoc typedefs used as the shared type
   *          vocabulary across modules (spec §5/§6/§13.2). No runtime behaviour —
   *          typedefs are documentation that tooling and humans rely on.
   * PURITY:  pure (declarations only)
   * DEPENDS: (none)
   * INVARIANTS: typedefs here are the single source of truth for cross-module shapes.
   * ============================================================================= */
  (function (App) {
    'use strict';

    /**
     * @typedef {Object} Issue
     * @property {'parse'|'validation'|'state'|'completeness'|'generation'} category
     * @property {'error'|'warning'|'info'} severity
     * @property {string} message            Human-readable WHAT.
     * @property {string} [location]         WHERE (file/slot/line/key).
     * @property {string} [fix]              Suggested remediation.
     */

    /**
     * @typedef {Object} ParseResult
     * @property {RegisterItemSeed[]} items  Keyed items discovered in the capture.
     * @property {Issue[]} warnings
     * @property {Issue[]} errors
     * @property {*} [template]              Retained source structure (tactical JSON).
     * @property {Object<string,string>} [values]  Optional per-key capture value.
     * @property {string[]} keys             Sorted unique applicability keys.
     */

    /**
     * @typedef {Object} RegisterItemSeed
     * @property {string} key
     * @property {*} [defaultValue]          Captured value used to seed a decision default.
     */

    /**
     * @typedef {Object} RegisterItem
     * @property {string} key
     * @property {string} [description]
     * @property {Object|null} decision      Shape per adapter.decisionSchema; null = undecided.
     * @property {string[]} controlRefs
     * @property {string} [rationale]
     * @property {string} [rollback]
     * @property {true} [diverges]           DIV-1: departs from the guidelines (absent = it does not).
     * @property {string} [divergenceNarrative]  DIV-2: what it departs from, and why.
     * @property {'undecided'|'decided'} status   Derived (recompute on load).
     */

    /**
     * @typedef {Object} Snapshot
     * @property {string} capturedUtc
     * @property {string} sourceFilename
     * @property {string} sha256             Hash of raw uploaded bytes (hex 64).
     * @property {string[]} keys             Sorted unique; the applicability set.
     * @property {Object<string,string>} [values]
     * @property {*} [template]
     */

    /**
     * @typedef {Object} DeviceConfig
     * @property {string} id                 Slug, unique per version.
     * @property {string} baseId             Stable identity across versions.
     * @property {number} version            Integer >= 1.
     * @property {string|null} supersedesId
     * @property {string} name
     * @property {string} model
     * @property {string} firmware
     * @property {string} onboardedUtc
     * @property {Object<string,Snapshot>} snapshots   Keyed by dataset id.
     */

    /**
     * @typedef {Object} Project
     * @property {number} schemaVersion
     * @property {string} platformProfileId
     * @property {{createdUtc:string, modifiedUtc:string, appVersion:string}} meta
     * @property {DeviceConfig[]} deviceConfigs
     * @property {Object<string, RegisterItem[]>} items   Keyed by dataset id.
     */

    /**
     * @typedef {Object} DecisionField
     * @property {string} name
     * @property {'enum'|'string'|'value-typed'|'bool'} kind
     * @property {string[]} [options]        For kind 'enum'.
     * @property {boolean} [required]
     */

    /**
     * @typedef {Object} ColumnDef
     * @property {string} key                Logical column id.
     * @property {string} label
     * @property {(item:RegisterItem)=>string} [get]   Derived value accessor.
     */

    /**
     * @typedef {Object} GeneratedFile
     * @property {string} name               Path within the zip.
     * @property {string} content            File contents (text).
     */

    /**
     * @typedef {Object} DeviceContext
     * @property {DeviceConfig} device
     * @property {Project} project
     * @property {string} toolVersion
     * @property {string} generatedUtc
     */

    App.types = {}; // marker; all content above is documentation
  })(App);
