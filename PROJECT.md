# PVD Library — Project Documentation

Full-featured library management system built with Next.js + PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS + lucide-react |
| ORM | Prisma 6 + PostgreSQL |
| Auth | NextAuth v5 (credentials, JWT) |
| i18n | next-intl v4.12.0 (English + Khmer) |
| Barcode | @zxing/browser (webcam scan) |
| Other | bcryptjs, zod, date-fns, xlsx, recharts |

> **Note:** Prisma 7 was evaluated but requires adapters — project stays on Prisma 6.

---

## Running the Project

```bash
npm install
npm run db:push        # sync schema to DB (no migration history needed)
npm run db:seed        # create admin account + sample data
npm run dev            # start dev server on localhost:3000
```

**Admin login:** `admin@pvdlibrary.com` / `admin123`

---

## Project Structure

```
app/
  [locale]/
    admin/          # All admin pages
    auth/login/     # Staff login (split / glass / minimal themes)
    member/         # Member-facing pages
  api/              # All API routes

lib/                # Shared utilities
  auth.ts           # NextAuth config
  prisma.ts         # Prisma client
  rbac.ts           # Role-based access (ADMIN > LIBRARIAN > STAFF > MEMBER)
  locales.ts        # Single source of truth for languages
  navigation.ts     # Locale-aware router (import from here, not next/navigation)

prisma/
  schema.prisma
  seed.ts

messages/
  en.json           # English translations
  km.json           # Khmer translations
  fr.json           # French translations
```

---

## Modules

### 1. OPAC — Discover (Member-facing)
- Public book catalog with search, filter by category/type/audience
- Reserve books, request new acquisitions
- Member portal (loans, fines, reservations)

### 2. Books
- Full CRUD with ISBN lookup / AI enrichment
- Barcode generation (prefix `PVD-`, configurable)
- Physical copies management — add copies, set condition, status
- Copy statuses: `STOCK → AVAILABLE | FOR_SALE | BORROWED | RESERVED | LOST | DAMAGED | WITHDRAWN`
- E-Library attachments (PDF/ePub)

### 3. Members
- CRUD with Member ID (e.g. `MEM-2024-0001`)
- Types: STUDENT, TEACHER, STAFF, PUBLIC
- Membership expiry, incidents log

### 4. Circulation
- Borrow / return via barcode scan or ID
- Loan types: HOME (take away) or IN_LIBRARY (reading room)
- Auto overdue detection, renewal (up to `MAX_RENEWALS`)

### 5. Fines
- Auto-calculated at `FINE_PER_DAY` per overdue copy
- Mark as paid, waive, batch operations

### 6. Reservations
- Member reserves a copy; hold shelf expires after `RESERVATION_EXPIRE_DAYS`

### 7. Stock Management ← new
Full warehouse-style stock workflow:

| Action | What it does |
|--------|-------------|
| **Receive to Stock** | Move any copy → `STOCK`. Scan barcode or paste IDs. API resolves barcodes → UUIDs automatically. |
| **Deploy Stock** | Move `STOCK` copies → `AVAILABLE` (shelf) or `FOR_SALE` (bookstore). Select branch + optional price. |
| **In Stock panel** | Auto-loads on page open. Shows copies awaiting deployment, grouped by book. Includes info note: copies added directly to a book start as `AVAILABLE` and skip this panel — use Receive to bring them in. |
| **For Sale Inventory** | Price management for `FOR_SALE` copies. Set per-copy or bulk-set all copies of a book. |

Key routes: `POST /api/stock/receive`, `POST /api/stock/deploy`, `GET /api/stock/copies?status=STOCK|FOR_SALE`

### 8. Sale Orders (Bookstore mode)
- Enabled via `BOOK_SALE_ENABLED = true` in Settings
- Cart → Order → Payment flow for FOR_SALE copies
- Revenue and tax tracking

### 9. Reports ← improved
Three tabs:

#### Analytics
- Live stats: borrowed, returned, overdue, fines collected
- Charts: monthly trend, category distribution, copy status/condition, popular books, top members
- Collection snapshot: total titles, copies, active members
- Export: `GET /api/reports/export?format=xlsx|csv`

