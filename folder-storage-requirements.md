# Folder Storage — Technical Requirements

**Version:** 1.0
**Status:** For implementation
**Target:** `ch-config-tool.html`, opened from `file://`, Edge/Chromium 150+
**Supersedes for this phase:** nothing. Sits *beside* `config-store-requirements.md` — see §1.3.

---

## 1. Purpose and scope

### 1.1 What this delivers

Connect the tool to a single folder on disk — in practice a OneDrive/SharePoint-synced
folder — and have it load from and save into that folder automatically, so that:

- work is never lost to a crash, a closed tab, or a forgotten save;
- a change that turns out to be wrong can be rolled back, from inside the tool, without
  going to the SharePoint web UI;
- SharePoint's own version history accumulates as a deep backstop, at a cadence that
  keeps it meaningful rather than churning it away;
- generated scripts and reports land in the project folder instead of Downloads.

### 1.2 What this deliberately is not

Single-user, single-project, roll-back-oriented. It is **not** an audit or assurance
mechanism. There is no lineage, no content addressing, no mandatory change note, no
merge UI, and no Config Manager. Concurrency is handled by *one* guard (§10) that
refuses to clobber, not by reconciliation.

### 1.3 Relationship to `config-store-requirements.md`

That document specifies a different and much larger system: immutable content-addressed
files that are never overwritten, lineage tracking, three-way merge, a Config Manager.
The two designs are **not compatible** — this one overwrites one file in place, which
that one forbids by construction.

This document is what is being built now. `config-store-requirements.md` remains on the
shelf as the design to adopt *if* the tool ever becomes genuinely multi-user. Nothing
here forecloses it: the migration path would be to read `project.json`, write it as a
genesis version, and retire this layer wholesale.

### 1.4 Decisions taken

Recorded so they are not relitigated mid-build:

| Question | Decision |
|---|---|
| Users | One now. Multi-user deferred; one cheap guard only (§10). |
| Projects per folder | Exactly one. Each project gets its own folder. |
| Purpose of history | Rollback, not audit. No mandatory change notes. |
| Manual save/load | **Retained unchanged**, for archiving and for sharing with people who lack folder access. |
| Canonical write cadence | 60s idle, 180s hard cap (§6.2). Chosen to keep SharePoint version history useful. |
| Snapshot cadence | At most once per 5 minutes, newest 40 retained (§7). |
| Outputs | Written **unpacked** into `Outputs/` (§9). Zip retained for the disconnected path. |
| Directory handle | Persisted in IndexedDB; folder re-selectable from inside the app (§5.5). |
| Offline | Must work fully offline (§11). |
| Browser | Edge/Chromium only. No FSA ⇒ the app behaves exactly as it does today. |

---

## 2. Environment and constraints

Per `config-store-requirements.md` §1.1, verified by capability probe on the target
machine (Edge 150, Windows 10, `file://`, OneDrive-synced SharePoint folder):

- `showDirectoryPicker()` — available on `file://`.
- IndexedDB — available; directory handles are structured-cloneable and persist.
- OPFS, `fetch()` of local files, ES modules — **blocked**. Do not use.

Every `CLAUDE.md` hard invariant continues to apply. In particular:

- **One file, no imports.** New code is ordered classic `<script>` IIFEs attaching to
  `App`, with the standard `MODULE:/PURPOSE:/PURITY:/DEPENDS:` banner.
- **No network.** The File System Access API is local I/O, not network access. The
  no-`fetch`/no-XHR/no-CDN rule is untouched.
- **No `crypto.subtle`.** Hashing uses the vendored `App.util.hash`.
- **Determinism.** All timestamps come from `App.util.clock`. Snapshot filenames are
  derived from it, never from `Date.now()`.
- **Dependencies point downward only.** Storage sits in the util/IO tier; the engine and
  adapters remain pure and know nothing about it.

### 2.1 Invariant requiring an explicit amendment

`CLAUDE.md` currently states that `localStorage` is never canonical state. That remains
true and is strengthened here: **the folder becomes canonical**, and browser storage is
demoted to crash insurance only (§6.1). The IndexedDB *fallback driver* described in
`Reference Files/local-folder-storage.md` §1 is **deliberately not implemented** — making
IndexedDB canonical would violate the invariant and, on the shared `file://` origin, would
expose project data to any other local HTML page. The fallback when FSA is unavailable is
the existing manual save/load, nothing else.

