# PVD Library

A full-featured library management system built for a Cambodian library. Covers the complete lifecycle of physical book circulation, e-book access, member management, fines, reservations, inventory, and reporting. The UI is bilingual (English / Khmer) and targets both library staff and member patrons.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma 6 |
| Auth | NextAuth v5 (Credentials + Google + Magic Link) |
| Styling | Tailwind CSS v4 |
| i18n | next-intl v4 (locale prefix routing) |
| Charts | Recharts |
| Barcode scan | @zxing/browser |
| Barcode gen | JsBarcode |
| Excel export | xlsx (SheetJS) |
| Email | Nodemailer |
| Validation | Zod |
| Fonts | Noto Sans Khmer (via next/font) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/pvd_library"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Push the database schema

```bash
npx prisma db push
npx prisma generate
```

### 4. Seed the admin account

```bash
npm run db:seed
```

Default admin credentials:
- **Email:** `admin@pvdlibrary.com`
- **Password:** `admin123`

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Key Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run db:seed` | Seed admin user |
| `npx prisma db push` | Apply schema changes (no migration files) |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma studio` | Open DB browser |

> **Schema changes:** This project uses `db push` — no migration files. After any `schema.prisma` change, run `npx prisma db push && npx prisma generate` then restart the dev server.

---

## Features

### Staff (Admin / Librarian / Staff)

- **Dashboard** — stats, recent activity, quick-action cards
- **Circulation** — issue / return books with barcode scan; active loans with overdue alerts
  - HOME loans: quota-enforced, renewals, fines on overdue
  - IN_LIBRARY (read in library): independent of HOME quota, no fines, advisory-only conflict warnings
- **Reservations** — approval queue, copy assignment, hold-shelf location
- **Books** — full catalog management, multi-copy tracking, barcode generation, cover upload, label printing
- **E-books** — upload PDFs/EPUBs or link to external video/audio
- **Members** — CRUD, membership expiry, overdue status
- **Fines** — auto-calculated on overdue HOME loans, mark paid / waived
- **Reports** — 9 custom tabular reports + analytics charts with date range
- **Inventory** — named stock-take sessions, scan copies, compare expected vs found
- **Baskets** — named batch-issue containers; tagged/untagged copies; batch actions
- **Barcode** — prefix/padding settings, bulk barcode generation
- **Taxonomy** — manage authors, categories, publishers, shelf locations
- **Users** — create / edit staff and member accounts, reset passwords, per-user auth method settings
- **Database tools** — health check, 7-step cleanup, JSON backup, Excel export
- **Settings** — loan policy, fines, barcode config, appearance theme, login style, languages, logo upload
- **Notifications** — due-soon / overdue alerts (configurable channel)

### Member Portal

- **Discover** — public book catalog with search and category filter
- **My Loans** — active and past loan history
- **E-books** — browse and open available digital content
- **Book Requests** — submit purchase suggestions
- **Basket** — view basket membership

---

## Roles & Access

| Role | Access |
|---|---|
| ADMIN | All pages, database tools, user management, settings |
| LIBRARIAN | Books, members, circulation, ebooks, reports, export |
| STAFF | Circulation (issue / return) only |
| MEMBER | Own loans, discover, ebooks, requests |

---

## i18n (Bilingual English / Khmer)

- All pages are under `app/[locale]/...` — routes are `/en/admin` or `/km/admin`
- **Single source of truth:** `lib/locales.ts` — add a new language here only
- Translation strings: `messages/en.json` and `messages/km.json`
- Enabled locales stored in DB (`ENABLED_LOCALES` setting); English is always on
- Locale switching uses `window.location.href` for reliability across all router states

### Adding a new language

1. Add an entry to `lib/locales.ts`
2. Create `messages/{code}.json` (copy `en.json` as a starting point)
3. Enable it in **Settings → Languages**

---

## Settings

All settings are stored in the `settings` table as key-value pairs.

| Key | Default | Description |
|---|---|---|
| `DEFAULT_LOAN_DAYS` | 14 | Days until take-home loan is due |
| `FINE_PER_DAY` | 0.50 | Fine rate in USD per overdue day |
| `MAX_RENEWALS` | 2 | Renewal limit per loan |
| `MAX_LOANS_PER_MEMBER` | 3 | Active take-home loan quota |
| `RESERVATION_EXPIRE_DAYS` | 7 | Days before unfulfilled reservation expires |
| `LIBRARY_NAME` | PVD Library | Shown in header and sidebar |
| `LIBRARY_EMAIL` | — | Contact info |
| `LIBRARY_PHONE` | — | Contact info |
| `BARCODE_PREFIX` | PVD | Prefix for generated barcodes |
| `BARCODE_PADDING` | 6 | Zero-padding for barcode numbers |
| `DEFAULT_STAFF_THEME` | ocean | UI theme (ocean / midnight / emerald) |
| `DEFAULT_STAFF_AUTH_STYLE` | split | Login page style (split / glass / minimal) |
| `DEFAULT_STAFF_AUTH_METHODS` | all | Allowed auth methods (JSON array) |
| `ENABLED_LOCALES` | all | Enabled UI languages (JSON array) |
| `LIBRARY_LOGO` | — | Managed via `/api/settings/logo` (PNG/JPG/WebP/SVG ≤ 2 MB) |

