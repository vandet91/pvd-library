# PVD Library — Full Project Prompt

> Paste this file as context when starting a new AI session about this project.
> It covers the complete architecture, all modules, all API routes, data models, and conventions.

---

## What This Is

**PVD Library** is a full-featured library management system (similar to PMB / Koha) built from scratch for a real library. It is a bilingual (English + Khmer) web application with an admin panel for staff and a public OPAC for members. It also has a bookstore mode (selling books to members).

---

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Framework | **Next.js 16** (App Router, Turbopack) + TypeScript |
| Styling | **Tailwind CSS** + lucide-react icons |
| Database | **PostgreSQL** via **Prisma 6** ORM |
| Auth | **NextAuth v5** — credentials + Google + magic link |
| i18n | **next-intl v4.12.0** — English, Khmer, French |
| Barcode scan | **@zxing/browser** (webcam) |
| Charts | **recharts** |
| Excel | **xlsx** (SheetJS) |
| Validation | **zod** |
| Date utils | **date-fns** |
| AI | Provider-agnostic OpenAI-compatible client (`lib/ai-client.ts`) — defaults to Gemini 2.5 Flash |
| Email | Nodemailer (SMTP) |
| Telegram | Bot webhook for member notifications |
| Other | bcryptjs, qrcode, @zxing/browser |

> **Important:** Prisma 7 was evaluated but requires adapters — project stays on **Prisma 6**. Do not upgrade.

> **Important:** Next.js 16 uses `proxy.ts`, not `middleware.ts` — this is a breaking rename from Next.js 15.

---