### 2.2 Recorded risk — persisted directory handle

All local HTML pages share the `file://` origin and therefore share IndexedDB. Any other
HTML file opened from disk on the same machine can read this tool's IndexedDB, including
the stored directory handle **with its granted read-write permission to the folder**.

The decision (§1.4) is to persist anyway, for usability. This must be recorded as an
accepted risk and raised with the approver, per `config-store-requirements.md` §11. The
mitigation applied is namespacing: the IndexedDB database name is specific to this tool.

---

## 3. On-disk layout

Everything relative to the folder the user selects:

```
<project folder>/
  ch-config-tool.html                        the tool itself
  project.json                               canonical state — the file SharePoint versions
  Snapshots/
    2026-08-18T01-08-14-233Z.json            rolling, newest 40 retained
  Outputs/
    <device-id>/
      <command>/
        <generated files, unpacked>
  project.corrupt-<ISO-stamp>.json           quarantined unreadable state, never overwritten
```

### 3.1 Naming

Timestamps are `App.util.clock.nowIso()` with `[:.]` replaced by `-`, so filenames are
both filesystem-safe and lexicographically sortable. Snapshot listing is therefore a
plain `sort().reverse()` with no parsing.

### 3.2 The tool inside the folder

The user's convention is one `.html` at the top level of the project folder. This is
supported and has a useful consequence: the persisted handle is keyed to the `file://`
origin rather than to a specific file, so **dropping in a new build of the tool reconnects
to the same folder with no re-pick**. Tool upgrades stay a one-step operation.

The tool must nevertheless work when opened from anywhere else. Nothing may depend on
the HTML residing in the connected folder.

### 3.3 Files the app does not own

Anything in the folder other than the paths above is left strictly alone — never read,
never written, never deleted. The one exception is detection (not modification) of
suspected sync conflict copies, per §10.3.

---

## 4. Module design

### 4.1 Layering

```
App.ui.app            glue: boot gating, status chrome, flush hooks
  └─ App.storage.folder    layout, snapshot policy, quarantine, status machine — domain-blind
       └─ App.storage.driverFsa | driverMemory    raw named-text IO
            └─ App.util.idbKv                     handle persistence
```

`App.storage.folder` knows nothing about projects. It moves one opaque text document, a
set of snapshots, and a tree of output files. That ignorance is what makes it testable
against the memory driver and replaceable later.

### 4.2 Naming hazard

`App.store` already exists and holds the in-memory project. The new module is
**`App.storage.folder`** — never `App.store.*`. Reviewers and future sessions will
conflate them otherwise.

### 4.3 Driver interface

```js
init()                    -> Promise<STATUS>
getText(name)             -> Promise<string|null>    // null = not found
putText(name, text)       -> Promise<void>           // creates intermediate directories
listNames(prefix)         -> Promise<string[]>
removeName(name)          -> Promise<void>           // no-op if absent
```

`name` is a POSIX-ish relative path (`"Snapshots/2026-08-18T01-08-14-233Z.json"`); the
driver walks and creates intermediate directories.

Folder-driver extras: `pickFolder()`, `requestAccess()`, `hasSavedHandle()`, `forget()`,
`get label()` (folder name, for the UI), `kind`.

Blob/attachment primitives from the reference design (`putBlob`/`getBlob`/`removeBlob`)
are **not required** — every artifact this tool produces is text (§9.1). They are omitted
rather than stubbed.

### 4.4 Load order

`App.storage.*` and `App.util.idbKv` are placed at the end of the util tier, after
`App.util.stable` and before `App.registry`. They depend only on `App.util.clock`. All
project-aware glue lives in `App.ui.app`, which already sits last.

### 4.5 Atomicity

```js
const fh = await dir.getFileHandle(name, { create: true });
const w  = await fh.createWritable();   // stages to a swap file
await w.write(text);
await w.close();                        // commits atomically
```

A crash mid-write leaves the previous contents intact. Note that Chromium's swap file is
created in the same directory and will be briefly visible to the sync client; this is
expected and harmless.

