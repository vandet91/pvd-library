"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, BookOpen, BookMarked, Users, ArrowLeftRight,
  AlertCircle, BarChart3, Search, Settings, LogOut, ShoppingCart, ShieldCheck, Inbox,
  ClipboardList, ShoppingBasket, Barcode, Shield, DatabaseBackup, Bell, Tags,
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
  reservations: number;  // PENDING — needs approve/cancel decision
  approved:     number;  // APPROVED — book needs to be pulled from shelf
  readyPickup:  number;  // READY — on hold shelf, awaiting member pickup
  bookRequests: number;
  overdue:      number;
  fines:        number;
}

export default function Sidebar({ role }: { role: string }) {
  const t        = useTranslations("nav");
  const locale   = useLocale();
  const pathname = usePathname();
  const libraryName = useLibraryName();
  const libraryLogo = useLibraryLogo();

  const [alerts, setAlerts] = useState<Alerts>({
    reservations: 0, approved: 0, readyPickup: 0, bookRequests: 0, overdue: 0, fines: 0,
  });

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

  /* Each link: href, label, icon, minRole, badge (optional) */
  type NavLink = {
    href: string; label: string; icon: React.ElementType; minRole: string;
    badge?: React.ReactNode;
  };

  const allLinks: NavLink[] = [
    {
      href: `/${locale}/admin`,
      label: t("dashboard"),
      icon: LayoutDashboard,
      minRole: "STAFF",
    },
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
      href: `/${locale}/admin/taxonomy`,
      label: t("taxonomy"),
      icon: Tags,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/members`,
      label: t("members"),
      icon: Users,
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
      // Combined total; color = most urgent status present
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
      href: `/${locale}/admin/fines`,
      label: t("fines"),
      icon: AlertCircle,
      minRole: "STAFF",
      badge: alerts.fines > 0
        ? <Badge count={alerts.fines} color="orange" />
        : null,
    },
    {
      href: `/${locale}/admin/reports`,
      label: t("reports"),
      icon: BarChart3,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/users`,
      label: t("users"),
      icon: ShieldCheck,
      minRole: "ADMIN",
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
      href: `/${locale}/admin/inventory`,
      label: t("inventory"),
      icon: ClipboardList,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/baskets`,
      label: t("baskets"),
      icon: ShoppingBasket,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/barcode`,
      label: t("barcode"),
      icon: Barcode,
      minRole: "LIBRARIAN",
    },
    {
      href: `/${locale}/admin/notifications`,
      label: t("notifications"),
      icon: Bell,
      minRole: "ADMIN",
    },
    {
      href: `/${locale}/admin/database`,
      label: t("database"),
      icon: DatabaseBackup,
      minRole: "ADMIN",
    },
    {
      href: `/${locale}/discover`,
      label: t("opac"),
      icon: Search,
      minRole: "STAFF",
    },
  ];

  const links = allLinks.filter((l) => hasAccess(role, l.minRole));
  const chip  = ROLE_CHIP[role] ?? ROLE_CHIP.MEMBER;

  /* Total urgent count for the page <title> */
  const totalUrgent = alerts.reservations + alerts.approved + alerts.readyPickup + alerts.bookRequests + alerts.overdue + alerts.fines;

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
          const isActive = pathname === href || (href !== `/${locale}/admin` && pathname.startsWith(href));
          return (
            <Link
              key={href}
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
          );
        })}
      </nav>

      {/* ── Bottom links ── */}
      <div className="p-4 border-t border-white/10 space-y-0.5">
        {hasAccess(role, "ADMIN") && (
          <Link
            href={`/${locale}/admin/settings`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            {t("settings")}
          </Link>
        )}
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
