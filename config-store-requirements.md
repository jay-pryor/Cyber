# Content-Addressed Config Store — Technical Requirements

**Version:** 1.0
**Status:** For implementation
**Target:** Single self-contained HTML file, opened from `file://`, Chromium (Edge 150+)

---

## 1. Purpose and context

This specifies a configuration storage and version-management subsystem to be embedded in local HTML tools. Tools are distributed as single self-contained HTML files and opened directly from disk. Configuration lives in a shared OneDrive-synced SharePoint folder, accessed through the File System Access API.

The subsystem provides: versioned config storage, automatic archiving of superseded versions, mandatory change notes, and detection and reconciliation of divergent edits made by concurrent users.

There is no server. There is no locking. Divergence is treated as a normal state to be reconciled, not an error to be prevented.

### 1.1 Verified environment

The following was confirmed by capability probe on a target machine (Edge 150, Windows 10, `file://` origin, OneDrive-synced SharePoint folder):

| Capability | Status | Consequence |
|---|---|---|
| File System Access (`showDirectoryPicker`, `showSaveFilePicker`) | Available | Folder-backed storage is viable |
| IndexedDB | Available | Directory handles and the index cache can persist |
| `crypto.subtle` (SHA-256) | Available | Content addressing is viable |
| Blob-URL Workers | Available | Hashing and diffing can run off the main thread |
| WebAssembly | Available | Reserved for future use; not required |
| `CompressionStream` (gzip) | Available | Reserved for future use; not required |
| Origin Private File System | **Blocked** | Not used; irrelevant to this design |
| `fetch()` of sibling files | **Blocked** | All file access must go through FSA or user input |
| Origin | `file://`, shared | See §11 |

**Implementation constraint:** the blocked rows are hard constraints. Do not use OPFS. Do not use `fetch()` or XHR for local files. Do not use `<script type="module">` — module scripts fail CORS on `file://`. All script must be inline classic script; workers must be constructed from Blob URLs.

---

## 2. Core model

### 2.1 Content addressing

Every config version is identified by the SHA-256 hash of its exact serialised bytes. A version's identity **is** its content. Two files with identical content are the same version.

Consequences to rely on:
- Config files are immutable. A file at a given hash never changes.
- Any cached data keyed by hash is permanently valid and never needs revalidation.
- Concurrent writes of identical content are harmless.
- A rename is a content change, and therefore a new version. This is intended.

### 2.2 Lineage

Each version records the hash of the version it was derived from (`parent`). Each version also carries a `lineageId` — a UUID generated once at genesis and inherited unchanged by every descendant.

This distinguishes two cases that look identical on disk:
- **Multiple configs coexisting** — several active files with *different* `lineageId`s. Normal. Not divergence.
- **Divergence** — two or more active files sharing the *same* `lineageId`. Requires reconciliation.

### 2.3 Heads and archive

An **active head** is a config file in the store root. The archive holds every superseded version.

A lineage normally has exactly one head. It has more than one when two users saved from the same parent.

---

## 3. On-disk layout

```
<store root>/
  <slug>.<short-hash>.json          ← active heads
  archive/
    <short-hash>.json               ← every superseded version
  STORE-README.txt                  ← written once at initialisation
```

### 3.1 Naming

- `<short-hash>` — the first **12 hex characters** of the version's SHA-256, lowercase.
- `<slug>` — the config's `name`, lowercased, non-alphanumerics collapsed to `-`, trimmed, truncated to 48 characters. Purely cosmetic; never parsed.
- Archive filenames omit the slug — content address only.
- Extension is always `.json`.

The short hash in the filename is load-bearing: it allows a reader to verify file integrity by rehashing, without any external index. See §5.2.

### 3.2 STORE-README.txt

Written at initialisation if absent. Plain text explaining, for the benefit of anyone who finds the folder without the tool: that files are managed automatically, that filenames encode content hashes, that files must not be renamed, moved, or edited by hand, and which tool manages them. Never read back by the application.

---

## 4. File format

Every config file is a JSON document with this envelope:

```json
{
  "schema": "config-store/v1",
  "meta": {
    "lineageId": "9f2c1e44-6d3a-4b81-9a0e-1c2f8b7d4e55",
    "name": "Sensor baseline — Trial 4",
    "note": "Raised sampling rate to 4 kHz following calibration drift.",
    "author": "j.smith",
    "savedAt": "2026-07-28T06:12:36.554Z",
    "parent": "a3f21b9c4d7e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192",
    "supersedes": [],
    "app": "sensor-config-tool",
    "appVersion": "2026.07.28-1a2b3c"
  },
  "payload": { }
}
```