---

## 5. Connection lifecycle

### 5.1 Statuses

```
IDLE               no saved handle           → "Connect a folder" affordance
READY              handle, permission granted → folder autosave active
NEEDS_PERMISSION   handle, permission 'prompt'→ one-button "Reconnect"
UNSUPPORTED        no FSA in this browser     → app behaves exactly as it does today
ERROR              stale/denied/failed        → explain, offer re-selection
```

### 5.2 Reconnect is a normal path, not an error path

A `FileSystemDirectoryHandle` survives a browser restart; **its permission grant does
not**. Every session after the first begins at `NEEDS_PERMISSION`. It must be designed
and worded as routine — a named folder and a Reconnect button — not as a fault.

`requestPermission()` **must not** be called on load; it requires a user gesture. It is
called inside the Reconnect button's click handler.

### 5.3 Unconnected is a fully usable state

This is a deliberate deviation from `Reference Files/local-folder-storage.md` §2, which
says to keep the app read-only until a writable handle exists.

That rule is correct for an app with no other persistence. This tool has always worked
standalone and retains manual save/load, so gating it would be a regression. Therefore:

- `IDLE` / `UNSUPPORTED` — the app is fully editable, exactly as today, with the browser
  draft (§6.1) as crash insurance and manual Save as the way out. A dismissible banner
  offers to connect a folder.
- `NEEDS_PERMISSION` / `ERROR` — **the app is read-only.** This is the one case where the
  user would otherwise reasonably believe their edits were being saved to the folder.
  There must never be a window in which an edit is accepted and silently lost.

### 5.4 Picker behaviour

```js
showDirectoryPicker({ mode: 'readwrite', id: 'ch-config-tool-project', startIn: 'documents' })
```

`AbortError` means the user cancelled. Return to the previous state silently; it is not
an error and must not be logged as one.

### 5.5 Changing folder

"Change folder" is available from inside the app at any time, not only from the connect
screen. Switching folders discards the stored handle, stores the new one, and reloads
state from the new folder. Unsaved changes must be flushed to the *old* folder first, or
the user warned if that is not possible.

**This is load-bearing, not a convenience** (D-065). The first implementation rendered it
only on the reconnect banner, so a *connected* session had no way to re-point or disconnect
— and when the stored handle went stale, the only recovery was deleting the IndexedDB
database through DevTools. The status chip is therefore the control: always present,
always clickable, in every state.

### 5.6 A stale handle is a first-class state

The single most important thing `queryPermission()` does **not** tell you is whether the
folder still exists. It inspects the permission grant, not the disk, and answers `'granted'`
for a handle whose folder has been moved, renamed, or re-synced by OneDrive.

So `NotFoundError` must never be treated as one condition. It stands for four:

| Meaning | Code | Swallowable? |
|---|---|---|
| This file is not there yet | `not-found` | Yes — it is the normal first-run answer |
| This directory is not there yet | `not-found` | Yes — lists as empty |
| The root handle no longer resolves | `stale` | **Never** |
| Nothing is connected at all | `no-folder` | **Never** — a programming error |

Deciding between them requires a probe: enumerate the root, the cheapest operation that
must genuinely resolve the handle. Classify **before** swallowing, on every path.

On `stale`: discard the stored handle, hold `ERROR` (not `IDLE` — that would render the
ordinary connect invitation and lose the explanation), stop all writes, and show a banner
that names the likely cause and states that nothing has been lost. Never retry in a loop.

### 5.6 Error handling

Every filesystem operation is wrapped. An unhandled rejection leaving the store
half-written is the worst outcome this design can produce.

| Error | Required behaviour |
|---|---|
| `AbortError` on the picker | User cancelled. Silent return. Not an error. |
| `NotAllowedError` | Permission refused or revoked → `NEEDS_PERMISSION`, reconnect flow. |
| `NotFoundError` on the root handle | Stale handle (remounted drive, moved sync root). Discard it, explain, prompt for re-selection. Never retry in a loop. |
| `NotFoundError` deleting a file | Already gone. Swallow. |
| `NoModificationAllowedError` | Locked by another process, commonly the sync client. Advise retry; do not retry automatically. |
| Quota or write failure | Report verbatim to the Activity drawer. Do not swallow. |
| Read failure on a snapshot | Likely a dehydrated Files On-Demand placeholder while offline. Say so specifically (§11); offer retry. |