---

## Project Structure

```
pvd-library/
├── app/
│   ├── [locale]/               # All UI pages (locale-prefixed)
│   │   ├── admin/              # Staff-only pages
│   │   │   ├── page.tsx        # Dashboard
│   │   │   ├── books/          # Book catalog + copies + labels
│   │   │   ├── ebooks/         # E-book management
│   │   │   ├── members/        # Member management
│   │   │   ├── circulation/    # Issue / return / active loans
│   │   │   ├── reservations/   # Reservation queue
│   │   │   ├── fines/          # Fine management
│   │   │   ├── baskets/        # Batch circulation baskets
│   │   │   ├── inventory/      # Stock-take
│   │   │   ├── reports/        # Analytics + custom reports
│   │   │   ├── barcode/        # Barcode settings + bulk generation
│   │   │   ├── taxonomy/       # Authors, categories, publishers, locations
│   │   │   ├── users/          # User accounts
│   │   │   ├── notifications/  # Alert configuration
│   │   │   ├── database/       # Health, cleanup, backup, export
│   │   │   └── settings/       # System settings
│   │   ├── discover/           # Public book catalog
│   │   ├── loans/              # Member's own loans
│   │   ├── ebooks/             # Member e-book access
│   │   ├── requests/           # Member book requests
│   │   ├── basket/             # Member basket view
│   │   ├── auth/               # Login, verify
│   │   └── member/             # Member login
│   └── api/                    # All API routes
├── components/
│   ├── admin/                  # Admin UI components (Sidebar, BookForm, etc.)
│   └── shared/                 # Shared components (LanguageToggle, etc.)
├── context/                    # React context providers (logo, name, locales)
├── lib/                        # Server utilities (auth, prisma, rbac, utils)
├── i18n/                       # next-intl routing + request config
├── messages/                   # i18n strings (en.json, km.json)
├── prisma/
│   └── schema.prisma           # Database schema (single source of truth)
├── public/
│   └── uploads/                # User-uploaded files — gitignored
├── backups/                    # Local JSON snapshots — gitignored
└── scripts/                    # Seed and utility scripts
```

---

## API Overview

### Books
| Route | Methods | Notes |
|---|---|---|
| `/api/books` | GET, POST | Search (`?q=`, `?copies=true`), create |
| `/api/books/[id]` | GET, PATCH, DELETE | Single book |
| `/api/books/[id]/copies` | GET, POST | Copies list + basket membership |
| `/api/books/[id]/barcode` | POST | Generate system barcode |

### Circulation
| Route | Methods | Notes |
|---|---|---|
| `/api/loans` | GET, POST | List / create single loan |
| `/api/loans/batch` | POST | Multi-book batch loan |
| `/api/loans/[id]` | GET, PATCH | Renew / return / mark lost |
| `/api/reservations` | GET, POST | List / create |
| `/api/reservations/[id]` | PATCH, DELETE | Update status |

### Settings & Logo
| Route | Methods | Notes |
|---|---|---|
| `/api/settings` | GET, PUT | All settings (bulk save) |
| `/api/settings/logo` | POST, DELETE | Logo upload/remove only |

### Admin DB
| Route | Methods | Notes |
|---|---|---|
| `/api/admin/db/health` | GET | Integrity scan |
| `/api/admin/db/cleanup` | POST | Fix overdue, fines, copy counts (`dryRun` support) |
| `/api/admin/db/backup` | GET, POST, DELETE | JSON snapshots |
| `/api/admin/db/export` | GET | Excel export |

---

## Maintenance

### Disk space

| Folder | Typical size | Notes |
|---|---|---|
| `node_modules/` | ~1.2 GB | Never committed — in `.gitignore` |
| `.next/dev` | 0.5–2 GB | Turbopack cache — safe to delete anytime |
| `.next/` (production) | ~50 MB | Clean build output |
| `public/uploads/` | Varies | User files — gitignored |

**Free up disk space at any time:**
```bash
# Windows
rd /s /q .next

# macOS / Linux
rm -rf .next
```

The next `npm run dev` will rebuild automatically.

### Turbopack preload warnings in dev

Console warnings about CSS files preloaded but not used (`[root-of-the-server]__xx._.css`) are a **known Turbopack dev-mode bug** — not your code. They disappear in production builds and have no visual impact.

---

## Deployment

### Production build

```bash
npm run build
npm start
```

### Environment variables required in production

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

Optional (for email magic links / notifications):
```env
EMAIL_SERVER_HOST=
EMAIL_SERVER_PORT=
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=
```

---

## License

Private project — all rights reserved.
