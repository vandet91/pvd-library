"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, BookOpen, BookMarked, Users, ArrowLeftRight,
  AlertCircle, BarChart3, Search, Settings, LogOut, ShoppingCart, ShieldCheck, Inbox,
  ClipboardList, ShoppingBasket, Barcode, Shield, DatabaseBackup, Bell, Tags, Activity,
  Bot, Tag, Trash2, PackagePlus, Warehouse, ShoppingBag, CheckSquare, ArrowDownToLine, Hash,
  Languages, Wand2, UserRound, Wrench, ChevronDown, ScrollText, Newspaper, CalendarDays, TrendingUp,
} from "lucide-react";
import { useLibraryName } from "@/context/library-name";
import { useLibraryLogo } from "@/context/library-logo";

/* ── Role hierarchy ─────────────────────────────────────────────── */
const LEVEL: Record<string, number> = { STAFF: 1, LIBRARIAN: 2, ADMIN: 3 };
function hasAccess(userRole: string, minRole: string) {
  return (LEVEL[userRole] ?? 0) >= (LEVEL[minRole] ?? 99);
}

const ROLE_CHIP: Record<string, { label: string; cls: string }> = {
  ADMIN:     { label: "Admin",     cls: "bg-indigo-500/30 text-indigo-100" },
  LIBRARIAN: { label: "Librarian", cls: "bg-violet-500/30 text-violet-100" },
  STAFF:     { label: "Staff",     cls: "bg-blue-500/30   text-blue-100"   },
  MEMBER:    { label: "Member",    cls: "bg-gray-500/30   text-gray-100"   },
};

