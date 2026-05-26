# PVD Library — Project Documentation

## Overview

PVD Library is a full-featured library management system built for a Cambodian library. It covers the full lifecycle of physical book circulation, e-book access, member management, fines, reservations, inventory, and reporting. The UI is bilingual (English / Khmer) and targets library staff (admin, librarian) and members (patrons).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma 6 |
| Auth | NextAuth v5 (beta) + Prisma Adapter |
| Styling | Tailwind CSS v4 |
| i18n | next-intl (locale prefix routing) |
| Charts | Recharts |
| Barcode scan | @zxing/browser |
| Barcode gen | JsBarcode |
| Excel | xlsx (SheetJS) |
| Email | Nodemailer |
| Validation | Zod + React Hook Form |

> **Important:** Prisma uses `db push` — no migration files. After any schema change, run `npx prisma generate` then restart the dev server.

---

## Directory Structure

```
pvd-library/
├── app/
│   ├── [locale]/             # All UI pages (locale-prefixed)
│   │   ├── admin/            # Staff-only pages
│   │   │   ├── page.tsx      # Dashboard
│   │   │   ├── books/        # Book catalog management
│   │   │   ├── members/      # Member management
│   │   │   ├── circulation/  # Issue / return / active loans
│   │   │   ├── baskets/      # Batch circulation baskets
│   │   │   ├── fines/        # Fine management
│   │   │   ├── reservations/ # Reservation queue
│   │   │   ├── inventory/    # Stock-take
│   │   │   ├── ebooks/       # E-book management
│   │   │   ├── reports/      # Analytics + custom reports
│   │   │   ├── database/     # Backup, health, cleanup, export
│   │   │   ├── settings/     # System settings
│   │   │   ├── taxonomy/     # Authors, categories, publishers
│   │   │   └── users/        # User accounts
│   │   ├── discover/         # Public book catalog
│   │   ├── loans/            # Member's own loans
│   │   ├── ebooks/           # Member e-book access
│   │   ├── requests/         # Member book requests
│   │   ├── basket/           # Member basket view
│   │   └── auth/             # Login, verify
│   └── api/                  # All API routes
├── components/
│   ├── admin/                # Admin UI components
│   └── shared/               # Shared UI components
├── lib/                      # Server utilities
├── prisma/
│   └── schema.prisma         # Single source of truth for DB
├── messages/                 # i18n strings (en.json, km.json)
├── backups/                  # Local JSON snapshots (gitignored)
└── scripts/                  # Seed / utility scripts
```

---

## Data Models

### Core Entities

```
User ──────── Account / Session (NextAuth)
  │
  └── Member ──── Loan ──── BookCopy ──── Book
                │       └── Fine
                ├── Reservation ──── Book
                ├── BookRequest
                ├── BasketItem ──── Basket
                └── Notification
```

### Book Catalog

| Model | Key Fields | Notes |
|---|---|---|
| `Book` | title, titleKm, isbn, barcode, materialType, totalCopies, availableCopies, referenceOnly | Denormalised copy counts |
| `BookCopy` | copyNumber, barcode, rfid, status, condition, loanable | Physical copy of a Book |
| `Author` | name | Shared across books |
| `Category` | name | Used for pie charts |
| `Publisher` | name | |
| `Location` | name, floor, shelf | Shelf location |

### Circulation

| Model | Key Fields | Notes |
|---|---|---|
| `Loan` | memberId, bookId, copyId, dueDate, returnDate, status, loanType, renewalCount | Core borrow record |
| `Fine` | loanId, memberId, amount, daysLate, status | 1:1 with Loan |
| `Reservation` | memberId, bookId, copyId, status, expiresAt, holdShelf | Queue for unavailable books |
| `Basket` | name, description | Named batch-issue container |
| `BasketItem` | basketId, copyId, tagged | Copy in a basket; `tagged` = selected for batch action |

### Operations