## Environment Variables (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/pvd-library"
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth (optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# AI (provider-agnostic — swap AI_PROVIDER to use OpenAI, Anthropic, etc.)
AI_PROVIDER="gemini"          # or "openai", "anthropic"
AI_API_KEY="..."
AI_BASE_URL="..."             # optional override
AI_MODEL="gemini-2.5-flash"

# ISBN lookup
NEXT_PUBLIC_ISBNDB_API_KEY=""

# Email / magic link
EMAIL_SERVER_HOST=""
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=""
EMAIL_SERVER_PASS=""
EMAIL_SERVER_SECURE=false
EMAIL_FROM=""

# Telegram bot
TELEGRAM_BOT_TOKEN=""
TELEGRAM_BOT_USERNAME=""
TELEGRAM_WEBHOOK_SECRET=""
```

---

## Running the Project

```bash
npm install
npm run db:push        # sync Prisma schema → DB (no migration history)
npm run db:seed        # create admin + sample data
npm run dev            # dev server on :3000
```

**Admin login:** `admin@pvdlibrary.com` / `admin123`

---

## Routing & File Structure

All user-facing pages live under `app/[locale]/` — locale is always in the URL.

```
app/
  [locale]/
    page.tsx                     # Root redirect → /[locale]/discover
    layout.tsx                   # Locale layout — loads messages, context providers
    discover/                    # Public OPAC (book catalog)
    auth/login/                  # Staff login (3 themes: split, glass, minimal)
    member/login/                # Member portal login (by Member ID)
    member/register/             # Self-registration
    account/                     # Member account (me page)
    loans/                       # Member: my loans
    fines/                       # Member: my fines
    requests/                    # Member: my book requests
    basket/                      # Member: reading basket
    ebooks/                      # Member: e-library browser
    shop/                        # Member: bookstore (buy FOR_SALE copies)
    print/                       # Print layouts (labels, member cards)
    admin/
      page.tsx                   # Dashboard
      layout.tsx                 # Admin shell (sidebar + header)
      books/                     # Books CRUD, new, [id], processing, weeding, etc.
      members/                   # Members CRUD
      circulation/               # Borrow / return
      fines/                     # Fine management
      reservations/              # Reservation management
      stock/                     # Stock management (receive, deploy, track)
      orders/                    # Sale order management
      reports/                   # Analytics + custom reports + SQL query
      settings/                  # Library settings
      users/                     # User / staff accounts
      inventory/                 # Shelf-check workflow
      baskets/                   # Book basket curation
      barcode/                   # Barcode label printing
      books/processing/          # Processing queue (new arrivals workflow)
      books/weeding/             # Weeding candidates
      books/acquisition/         # Purchase request workflow
      books/enrich/              # Bulk AI / ISBN enrichment
      books/covers/              # Cover image audit & bulk fetch
      ebooks/                    # E-library admin
      tasks/                     # Staff task board (AI-generated + manual)
      taxonomy/                  # Authors, categories, publishers, locations
      ai-assistant/              # AI book assistant
      logs/                      # Activity log viewer
      notifications/             # Notification centre
      translations/              # i18n translation editor
      database/                  # DB admin tools (backup, cleanup, health)
      migration/                 # PMB data migration tools

app/api/                         # All API routes (see section below)
lib/                             # Shared server utilities
components/                      # Shared React components
messages/                        # i18n JSON files (en.json, km.json, fr.json)
prisma/
  schema.prisma
  seed.ts
public/uploads/                  # Uploaded files (logo, payment proofs, etc.)
```

---

## Database Models (Prisma)

### Core

| Model | Purpose |
|-------|---------|
| `User` | Staff accounts (ADMIN / LIBRARIAN / STAFF) and member-linked accounts |
| `Member` | Library members (borrowers) — linked to User optionally |
| `Book` | Bibliographic record |
| `BookCopy` | Physical copy of a book — has status, barcode, condition, branch |
| `Loan` | Borrow transaction (member ↔ copy) |
| `Fine` | Fine attached to a loan |
| `Reservation` | Member holds a copy at a branch |
| `Ebook` | Digital resource attached to a book |
| `Rating` | Star rating + review by a member |
| `BookRequest` | Member-suggested acquisition |
| `Category` | Book category (DDC + custom) |
| `Author` | Author record |
| `Publisher` | Publisher record |
| `Location` | Shelf location |
| `Branch` | Library branch |

### Stock & Sales

| Model | Purpose |
|-------|---------|
| `StockMovement` | Audit log of every copy status change (RECEIVED, DEPLOYED, SOLD, etc.) |
| `SaleCart` | Member's active shopping cart |
| `SaleCartItem` | Line item in a cart |
| `SaleOrder` | Completed sale order |
| `SaleOrderItem` | Line item in an order |

### Admin / System

| Model | Purpose |
|-------|---------|
| `Settings` | Key-value store for all library settings |
| `Inventory` | A shelf-check session |
| `InventoryItem` | Individual copy scanned during inventory |
| `Notification` | In-app / Telegram notification |
| `ActivityLog` | Audit trail of all mutations |
| `Basket` | Curated reading list (admin-created) |
| `BasketItem` | Book in a basket |
| `StaffTask` | Task board item (manual or AI-generated) |
| `MemberIncident` | Incident record on a member (lost book, damage, etc.) |
| `QueryTemplate` | Saved SQL query templates (SQL Query tab in Reports) |

### Enums

```
CopyStatus:        STOCK | AVAILABLE | FOR_SALE | BORROWED | RESERVED | LOST | DAMAGED | WITHDRAWN
StockMovementType: RECEIVED | DEPLOYED | DEPLOYED_FOR_SALE | TRANSFERRED | RETURNED_TO_STOCK | WITHDRAWN | STATUS_CHANGE | SOLD | SALE_RETURNED
Role:              ADMIN | LIBRARIAN | STAFF | MEMBER
MemberType:        STUDENT | TEACHER | STAFF | PUBLIC
LoanStatus:        ACTIVE | RETURNED | OVERDUE | LOST
LoanType:          HOME | IN_LIBRARY
FineStatus:        UNPAID | PAID | WAIVED
ReservationStatus: PENDING | APPROVED | READY | CANCELLED | FULFILLED | EXPIRED
SaleOrderStatus:   PENDING_PAYMENT | PAYMENT_SUBMITTED | PAYMENT_CONFIRMED | PREPARING | READY_FOR_PICKUP | SHIPPED | DELIVERED | CANCELLED | REFUNDED
MaterialType:      BOOK | MAGAZINE | JOURNAL | NEWSPAPER | DVD | AUDIO_CD | THESIS | MAP | OTHER
AudienceLevel:     CHILDREN | YOUTH | ADULTS | UNSPECIFIED
BookCondition:     EXCELLENT | GOOD | FAIR | POOR | DAMAGED
TaskPriority:      LOW | MEDIUM | HIGH | URGENT
TaskStatus:        PENDING | IN_PROGRESS | DONE | CANCELLED
```

---

## Auth & RBAC

### Roles (lowest → highest)
```
MEMBER < STAFF < LIBRARIAN < ADMIN
```

### How to guard an API route
```ts
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

const session = await auth();
if (!session || !can(session.user?.role, "LIBRARIAN"))
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### `can(role, minRole)` — returns true if role ≥ minRole.

### NextAuth config (`lib/auth.ts`)
- Providers: credentials (email+password), Google, email (magic link)
- Strategy: JWT
- Session includes: `id`, `name`, `email`, `role`, `image`

---

## i18n Architecture

- **`lib/locales.ts`** — single source of truth. Add new language here only. Exports `ALL_LOCALES`, `LOCALE_CODES`, `DEFAULT_LOCALE` ("en").
- **`i18n/routing.ts`** — uses `LOCALE_CODES`.
- **`i18n/request.ts`** — if locale disabled in DB → redirect to default. Missing translation key → falls back to en.json.
- **`lib/get-enabled-locales.ts`** — reads `ENABLED_LOCALES` from DB; always includes "en".
- **`lib/navigation.ts`** — re-exports `useRouter`, `usePathname` from `createNavigation(routing)`.
  - ⚠️ **Always import `useRouter`/`usePathname` from `@/lib/navigation`**, never from `next/navigation`, in any client component that needs locale-aware navigation.
- Locale switching uses `window.location.href` (hard redirect) — reliable across all router states.

### Adding a new language
1. Add entry to `lib/locales.ts`
2. Create `messages/{code}.json` (copy en.json, translate)
3. Enable in Settings → Languages
No other files need to change.

### Context providers (all server-populated in `app/layout.tsx`)
- `useEnabledLocales()` — currently active locales
- `useLibraryName()` — from `LIBRARY_NAME` setting
- `useLibraryLogo()` — logo URL, empty string = no logo

---

## Key Library Files

| File | Purpose |
|------|---------|
| `lib/auth.ts` | NextAuth config |
| `lib/prisma.ts` | Singleton Prisma client |
| `lib/rbac.ts` | `can(role, minRole)` role hierarchy |
| `lib/activity-log.ts` | `logActivity(actor, action, params)` — audit trail |
| `lib/ai-client.ts` | Provider-agnostic AI client, `AI_ENABLED` boolean, `AI_MODEL` |
| `lib/barcode.ts` | Barcode generation logic (`BARCODE_PREFIX-{bookNum}-C{copyNum}`) |
| `lib/mailer.ts` | Nodemailer SMTP helper |
| `lib/telegram.ts` | Telegram bot message sender |
| `lib/notifications.ts` | Create notification + optionally send Telegram/email |
| `lib/excel.ts` | XLSX generation utilities |
| `lib/price-format.ts` | `formatPrice(amount, currency)` |
| `lib/book-availability.ts` | Compute available copy count for a book |
| `lib/locales.ts` | Language registry |
| `lib/navigation.ts` | Locale-aware router (use this) |

---

## Settings System

All settings live in the `Settings` table as `key → value` strings.

**API:**
- `GET /api/settings` → returns all keys with defaults merged
- `PUT /api/settings` → bulk save (only known keys); does NOT include `LIBRARY_LOGO`
- `POST /api/settings/logo` → upload logo (PNG/JPG/WebP/SVG ≤ 2 MB) → `public/uploads/logo.{ext}`
- `DELETE /api/settings/logo` → remove logo

After saving settings that affect context (locales, library name, logo), call `router.refresh()` from `next/navigation` to re-run server components.

### All Settings Keys

| Key | Default | Notes |
|-----|---------|-------|
| `DEFAULT_LOAN_DAYS` | `14` | |
| `FINE_PER_DAY` | `0.50` | |
| `MAX_RENEWALS` | `2` | |
| `MAX_LOANS_PER_MEMBER` | `3` | |
| `RESERVATION_EXPIRE_DAYS` | `7` | |
| `LIBRARY_NAME` | `PVD Library` | Shown in navbar, login, footer |
| `LIBRARY_EMAIL` | `""` | |
| `LIBRARY_PHONE` | `""` | |
| `LIBRARY_ADDRESS` | `""` | |
| `LIBRARY_FACEBOOK` | `""` | |
| `LIBRARY_TELEGRAM` | `""` | |
| `BARCODE_PREFIX` | `PVD` | e.g. `PVD-000123-C001` |
| `BARCODE_PADDING` | `6` | Zero-pad width for book number |
| `DEFAULT_STAFF_THEME` | `ocean` | `ocean` / `midnight` / `emerald` |
| `DEFAULT_STAFF_AUTH_STYLE` | `split` | `split` / `glass` / `minimal` |
| `DEFAULT_STAFF_AUTH_METHODS` | `["password","google","magic"]` | JSON array |
| `ENABLED_LOCALES` | all codes | JSON array; "en" always forced in |
| `LIBRARY_LOGO` | `""` | Managed via `/api/settings/logo` ONLY |
| `BOOK_SALE_ENABLED` | `false` | Enables bookstore / FOR_SALE mode |
| `STOCK_CURRENCY` | `USD` | Currency for stock & sale UI |
| `OPAC_THEME` | `indigo` | Public catalog accent colour |
| `MEMBER_SELF_REGISTER` | `false` | Allow public self-registration |

---

## All API Routes

### Books
```
GET    /api/books                          list (search, filter, paginate)
POST   /api/books                          create book (+ initial copies)
GET    /api/books/[id]                     get book
PATCH  /api/books/[id]                     update book
DELETE /api/books/[id]                     delete book
GET    /api/books/[id]/copies              get copies of book
POST   /api/books/[id]/copies              add copies to book (default status: STOCK)
GET    /api/books/[id]/availability        copy availability for OPAC
POST   /api/books/[id]/barcode             generate / regenerate barcode
POST   /api/books/[id]/translate           AI-translate a field to another locale
POST   /api/books/batch                    bulk operations (condition, status, delete)
POST   /api/books/import                   import books from CSV/Excel
GET    /api/books/export                   export books to CSV/Excel
POST   /api/books/ai-enrich               bulk AI enrichment (description, cover, etc.)
GET    /api/books/ai-duplicates            find potential duplicate books
POST   /api/books/ai-suggest              AI book suggestions
POST   /api/books/isbn-enrich/bulk         ISBN lookup + enrich
GET    /api/books/isbn-enrich/stats        enrichment coverage stats
POST   /api/books/covers/elibrary-bulk     bulk fetch covers from e-library
POST   /api/books/covers/remove            remove cover image
GET    /api/books/covers/audit             audit cover image URLs
GET    /api/books/covers/elibrary-search   search e-library for covers
POST   /api/books/barcode/bulk             bulk barcode generation
POST   /api/books/processing/scan          scan barcode during processing workflow
GET    /api/books/processing               processing queue
GET    /api/books/quality                  data quality report
GET    /api/books/weeding                  weeding candidate list
GET    /api/books/acquisition              acquisition requests
```

### Copies
```
GET    /api/copies                         get copies by IDs or bookId
PATCH  /api/copies/[id]                    update copy (status, condition, price, barcode, notes)
DELETE /api/copies/[id]                    delete copy
```

### Members
```
GET    /api/members                        list members (search, filter, paginate)
POST   /api/members                        create member
GET    /api/members/[id]                   get member
PATCH  /api/members/[id]                   update member
DELETE /api/members/[id]                   delete member
GET    /api/members/[id]/incidents         member incidents
POST   /api/members/[id]/incidents         add incident
GET    /api/members/[id]/portal            member portal summary (loans, fines, etc.)
POST   /api/members/[id]/recommendations   AI book recommendations
PATCH  /api/members/[id]/restriction       set/clear restriction
POST   /api/members/export                 export members CSV/Excel
POST   /api/members/import                 import members CSV/Excel
POST   /api/members/register               public self-registration
GET    /api/members/risk                   at-risk member list
```

### Circulation
```
GET    /api/loans                          list loans (filter by status, member, branch)
POST   /api/loans                          checkout (borrow)
GET    /api/loans/[id]                     get loan
PATCH  /api/loans/[id]                     update loan (return, lost, extend)
POST   /api/loans/[id]/renew               renew loan
POST   /api/loans/batch                    batch return / status change
GET    /api/loans/risk                     overdue risk list
```

### Fines
```
GET    /api/fines                          list fines
POST   /api/fines                          create manual fine
GET    /api/fines/[id]                     get fine
PATCH  /api/fines/[id]                     update fine (pay, waive, amount)
```

### Reservations
```
GET    /api/reservations                   list reservations
POST   /api/reservations                   create reservation
GET    /api/reservations/[id]              get reservation
PATCH  /api/reservations/[id]              update (approve, ready, cancel, fulfil)
```

### Stock
```
GET    /api/stock                          stock movements + summary
GET    /api/stock/copies?status=STOCK      copies with given status (STOCK default)
POST   /api/stock/receive                  move copies → STOCK (resolves barcodes)
POST   /api/stock/deploy                   move STOCK copies → AVAILABLE | FOR_SALE
POST   /api/stock/transfer                 transfer copies between branches
```

### Reports
```
GET    /api/reports                        analytics summary (charts data)
GET    /api/reports/export?format=xlsx|csv export analytics
GET    /api/reports/custom?type=...        run a named custom report
POST   /api/reports/query                  run raw SQL (SELECT only, Admin only)
GET    /api/reports/templates              list saved SQL templates
POST   /api/reports/templates              save new SQL template
PATCH  /api/reports/templates/[id]         edit template
DELETE /api/reports/templates/[id]         delete template
```

### Sales (Bookstore)
```
# Member-facing
GET    /api/shop/books                     list FOR_SALE books
GET    /api/sale/cart                      get member's cart
POST   /api/sale/cart/items                add item to cart
DELETE /api/sale/cart/items                remove item
POST   /api/sale/checkout                  create order from cart
GET    /api/sale/orders                    member's order history
GET    /api/sale/orders/[id]               order detail
POST   /api/sale/orders/[id]/payment       upload payment proof
PATCH  /api/sale/orders/[id]               update order status

# Admin-facing
GET    /api/admin/sale/orders              list all orders (filter, paginate)
PATCH  /api/admin/sale/orders/[id]         process order (confirm payment, ship, etc.)
GET    /api/admin/sale/books               list for-sale books with inventory
POST   /api/admin/sale/counter             counter sale (walk-in, instant)
```

### Taxonomy
```
GET/POST        /api/categories            list / create category
GET/PATCH/DELETE /api/categories/[id]
GET/POST        /api/authors
GET/PATCH/DELETE /api/authors/[id]
GET/POST        /api/publishers
GET/PATCH/DELETE /api/publishers/[id]
GET/POST        /api/locations             shelf locations
GET/PATCH/DELETE /api/locations/[id]
GET/POST        /api/branches              library branches
GET/PATCH/DELETE /api/branches/[id]
```

### E-Library
```
GET    /api/ebooks                         list ebooks
POST   /api/ebooks                         create ebook record + upload file
GET    /api/ebooks/[id]
PATCH  /api/ebooks/[id]
DELETE /api/ebooks/[id]
GET    /api/ebooks/[id]/download           serve ebook file (authenticated)
```

### Users (Staff Accounts)
```
GET    /api/users                          list staff users
POST   /api/users                          create staff user
GET    /api/users/[id]
PATCH  /api/users/[id]
DELETE /api/users/[id]
GET    /api/users/me                       current user profile
PATCH  /api/users/me/password              change password
```

### Other
```
GET    /api/settings                       all settings
PUT    /api/settings                       bulk save settings
POST   /api/settings/logo                  upload logo
DELETE /api/settings/logo                  remove logo
GET    /api/notifications                  user notifications
GET    /api/logs                           activity log
GET    /api/alerts                         dashboard alerts (overdue, expiring, etc.)
GET    /api/public/stats                   public library stats (for Discover hero)
GET    /api/ratings                        book ratings
POST   /api/ratings
PATCH  /api/ratings/[id]
POST   /api/upload                         generic file upload
GET    /api/book-requests                  acquisition requests
POST   /api/book-requests
PATCH  /api/book-requests/[id]
GET    /api/inventory                      inventory sessions
POST   /api/inventory
PATCH  /api/inventory/[id]
POST   /api/inventory/[id]/scan            scan copy during session
GET    /api/baskets                        reading baskets
POST   /api/baskets
GET    /api/baskets/[id]
PATCH  /api/baskets/[id]
POST   /api/baskets/[id]/items             add/remove items
POST   /api/baskets/[id]/actions           share, archive, etc.
GET    /api/staff-tasks                    task board
POST   /api/staff-tasks
PATCH  /api/staff-tasks/[id]
DELETE /api/staff-tasks/[id]
POST   /api/admin/assistant                AI chat assistant
POST   /api/search/chat                    OPAC AI chat search
POST   /api/telegram/webhook               Telegram bot webhook
POST   /api/telegram/link                  link member account to Telegram
GET    /api/member/status                  member loan/fine status (for portal)
GET    /api/member/fines                   member fines (self-service)
GET    /api/admin/translations             translation strings
PATCH  /api/admin/translations             save edited strings
POST   /api/admin/translations/ai          AI-translate a locale
POST   /api/admin/translations/publish     write translated strings to messages/{code}.json
```

---

## Modules Detail

### Stock Management (`/admin/stock`)

**Workflow:** Physical copies move through statuses via deliberate actions:
```
[Added to book] → STOCK → AVAILABLE (loanable shelf)
                        → FOR_SALE (bookstore shelf)
                 ↑
          [Receive to Stock pulls any status back to STOCK]
```

**UI sections:**
- **Summary cards** — In Stock / Available / For Sale / Total Copies + sales stats if bookstore enabled
- **In Stock panel** — auto-loads on page open; copies with `status = STOCK` grouped by book; blue info note explains `AVAILABLE` copies bypass this (they were added directly or pre-date stock workflow)
- **Receive to Stock modal** — scan input (barcode, auto-focused, Enter to queue) + manual paste. API resolves barcodes → UUIDs. Any status → STOCK; decrements `availableCopies` if was AVAILABLE
- **Deploy modal** — select copies (grouped by book, select-all per group), choose branch, target `AVAILABLE` or `FOR_SALE`, optional per-book price
- **For Sale Inventory panel** — price management; set individual or bulk per-book price

**Key API behaviour:**
- `POST /api/stock/receive` — accepts UUIDs or barcodes mixed. Non-UUID strings are looked up by barcode. Blocks if copy has active loan.
- `POST /api/stock/deploy` — moves STOCK → target status, sets branchId, logs StockMovement
- `GET /api/stock/copies?status=STOCK` — used by In Stock panel and Deploy modal
- `GET /api/stock/copies?status=FOR_SALE` — used by For Sale Inventory panel

---

### Reports (`/admin/reports`)

**Three tabs:**

#### Analytics
- `GET /api/reports` returns: totalBorrowed, totalReturned, totalOverdue, totalFinesCollected, totalBooks, totalCopies, activeMembers, copyStatusDistribution, copyConditionDistribution, popularBooks, monthlyLoans, categoryDistribution, materialTypeDistribution, audienceLevelDistribution, topMembers, finesByMonth
- Supports `?from=&to=&branchId=` date/branch filtering
- Export: `GET /api/reports/export?format=xlsx|csv`

#### Custom Reports (30+ types)
Groups: Circulation, Overdue & Fines, Collection, Members, Analytics, Sales

Report IDs: `active-loans`, `all-unreturned`, `loans-by-date`, `returns-by-date`, `returned-loans`, `expiring-today`, `loans-by-location`, `reservations`, `overdue`, `unpaid-fines`, `all-books`, `new-acquisitions`, `books-by-language`, `books-by-category`, `count-by-category`, `copies-by-status`, `total-copies`, `copies-added`, `with-ebooks`, `low-stock`, `never-borrowed`, `borrowers-list`, `top-borrowers`, `expiring-members`, `book-requests`, `most-borrowed`, `most-read-category`, `basket-tagged`, `basket-untagged`, `sales-orders`, `best-selling`, `sales-revenue`, `payment-methods`, `tax-collected`

UI features:
- Searchable left sidebar (filter by name/description)
- **Single click** = select · **Double-click** = select + run + scroll to results
- Sortable columns (click header), 50-row pagination, CSV + Excel export
- Quick date presets: Today / Week / Month / Year / Clear

#### SQL Query (Admin only)
- Dark SQL editor, Ctrl+Enter to run
- Only SELECT / WITH allowed — all DML/DDL blocked by keyword check
- Auto-caps at 1,000 rows if no LIMIT
- `POST /api/reports/query` — also handles BigInt and Date serialisation
- **Saved Templates** — `QueryTemplate` table. Save/edit/delete named queries in sidebar.

---

### OPAC / Discover (`/discover`)

Public book catalog:
- Search by title/author/ISBN
- Filter by category, material type, audience level, language, availability
- Sort by title, number, newest, year, available first
- Book cards with cover, availability badge, borrow/reserve/buy buttons
- AI chat search (`/api/search/chat`)
- Book request form for missing titles
- For-Sale books shown in Discover if `BOOK_SALE_ENABLED`

---

### Circulation (`/admin/circulation`)

- Checkout: scan member ID or barcode → scan book barcode → create loan
- Return: scan barcode → mark returned → auto-calculate fine if overdue
- Loan types: HOME (take away) or IN_LIBRARY (reading room only)
- Renewal: up to `MAX_RENEWALS` times
- Overdue detection runs on loan fetch (compares dueDate to now)
- Fine auto-created at `FINE_PER_DAY × daysLate` on return

---

### Bookstore / Shop (`/shop`)

Enabled when `BOOK_SALE_ENABLED = true`.

Member flow: Browse FOR_SALE books → Add to cart → Checkout → Upload payment proof → Await staff confirmation → Pickup/delivery

Staff flow (admin): View orders → Confirm payment → Mark preparing → Ready for pickup → Delivered

Counter sale: instant walk-in sale without online order flow.

---

## Component Architecture

### Admin Layout
- `components/admin/Sidebar.tsx` — navigation, logo, logout, role-based link visibility
- `components/admin/Header.tsx` — search bar, notification bell, user avatar, language switcher
- `components/Providers.tsx` — wraps app with SessionProvider + context providers

### Key Shared Components
- `components/admin/BookCopiesPanel.tsx` — physical copies panel on book detail page
- `components/admin/BookForm.tsx` — book create/edit form
- `components/admin/MemberForm.tsx` — member create/edit form
- `components/shared/Pagination.tsx` — reusable pagination
- `components/shared/EbookViewer.tsx` — in-browser PDF/ePub reader
- `components/BookSearchChat.tsx` — AI chat widget for OPAC
- `components/admin/DashboardLoanChart.tsx` — dashboard activity chart

---

## AI Integration

`lib/ai-client.ts` — provider-agnostic, uses OpenAI-compatible SDK:
- Set `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` in `.env`
- `AI_ENABLED` boolean — `true` when API key is configured and non-trivial
- Used for: book description generation, field translation, cover fetching suggestions, duplicate detection, member recommendations, chat search, task generation, translation of UI strings

---

## Activity Logging

Every successful mutation should call:
```ts
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

await logActivity(actorFromSession(session), Actions.LOAN_CHECKOUT, {
  entityType: "Loan",
  entityId:   loan.id,
  detail:     { bookTitle, memberName },
});
```

`Actions` is a namespace of dot-separated strings: `"loan.checkout"`, `"member.created"`, `"stock.received"`, etc.

---

## Notifications

```ts
import { createNotification } from "@/lib/notifications";

await createNotification({
  userId,
  type:    "OVERDUE_REMINDER",
  title:   "Book overdue",
  message: "...",
  sendTelegram: true,   // also push to linked Telegram
  sendEmail:    false,
});
```

---

## Key Conventions & Gotchas

1. **`proxy.ts` not `middleware.ts`** — Next.js 16 renamed this. Do not create `middleware.ts`.
2. **Prisma 6** — Do not upgrade to Prisma 7 (requires adapters).
3. **Locale routing** — Every page is under `app/[locale]/`. All links must be locale-prefixed.
4. **`useRouter` / `usePathname`** — Always import from `@/lib/navigation`, NOT from `next/navigation`, in client components that need locale-aware routing.
5. **Settings context refresh** — After saving settings that affect context providers, call `router.refresh()` (from `next/navigation`) to re-run server components.
6. **`LIBRARY_LOGO`** — Never include in `PUT /api/settings`. Managed only via `/api/settings/logo`.
7. **Copy creation status** — `POST /api/books/[id]/copies` creates with `status: "STOCK"` by default (stock workflow). Direct book creation via `POST /api/books` creates initial copies as `AVAILABLE` (legacy).
8. **Barcode format** — `{BARCODE_PREFIX}-{zero-padded-book-number}-C{copyNumber}` e.g. `PVD-000042-C003`
9. **Auth guard pattern** — Every API route checks `const session = await auth()` then `can(session.user?.role, "MINIMUM_ROLE")`.
10. **SQL Query security** — `/api/reports/query` only allows SELECT/WITH. Blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, EXECUTE, EXEC, CALL, COPY, VACUUM, ANALYZE. Auto-adds LIMIT 1000 if none present.
11. **Prisma `db push`** — The project uses `db push` (not `migrate dev`) because the DB user lacks CREATE DATABASE permission for the shadow DB needed by `migrate dev`.

---

## How to Add a New Feature (checklist)

- [ ] Add Prisma model / fields to `prisma/schema.prisma` → run `npx prisma db push && npx prisma generate`
- [ ] Create API route under `app/api/...` with auth guard + `logActivity` call
- [ ] Create page under `app/[locale]/admin/...` — import `useRouter/usePathname` from `@/lib/navigation` if needed
- [ ] Add sidebar link in `components/admin/Sidebar.tsx` with role check
- [ ] Add i18n keys to `messages/en.json` (and `km.json`, `fr.json`)
- [ ] Add any new Settings keys to `app/api/settings/route.ts` defaults object