### 4.1 Field requirements

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema` | string | yes | Exactly `config-store/v1`. Reject unknown values with a clear message. |
| `meta.lineageId` | UUID v4 | yes | Generated at genesis via `crypto.randomUUID()`. Inherited unchanged. |
| `meta.name` | string | yes | Non-empty after trim. User-supplied at save. |
| `meta.note` | string | yes | Non-empty after trim. User-supplied at save. Save must be refused without it. |
| `meta.author` | string | yes | Non-empty after trim. See §8.3. |
| `meta.savedAt` | ISO 8601 UTC | yes | `new Date().toISOString()`. Advisory only — never used for ordering or conflict resolution. |
| `meta.parent` | 64-hex string or `null` | yes | `null` only for genesis. |
| `meta.supersedes` | array of 64-hex strings | yes | Empty for ordinary saves. Populated by merge and abandon (§7). |
| `meta.app` | string | yes | Identifies the owning tool. |
| `meta.appVersion` | string | yes | Build stamp of the tool that wrote the file. |
| `payload` | object | yes | Tool-specific. This subsystem must not inspect or validate its contents beyond treating it as JSON. |

### 4.2 Canonical serialisation

Hashing requires byte-for-byte determinism. Serialisation **must** be:

1. Object keys sorted lexicographically at every level, recursively. Array order preserved.
2. `JSON.stringify(value, sortedReplacer, 2)`.
3. Single trailing newline (`\n`).
4. UTF-8 encoded via `TextEncoder`. No BOM.
5. LF line endings only.

Reject on save: `undefined`, functions, `NaN`, `Infinity`, and circular references. These must fail loudly rather than silently serialising to `null`.

### 4.3 Hash definition

`hash = SHA-256(canonical bytes of the entire document, including meta)`

The hash covers the whole file. A file cannot contain its own hash; the hash lives in the filename and in descendants' `parent` fields.

Implementation:

```js
async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
```

---

## 5. Reading the store

### 5.1 Scan

On connect, and on explicit refresh:

1. Enumerate the store root **non-recursively**. Take entries matching `*.json`.
2. Skip the `archive/` directory entirely. Never enumerate archive contents during scan.
3. For each root file: read, decode, parse, verify (§5.2), and record as an active head.
4. Group heads by `lineageId`. Any group with more than one member is divergent.

Archive files are read **only on demand** — during ancestry walks, diffs, and restores. This is required, not an optimisation: with OneDrive Files On-Demand, archived files may be dehydrated placeholders whose contents are fetched over the network on first read. Eager archive scanning will stall or fail when offline.

### 5.2 Verification

For every file read from disk:

1. Compute SHA-256 of the raw bytes.
2. Compare against the hash embedded in the filename.
3. On mismatch: **exclude the file from the working set** and surface it in a "Damaged or foreign files" list in the Config Manager. Do not attempt repair. Do not delete.

This single check catches: half-written files from interrupted SMB writes, files edited by hand, files renamed by hand, and OneDrive conflict copies (`<slug>.<hash>-JSMITH-PC.json`), which will not rehash to their filename fragment.

Report OneDrive conflict copies with a distinct message — filename ending in `-<something>.json` after the hash segment — since the remedy differs from genuine corruption.

### 5.3 Index cache

Maintain an IndexedDB object store `configIndex`, keyed by full hash:

```
{ hash, lineageId, name, author, savedAt, parent, supersedes,
  location: 'root' | 'archive', filename, verifiedAt }