| Model | Key Fields | Notes |
|---|---|---|
| `Inventory` | status, startedAt, completedAt | Stock-take run |
| `InventoryItem` | inventoryId, copyId, found, condition | Result per copy |
| `Notification` | memberId, type, status, channel | Due-soon / overdue alerts |
| `Settings` | key, value | Key-value config store |

---

## Enums Reference

```
Role:               ADMIN | LIBRARIAN | STAFF | MEMBER
MemberType:         STUDENT | TEACHER | STAFF | PUBLIC
LoanStatus:         ACTIVE | RETURNED | OVERDUE | LOST
LoanType:           HOME | IN_LIBRARY
FineStatus:         UNPAID | PAID | WAIVED
ReservationStatus:  PENDING | APPROVED | READY | CANCELLED | FULFILLED | EXPIRED
CopyStatus:         AVAILABLE | BORROWED | RESERVED | LOST | DAMAGED | WITHDRAWN
BookCondition:      EXCELLENT | GOOD | FAIR | POOR | DAMAGED | LOST | WITHDRAWN | ARCHIVED
MaterialType:       BOOK | MAGAZINE | JOURNAL | NEWSPAPER | DVD | AUDIO_CD | THESIS | MAP | OTHER
EbookType:          PDF | EPUB | LINK | VIDEO | AUDIO
BookRequestStatus:  PENDING | APPROVED | REJECTED | FULFILLED
```

---

## Authentication & RBAC

- Auth provider: **NextAuth v5** with Email (magic link) + Credentials
- Session stored in DB via Prisma Adapter
- Every user has a `Role`; every staff member has both a `User` and optionally a linked `Member`
- RBAC helper: `lib/rbac.ts` → `can(role, "ADMIN"|"LIBRARIAN"|"STAFF")`

| Role | Access |
|---|---|
| ADMIN | All pages + database tools + user management |
| LIBRARIAN | Books, members, circulation, reports, export |
| STAFF | Circulation (issue/return) only |
| MEMBER | Own loans, reservations, book requests, ebooks |

---

## Business Logic

### Loan Lifecycle

```
Book searched → Copy auto-picked (or scanned) → Loan created (ACTIVE)
    → Due date passed → Cron/cleanup marks OVERDUE
    → Fine created ($finePerDay × daysLate) for HOME loans only
    → Staff returns book → RETURNED, copy back to AVAILABLE
    → OR staff marks LOST → LOST status, fine may be applied
```

**Loan Types:**

| | HOME | IN_LIBRARY |
|---|---|---|
| Due date | today + loanDays (default 14) | end of today |
| Quota counted | Yes | No |
| Overdue blocks issue | Yes | No (only expired membership blocks) |
| Renewals | Allowed (up to MAX_RENEWALS) | **Not allowed** |
| Fines | Yes (per day) | **No** |
| Copy leaves library | Yes | No |

**Membership expired** blocks ALL loan types (both HOME and IN_LIBRARY).

**In-library limit:** 1 book at a time. If member already has an active in-library loan, librarian sees a conflict alert and must explicitly click "Allow Anyway" to override.

### Copy Count Denormalization

`Book.totalCopies` and `Book.availableCopies` are stored directly on the `Book` for fast queries. They must be kept in sync — every borrow, return, and copy creation increments/decrements accordingly. The **cleanup job** (step 7) recalculates these from actual `BookCopy.status` values to fix any drift.

### Reservations

```
Member reserves book → PENDING
Staff approves + assigns copy → APPROVED → copy set to RESERVED
Book ready at desk → READY, holdShelf set
Member collects → FULFILLED
Reservation expires (expiresAt < now) → EXPIRED
```

The cleanup job expires stale PENDING/APPROVED reservations and releases orphan RESERVED copies back to AVAILABLE.

### Baskets (Batch Circulation)

