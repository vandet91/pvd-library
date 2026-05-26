# PVD Library — AI Assistant Prompt

Use this prompt at the start of a new AI session to give full context about the project.

---

## Prompt

You are working on **PVD Library**, a full-featured library management system for a Cambodian library. Here is everything you need to know to contribute effectively.

---

### Stack

- **Next.js 16** App Router, TypeScript, Tailwind CSS v4
- **Prisma 6** + PostgreSQL — schema-first, no migration files (`db push` only). After any schema change, run `npx prisma generate` and restart the dev server.
- **NextAuth v5** (beta) — email magic link + credentials, Prisma session adapter
- **next-intl** — bilingual routing (`/en/...` and `/km/...`), messages in `messages/en.json` and `messages/km.json`
- **Recharts** for charts, **xlsx** for Excel export/import, **@zxing** for barcode scanning, **date-fns** for dates, **Zod** for validation

---

### Routing

All UI pages live under `app/[locale]/`. Staff pages are under `app/[locale]/admin/`. API routes are under `app/api/`. There is no `pages/` directory.

---

### Auth & Roles

Every API route checks `const session = await auth()` then uses `can(session.user?.role, "LIBRARIAN")` from `lib/rbac.ts`.

| Role | Access |
|---|---|
| ADMIN | Everything including database tools and user management |
| LIBRARIAN | Books, members, circulation, reports, export |
| STAFF | Circulation (issue/return) only |
| MEMBER | Own loans, ebooks, reservations, book requests |

---

### Key Models (Prisma)

**Book** — `title`, `titleKm`, `isbn`, `barcode`, `materialType`, `totalCopies`, `availableCopies` (denormalised), `referenceOnly`

**BookCopy** — physical copy of a Book. Fields: `copyNumber`, `barcode`, `rfid`, `status` (CopyStatus enum), `condition`, `loanable`

**Loan** — `memberId`, `bookId`, `copyId`, `dueDate`, `returnDate`, `status` (LoanStatus), `loanType` (LoanType), `renewalCount`

**Fine** — 1:1 with Loan. `amount`, `daysLate`, `status` (FineStatus)

**Reservation** — `memberId`, `bookId`, `copyId`, `status` (ReservationStatus), `expiresAt`, `holdShelf`

**Basket** — named container for batch circulation. `BasketItem` links a `copyId` to a `Basket` with `tagged: Boolean`. Unique on `[basketId, copyId]`.

**Member** — `memberId` (display ID), `name`, `email`, `memberType`, `expireDate`, `isActive`

**Settings** — key-value store. Important keys: `MAX_LOANS_PER_MEMBER`, `MAX_RENEWALS`, `DEFAULT_LOAN_DAYS`, `finePerDay`

---

### Critical Business Rules

**Loan Types — HOME vs IN_LIBRARY:**
- `HOME` — take-home, standard due date, subject to quota, fines, renewals
- `IN_LIBRARY` — same-day read-only, due end of today, limit 1 book at a time, bypasses overdue/quota blocks, **no renewals**, **no fines**
- **Expired membership blocks BOTH types.** Overdue loans and quota only block HOME.
- If a member already has an active IN_LIBRARY loan, a warning alert appears and the librarian must explicitly click "Allow Anyway" to override.

**Copy Count Denormalization:**
`Book.availableCopies` and `Book.totalCopies` must be updated in the same transaction as any copy status change. The cleanup job recalculates them from actual `BookCopy.status` values to fix drift.

**BasketItem compound key:**
`@@unique([basketId, copyId])` — use `createMany + skipDuplicates` or `findFirst + update by id` instead of `upsert` with compound key (client types may be stale until regenerated).

**Fines:**
Auto-created by the cleanup job for `OVERDUE` + `loanType = HOME` loans only. Amount = `daysLate × finePerDay`. IN_LIBRARY overdue loans never generate fines.

**Renewals:**
Only for HOME loans. Max renewals from `MAX_RENEWALS` setting. Due date extends from `max(today, currentDueDate) + DEFAULT_LOAN_DAYS`. Renewing un-flags OVERDUE → ACTIVE.

---

### Important Files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All models, enums, and relations |
| `lib/auth.ts` | NextAuth config |
| `lib/rbac.ts` | `can()` role check |
| `lib/prisma.ts` | Singleton Prisma client |
| `lib/barcode.ts` | Barcode generation |
| `lib/excel.ts` | Excel import/export helpers |
| `app/[locale]/admin/circulation/page.tsx` | Issue/return UI — most complex page |
| `app/[locale]/admin/baskets/[id]/page.tsx` | Basket detail with scan + batch actions |
| `app/[locale]/admin/reports/page.tsx` | Analytics + 9 custom tabular reports |
| `app/[locale]/admin/database/page.tsx` | Health check, cleanup, backup, export |
| `app/api/loans/batch/route.ts` | Multi-book loan creation (handles HOME + IN_LIBRARY) |
| `app/api/admin/db/cleanup/route.ts` | 7-step database cleanup with dryRun support |
| `app/api/admin/db/health/route.ts` | Integrity scan |
| `app/api/reports/custom/route.ts` | 9 custom tabular reports with CSV/Excel export |

---

### Code Conventions

- No comments unless the WHY is non-obvious
- Tailwind utility classes only — no custom CSS files
- Every API response error is `{ error: "message" }` with appropriate HTTP status
- Dates: `date-fns` on the server, `toLocaleDateString()` in UI
- Never skip `prisma generate` after schema changes — stale client causes silent type errors
- Prefer editing existing files over creating new ones
- No backwards-compat shims — change the code directly

---

### What This System Does

1. **Catalog** — Manage books, copies, authors, categories, publishers, locations, e-books
2. **Circulation** — Issue/return books (HOME or IN_LIBRARY), batch via baskets, barcode/QR scanning
3. **Members** — Register members, track quota and expiry, link to user accounts
4. **Reservations** — Queue members for unavailable books, assign copies when available
5. **Fines** — Auto-create overdue fines, mark paid/waived
6. **Reports** — Analytics charts + 9 custom tabular reports (overdue, unpaid fines, active loans, reservations, new acquisitions, low stock, never borrowed, book requests, expiring memberships)
7. **Database Tools** — Health check, 7-step cleanup, JSON backup with download/delete, Excel export
8. **Notifications** — Email/in-app alerts for due soon, overdue, reservation ready
9. **Inventory** — Periodic stock-take with copy-by-copy scanning
10. **E-books** — PDF/EPUB/link/video/audio with public or member-only access