```

Because content is immutable, a cached entry is permanently valid. Never re-read or re-verify a hash already present in the cache. The cache exists so that ancestry walks and the lineage tree can be rendered without touching the network share.

Cache misses during an ancestry walk are read from `archive/<short>.json` and inserted.

Provide a "Rebuild index" action that clears the cache and performs a full enumeration of root **and** archive. This is the only operation permitted to enumerate the archive, it must warn about Files On-Demand hydration before running, and it must show progress and be cancellable.

### 5.4 No mutable shared state

There must be **no** shared mutable file — no `index.json`, no manifest, no lock file, no registry. Every such file would be rewritten by multiple users and would generate OneDrive conflict copies. All shared state is derived from immutable content-addressed files. All mutable state is per-user, in IndexedDB.

---

## 6. Writing

### 6.1 Save algorithm

Given the currently loaded config (parent, possibly `null`) and edited payload:

1. **Validate.** `name`, `note`, `author` all non-empty after trim. If not, abort and focus the offending field. Never auto-generate a note.
2. **Build envelope.** `lineageId` inherited from parent, or newly generated if genesis. `parent` = parent's full hash, or `null`. `savedAt` = now. `supersedes` = `[]`.
3. **Serialise and hash** per §4.2–4.3 → `newBytes`, `newHash`.
4. **No-op check.** If `newHash === parentHash`, abort with "No changes to save." Note this can only occur if name, note, author and payload are all unchanged; since `savedAt` differs on every save, compute this check against a copy of the envelope with `savedAt` and `note` normalised to the parent's values. If payload, name and author are identical, treat as no-op.
5. **Write the new head.** `<slug>.<newShort>.json` in the store root, via `createWritable()` → `write()` → `close()`.
6. **Read back and verify.** Re-read the file just written, rehash, compare to `newHash`. On mismatch, abort with a hard error and do **not** proceed to archive the parent. SMB and sync clients can accept a write that has not committed; this check is mandatory.
7. **Archive the parent** (skip if genesis):
   a. If `archive/<parentShort>.json` does not exist, write the parent's exact original bytes to it, then read back and verify. If it already exists, do nothing — identical content, nothing to reconcile.
   b. If the parent's root file still exists, delete it.
8. **Update the index cache** — insert the new head, move the parent's entry to `location: 'archive'`.
9. **Rescan** the root and refresh the Config Manager.

**Ordering is mandatory.** New head is written before the parent is removed, so the lineage is never absent from the root. The parent is archived before it is deleted, so it is never unreachable. Both archive-write and delete are idempotent: writing an archive file that already exists is a no-op, and deleting a root file that another user already deleted is a no-op. Neither may raise a user-visible error.

### 6.2 Concurrency behaviour

No locking, no pre-write conflict check. If two users save from the same parent:

- Both new heads are written to root. Different content, different hashes, no filename collision.
- Both attempt to archive the same parent. One writes `archive/<parentShort>.json`; the other finds it present and skips. Identical content, so order is irrelevant.
- Both attempt to delete the parent's root file. One succeeds; the other gets `NotFoundError`, which is swallowed.

Result: one archived parent, two active heads sharing a `lineageId` — a detected divergence. This is correct and expected behaviour, not an error state.

**Sync latency.** The folder is OneDrive-synced, so the browser reads a local cache. Another user's head may not appear for seconds or minutes. Divergence will therefore be common rather than rare, and may be detected long after the fact. Do not treat delayed divergence detection as anomalous.

---

## 7. Divergence and reconciliation

### 7.1 Detection

After every scan, any `lineageId` with more than one active head is divergent. Surface this prominently in the Config Manager — a banner listing affected lineages, not a modal.

### 7.2 Common ancestor

Given heads A and B, walk `parent` chains backwards, reading from the index cache and falling back to `archive/`, until a hash appears in both chains. That is the merge base.

Handle these cases explicitly:
- **No common ancestor** — malformed store, or archive files deleted by hand. Fall back to two-way diff and warn that automatic merge is unavailable.
- **Broken chain** — a `parent` hash with no corresponding archive file. Report the missing hash; fall back to two-way diff.
- **Cycle** — cap traversal depth (suggest 10,000) and report a malformed store rather than hanging.

### 7.3 Three-way diff

Compare base, A and B at every leaf path in the JSON payload plus the `name` field. For each path:

| Condition | Resolution |
|---|---|
| A = B | Take the value. No conflict. |
| A ≠ base, B = base | Take A automatically. |
| B ≠ base, A = base | Take B automatically. |
| A ≠ base, B ≠ base, A ≠ B | **Conflict.** User must choose. |
| Key added in one side only | Take the addition. |
| Key added in both with different values | **Conflict.** |
| Key deleted in one side, unchanged in other | Take the deletion. |
| Key deleted in one side, modified in other | **Conflict.** |

**Arrays are atomic.** Do not attempt element-wise array merging. An array that differs is a single conflicting value, resolved by choosing one side's array whole. This is a deliberate simplification; element-wise merge is out of scope.

### 7.4 Merge UI

Requirements:
- Show every differing path, conflicts first, auto-resolved changes below in a collapsed section.
- For each path: the base value, A's value, B's value, and the chosen resolution.
- Conflicts must default to *unresolved*. Never pre-select a side.
- Merge cannot be committed while any conflict is unresolved.
- Display each head's `name`, short hash, `savedAt`, `author` and `note`. The note is the primary information a user needs to choose; give it visual weight.
- Provide a "take all from A" / "take all from B" shortcut, and allow subsequent per-path override.

### 7.5 Committing a merge

The merged result is saved as an ordinary new version with:
- `parent` = hash of head A (the head the user was working from)
- `supersedes` = `[hash of A, hash of B]`
- `note` — mandatory, user-supplied, describing the reconciliation
- `lineageId` — inherited (both heads share it by definition)

Then archive **both** heads using the §6.1 step 7 procedure, and delete both root files. The lineage returns to a single head.

### 7.6 Abandoning a head

To discard one side without merging:

1. Save a new version from the surviving head, with `supersedes` containing the abandoned head's hash and a mandatory note stating why.
2. Archive and delete the abandoned head's root file.

The abandoned version remains in the archive permanently and is fully restorable. Abandonment records a decision; it never destroys history.

### 7.7 Branching

Two users may each choose a different head and continue saving, producing parallel lineages sharing a `lineageId`. This is permitted. The Config Manager must render lineage as a **tree** derived from `parent` pointers, not a flat chronological list, so parallel branches read as structure rather than clutter.

---

## 8. Config Manager

A distinct section of the tool, presented on load before any config is opened.

### 8.1 Required views

**Store connection** — connected folder name, connect / reconnect / change-folder controls, last scan time, manual refresh.

**Config list** — one row per active head:
- `name`
- short hash (monospace)
- `savedAt`, rendered in local time with the UTC value on hover
- `author`
- `note` from the most recent save
- a divergence marker where the lineage has multiple heads

Grouped by `lineageId`. Sortable by name and date. This list is the **only** place config names are displayed; the rest of the tool addresses configs by hash.

**Lineage tree** — for a selected config, the version history as a tree with branch points visible. Each node shows short hash, `savedAt`, `author`, `note`. Actions per node: view, diff against current, restore.

**Divergence view** — the reconciliation interface of §7.4.

**Damaged or foreign files** — files in the store root that failed verification (§5.2), with the reason. Read-only; no automatic remediation.

### 8.2 Opening a config

The user must explicitly select a config before the tool proper becomes usable. Where a lineage is divergent, both heads appear in the list and either may be opened; the divergence banner remains visible while unreconciled. Reconciliation is not enforced by the application.

### 8.3 Author identity

There is no authentication available. Prompt once for a name or initials on first use, persist in `localStorage`, and expose it as an editable field in settings. Pre-fill it in the save dialog and allow override. Treat it as attribution, not identity, and label it as such in the UI. Do not attempt to derive identity from the filesystem or environment.

### 8.4 Save dialog

Fields: `name` (pre-filled from parent), `note` (always empty — never pre-filled or carried forward), `author` (pre-filled, editable).

Above the fields, display an auto-generated summary of what changed against the parent — the same path-level diff used for merges, rendered as a compact list (`sampling.rateHz: 2000 → 4000`). The user writes only the justification; the machine records the change itself. Save is blocked while `note` is empty.

### 8.5 Restore

Restoring an archived version writes a **new** version whose payload is that of the restored version, `parent` = the current head, and a mandatory note. History is append-only. Never rewind, never delete, never rewrite an existing file.

---

## 9. Directory handle lifecycle

### 9.1 Persistence

Store the `FileSystemDirectoryHandle` in IndexedDB (handles are structured-cloneable). Store one per tool.

### 9.2 Reconnection

On load:

```js
const perm = await handle.queryPermission({ mode: 'readwrite' });
```

- `granted` — proceed silently.
- `prompt` — the tool **must not** attempt `requestPermission()` on load. It requires a user gesture. Render a "Reconnect to config folder" button showing the remembered folder name; call `requestPermission()` inside its click handler.
- `denied` — offer folder re-selection.

### 9.3 Stale handles

A stored handle may become invalid — remounted drive, moved OneDrive root, changed sync location. Any operation raising `NotFoundError` on the root handle must: discard the stored handle, explain that the folder can no longer be found, and prompt for re-selection. Never fail silently and never retry in a loop.

### 9.4 Error handling

| Error | Required behaviour |
|---|---|
| `AbortError` on any picker | User cancelled. Return to previous state silently. Not an error. |
| `NotAllowedError` | Permission refused or revoked. Show the reconnect flow. |
| `NotFoundError` on root handle | Stale handle. See §9.3. |
| `NotFoundError` deleting a root file | Another user already deleted it. Swallow. |
| `NoModificationAllowedError` | File locked by another process — commonly the sync client. Advise retry; do not retry automatically. |
| Read-back hash mismatch | Hard failure. Abort the operation, preserve the parent, tell the user the write could not be verified. |
| Read of an archive file times out or fails | Likely a dehydrated Files On-Demand placeholder while offline. Explain this specifically; offer retry. |
| Quota or write failure | Report verbatim. Do not swallow. |

Every filesystem operation must be wrapped. An unhandled rejection that leaves the store half-written is the worst outcome this design can produce.

---

## 10. Non-functional requirements

1. **Single file.** The deliverable is one `.html` file with all CSS and JS inline. No external requests of any kind at runtime.
2. **No modules.** Classic inline script only. Workers constructed from Blob URLs.
3. **No network.** Include a CSP meta tag with `connect-src 'none'` and `default-src 'none'`, as a demonstrable assurance artefact.
4. **Build stamp.** Display tool name, version, build date and a SHA-256 of the file's own source in a footer, and write them into `meta.app` / `meta.appVersion` on every save.
5. **Authoring.** The source should be developed as separate modules and bundled to a single file (Vite with a single-file plugin, or equivalent). Do not hand-author a monolithic file.
6. **Off-thread hashing.** Hashing and diffing run in a Blob-URL worker. The UI must not block during a scan.
7. **Accessibility floor.** Keyboard-navigable, visible focus, `prefers-reduced-motion` respected, no colour-only status encoding.
8. **Determinism.** The canonical serialiser must be covered by unit tests asserting that identical logical content produces identical bytes across key insertion orders.

---

## 11. Documented risks

To be recorded and raised with the relevant approver, not silently accepted:

**Shared `file://` origin.** All local HTML pages on a machine share the `file://` origin and therefore share IndexedDB. Any other HTML file opened from disk can read this tool's IndexedDB, including the stored directory handle with its granted read-write permission to the network share. Mitigations, in increasing severity: namespace all IndexedDB databases by tool; or do not persist the handle at all and require folder re-selection each launch. Choose deliberately and record the choice.