Baskets are named containers for batch-issuing books to a group (e.g. a class). Each `BasketItem` links a specific copy (`copyId`) to a basket with a `tagged` boolean.

- **Tagged** = selected for the next batch action (issue / return)
- **Untagged** = in the basket but excluded from current batch
- A copy can be in multiple baskets (as siblings, informational only)
- When adding to a basket from the circulation UI, the librarian chooses tagged or untagged at add time
- Batch actions can scope to "tagged only" or "all in basket"

### Fines

- Auto-created by the cleanup job for `OVERDUE` + `loanType = HOME` loans with no fine
- Fine amount = `daysLate × finePerDay` (setting key: `finePerDay`, default $0.25)
- Statuses: UNPAID → PAID or WAIVED
- IN_LIBRARY loans never generate fines

### Renewals

- Only for HOME loans
- Max renewals controlled by `MAX_RENEWALS` setting (default: 2)
- Due date extends from `max(today, currentDueDate) + DEFAULT_LOAN_DAYS`
- Renewing an OVERDUE loan un-flags it back to ACTIVE

---

## API Routes

### Books & Catalog
| Route | Methods | Description |
|---|---|---|
| `/api/books` | GET, POST | Search books (`?q=`, `?copies=true`), create |
| `/api/books/[id]` | GET, PATCH, DELETE | Single book |
| `/api/books/[id]/copies` | GET, POST | Copies for a book (with basket membership) |
| `/api/books/batch` | POST | Bulk create |
| `/api/books/import` | POST | CSV/Excel import |

### Circulation
| Route | Methods | Description |
|---|---|---|
| `/api/loans` | GET, POST | List / create single loan |
| `/api/loans/batch` | POST | Multi-book batch loan (`loanType` supported) |
| `/api/loans/[id]` | GET, PATCH | Get / renew / return / mark lost |
| `/api/loans/[id]/renew` | POST | Extend due date (HOME only) |
| `/api/reservations` | GET, POST | List / create |
| `/api/reservations/[id]` | PATCH, DELETE | Update status |

### Baskets
| Route | Methods | Description |
|---|---|---|
| `/api/baskets` | GET, POST | List / create basket |
| `/api/baskets/[id]` | GET, PATCH, DELETE | Single basket |
| `/api/baskets/[id]/items` | GET, POST, DELETE | Add/remove copies; supports `tagged`, `copyIds`, `bookIds`, `barcode`, `isbn` |
| `/api/baskets/[id]/actions` | POST | Batch issue / return |

### Admin DB Tools
| Route | Methods | Description |
|---|---|---|
| `/api/admin/db/health` | GET | Integrity scan |
| `/api/admin/db/cleanup` | POST | Fix overdue, expired reservations, fines, copy counts (`dryRun` support) |
| `/api/admin/db/backup` | GET, POST, DELETE | List / create / delete / download JSON snapshots |
| `/api/admin/db/export` | GET | Export tables to `.xlsx` |

### Reports
| Route | Methods | Description |
|---|---|---|
| `/api/reports` | GET | Analytics data (monthly trends, popular books, etc.) |
| `/api/reports/export` | GET | Export loans report |
| `/api/reports/custom` | GET | Tabular custom reports (`?type=overdue\|unpaid-fines\|active-loans\|reservations\|new-acquisitions\|low-stock\|never-borrowed\|book-requests\|expiring-members`); supports `?format=csv\|xlsx` |

---

## Frontend Pages

### Admin

| Page | Purpose |
|---|---|
| `/admin` | Dashboard — stats, recent activity, quick actions |
| `/admin/circulation` | Issue/return loans, active loans with filter/sort |
| `/admin/books` | Book catalog, copy management (BookCopiesPanel) |
| `/admin/members` | Member list and detail |
| `/admin/baskets` | Basket list; basket detail with scan, copy picker, batch actions |
| `/admin/fines` | Fine list, mark paid/waived |
| `/admin/reservations` | Reservation queue management |
| `/admin/reports` | Analytics charts (tab 1) + 9 custom tabular reports (tab 2) |
| `/admin/database` | Health check, cleanup, backup history, Excel export |
| `/admin/settings` | MAX_LOANS, MAX_RENEWALS, finePerDay, loan days, etc. |
| `/admin/inventory` | Stock-take runs |
| `/admin/taxonomy` | Authors, categories, publishers, locations |

