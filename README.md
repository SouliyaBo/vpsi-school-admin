# VPSI School — Admin Panel

ໜ້າບໍລິຫານລະບົບໂຮງຮຽນ — the admin web frontend for the
[VPSI School Management API](../vpsischool-api).

**Stack:** TypeScript (strict) · React 18 + Vite 6 · React Router 6 · TanStack Query 5 ·
TanStack Table 8 · React Hook Form + Zod · shadcn/ui on Tailwind CSS 3 · Recharts ·
axios · Zustand · react-i18next (lo / en) · Vitest + React Testing Library

**Decisions confirmed with the requester:** access token in memory + refresh token in
`localStorage` · types generated from the API's OpenAPI document · Lao **and** English
from the start · the "muted" token set (see [Design tokens](#design-tokens)).

---

## 1. Status — what is built

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Vite + TS setup, design tokens, layout, auth flow, API client, shared table/form/state components, i18n, dashboard | ✅ Complete |
| 1 | Teachers, students, guardians, locations, school years, semesters, grade levels, classrooms, subjects | ✅ Complete |
| 2a | **Enrollment / class placement** — queue, bulk placement, class roster, transfers | ✅ Complete |
| 2b | Teaching assignments, score entry, attendance | ⏳ Routed to a placeholder |
| 3 | Report generation, lesson-plan review workflow | ⏳ Routed to a placeholder |
| 4 | Exam registration, results, certificates | ⏳ Routed to a placeholder |
| 5 | Announcements, notifications, calendar, documents, feedback | ⏳ Routed to a placeholder |
| 6 | Users & roles, audit log, settings | ⏳ Routed to a placeholder |

Every nav entry for a later phase is already wired to a route **and** to the permission
check for its resource; it renders an explicit "planned" screen instead of a 404, so
shipping the real page is a one-line swap in [`src/app/router.tsx`](src/app/router.tsx).
Those entries are marked `soon` in the sidebar.

---

## 2. Quick start

```bash
cp .env.example .env      # then point VITE_API_BASE_URL at your API
npm install
npm run dev               # http://localhost:5173
```

The API must be running, and its `CORS_ORIGINS` must include `http://localhost:5173`
(the shipped `.env.example` in the API already does).

### First sign-in

The API's seed creates `admin` / `ChangeMe123` with `mustChangePassword` set. Until that
password is changed the API answers **403 `auth.mustChangePassword`** on every other
endpoint, so the app routes straight to `/change-password` and only releases the rest of
the UI once the change succeeds. All sessions are revoked on success — sign in again with
the new password.

### Environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | API base URL **including** the version prefix. The API uses URI versioning, so the `/v1` is required. |
| `VITE_API_DOCS_URL` | `http://localhost:3000/api/docs-json` | Where `npm run gen:api` reads the OpenAPI document. Served in non-production only. |
| `VITE_DEFAULT_LOCALE` | `lo` | `lo` or `en`. A stored user choice wins over this. |
| `VITE_SCHOOL_NAME_LO` / `_EN` | VPSI School | Shown on the login screen and in the sidebar. |

Nothing else is configurable at build time; colour, spacing and radii are design tokens
(below), not env vars.

### Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Dev server on port 5173 (fixed — it is the origin the API whitelists) |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | `tsc` only |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run test` | Vitest run |
| `npm run test:watch` | Vitest watch |
| `npm run gen:api` | Regenerate `src/types/api-schema.d.ts` from the live OpenAPI document |

---

## 3. Design tokens

Colour is defined in exactly one file: [`src/styles/theme.css`](src/styles/theme.css).
[`tailwind.config.ts`](tailwind.config.ts) only maps those variables onto utility names
(`bg-primary`, `text-muted-foreground`, `border-border`, …). No component contains a hex
value, so re-skinning the panel is an edit to that one file.

| Role | Value | Used for |
| ---- | ----- | -------- |
| `--primary` | `#116830` | Sidebar, primary buttons, active state, focus ring |
| `--secondary` | `#FFFFFF` | Page and card surfaces, text on primary |
| `--success` | `#15803D` | `active`, `approved`, `present` |
| `--warning` | `#B45309` | `pending`, `on_leave`, `late`, `grading` |
| `--danger` | `#B91C1C` | `dropped`, `failed`, `absent`, destructive actions |
| `--info` | `#1D4ED8` | `upcoming`, `draft`, `queued` |
| neutral | zinc scale | Secondary text, borders, disabled state |
| `--radius` | `0.5rem` | shadcn/ui default scale |
| font | Noto Sans Lao → Inter | Lao first so mixed lo/en strings keep one weight |

Status colour is decided once, for every enum the API can return, in
[`StatusBadge`](src/components/common/StatusBadge.tsx) — so `active` is the same green in
the students table, the teacher drawer and the dashboard.

The five chart series are **validated for colour-vision deficiency**: every adjacent pair
keeps ΔE ≥ 8 under protan and tritan simulation, each step clears the chroma floor so
none reads as grey, and all five hold ≥ 3:1 against the card surface. Changing one means
re-running that check.

---

## 4. Class placement — where "which class is this student in?" lives

Placement is **not** a field on the student. It is a row in the API's `enrollments`
collection (student × classroom × school year), because a student's movement across
classes and years is itself the record. The API enforces the rules: one active
enrollment per student per school year, classroom capacity, the headcount written in
the same transaction, an auto-assigned roll number, and a fixed set of status moves
(`active` → transferred / promoted / dropped / repeated).

The flow this admin panel implements:

1. **Create the student.** Saving succeeds on its own — a student with no class is a
   valid record, and forcing a class at creation would mean a full classroom loses
   the whole form.
2. **Get asked, immediately.** The moment the student is saved, the panel offers to
   place them. This matters because an unplaced student is invisible to rosters,
   score entry and attendance, and nothing else in the UI would have said so.
3. **Or place them later, in bulk.** `Enrollment → Placement queue` lists every
   student with no class for the active year, multi-select, pick a class, submit. The
   API's bulk endpoint runs each row in its own transaction, so a class filling up
   mid-batch rejects only the rows that no longer fit — those come back named, with
   the reason, rather than as one opaque failure.
4. **See and move them.** `Enrollment → Class roster` lists a class in roll-number
   order with its occupancy, and is where a transfer, promotion, drop or repeat is
   recorded. A transfer creates the destination placement and adjusts both
   headcounts atomically.

Placement is visible in three places: a **Classroom** column on the students table
(with `Not placed` as a warning badge), a **placement filter** on that table, and an
**Enrollment history** tab on the student detail page.

### Two API additions this required

The students list could previously be *filtered* by classroom but did not *return* the
classroom, and there was no way to ask for "students with no class" — so both were
added to the API (`vpsischool-api`):

| Change | Why |
| ------ | --- |
| `currentEnrollment` on each row of `GET /students` | A classroom column otherwise needs one request per row. Resolved with a single extra query keyed on the ids already fetched — deliberately not an `$lookup` in the main pipeline, which would join across the whole collection to return 20 rows. |
| `?enrolled=false&schoolYearId=` on `GET /students` | The placement queue. Without it, finding unplaced students means downloading every student and every enrollment and diffing them client-side. |

Both default to the active school year when `schoolYearId` is omitted.

---

## 5. How it is put together

```
src/
  app/          router, providers, guards, error boundary, 404
  components/
    ui/         shadcn primitives, themed
    layout/     Sidebar, Topbar, AppLayout, LocaleSwitcher, nav-config
    common/     DataTable, FormDialog, ConfirmDialog, DetailDrawer, StatusBadge,
                FileUpload, EmptyState, ErrorState, fields, EntitySelect, …
  features/     one folder per module: api.ts · components/ · pages/
  hooks/        use-table-query-state, use-crud-dialogs, use-debounced-value, …
  lib/          api-client, api-error, crud, permissions, payload, zod-helpers, utils
  i18n/         config + lo/en catalogues
  styles/       theme.css (all tokens) + index.css
  types/        enums, entities, common, api-schema.d.ts (generated)
```

A few decisions worth knowing before changing things:

**Auth.** The access token lives in a module variable only — never `localStorage` — so a
successful XSS cannot read it back after the tab closes. The refresh token *is* persisted,
because otherwise every reload would force a re-login; it is single-use and the API
revokes all sessions if a rotated one is replayed. A reload therefore starts by exchanging
it (`restore()` in [`features/auth/store.ts`](src/features/auth/store.ts)), and
`RequireAuth` holds the UI on a spinner while that is in flight rather than bouncing to
`/login`. Concurrent 401s are collapsed into **one** refresh request by a single-flight
guard in [`lib/api-client.ts`](src/lib/api-client.ts) — without it, a burst of parallel
refreshes would look like token theft and log the user out.

Moving to an httpOnly refresh cookie is a backend change (set-cookie + CSRF); only
[`lib/token-store.ts`](src/lib/token-store.ts) would change here.

**Permissions.** [`nav-config.ts`](src/components/layout/nav-config.ts) is the single table
that says which route needs which `resource`/`action`. It is read twice — to filter the
sidebar and to wrap each route in `RequirePermission` — which is what stops a menu entry
and its guard from drifting apart. This decides only what is *shown*; the API enforces the
same matrix on every request, so a hand-typed URL reaches nothing extra. `manage` implies
every other action.

**Types.** Request DTOs and query parameters come from the API's OpenAPI document
(`npm run gen:api` → `src/types/api-schema.d.ts`). Responses are *not* described there —
the API returns serialized Mongoose documents — so response shapes are hand-written in
[`types/entities.ts`](src/types/entities.ts), mirroring the API's schemas with the two
transforms its serializer applies: `_id` → `id`, `Date` → ISO string. Reference fields are
`Ref<T>`: an id on list endpoints, a populated object on detail endpoints — read them with
`refId()` / `refObject()`.

**Tables.** Server-side paging, sorting and filtering throughout; TanStack Table is used
for column definition and rendering only (`manualPagination`/`manualSorting`). A column
opts into sorting by declaring `meta.sortKey` — the field name the endpoint whitelists.
Table state lives in the URL ([`use-table-query-state.ts`](src/hooks/use-table-query-state.ts)),
so a filtered roster is linkable and survives a reload or a back-navigation from a detail
page.

**Forms.** One Zod schema per form, mirroring the API's DTO constraints. Two conventions:
validation messages are stored as **i18n keys** and translated at render time
([`lib/form-message.ts`](src/lib/form-message.ts)) so they follow the language switcher
instead of freezing at import; and blank optional inputs are dropped from the payload by
`stripEmpty()` ([`lib/payload.ts`](src/lib/payload.ts)) — the API validates with
`forbidNonWhitelisted`, where `email: ''` is a malformed address rather than an absent
field.

**Errors.** Every failure becomes an `ApiError`. The API's exception filter returns a
stable `messageKey` (`auth.invalidCredentials`, `common.duplicate`, …), which the frontend
translates itself and falls back to the API's own localised `message`. A failed *query*
renders an error state in place; a failed *mutation* raises a toast. Every table and page
has skeleton, empty and error states.

**CRUD boilerplate.** Nine modules expose the same five endpoints, so `createCrudApi` /
`createCrudHooks` in [`lib/crud.ts`](src/lib/crud.ts) generate the typed client and the
query hooks, including cache invalidation. Anything beyond CRUD (activate, close, photo
upload, guardian replacement) is written explicitly in the module's own `api.ts`.

---

## 6. Tests

```bash
npm run test
```

Covers the two pieces every screen is built from:

- [`DataTable.test.tsx`](src/components/common/DataTable.test.tsx) — rows, skeletons, empty
  and error states, which columns are sortable and the API field name they report, the
  `aria-sort` marker, server-side paging and its edge-disabled controls, row clicks.
- [`GradeLevelsPage.test.tsx`](src/features/grade-levels/pages/GradeLevelsPage.test.tsx) —
  the shared form path: required-field validation blocking submit, blank optionals being
  dropped from the payload, edit prefill + PATCH to the right record, and a numeric bound
  rejected client-side.
- [`StudentsPage.test.tsx`](src/features/students/pages/StudentsPage.test.tsx) — the
  create-student flow, including the guardian list's two group-level rules and the exact
  payload sent when a guardian is created alongside the student.
- [`enrollment-flow.test.tsx`](src/features/enrollments/enrollment-flow.test.tsx) —
  placement: the classroom column, the unplaced badge, the offer to place a student right
  after creating them, the queue asking the API to filter, the bulk request keyed by
  student code, and a partially-rejected batch naming the students it failed on.
- [`StudentDetailPage.test.tsx`](src/features/students/pages/StudentDetailPage.test.tsx) —
  every tab renders, and the guardians editor opens (a regression guard).

Tests run against the **English** catalogue (`src/test/setup.ts`), which also means a
missing English key fails a test rather than shipping.

---

## 7. Known gaps

- **File upload needs object storage.** Student and teacher photo upload posts to the API's
  multipart endpoints, which require the S3/MinIO bucket to exist. With the bucket
  unreachable the API logs `Bucket "vpsischool" is not reachable` and uploads fail — run
  `docker compose up minio minio-init` in the API project first.
- **Excel import** for enrollment is not built. The API's bulk endpoint takes JSON rows
  (`studentCode` + `classroomId`), which the placement queue uses for multi-select; parsing
  a spreadsheet into those rows still needs a file-import step.
- **The rest of phases 2–6** are routed placeholders, as described above.
- `react-day-picker` is installed for the Phase 5 calendar view and is not used yet.
- The dashboard derives its totals from `meta.total` on `limit=1` list queries, because the
  API has no aggregate endpoint. That is one small request per figure; a
  `/statistics` endpoint on the API would collapse them into one.
