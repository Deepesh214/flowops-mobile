# FlowOps

**Offline-first work management for field and operations teams.** Sign in, see your assigned tasks, tick off checklists, add notes and photo evidence, and complete work, all without a signal. Changes sync on their own when the connection comes back.

Built with React Native, Expo, TypeScript, SQLite, TanStack Query, Zustand and Supabase.

<p align="center">
  <img src="docs/demo.gif" alt="FlowOps demo: sign in, complete a checklist offline, sync on reconnect, attach evidence, complete the task" width="300" />
</p>

<p align="center"><a href="docs/demo.mp4"><b>▶ Watch the full demo video (69 s, MP4)</b></a></p>

## Features

- **Offline-first sync.** Every write lands in SQLite first, goes into a durable operation queue, and is pushed by a single-flight sync worker with bounded backoff (2s, 5s, 15s, 30s, 60s). After that, failed changes wait for a manual Retry and are never thrown away.
- Email/password auth with persistent session restore and safe handling of expired sessions.
- Home dashboard: greeting, open, due today, overdue and done-this-week tiles, checklist progress, and the next tasks sorted by urgency.
- Task list with instant local search and filters (status, priority, due date, sync state), pull-to-refresh and a last-synced indicator.
- Task detail: start, block and resume a task, an interactive checklist (optimistic), notes, and photo evidence.
- **Completion validation.** All required checklist steps must be done, evidence must be attached when the task requires it, and blocked tasks can't be completed. The app shows exactly what is missing.
- Evidence capture from the camera or gallery. Permissions are asked only when needed, photos are resized to 1600px JPEG, and offline photos show as pending.
- Local due-soon and overdue reminders (opt-in) that deep-link to the task. Sync-issue alerts open Profile.
- Insights: completion rate, completed, pending and overdue counts, and a 7-day completed trend.
- Full set of UI states: skeleton loading, empty, offline banner, errors with Retry, pending and failed sync badges.
- Accessibility: 44pt+ touch targets, labels on every icon control, and status/priority always shown as text (never color alone).

## Run it

Requires **Node.js 22.13+** (Expo SDK 58).

```bash
npm install
npm run web        # or: npm run android / npm run ios
```

With no `.env`, the app runs in **Demo mode** against an on-device mock backend. Tap **Use demo account** on the login screen. Profile → **Simulate offline** lets you demo offline mode without airplane mode, and **Reset demo data** restores the seed.

### Connect Supabase

1. Create a Supabase project with email/password auth enabled.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor (tables, RLS policies, private `evidence` bucket).
3. Create a user, then run [`supabase/seed.sql`](supabase/seed.sql) with that user's id.
4. `cp .env.example .env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Only ever use the anon key here.

Camera and notifications need a device. Expo Go works for most of it, but remote push tokens need a development build (`npx expo run:android` or `eas build --profile development`).

## Architecture

```
UI / Screens (src/app)            render + trigger actions, no SQL or Supabase calls
      │
Hooks (features/*/hooks)          React Query: local reads + remote refresh lifecycle
      │
TaskRepository                    local-first writes: SQLite → enqueue → kick worker
   /          \
LocalStore    RemoteApi           interfaces; SqliteStore / MemoryStore, SupabaseApi / DemoApi
(SQLite)      (Supabase)
      \        /
     SyncEngine                   single-flight queue drain, ordering, backoff, error classes
         │
NetInfo + AppState                reconnect / foreground → drain queue + pull
```

**State ownership**

| State | Owner | Why |
| --- | --- | --- |
| Tasks, checklist, notes, attachment metadata, operation queue | SQLite (`LocalStore`) | Durable, must survive restarts and work offline |
| Server request lifecycle (refresh, loading, error, retry) | TanStack Query | Caching and request states without hand-rolled flags |
| Connectivity, pending/failed counts, last sync, notices, prefs | Zustand | Small, cross-screen, short-lived UI state |

`src/data/container.ts` is the only place that picks concrete implementations.

### Sync design

- **Business status vs sync status.** `assigned → in_progress → completed` (and `blocked`) is separate from a task's `synced | pending | failed`, which is derived from the queue.
- **Queue rows:** `entity_type, entity_id, task_id, operation, payload_json, created_at, retry_count, next_attempt_at, status, last_error`.
- **Coalescing.** A new update merges into a queued update for the same entity, so toggling a checkbox 3 times produces one operation with the final value. In-flight operations are never merged into.
- **Ordering.** Operations run oldest first. A retryable failure stops the pass so later edits can't overtake earlier ones.
- **Deletion only after success.** Interrupted in-flight operations go back to pending on the next launch.
- **Error classes:** retryable (network, timeout, 5xx) → backoff; auth → keep the change and send the user to Login; validation → failed with a Retry path; conflict → policy below.
- **Conflict policy (last-write-wins).** Task updates carry `baseUpdatedAt`. The server applies them only if its row hasn't changed since. Otherwise the server version is kept, the local copy is refreshed, and the user sees a notice.
- **Pull merge.** A refresh never overwrites a task that still has queued local changes.
- **Idempotency.** Notes and attachments use client-generated UUIDs, so a retried request never creates duplicates.

## Data model

Supabase: `profiles`, `tasks`, `task_checklist_items`, `task_notes`, `task_attachments`, `device_tokens`, plus RLS so a user can only read or update tasks where `assignee_id = auth.uid()` (notes, checklist, attachments and storage objects are checked through the parent task). Local SQLite mirrors it: `tasks_local`, `checklist_local`, `notes_local`, `attachments_local`, `sync_operations`, `meta`.

## Quality

```bash
npm run lint
npm run typecheck
npm test
```

45 Jest tests cover the sync queue (single op per toggle, coalescing, ordering, delete-after-success, backoff, retry limit, manual retry, validation, conflict, auth, lock, restart recovery), completion rules, sorting, search and filter combinations, analytics, login validation, error mapping, repository + queue integration against the mocked backend (offline cache, pending photo evidence, refresh safety), and components (LoginForm, TaskCard, offline banner, notification deep links). GitHub Actions runs lint, typecheck and tests on every push and PR.

## Demo script (60–90 s)

1. Log in → Home summary and task list.
2. Open the HVAC task → tick a checklist step, add a note.
3. Go offline (airplane mode or Profile → Simulate offline) → make another change → **Pending sync** badge.
4. Go back online → the badge clears automatically.
5. Add photo evidence → Complete (see the validation messages first).
6. Search and filter Tasks → Insights.

## Trade-offs and next steps

- Background sync only runs while the app is open (no OS background task yet).
- Conflicts resolve server-wins for task status; a conflict-resolution UI is a stretch goal.
- Push from the server (task assigned) needs a Supabase Edge Function. Reminders are local notifications today.
- The SQLite store is exercised by the app; tests use an in-memory store with the same contract.
- Stretch: biometric unlock, dark mode (tokens are centralized in `src/theme/tokens.ts`), manager role, E2E tests.