---

## 6. The save ladder

Three layers, deliberately separated by cadence and by what they protect against.

### 6.1 Layer 1 — browser draft, ~5s

Replaces today's `localStorage` draft autosave with the same role and better storage
(IndexedDB, namespaced to this tool). Debounced ~5s off `App.store.onChange`.

Crash insurance only. **Never canonical**, never offered in preference to the folder, and
it never touches the sync client — so it can be as eager as it likes. Cleared once its
content has been committed to the folder.

### 6.2 Layer 2 — `project.json`, 60s idle / 180s cap

The canonical file, and the one SharePoint versions.

- **60s idle debounce** — writes 60s after the last mutation.
- **180s hard cap** — continuous editing that never pauses for 60s must still be written
  at least every 180s. A pure idle debounce would otherwise write nothing during a long
  working stretch.
- **Immediate flush** on: explicit Save, any generate action, folder change, and the
  `visibilitychange`/`beforeunload` hooks (§6.4).

This cadence is the whole reason for the design. SharePoint records a version per change
and prunes the oldest beyond its retention limit; a 500ms autosave would churn several
hundred meaningless versions per session and push the ones worth keeping off the end.

The writer must guarantee three properties:

1. **Coalescing.** Bursts collapse to one write. `pending` holds only the latest document;
   there is no queue of stale versions.
2. **One write at a time.** A single `inFlight` drain *loops* rather than recurses, so an
   edit arriving during a write is picked up by the same drain. `flush()` resolves only
   when nothing is pending *and* nothing is in flight.
3. **No retry spin.** On failure it clears `pending` and reports `error`. The next edit
   retries; a failed write never loops hot.

### 6.3 Layer 3 — `Snapshots/`, ≤ once per 5 min, newest 40

See §7.

### 6.4 Flush hooks

```js
window.addEventListener('beforeunload', () => writer.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writer.flush();
});
```

`visibilitychange` is the reliable one; `beforeunload` is best-effort. Keep both.

### 6.5 Status surface

The writer's state — `dirty` / `saving` / `saved` / `error` — and the connection status
must be visible at all times. The existing topbar "unsaved" marker is repurposed for
this; it must distinguish *not yet written to the folder* from *no folder connected*,
because those call for different user action.

### 6.6 Saving on demand

**Save to folder** writes immediately and restarts the clock: it flushes the writer, which
disarms the pending timer and clears the cap window, so both the 60s idle and the 180s cap
begin again from the next edit.

It also snapshots **regardless of the §7.1 five-minute floor**. A deliberate save is a point
the user considers significant, and the rollback list should hold the points they marked
rather than only the points a timer chose. An automatic write continues to respect the floor.

If nothing has changed since the last write it does nothing — identical content is not a new
version, and a folder write is what SharePoint records.

It is refused, with a message, while a divergence (§10) is unresolved.

### 6.7 Manual save is unchanged

The existing Save button still serialises and downloads a `.json` via
`App.util.dom.download`, and Load still accepts a file through `<input type="file">`.
Neither is removed, reworded as a fallback, or gated on connection state. Manual Save
additionally flushes the folder writer.

---

## 7. Snapshots and rollback

### 7.1 Policy

Immediately before overwriting `project.json`, and only if **both**:

- the newest existing snapshot is ≥ 5 minutes old, and
- the current on-disk content differs from what is about to be written,

copy the current on-disk `project.json` to `Snapshots/<stamp>.json`, then prune to the
newest 40.

At the 60s canonical cadence this yields roughly 3.5 hours of fine-grained history.
Anything older is SharePoint's job.

### 7.2 Restore

A rollback view lists snapshots newest-first with human-formatted timestamps and a
one-click restore. Restoring:

1. flushes and snapshots the *current* state first, so a rollback is itself undoable;
2. parses the snapshot through `App.projectIo.parseProject` — a snapshot that fails to
   parse is listed but not restorable, with the reason shown;
3. loads it via `App.store.init`, resets undo history (the undo stack belongs to the
   pre-restore project — see the existing handling in `loadProjectFile`), and marks the
   project dirty so the next write commits it.