### Member Portal

| Page | Purpose |
|---|---|
| `/discover` | Browse books, filter by category/type |
| `/loans` | Own loan history |
| `/ebooks` | Browse and read e-books |
| `/requests` | Submit new book requests |
| `/basket` | View basket membership |

---

## Database Tools

Located at `/admin/database`. Auto-runs health check on page load.

### Health Check
Scans for: loans marked active past due date, loans with return date still active, expired reservations not marked, stale pending reservations (>30 days), overdue take-home loans with no fine, stale in-library loans from previous days, negative/overflow copy counts, expired active memberships.

### Cleanup (7 steps)
1. Mark ACTIVE loans past dueDate as OVERDUE
2. Mark expired PENDING/APPROVED reservations as EXPIRED
3. Deactivate expired memberships
4. Create fines for OVERDUE **HOME** loans with no fine
5. Revert orphan READY reservations (copy not actually RESERVED) → APPROVED
6. Release orphan RESERVED copies (no READY reservation) → AVAILABLE
7. Recalculate `totalCopies` / `availableCopies` from actual copy statuses

Supports `dryRun: true` — previews without writing.

### Backup
JSON snapshot of all 19 tables saved to `/backups/{timestamp}/`. Includes `manifest.json` (metadata) and `snapshot.json` (data). Downloadable and deletable from the UI.

### Export
Excel export of individual tables or all at once: Books, Book Copies, Members, Loans (with LoanType), Fines, Reservations, Book Requests, Ebooks.

---

## Internationalization

- Routing: `[locale]` prefix — `/en/admin/...` and `/km/admin/...`
- **Single source of truth:** `lib/locales.ts` — exports `ALL_LOCALES`, `LOCALE_CODES`, `DEFAULT_LOCALE`
- `i18n/routing.ts` — uses `LOCALE_CODES` via `defineRouting`
- `i18n/request.ts` — checks DB-enabled locales; disabled locale → redirect to default; missing translation → fall back to `en.json`
- `lib/get-enabled-locales.ts` — server utility; always ensures `DEFAULT_LOCALE` ("en") is included
- `lib/navigation.ts` — re-exports `useRouter`, `usePathname`, `Link`, `redirect` from `createNavigation(routing)`. **Import from here** in client components needing locale-aware navigation, not from `next/navigation`
- Locale switching uses `window.location.href` (hard redirect) — reliable across all router states
- `DEFAULT_LOCALE` ("en") is always enabled and cannot be disabled via the UI

### Context providers (populated server-side in `app/layout.tsx`, passed via `components/Providers.tsx`)

| Provider | Hook | Source |
|---|---|---|
| `EnabledLocalesProvider` | `useEnabledLocales()` | `ENABLED_LOCALES` setting |
| `LibraryNameProvider` | `useLibraryName()` | `LIBRARY_NAME` setting |
| `LibraryLogoProvider` | `useLibraryLogo()` | `LIBRARY_LOGO` setting |

After any settings save that affects context (locales, name, logo), call `router.refresh()` from `next/navigation` to re-run server components.

### Adding a new language

1. Add entry to `lib/locales.ts`
2. Create `messages/{code}.json` (copy `en.json` as starting point)
3. Enable in **Settings → Languages**, restart dev server

---

## Logo System

