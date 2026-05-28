# PVD Library — Setup & Configuration Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 14+ | Must be running before starting the app |
| npm | 9+ | Comes with Node.js |

---

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd pvd-library
npm install
```

---

## 2. Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

### Required

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/pvd_library"

# NextAuth — generate with: openssl rand -base64 32
# On Windows PowerShell: [Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

### Optional — Email (magic-link login & notifications)

```env
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER="your-email@gmail.com"
EMAIL_SERVER_PASS="your-app-password"
EMAIL_FROM="PVD Library <your-email@gmail.com>"
```

> For Gmail, use an **App Password** (Google Account → Security → 2-Step Verification → App passwords).

### Optional — Google OAuth

```env
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

> Create credentials at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client.
> Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

### Optional — AI Book Search

```env
# Gemini Flash (free tier — recommended to start)
AI_PROVIDER=gemini
AI_API_KEY=AIza...
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-2.5-flash
```

Get a free key at [aistudio.google.com](https://aistudio.google.com) → Get API Key.

### Optional — Telegram Bot

```env
TELEGRAM_BOT_TOKEN=7123456789:AAF...
TELEGRAM_BOT_USERNAME=your_bot_username_bot
TELEGRAM_WEBHOOK_SECRET=any-random-string
```

See **Section 6** for full Telegram setup.

---

## 3. Database Setup

```bash
# Create tables from schema
npm run db:push

# Seed with sample data + default admin account
npm run db:seed
```

Default admin credentials (change after first login):

| Field | Value |
|-------|-------|
| Email | `admin@pvdlibrary.com` |
| Password | `admin123` |

---

## 4. Run the App

```bash
# Development
npm run dev

# Production build
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000)

---

## 5. First-Time Admin Setup

1. Log in at `/en/auth/login` with the admin credentials above
2. Go to **Admin → Settings** and configure:
   - Library name and default language
   - Loan duration and max loans per member
   - Fine rate per day
   - Reservation expiry days
3. Go to **Admin → Notifications** to enable email/Telegram reminders
4. Go to **Admin → Taxonomy** to add your own categories, publishers, and shelf locations

---

## 6. Telegram Bot Setup

### Step 1 — Create the bot

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`
3. Enter a display name (e.g. `PVD Library`)
4. Enter a username ending in `_bot` (e.g. `pvdlibrary_bot`)
5. Copy the **bot token** you receive

### Step 2 — Add to `.env`

```env
TELEGRAM_BOT_TOKEN=7123456789:AAF...
TELEGRAM_BOT_USERNAME=pvdlibrary_bot
```

Generate a webhook secret (PowerShell):

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

```env
TELEGRAM_WEBHOOK_SECRET=paste-output-here
```

### Step 3 — Register the webhook

After deploying (or using ngrok locally):

```powershell
$TOKEN  = "7123456789:AAF..."
$URL    = "https://yourdomain.com/api/telegram/webhook"
$SECRET = "your-webhook-secret"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$TOKEN/setWebhook" `
  -Method POST `
  -Body @{ url = $URL; secret_token = $SECRET }
```

Verify:

```powershell
Invoke-RestMethod -Uri "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
```

### Step 4 — Enable in Admin panel

**Admin → Notifications → Configuration** → turn on **Telegram Notifications**

### Step 5 — Test locally with ngrok

```bash
# Install ngrok from https://ngrok.com, then:
ngrok http 3000
```

Use the `https://xxxx.ngrok.io` URL as your webhook URL in Step 3.

### How members link their account

1. Member goes to **My Profile** → **Connect Telegram**
2. Clicks **Link Telegram Account** → receives a 6-digit code
3. Opens the bot link (or searches `@pvdlibrary_bot`) and sends the code
4. Bot confirms the link — they will now receive automatic notifications

---

## 7. Database Utilities

```bash
npm run db:studio       # Open Prisma Studio (visual DB browser)
npm run db:backup       # Backup database to JSON
npm run db:restore      # Restore from backup
npm run db:cleanup      # Mark overdue loans, calculate fines
npm run db:health       # Check database integrity
npm run db:export       # Export data to CSV/Excel
```

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| `relation does not exist` | Run `npm run db:push` |
| `connect ECONNREFUSED` | Start PostgreSQL |
| `NEXTAUTH_SECRET not set` | Add secret to `.env` |
| Telegram: `Failed to load status` | Check server logs — likely DB or auth issue |
| Telegram: bot ignores code | Send the 6-digit code as plain text or use the deep link |
| Google login fails | Check redirect URI matches exactly in Google Console |
| Email not sending | Use Gmail App Password, not your regular password |