Restore never deletes a snapshot and never rewinds history.

---

## 8. Recovery

`App.projectIo.parseProject` never throws and returns located issues, which is a stronger
guarantee than the reference design's `validateDoc` shape check. Use it directly; do not
add a second, weaker validator.

On load, if `project.json` exists but fails to parse, the app must show a **recovery
screen, not a crash**, offering:

- **Restore from a snapshot** — the newest 10, formatted, one click each;
- **Start fresh** — which renames the bad file to `project.corrupt-<stamp>.json` rather
  than overwriting it. Starting fresh must never be the same act as destroying the only
  copy a human could repair;
- **Try again** — for the case where the file was fixed by hand.

Migration of older schema versions is `App.projectIo.migrate`'s existing job and is
unchanged; a migrated document is written back on the next normal write.

---

## 9. Outputs

### 9.1 Unpacked

`App.generate.build*` already returns `files: [{name, content}]` alongside the zip blob
(`ch-config-tool.html:11502`), where `name` is the logical path the zip entry used. When
connected, write those entries directly:

```
Outputs/<device-id>/<command>/<name>
```

overwriting in place on each run. All entries are text; no blob primitive is needed.

The zip is still built and offered as a download when **not** connected — the one-zip-per-
generator invariant exists because browsers throttle multiple downloads, a constraint
that does not apply to folder writes.

### 9.2 Housekeeping

None. Outputs accumulate and are the user's to manage. The app never deletes anything
under `Outputs/`.

### 9.3 Reporting

Every generate action reports, in the Activity drawer, where the files went — folder path
or download — so it is never ambiguous which happened.

---

## 10. Concurrent-write guard

Cheap insurance against a second person, a second machine, or simply two copies of the
tool open at once. Roughly thirty lines; not a reconciliation system.

### 10.1 Mechanism

The app records the `App.util.hash.sha256Hex` of the bytes it last wrote to
`project.json`. Before every canonical write it re-reads the file and compares.

- Hash matches, or the file is absent → write normally.
- Hash differs → **do not write.** Someone else changed the file underneath us.

### 10.2 On divergence

Raise a banner (not a modal) offering three explicit choices:

| Choice | Behaviour |
|---|---|
| Keep mine | Snapshot the on-disk version first, then overwrite. |
| Take theirs | Snapshot my unsaved state to `Snapshots/`, then reload from disk. |
| Save mine separately | Download my state as a `.json` and leave the folder untouched. |

No choice may silently discard either side.

### 10.3 Sync conflict copies

OneDrive resolves a genuine simultaneous edit by writing a conflict copy — typically
`project-<username>.json` — beside the original. Any `.json` at the folder root that is
not `project.json` must be surfaced as a **suspected sync conflict copy**, reported
distinctly from corruption, and otherwise left completely alone (§3.3).

---

## 11. Offline

The app talks to the local filesystem only; OneDrive syncs beneath it. Everything works
offline by construction, with two consequences to handle:

1. **Version history is not immediate.** SharePoint versions materialise on sync, not on
   write. Say so where history is presented, so an offline user is not misled.
2. **Files On-Demand dehydration.** Rarely-touched files can become placeholders that
   fail or stall on read while offline. `project.json` stays hydrated because it is
   written constantly; `Snapshots/` and `Outputs/` are at risk.

Mitigations, both required:

- Detect the failure and explain it specifically — "this file is not downloaded and you
  are offline", not a generic read error — with a retry.
- Document in the in-app Help that the project folder should be set to **Always keep on
  this device** in OneDrive, and why.

---

## 12. UI surface

New or changed, kept as small as the design allows:

1. **Connect banner** (`IDLE`) — dismissible, explains the benefit, one button.
2. **Reconnect screen** (`NEEDS_PERMISSION`) — named folder, Reconnect, and "Choose a
   different folder". Worded as routine.
3. **Status chrome** — connection state plus `dirty`/`saving`/`saved`/`error`, always
   visible, distinguishing "not connected" from "connected but unwritten".