**No access control.** Anyone with write access to the SharePoint folder can write, archive or delete configs. The store provides tamper *evidence* through content hashing, not tamper *prevention*.

**Attribution is self-asserted.** `meta.author` is typed by the user and is not authenticated.

**SharePoint version history as backstop.** SharePoint maintains its own version history for the folder independently. This is a useful audit backstop and a recovery path for hand-deleted archive files, and is worth citing in any assurance discussion.

---

## 12. Test requirements

### 12.1 Unit

- Canonical serialiser: identical bytes regardless of key insertion order; rejects `undefined`, `NaN`, functions, cycles.
- Hash: known-answer test against a fixed input.
- Three-way diff: every row of the §7.3 table, plus nested objects, additions, deletions, and arrays-as-atomic.
- Ancestry walk: linear chain, branch, missing archive file, cycle, no common ancestor.

### 12.2 Integration — single user

- Genesis save into an empty folder; correct layout created.
- Sequential saves; exactly one head, archive grows by one per save.
- Save with empty note is refused.
- No-op save is detected and refused.
- Rename produces a new version with a new hash.
- Restore from archive produces a new head, archive intact.
- Hand-corrupt a root file → flagged, excluded, not deleted.
- Hand-delete an archive file → ancestry walk degrades gracefully.

### 12.3 Integration — two machines