- Upload via **Settings → Library Information** (PNG/JPG/WebP/SVG ≤ 2 MB)
- Saved to `public/uploads/logo.{ext}` with `?v={timestamp}` cache-buster stored in DB
- API: `POST /api/settings/logo` (upload), `DELETE /api/settings/logo` (remove)
- **`LIBRARY_LOGO` is excluded from the bulk `PUT /api/settings` endpoint** — managed exclusively via `/api/settings/logo` to prevent accidental overwrite
- Displayed in admin sidebar (`w-12 h-12`) and Discover nav (`w-9 h-9`); falls back to `BookOpen` icon
- Sidebar: outer div is `relative` (no `overflow-hidden`) so the alert dot is never clipped; inner div has `overflow-hidden` to clip the logo only

---

## IN_LIBRARY Loans — Business Rules

| Rule | HOME | IN_LIBRARY |
|---|---|---|
| Due date | today + loanDays | end of today |
| Quota counted | Yes | **No** (independent) |
| Overdue blocks issue | Yes (hard block) | **No** (advisory warning only) |
| Existing loans block | Yes (quota) | **Advisory warning only** — librarian must click "Allow Anyway" |
| Expired membership | Hard block | Hard block |
| Renewals | Allowed | **Not allowed** |
| Fines | Yes | **No** |
| Limit | MAX_LOANS_PER_MEMBER | 1 at a time (advisory) |

**Conflict detection:** When switching to IN_LIBRARY mode, the system checks:
- `inLibHasOverdue` — member has any overdue loan (HOME or IN_LIBRARY)
- `inLibHasExisting` — member already has active/overdue IN_LIBRARY loans

Both show a combined warning block with a single "Allow Anyway" button (`inLibOverride`). The submit button is disabled while `inLibNeedsOverride` is true.

**After a successful borrow**, the IN_LIBRARY loan list is refreshed (both ACTIVE + OVERDUE fetched) so the conflict warning shows the correct count for the next attempt in the same session.

---

## Key Conventions

- **No migration files** — schema changes use `npx prisma db push` then `npx prisma generate`
- **Compound unique keys** — `BasketItem` has `@@unique([basketId, copyId])` — use `createMany + skipDuplicates` or `findFirst + update` instead of `upsert` if client types are stale
- **Denormalized counts** — always update `Book.availableCopies` and `Book.totalCopies` in the same transaction as copy status changes
- **Auth checks** — every API route starts with `const session = await auth()` and role check
- **RBAC** — use `can(session.user?.role, "LIBRARIAN")` from `lib/rbac.ts`
- **Date formatting** — use `date-fns` throughout; ISO strings in API, `toLocaleDateString()` in UI
- **Error responses** — always `{ error: "message" }` with appropriate HTTP status
- **Tailwind v4** — no config file needed for basic usage; utility-first throughout
- **Locale-aware navigation** — import `useRouter`/`usePathname` from `@/lib/navigation`, not `next/navigation`, in client components that need locale-aware routing
- **Settings refresh** — after saving any setting that affects context providers (logo, name, locales), call `router.refresh()` from `next/navigation`
- **Logo management** — never include `LIBRARY_LOGO` in bulk settings saves; use `POST/DELETE /api/settings/logo` exclusively
- **Form accessibility** — all `<label>` elements must have `htmlFor` matching the field's `id`; group labels (checkbox sets, custom components) use `<p>` instead of `<label>`

---

## Disk & Maintenance

| Folder | Size | Notes |
|---|---|---|
| `node_modules/` | ~1.2 GB | Normal — gitignored |
| `.next/dev` | 0.5–2 GB | Turbopack cache — delete freely (`rd /s /q .next`) |
| `public/uploads/` | Varies | User files — gitignored |

Run `rd /s /q .next` (Windows) or `rm -rf .next` (macOS/Linux) whenever disk space is tight. Rebuilds automatically on next `npm run dev`.

**Turbopack preload warnings** in the browser console (`[root-of-the-server]__xx._.css preloaded but not used`) are a known Turbopack dev-mode bug — not your code, not a real problem. They do not appear in production builds.