#### Custom Reports
- **30+ report types** in 6 groups: Circulation, Overdue & Fines, Collection, Members, Analytics, Sales
- **Searchable sidebar** — filter by name or description
- **Single click** = select report · **Double-click** = select + run immediately (scrolls to results)
- Results table: **sortable columns** (click header), **50-row pagination**, CSV + Excel export
- Shared date filter with **quick presets**: Today / Week / Month / Year / Clear
- Fetch: `GET /api/reports/custom?type=...&from=...&to=...&branchId=...`

#### SQL Query (Admin only)
- Dark SQL editor; `Ctrl+Enter` to run
- `SELECT` / `WITH` only — DML/DDL blocked
- Auto-caps results at 1,000 rows
- **Saved Templates** — save, edit, delete named queries (stored in `QueryTemplate` table)
- API: `POST /api/reports/query`, `GET|POST /api/reports/templates`, `PATCH|DELETE /api/reports/templates/[id]`

### 10. Settings
- All stored in `Settings` table as key-value pairs
- Loan policy, fines, library info, appearance (theme, auth style), languages, logo

| Key | Default | Notes |
|-----|---------|-------|
| `DEFAULT_LOAN_DAYS` | 14 | |
| `FINE_PER_DAY` | 0.50 | |
| `MAX_RENEWALS` | 2 | |
| `MAX_LOANS_PER_MEMBER` | 3 | |
| `RESERVATION_EXPIRE_DAYS` | 7 | |
| `LIBRARY_NAME` | PVD Library | |
| `BARCODE_PREFIX` | PVD | |
| `BARCODE_PADDING` | 6 | |
| `DEFAULT_STAFF_THEME` | ocean | ocean / midnight / emerald |
| `DEFAULT_STAFF_AUTH_STYLE` | split | split / glass / minimal |
| `ENABLED_LOCALES` | all | JSON array; "en" always forced in |
| `LIBRARY_LOGO` | "" | Via `/api/settings/logo` only |
| `BOOK_SALE_ENABLED` | false | Enables bookstore/FOR_SALE mode |
| `STOCK_CURRENCY` | USD | Currency for stock & sale panels |

### 11. Other Admin Tools
- **AI Assistant** — book enrichment, duplicate detection, cover fetching
- **Barcodes** — print barcode labels (individual or batch)
- **Processing Queue** — workflow for cataloguing new arrivals
- **Book Baskets** — curated reading lists
- **Inventory** — physical shelf-check workflow
- **Weeding** — identify candidates for removal
- **Acquisition** — purchase request workflow
- **Task Board** — staff task management (AI-generated or manual)
- **Database** — admin DB tools
- **Users & Permissions** — role management (ADMIN / LIBRARIAN / STAFF / MEMBER)

---

## i18n Architecture

- `lib/locales.ts` — **only file to edit** when adding a language. Add entry, create `messages/{code}.json`.
- `i18n/routing.ts` — uses `LOCALE_CODES` from locales.ts.
- `i18n/request.ts` — disabled locale → redirect to default; missing translation → fall back to en.json.
- Locale switching uses `window.location.href` (hard redirect).
- **Import `useRouter`/`usePathname` from `@/lib/navigation`**, not from `next/navigation`, in client components.

---

## Auth & Roles

| Role | Access |
|------|--------|
| ADMIN | Everything including SQL Query, User management |
| LIBRARIAN | Stock, reports, circulation, books |
| STAFF | Circulation, members |
| MEMBER | OPAC, own loans/fines |

`can(role, requiredRole)` in `lib/rbac.ts` — hierarchical check.

---

## Key Conventions

- All pages under `app/[locale]/...` — routing is always locale-prefixed.
- `proxy.ts` (not `middleware.ts`) — Next.js 16 renamed this convention.
- After settings save that affects context (locales, library name, logo) → call `router.refresh()`.
- Logo managed exclusively via `/api/settings/logo` (not included in bulk PUT `/api/settings`).
- `DATABASE_URL` in `.env`.