Requires two workstations with the share mounted. **This is the acceptance gate; the design is untested without it.**

- Both open the same head, both save. Expect: two heads, one archived parent, divergence detected on both machines after sync.
- Merge with conflicts on one machine; verify the other converges to a single head after sync.
- Abandon a head; verify `supersedes` is recorded and the abandoned version remains restorable.
- Save while the other machine is offline; verify divergence surfaces correctly on reconnection.
- Trigger a OneDrive conflict copy deliberately; verify it is detected and reported distinctly from corruption.

### 12.4 Deferred — performance

Not yet measured. Required before the store exceeds a few hundred archived versions:

- Time a root enumeration with 10, 100 and 500 root files.
- Time a full index rebuild against an archive of 1,000 files, both hydrated and dehydrated.
- Confirm the UI remains responsive throughout.

If root enumeration degrades noticeably, the mitigation is to shard the archive by hash prefix (`archive/a3/a3f21b9c4d7e.json`). The root itself holds only active heads and should stay small by construction.

---

## 13. Out of scope

- Element-wise array merging.
- Automatic pruning or expiry of archived versions. **Archive files are never deleted by the application.**
- Any local HTTP server, service worker, or PWA installation.
- Encryption at rest — delegated to the platform.
- Payload schema validation — the owning tool's responsibility.
- OPFS, `fetch()` of local files, ES modules. Blocked in the target environment.
