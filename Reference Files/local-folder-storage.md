# Local folder storage: connection + save mechanism

A portable description of how the task-tracker experiment
(`experiments/2026-08-16-task-tracker/src/store/`) connects a browser app to a
real folder on disk and saves into it. Written as a handoff spec so another
agent can implement the same mechanism in a different, pre-existing app.

No server, no upload, no bundler requirement. The user picks a folder once; the
app writes plain files into it forever after.

---

## 1. The shape

Two layers, and the split is the whole design:

```
Store    ← layout, snapshots, atomicity policy, status machine.  Domain-blind.
  └─ Driver   ← raw named-text + blob IO.  One per backend.
```

The **Store** knows nothing about your domain objects. It moves one opaque JSON
document, an append-only event log, rolling snapshots, and some blobs. That
ignorance is what makes it droppable into any app unchanged.

The **Driver** implements a tiny primitive interface and nothing else:

```js
init()                    -> Promise<STATUS>
getText(name)             -> Promise<string|null>   // null = not found
putText(name, text)       -> Promise<void>          // creates parents
appendText(name, text)    -> Promise<void>
listNames(prefix)         -> Promise<string[]>
removeName(name)          -> Promise<void>          // no-op if absent
putBlob(id, blob)         -> Promise<void>
getBlob(id)               -> Promise<Blob|File|null>
removeBlob(id)            -> Promise<void>
```

Optional, only meaningful for the folder driver:
`pickFolder()`, `requestAccess()`, `hasSavedHandle()`, `forget()`, plus
`get label()` (folder name, for the UI) and `kind` (`'fsa' | 'idb' | 'memory'`).

`name` is a POSIX-ish relative path (`"snapshots/2026-08-17T09-14-02-233Z.json"`).
The driver is responsible for walking/creating intermediate directories.

Three drivers ship:

| Driver | Backend | Role |
|---|---|---|
| `fsa` | File System Access API | primary — real files in a real folder |
| `idb` | IndexedDB | fallback when FSA is unavailable; explicitly degraded |
| `memory` | a `Map` | the reason any of this is testable |

`selectDriver()` picks the most durable one the browser permits and returns
`{ driver, degraded, reason }`. Nothing outside the store folder imports a
driver directly — everything goes through `store/index.js`.

---

## 2. Connecting the folder

```js
const handle = await showDirectoryPicker({
  mode: 'readwrite',
  id: 'task-tracker-data',   // browser remembers the last dir per id
  startIn: 'documents',
});
await idbKv.set('kv', 'dirHandle', handle);   // structured-cloneable
```

**The single most important behaviour:** a `FileSystemDirectoryHandle` is
structured-cloneable, so you can stash it in IndexedDB and it *survives a full
browser restart* — but **its permission grant does not**. After a restart,
`handle.queryPermission({mode:'readwrite'})` returns `'prompt'`, and
`handle.requestPermission({mode:'readwrite'})` (from a user gesture) restores
it in one click.

So `init()` deliberately reports a distinct status rather than an error:

```js
STATUS = { IDLE, READY, NEEDS_PERMISSION, READONLY, ERROR }
```

- no saved handle          → `IDLE`            → "Choose a data folder" screen
- saved handle, `granted`  → `READY`           → straight into the app
- saved handle, `prompt`   → `NEEDS_PERMISSION`→ one-button "Reconnect" screen
- FSA unsupported          → degraded path, IndexedDB, with a visible warning

Design the reconnect screen as a **normal** path, not an error path. It is what
every session after the first looks like. Keep the app read-only until a
writable handle exists, so there is never a window where an edit is accepted
and then silently lost.

Two other UI affordances worth copying: "Choose a different folder" on the
reconnect screen, and treating `AbortError` from the picker as "no folder
chosen" rather than an error worth alarming about.

---

## 3. On-disk layout

Everything the Store writes, relative to the chosen folder:

```
state.json                              the whole document, pretty-printed JSON
events.log                              append-only JSONL, one line per action
snapshots/<ISO-timestamp>.json          previous versions, newest 20 kept
files/<attachmentId>-<original-name>    attachment bytes, as real files
state.corrupt-<ISO-timestamp>.json      quarantined unreadable document
```

Timestamps are `new Date(ms).toISOString().replace(/[:.]/g,'-')` so they are
filename-safe *and* lexicographically sortable — snapshot listing is a plain
`sort().reverse()`.

Two deliberate choices:

- **Attachment bytes never go in the document.** `state.json` stays small and
  human-readable no matter how many PDFs are attached. The document holds only
  metadata; the bytes are files.
- **Attachment filenames keep the original name**, prefixed with the id
  (`att_1a2b-Q3 forecast.xlsx`). The id alone would make `files/` a folder of
  opaque names, which defeats the point of using a real folder. Renaming inside
  the app does *not* rewrite the file on disk — the folder stays stable.

---

## 4. Saving

### 4.1 Atomicity

```js
const fh = await dir.getFileHandle(name, { create: true });
const w  = await fh.createWritable();      // stages to a swap file
await w.write(text);
await w.close();                            // commits atomically
```

`createWritable()` stages into a temp file and commits on `close()`, so a crash
mid-write leaves the previous contents intact. Append uses
`createWritable({ keepExistingData: true })` + `seek(file.size)`.

### 4.2 Snapshot-before-write

`store.write(doc)` reads the current `state.json` first and, if it differs from
what is about to be written, copies it to `snapshots/<stamp>.json` and prunes
to the newest 20. A bad write costs one save, not the database.

### 4.3 The debounced writer

Save policy lives outside the Store so `write` stays trivially testable:

```js
const writer = createDebouncedWriter(store, {
  delay: 500,
  onStateChange: (s, err) => { /* 'dirty' | 'saving' | 'saved' | 'error' */ },
});
writer.schedule(doc);   // on every mutation
await writer.flush();   // on page hide, unload, and before anything irreversible
```