/* ── Badge colours ──────────────────────────────────────────────── */
function Badge({ count, color = "red" }: { count: number; color?: "red" | "yellow" | "purple" | "orange" }) {
  if (count === 0) return null;
  const cls = {
    red:    "bg-red-500    text-white",
    yellow: "bg-yellow-400 text-yellow-900",
    purple: "bg-purple-500 text-white",
    orange: "bg-orange-400 text-white",
  }[color];
  return (
    <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${cls}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface Alerts {
  reservations:         number;
  approved:             number;
  readyPickup:          number;
  bookRequests:         number;
  overdue:              number;
  fines:                number;
  processing:           number;
  pendingTasks:         number;
  pendingMembers:       number;
  salePaymentSubmitted: number;
  saleReturnRequested:  number;
  serialIssuesMissing:  number;
  subscriptionsExpiring: number;
  ordersAwaitingReceive: number;
}

/* ── Rotating daily quote ───────────────────────────────────────── */
const QUOTES = [
  { text: "A library is not a luxury but one of the necessities of life.", author: "Henry Ward Beecher" },
  { text: "The only thing that you absolutely have to know is the location of the library.", author: "Albert Einstein" },
  { text: "A great library contains the diary of the human race.", author: "George Mercer Dawson" },
  { text: "Libraries store the energy that fuels the imagination.", author: "Sidney Sheldon" },
  { text: "A library is the delivery room for the birth of ideas.", author: "Norman Cousins" },
  { text: "The reading of all good books is like a conversation with the finest minds.", author: "René Descartes" },
  { text: "Libraries are the thinking centres of the world.", author: "Walter Savage Landor" },
];

function QuoteCard() {
  const quote = QUOTES[new Date().getDay() % QUOTES.length];
  return (
    <div className="mx-4 mb-3 p-3 rounded-xl bg-white/5 border border-white/10">
      <p className="text-[11px] leading-relaxed text-white/60 italic line-clamp-3">
        &ldquo;{quote.text}&rdquo;
      </p>
      <p className="text-[10px] text-white/35 mt-1.5 font-medium">— {quote.author}</p>
    </div>
  );
}

/* ── Reusable collapsible section ──────────────────────────────── */
function CollapsibleSection({
  label, icon: Icon, open, onToggle, children,
}: {
  label: string; icon: React.ElementType; open: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="pt-1 pb-0.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="ml-3 pl-3 border-l border-white/10 mt-0.5 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function SubLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1">{label}</span>
    </Link>
  );
}

export default function Sidebar({ role }: { role: string }) {
  const t        = useTranslations("nav");
  const locale   = useLocale();
  const pathname = usePathname();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  const [alerts, setAlerts] = useState<Alerts>({
    reservations: 0, approved: 0, readyPickup: 0, bookRequests: 0, overdue: 0, fines: 0,
    processing: 0, pendingTasks: 0, pendingMembers: 0,
    salePaymentSubmitted: 0, saleReturnRequested: 0,
    serialIssuesMissing: 0, subscriptionsExpiring: 0, ordersAwaitingReceive: 0,
  });

  const [aiAdminEnabled, setAiAdminEnabled] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) setAlerts(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 60_000); // background refresh every 60 s

    // Immediately re-fetch whenever any page signals a data change
    window.addEventListener("alertsChanged", fetchAlerts);
    return () => {
      clearInterval(id);
      window.removeEventListener("alertsChanged", fetchAlerts);
    };
  }, [fetchAlerts]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((d: Record<string, string>) => {
        setAiAdminEnabled(d.AI_SEARCH_ADMIN !== "false");
      })
      .catch(() => {});
  }, []);

  /* Each link: href, label, icon, minRole, badge (optional) */
  type NavLink = {
    href: string; label: string; icon: React.ElementType; minRole: string;
    badge?: React.ReactNode;
  };

  const allLinks: NavLink[] = [
    // ── Daily operations ─────────────────────────────────────────
    {
      href: `/${locale}/admin`,
      label: t("dashboard"),
      icon: LayoutDashboard,
      minRole: "STAFF",
    },
    {
      href: `/${locale}/admin/circulation`,
      label: t("circulation"),
      icon: ArrowLeftRight,
      minRole: "STAFF",
      badge: alerts.overdue > 0
        ? <Badge count={alerts.overdue} color="red" />
        : null,
    },
    {
      href: `/${locale}/admin/reservations`,
      label: t("reservations"),
      icon: ShoppingCart,
      minRole: "STAFF",
      badge: (() => {
        const total = alerts.reservations + alerts.approved + alerts.readyPickup;
        if (total === 0) return null;
        const color = alerts.reservations > 0 ? "yellow"
          : alerts.approved > 0              ? "orange"
          :                                    "purple";
        return <Badge count={total} color={color} />;
      })(),
    },
    {
      href: `/${locale}/admin/members`,
      label: t("members"),
      icon: Users,
      minRole: "STAFF",
      badge: alerts.pendingMembers > 0
        ? <Badge count={alerts.pendingMembers} color="yellow" />
        : null,
    },
    {
      href: `/${locale}/admin/fines`,
      label: t("fines"),
      icon: AlertCircle,
      minRole: "STAFF",
      badge: alerts.fines > 0
        ? <Badge count={alerts.fines} color="orange" />
        : null,
    },
    {
      href: `/${locale}/admin/book-requests`,
      label: t("bookRequests"),
      icon: Inbox,
      minRole: "LIBRARIAN",
      badge: alerts.bookRequests > 0
        ? <Badge count={alerts.bookRequests} color="yellow" />
        : null,
    },
    {
      href: `/${locale}/admin/tasks`,
      label: t("staffTasks"),
      icon: CheckSquare,
      minRole: "STAFF",
      badge: alerts.pendingTasks > 0
        ? <Badge count={alerts.pendingTasks} color="purple" />
        : null,
    },
    // ── Catalog ───────────────────────────────────────────────────
    {
      href: `/${locale}/admin/books`,
      label: t("books"),
      icon: BookOpen,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/ebooks`,
      label: t("ebooks"),
      icon: BookMarked,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/serials`,
      label: "Serials",
      icon: Newspaper,
      minRole: "LIBRARIAN",
      badge: (() => {
        const total = alerts.serialIssuesMissing + alerts.subscriptionsExpiring;
        if (total === 0) return null;
        const color = alerts.serialIssuesMissing > 0 ? "red" : "yellow";
        return <Badge count={total} color={color} />;
      })(),
    },
    {
      href: `/${locale}/admin/books/processing`,
      label: t("processing"),
      icon: Tag,
      minRole: "STAFF",
      badge: alerts.processing > 0
        ? <Badge count={alerts.processing} color="yellow" />
        : null,
    },
    {
      href: `/${locale}/admin/barcode`,
      label: t("barcode"),
      icon: Barcode,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/baskets`,
      label: t("baskets"),
      icon: ShoppingBasket,
      minRole: "LIBRARIAN",
    },
    // ── Acquisitions & Stock ──────────────────────────────────────
    {
      href: `/${locale}/admin/acquisitions`,
      label: "Acquisitions",
      icon: PackagePlus,
      minRole: "LIBRARIAN",
      badge: alerts.ordersAwaitingReceive > 0
        ? <Badge count={alerts.ordersAwaitingReceive} color="yellow" />
        : null,
    },
    {
      href: `/${locale}/admin/books/acquisition`,
      label: "Demand Intel",
      icon: TrendingUp,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/stock`,
      label: t("stock"),
      icon: Warehouse,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/inventory`,
      label: t("inventory"),
      icon: ClipboardList,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/books/weeding`,
      label: t("weeding"),
      icon: Trash2,
      minRole: "LIBRARIAN",
    },
    // ── Bookshop ──────────────────────────────────────────────────
    {
      href: `/${locale}/admin/orders`,
      label: t("saleOrders"),
      icon: ShoppingBag,
      minRole: "STAFF",
      badge: (() => {
        const total = alerts.salePaymentSubmitted + alerts.saleReturnRequested;
        if (total === 0) return null;
        const color = alerts.saleReturnRequested > 0 ? "red" : "orange";
        return <Badge count={total} color={color} />;
      })(),
    },
    // ── Analytics & AI ────────────────────────────────────────────
    {
      href: `/${locale}/admin/reports`,
      label: t("reports"),
      icon: BarChart3,
      minRole: "LIBRARIAN",
    },
    ...(aiAdminEnabled ? [{
      href: `/${locale}/admin/ai-assistant`,
      label: t("aiAssistant"),
      icon: Bot,
      minRole: "STAFF",
    }] : []),
    // ── User management ───────────────────────────────────────────
    {
      href: `/${locale}/admin/users`,
      label: t("users"),
      icon: ShieldCheck,
      minRole: "ADMIN",
    },
    // ── Public portal ─────────────────────────────────────────────
    {
      href: `/${locale}/discover`,
      label: t("opac"),
      icon: Search,
      minRole: "STAFF",
    },
  ];

  const links = allLinks.filter((l) => hasAccess(role, l.minRole));
  const chip  = ROLE_CHIP[role] ?? ROLE_CHIP.MEMBER;

  /* ── Settings section (collapsible) ── */
  const allSettingsLinks: NavLink[] = [
    { href: `/${locale}/admin/settings`,          label: t("settings"),      icon: Settings,    minRole: "ADMIN"     },
    { href: `/${locale}/admin/circulation-rules`, label: "Circ. Rules",      icon: ScrollText,  minRole: "LIBRARIAN" },
    { href: `/${locale}/admin/calendar`,          label: "Calendar",         icon: CalendarDays,minRole: "ADMIN"     },
    { href: `/${locale}/admin/taxonomy`,          label: t("taxonomy"),      icon: Tags,        minRole: "LIBRARIAN" },
    { href: `/${locale}/admin/notifications`,     label: t("notifications"), icon: Bell,        minRole: "ADMIN"     },
    { href: `/${locale}/admin/logs`,              label: t("activityLogs"),  icon: Activity,    minRole: "ADMIN"     },
    { href: `/${locale}/admin/translations`,      label: t("translations"),  icon: Languages,   minRole: "LIBRARIAN" },
  ];
  const settingsLinks = allSettingsLinks.filter((l) => hasAccess(role, l.minRole));
  const isOnSettingsPage = ["/admin/settings", "/admin/notifications", "/admin/logs", "/admin/translations", "/admin/circulation-rules", "/admin/calendar", "/admin/taxonomy"]
    .some((p) => pathname.includes(p));
  const [settingsOpen, setSettingsOpen] = useState(isOnSettingsPage);

  /* ── Database section (collapsible) ── */
  const allDbLinks: NavLink[] = [
    { href: `/${locale}/admin/database`,  label: t("database"),  icon: DatabaseBackup, minRole: "ADMIN" },
    { href: `/${locale}/admin/migration`, label: t("migration"), icon: ArrowDownToLine, minRole: "ADMIN" },
  ];
  const dbLinks = allDbLinks.filter((l) => hasAccess(role, l.minRole));
  const isOnDbPage = pathname.includes("/admin/database") || pathname.includes("/admin/migration");
  const [dbOpen, setDbOpen] = useState(isOnDbPage);

  /* ── Tools section (collapsible) ── */
  const allToolLinks: NavLink[] = [
    { href: `/${locale}/admin/tools/isbn`,             label: t("fixIsbn"),        icon: Hash,      minRole: "LIBRARIAN" },
    { href: `/${locale}/admin/tools/dedup-books`,      label: t("dedupBooks"),     icon: BookOpen,  minRole: "LIBRARIAN" },
    { href: `/${locale}/admin/tools/dedup-authors`,    label: t("dedupAuthors"),   icon: UserRound, minRole: "LIBRARIAN" },
    { href: `/${locale}/admin/tools/members`,          label: t("dedupMembers"),   icon: Users,     minRole: "LIBRARIAN" },
    { href: `/${locale}/admin/tools/regen-member-ids`, label: t("regenMemberIds"), icon: Wand2,     minRole: "ADMIN"     },
  ];
  const toolLinks = allToolLinks.filter((l) => hasAccess(role, l.minRole));
  const isOnToolsPage = pathname.includes("/admin/tools");
  const [toolsOpen, setToolsOpen] = useState(isOnToolsPage);

  /* Total urgent count for the page <title> */
  const totalUrgent = alerts.reservations + alerts.approved + alerts.readyPickup + alerts.bookRequests
    + alerts.overdue + alerts.fines + alerts.processing + alerts.pendingTasks + alerts.pendingMembers
    + alerts.salePaymentSubmitted + alerts.saleReturnRequested
    + alerts.serialIssuesMissing + alerts.subscriptionsExpiring + alerts.ordersAwaitingReceive;

  return (
    <aside className="w-64 min-h-screen flex flex-col" style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}>
      {/* ── Brand ── */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 flex-shrink-0">
            <div className="w-full h-full rounded-xl flex items-center justify-center overflow-hidden bg-white/20">
              {libraryLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={libraryLogo}
                  alt={libraryName}
                  className="w-full h-full object-contain"
                />
              ) : (
                <BookOpen className="w-6 h-6 text-white" />
              )}
            </div>
            {/* Global alert dot — outside the overflow-hidden inner div so it's never clipped */}
            {totalUrgent > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[var(--sidebar)] animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-white text-sm">{libraryName}</h1>
            <p className="text-white/60 text-xs">{t("managementSystem")}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${chip.cls}`}>
            <Shield className="w-3 h-3" />
            {chip.label}
          </span>
          {totalUrgent > 0 && (
            <span className="text-xs text-white/50">{totalUrgent} {t("pending")}</span>
          )}
        </div>
      </div>

      {/* ── Nav links ── */}
      <nav className="flex-1 p-4 space-y-0.5 overflow-y-auto">
        {links.map(({ href, label, icon: Icon, badge }) => {
          // Inject collapsible sections right before the OPAC link
          const isTranslations = href === `/${locale}/discover`;
          const isActive = pathname === href || (href !== `/${locale}/admin` && pathname.startsWith(href));
          return (
            <div key={href}>
              {isTranslations && (
                <>
                  {/* ── Settings section ── */}
                  {settingsLinks.length > 0 && (
                    <CollapsibleSection
                      label={t("settingsSection")}
                      icon={Settings}
                      open={settingsOpen}
                      onToggle={() => setSettingsOpen((v) => !v)}
                    >
                      {settingsLinks.map(({ href: h, label: l, icon: I }) => (
                        <SubLink key={h} href={h} label={l} icon={I} active={pathname === h || pathname.startsWith(h)} />
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* ── Database section ── */}
                  {dbLinks.length > 0 && (
                    <CollapsibleSection
                      label={t("databaseSection")}
                      icon={DatabaseBackup}
                      open={dbOpen}
                      onToggle={() => setDbOpen((v) => !v)}
                    >
                      {dbLinks.map(({ href: h, label: l, icon: I }) => (
                        <SubLink key={h} href={h} label={l} icon={I} active={pathname === h || pathname.startsWith(h)} />
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* ── Tools section ── */}
                  {toolLinks.length > 0 && (
                    <CollapsibleSection
                      label={t("tools")}
                      icon={Wrench}
                      open={toolsOpen}
                      onToggle={() => setToolsOpen((v) => !v)}
                    >
                      {toolLinks.map(({ href: h, label: l, icon: I }) => (
                        <SubLink key={h} href={h} label={l} icon={I} active={pathname === h || pathname.startsWith(h)} />
                      ))}
                    </CollapsibleSection>
                  )}
                </>
              )}
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {badge}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* ── Daily quote ── */}
      <QuoteCard />

      {/* ── Bottom bar — logout only ── */}
      <div className="p-4 border-t border-white/10">
        <form action="/api/auth/signout" method="POST">
          <input type="hidden" name="callbackUrl" value={`/${locale}/auth/login`} />
          <button type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
            {t("logout")}
          </button>
        </form>
      </div>
    </aside>
  );
}