4. **Folder controls** — change folder, disconnect, open rollback view.
5. **Rollback view** — snapshot list, restore, per §7.2.
6. **Recovery screen** — per §8.
7. **Divergence banner** — per §10.2.
8. **Help section** — connecting, what lands in the folder, the Always-keep-on-this-device
   setting, and what SharePoint version history does and does not cover.

Accessibility floor as elsewhere in the tool: keyboard-navigable, visible focus, no
status encoded by colour alone.

---

## 13. Test requirements

Everything above the driver line runs headlessly against the memory driver, in the
existing embedded harness under a new `/* ===== SUITES: folder storage ===== */` banner.

### 13.1 Unit — against `driverMemory`

- Writer coalescing: a burst of N schedules produces exactly one write.
- Writer max-wait: continuous scheduling that never idles still writes within the cap.
- `flush()` resolves only when nothing is pending *and* nothing is in flight, including an
  edit that arrives mid-write.
- Failure clears `pending`, reports `error`, and does not spin; the next edit retries.
- Snapshot policy: taken only when ≥5 min old *and* content differs; prune retains exactly
  the newest 40; filenames sort lexicographically in time order.
- Snapshot filenames derive from `App.util.clock` — determinism holds under a fixed clock.
- Quarantine renames rather than overwrites; the bad bytes survive.
- Concurrent-write guard: matching hash writes, differing hash refuses; each of the three
  resolutions behaves as specified and loses nothing.
- Outputs: `files[]` from `App.generate.build*` land at the specified paths with identical
  content to the corresponding zip entries.
- Fault injection on the memory driver exercises each row of the §5.6 table.

### 13.2 Hand-verified once — `driverFsa`

`showDirectoryPicker()` cannot be driven by any headless test; there is no picker to
click. This is precisely why the driver line sits where it does. Keep the FSA driver thin
enough that hand-verification is credible, and check by hand:

- genesis into an empty folder creates the layout correctly;
- reconnect after a full browser restart requires exactly one click;
- a stale handle (folder renamed underneath) degrades per §5.6;
- SharePoint records a version per canonical write, and the swap file does not persist;
- an offline dehydrated snapshot read produces the §11 message, not a generic error.

### 13.3 Not tested

Two-machine concurrency. Out of scope by decision (§1.4); the §10 guard is written to be
correct by construction and to fail safe, not to be proven by test.

---

## 14. Task breakdown

| Task | Deliverable |
|---|---|
| **TF.1** | `App.util.idbKv` — namespaced IndexedDB key/value, handle persistence. |
| **TF.2** | `App.storage.driverMemory` + fault injection. Tests can run from here on. |
| **TF.3** | `App.storage.driverFsa` — picker, permission query/request, atomic write, directory walk, §5.6 error mapping. |
| **TF.4** | `App.storage.folder` — layout, status machine, snapshot policy, prune, quarantine, concurrent-write guard. |
| **TF.5** | The debounced writer — coalescing, single-drain, max-wait, no retry spin. |
| **TF.6** | Boot gating in `App.ui.app` — statuses, connect/reconnect/recovery screens, read-only gate per §5.3. |
| **TF.7** | Replace the `localStorage` draft with the IndexedDB draft (§6.1). |
| **TF.8** | Status chrome, folder controls, flush hooks. |
| **TF.9** | Rollback view (§7.2). |
| **TF.10** | Unpacked `Outputs/` writing (§9). |
| **TF.11** | Divergence banner + conflict-copy detection (§10.2, §10.3). |
| **TF.12** | Help section (§12.8), `README.md` update, `CLAUDE.md` invariant amendment (§2.1) and recorded risk (§2.2). |
| **TF.13** | Self-test suites (§13.1); regenerate the code map. |

TF.1–TF.5 are the storage layer and are independently testable. TF.6–TF.11 are the host
wiring. TF.12–TF.13 close it out.

---

## 15. Out of scope

- Content addressing, lineage, three-way merge, Config Manager — see
  `config-store-requirements.md`.
- Multiple projects per folder; any config picker.
- Reading captured input files from the folder (an `inbox/`). Good idea, deferred.
- Automatic pruning of `Outputs/`.
- The IndexedDB *canonical* fallback driver (§2.1) — deliberately not built.
- Blob/attachment storage — nothing this tool produces is binary.
- Any local HTTP server, service worker, or PWA installation.