Three properties it guarantees, all of which matter:

1. **Coalescing.** Bursts of edits collapse to one write. `pending` holds only
   the latest document — there is no queue of stale versions.
2. **One write at a time.** A single `inFlight` drain loops rather than
   recurses, so an edit arriving *during* a write is picked up by the same
   drain. `flush()` therefore resolves only when nothing is pending *and*
   nothing is in flight.
3. **No retry spin.** On failure it clears `pending` and reports `'error'`. The
   next edit retries; a failed write does not loop hot.

Flush hooks:

```js
window.addEventListener('beforeunload', () => writer.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writer.flush();
});
```

`visibilitychange` is the reliable one — `beforeunload` is best-effort on
mobile and increasingly on desktop. Keep both.

### 4.4 The event log

Every mutation also appends one JSON line to `events.log`:

```js
store.appendEvent({ kind: 'task.create', id });   // best-effort, never awaited
```

Cheap, never rewrites the file, and survives a failure that corrupts
`state.json`. Callers can pass `silent: true` for high-frequency gestures
(drags commit on every pointer move — the log would take one line per pixel).

---

## 5. Recovery

`migrate()` is forgiving by design, which means a damaged file would otherwise
become a convincing *empty* document and destroy the real data. So on load:

```js
const loaded = await store.read();
if (loaded !== null) {
  const check = validateDoc(loaded);        // shape check, not a schema validator
  if (!check.ok) throw new Error(check.problem);
}
```

`validateDoc` only asserts the obvious: it is an object, the array fields are
arrays, the map fields are maps, and at least one expected field is present.

A failure shows a **recovery screen**, not a crash:

- lists the newest 10 snapshots with human-formatted timestamps, one-click
  restore;
- "Start fresh" calls `quarantineState()`, which renames the bad file to
  `state.corrupt-<stamp>.json` rather than overwriting it. Starting fresh must
  never be the same thing as destroying the only copy a human could repair;
- "Try again", for the case where the user fixed the JSON by hand.

---

## 6. Gotchas that cost real time

- **`file://` blocks ES modules.** `<script type="module">` fails CORS with
  `origin 'null'`. If the artifact must open by double-click, bundle to one
  IIFE and inline it. (`showDirectoryPicker()` itself *does* work on `file://`
  — measured on Edge/Chromium 151, Win32.)
- **Every `file://` page shares one origin literally named `file://`.** Any
  other local HTML file the user opens can read that IndexedDB. Another reason
  the IndexedDB driver is a fallback, never a peer.
- **IndexedDB is evictable.** Call `navigator.storage.persist()` on first run,
  but expect refusal and say so in the UI. Never treat it as the source of truth.
- **FSA hands back a `File` with an empty `type`.** Opening that makes the
  browser sniff, and a PNG arrives as a wall of gibberish text. Record the MIME
  at attach time; fall back to an extension map, then `application/octet-stream`.
- **`showDirectoryPicker()` cannot be driven by any headless test** — there is
  no picker UI to click. This is why the driver line exists where it does: keep
  the driver as thin as possible and put every piece of real logic above it,
  where the memory driver can exercise it in plain Node. Add a URL override
  (`?storage=memory` / `?storage=idb`) so an e2e suite can reach the app at all.
- **Sanitise attachment filenames** (`[\\/:*?"<>|]` → `_`, collapse whitespace,
  cap at ~120 chars) or a sync client will object.
- **Cap attachment size** (50 MB here). A 2 GB video will choke both the sync
  and the save.
- **Recommend the user pick a folder inside OneDrive/Dropbox.** You inherit
  cloud backup and version history from a service IT already runs, for free.

---

## 7. Porting into an existing app

Copy `src/store/` verbatim — `store.js`, `fsa-driver.js`, `idb-driver.js`,
`memory-driver.js`, `idb-kv.js`, `index.js`. It has no imports outside itself
and no domain knowledge. Change the IndexedDB `DB_NAME` and the picker `id`.

Then wire five things into the host app:

1. **Boot.** `selectDriver()` → `createStore({driver})` → `await store.open()` →
   branch on the returned status into your connect / reconnect / error screen,
   or into the app.
2. **Load.** `await store.read()` returns `null` on first run. Validate before
   trusting it; migrate; render.
3. **Mutate.** Funnel every state change through one `commit(nextDoc, event)`
   that calls `writer.schedule(nextDoc)` and `store.appendEvent(event)`. If the
   host app uses Redux/Zustand/signals, subscribe to the store and schedule from
   the subscription instead — the writer coalesces, so subscribing to every
   change is fine.
4. **Gate.** Make your `readOnly` predicate include `!store.canWrite`, and
   surface `store.status` + the writer's `'dirty'|'saving'|'saved'|'error'`
   state somewhere always-visible.
5. **Flush.** `visibilitychange` + `beforeunload`, and explicitly before any
   irreversible or outward-facing action.

If the host app's state is not already one serialisable document, that is the
real porting work — the Store deliberately moves exactly one JSON blob. Either
give it a single root object, or run several Stores over different `name`s
(the primitive interface is per-name, so `putText('projects.json', …)` is
perfectly legal; you would just be reimplementing the snapshot policy per file,
so prefer one document).

**Testing.** Everything above the driver line runs against `memory-driver` in
plain Node with no browser: snapshot rotation, prune, debounce coalescing,
flush-includes-in-flight-edits, migration, quarantine, the event log. The
memory driver also supports fault injection (`setFault((op, name) => Error|null)`)
so the failure paths get tested rather than assumed. The FSA driver itself is
verified by hand, once, and kept thin enough that hand-verification is credible.
