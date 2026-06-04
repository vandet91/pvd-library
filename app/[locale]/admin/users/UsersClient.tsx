"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Users, Search, Shield, Trash2, Loader2, AlertCircle,
  ChevronDown, UserCheck, UserPlus, X, Eye, EyeOff, KeyRound,
  BookUser, UserCog, Pencil, BookOpen, ArrowUpCircle, Settings2,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────── */
type RoleKey = "ADMIN" | "LIBRARIAN" | "STAFF" | "MEMBER";

interface UserRow {
  id:          string;
  name:        string | null;
  email:       string;
  role:        RoleKey;
  image:       string | null;
  createdAt:   string;
  member:      { memberId: string; memberType: string; isActive: boolean } | null;
  theme:       string | null;
  authStyle:   string | null;
  authMethods: string;
}

/* ── Role display config — no translatable strings here ────────── */
const ROLE_META: Record<RoleKey, {
  labelKey: string;
  descKey:  string;
  badge:    string;
  icon:     React.ReactNode;
}> = {
  ADMIN:     {
    labelKey: "roleAdminLabel",
    descKey:  "roleAdminDesc",
    badge:    "bg-indigo-100 text-indigo-700 border-indigo-200",
    icon:     <Shield   className="w-3 h-3" />,
  },
  LIBRARIAN: {
    labelKey: "roleLibrarianLabel",
    descKey:  "roleLibrarianDesc",
    badge:    "bg-violet-100 text-violet-700 border-violet-200",
    icon:     <BookUser className="w-3 h-3" />,
  },
  STAFF:     {
    labelKey: "roleStaffLabel",
    descKey:  "roleStaffDesc",
    badge:    "bg-blue-100 text-blue-700 border-blue-200",
    icon:     <UserCog  className="w-3 h-3" />,
  },
  MEMBER:    {
    labelKey: "roleMemberLabel",
    descKey:  "roleMemberDesc",
    badge:    "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon:     <BookOpen className="w-3 h-3" />,
  },
};

const STAFF_ROLES: RoleKey[] = ["ADMIN", "LIBRARIAN", "STAFF"];
const ALL_ROLES:   RoleKey[] = ["ADMIN", "LIBRARIAN", "STAFF", "MEMBER"];

function RoleBadge({ role }: { role: RoleKey }) {
  const t = useTranslations("users");
  const m = ROLE_META[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.badge}`}>
      {m.icon} {t(m.labelKey as Parameters<typeof t>[0])}
    </span>
  );
}

function Initials({
  name, email, variant = "indigo",
}: {
  name: string | null; email: string; variant?: "indigo" | "emerald";
}) {
  const src     = name ?? email;
  const letters = src.split(/[\s@]/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const cls     = variant === "emerald" ? "from-emerald-400 to-teal-600" : "from-indigo-400 to-blue-600";
  return (
    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${cls} flex items-center justify-center shrink-0`}>
      <span className="text-white text-xs font-bold">{letters}</span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function UsersClient({ currentUserId }: { currentUserId: string }) {
  const t  = useTranslations("users");
  const tc = useTranslations("common");

  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

  /* Per-section search / filter */
  const [staffQ,          setStaffQ]          = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState("");
  const [borrowerQ,       setBorrowerQ]       = useState("");

  /* Shared modals */
  const [confirmDelete,  setConfirmDelete]  = useState<UserRow | null>(null);
  const [resetTarget,    setResetTarget]    = useState<UserRow | null>(null);
  const [resetPw,        setResetPw]        = useState("");
  const [resetPwVisible, setResetPwVisible] = useState(false);
  const [resetBusy,      setResetBusy]      = useState(false);

  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editForm,   setEditForm]   = useState({ name: "", email: "" });
  const [editBusy,   setEditBusy]   = useState(false);
  const [editErr,    setEditErr]    = useState<string | null>(null);

  /* Prefs modal — only controls allowed sign-in methods (theme is per-user via Header) */
  const [prefsTarget, setPrefsTarget] = useState<UserRow | null>(null);
  const [prefsForm,   setPrefsForm]   = useState<{ authMethods: string[] }>({
    authMethods: ["password", "google", "magic"],
  });
  const [prefsBusy, setPrefsBusy] = useState(false);

  /* Create modal */
  const [createMode, setCreateMode] = useState<"staff" | "borrower">("staff");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "LIBRARIAN" as RoleKey });
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr,  setCreateErr]  = useState<string | null>(null);
  const [pwVisible,  setPwVisible]  = useState(false);

  /* ── Fetch all users ── */
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }

  function openCreate(mode: "staff" | "borrower") {
    setCreateMode(mode);
    setCreateForm({ name: "", email: "", password: "", role: mode === "staff" ? "LIBRARIAN" : "MEMBER" });
    setCreateErr(null);
    setPwVisible(false);
    setShowCreate(true);
  }

  function openEdit(user: UserRow) {
    setEditTarget(user);
    setEditForm({ name: user.name ?? "", email: user.email });
    setEditErr(null);
  }

  function openResetPw(user: UserRow) {
    setResetTarget(user);
    setResetPw("");
    setResetPwVisible(false);
  }

  function openPrefs(user: UserRow) {
    let methods = ["password", "google", "magic"];
    try {
      const parsed = JSON.parse(user.authMethods ?? '["password","google","magic"]');
      if (Array.isArray(parsed)) methods = parsed as string[];
    } catch { /* keep defaults */ }
    setPrefsForm({ authMethods: methods });
    setPrefsTarget(user);
  }

  async function doSavePrefs() {
    if (!prefsTarget) return;
    if (prefsForm.authMethods.length === 0) {
      showToast(t("methodRequired"), false);
      return;
    }
    setPrefsBusy(true);
    const res = await fetch(`/api/users/${prefsTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ authMethods: JSON.stringify(prefsForm.authMethods) }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) =>
        u.id === prefsTarget.id
          ? { ...u, authMethods: JSON.stringify(prefsForm.authMethods) }
          : u
      ));
      showToast(t("prefsUpdated", { name: prefsTarget.name ?? prefsTarget.email }));
      setPrefsTarget(null);
    } else {
      const err = await res.json();
      showToast(err.error ?? t("failedPrefs"), false);
    }
    setPrefsBusy(false);
  }

  /* change role */
  async function changeRole(user: UserRow, role: RoleKey) {
    setBusy(user.id);
    const res = await fetch(`/api/users/${user.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) =>
        u.id === user.id
          ? { ...u, role: updated.role, member: updated.member ?? u.member }
          : u
      ));
      showToast(t("roleChangedTo", {
        name: user.name ?? user.email,
        role: t(ROLE_META[role].labelKey as Parameters<typeof t>[0]),
      }));
    } else {
      const { error } = await res.json();
      showToast(error ?? t("failedUpdateRole"), false);
    }
    setBusy(null);
  }

  /* delete */
  async function doDelete(user: UserRow) {
    setConfirmDelete(null);
    setBusy(user.id);
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast(t("userDeleted", { name: user.name ?? user.email }));
    } else {
      const { error } = await res.json();
      showToast(error ?? t("failedDelete"), false);
    }
    setBusy(null);
  }

  /* reset password */
  async function doResetPassword() {
    if (!resetTarget || !resetPw.trim()) return;
    setResetBusy(true);
    const res = await fetch(`/api/users/${resetTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password: resetPw }),
    });
    if (res.ok) {
      showToast(t("passwordUpdated", { name: resetTarget.name ?? resetTarget.email }));
      setResetTarget(null);
      setResetPw("");
    } else {
      const data = await res.json();
      showToast(data.error ?? t("failedResetPassword"), false);
    }
    setResetBusy(false);
  }

  /* edit profile */
  async function doEditProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditBusy(true); setEditErr(null);
    const res = await fetch(`/api/users/${editTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: editForm.name.trim(), email: editForm.email.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => u.id === editTarget.id ? { ...u, name: updated.name, email: updated.email } : u));
      showToast(t("profileUpdated", { name: updated.name ?? updated.email }));
      setEditTarget(null);
    } else {
      const data = await res.json();
      setEditErr(typeof data.error === "string" ? data.error : t("failedUpdateProfile"));
    }
    setEditBusy(false);
  }

  /* create user */
  async function doCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateBusy(true); setCreateErr(null);
    const res = await fetch("/api/users", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(createForm),
    });
    if (res.ok) {
      setShowCreate(false);
      showToast(t("userCreated", { name: createForm.name || createForm.email }));
      load();
    } else {
      const data = await res.json();
      setCreateErr(typeof data.error === "string" ? data.error : t("failedCreate"));
    }
    setCreateBusy(false);
  }

  /* ── Derived lists ─────────────────────────────────────────────── */
  const adminCount   = users.filter((u) => u.role === "ADMIN").length;
  const allStaff     = users.filter((u) => (STAFF_ROLES as string[]).includes(u.role));
  const allBorrowers = users.filter((u) => u.role === "MEMBER");

  const visibleStaff = allStaff.filter((u) => {
    const matchQ    = !staffQ || (u.name ?? "").toLowerCase().includes(staffQ.toLowerCase()) || u.email.toLowerCase().includes(staffQ.toLowerCase());
    const matchRole = !staffRoleFilter || u.role === staffRoleFilter;
    return matchQ && matchRole;
  });

  const visibleBorrowers = allBorrowers.filter((u) => {
    if (!borrowerQ) return true;
    const q = borrowerQ.toLowerCase();
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)         ||
      (u.member?.memberId ?? "").toLowerCase().includes(q)
    );
  });

  /* ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-10">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50">
          <Users className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> {t("loadingUsers")}
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════
              SECTION 1 — STAFF ACCOUNTS
          ════════════════════════════════════════════════════════ */}
          <section className="space-y-4">

            {/* Section header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {t("staffSection")}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                      {allStaff.length}
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400">{t("staffSectionSubtitle")}</p>
                </div>
              </div>
              <button
                onClick={() => openCreate("staff")}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {t("addStaff")}
              </button>
            </div>

            {/* Role legend */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STAFF_ROLES.map((role) => (
                <div key={role} className="flex items-start gap-2.5 px-3 py-2.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="shrink-0 mt-0.5"><RoleBadge role={role} /></div>
                  <p className="text-xs text-gray-400 leading-snug">
                    {t(ROLE_META[role].descKey as Parameters<typeof t>[0])}
                  </p>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t("searchStaffPlaceholder")}
                  value={staffQ}
                  onChange={(e) => setStaffQ(e.target.value)}
                  autoComplete="off"
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <select
                value={staffRoleFilter}
                onChange={(e) => setStaffRoleFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700"
              >
                <option value="">{t("allStaffRoles")}</option>
                <option value="ADMIN">{t("roleAdminLabel")}</option>
                <option value="LIBRARIAN">{t("roleLibrarianLabel")}</option>
                <option value="STAFF">{t("roleStaffLabel")}</option>
              </select>
            </div>

            {/* Staff table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {visibleStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2 text-gray-400">
                  <Users className="w-9 h-9 opacity-30" />
                  <p className="text-sm">
                    {staffQ || staffRoleFilter ? t("noStaffSearch") : t("noStaffYet")}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-5 py-3">{t("colUser")}</th>
                      <th className="text-left px-5 py-3">{t("colRole")}</th>
                      <th className="text-left px-5 py-3 hidden lg:table-cell">{t("colJoined")}</th>
                      <th className="text-right px-5 py-3">{tc("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleStaff.map((user) => {
                      const isMe = user.id === currentUserId;
                      return (
                        <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <Initials name={user.name} email={user.email} variant="indigo" />
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                                  {user.name ?? <span className="italic text-gray-400">{t("noName")}</span>}
                                  {isMe && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold">
                                      {t("youLabel")}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-400 truncate">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5"><RoleBadge role={user.role} /></td>
                          <td className="px-5 py-3.5 hidden lg:table-cell text-gray-500 text-xs">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-2">
                              {busy === user.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                              ) : (
                                <>
                                  <RoleDropdown
                                    user={user}
                                    availableRoles={ALL_ROLES}
                                    isMe={isMe}
                                    isLastAdmin={user.role === "ADMIN" && adminCount === 1}
                                    onChangeRole={changeRole}
                                  />
                                  <button onClick={() => openEdit(user)} title={t("titleEditProfile")}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openResetPw(user)} title={t("titleResetPassword")}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                                    <KeyRound className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openPrefs(user)} title={t("titleSignInAccess")}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-violet-50 transition-colors">
                                    <Settings2 className="w-4 h-4" />
                                  </button>
                                  {!isMe && (
                                    <button onClick={() => setConfirmDelete(user)} title={t("titleDeleteAccount")}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </section>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* ════════════════════════════════════════════════════════
              SECTION 2 — BORROWER ACCOUNTS
          ════════════════════════════════════════════════════════ */}
          <section className="space-y-4">

            {/* Section header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {t("borrowerSection")}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      {allBorrowers.length}
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400">{t("borrowerSectionSubtitle")}</p>
                </div>
              </div>
              <button
                onClick={() => openCreate("borrower")}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {t("addBorrower")}
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t("searchBorrowerPlaceholder")}
                value={borrowerQ}
                onChange={(e) => setBorrowerQ(e.target.value)}
                autoComplete="off"
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            {/* Borrower table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {visibleBorrowers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2 text-gray-400">
                  <BookOpen className="w-9 h-9 opacity-30" />
                  <p className="text-sm">
                    {borrowerQ ? t("noBorrowerSearch") : t("noBorrowerYet")}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-5 py-3">{t("colBorrower")}</th>
                      <th className="text-left px-5 py-3 hidden md:table-cell">{t("colMemberId")}</th>
                      <th className="text-left px-5 py-3 hidden lg:table-cell">{t("colJoined")}</th>
                      <th className="text-right px-5 py-3">{tc("actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleBorrowers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Initials name={user.name} email={user.email} variant="emerald" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {user.name ?? <span className="italic text-gray-400">{t("noName")}</span>}
                              </p>
                              <p className="text-xs text-gray-400 truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          {user.member ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-700">{user.member.memberId}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                user.member.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                              }`}>
                                {user.member.isActive ? tc("active") : tc("inactive")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 italic">{t("noMemberCard")}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell text-gray-500 text-xs">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            {busy === user.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                            ) : (
                              <>
                                <PromoteDropdown user={user} onChangeRole={changeRole} />
                                <button onClick={() => openEdit(user)} title={t("titleEditProfile")}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => openResetPw(user)} title={t("titleResetPassword")}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                                  <KeyRound className="w-4 h-4" />
                                </button>
                                <button onClick={() => setConfirmDelete(user)} title={t("titleDeleteAccount")}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* ── Create Modal ──────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${createMode === "staff" ? "bg-indigo-100" : "bg-emerald-100"}`}>
                  <UserPlus className={`w-5 h-5 ${createMode === "staff" ? "text-indigo-600" : "text-emerald-600"}`} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {createMode === "staff" ? t("createStaffTitle") : t("createBorrowerTitle")}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {createMode === "staff" ? t("createStaffSubtitle") : t("createBorrowerSubtitle")}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={doCreate} className="space-y-4" autoComplete="off">
              <div>
                <label htmlFor="user-create-name" className="block text-sm font-medium text-gray-700 mb-1">{t("labelFullName")}</label>
                <input id="user-create-name" type="text" required value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={createMode === "staff" ? "Dara Sok" : "Sophea Chan"}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="user-create-email" className="block text-sm font-medium text-gray-700 mb-1">{t("labelEmail")}</label>
                <input id="user-create-email" type="email" required value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={createMode === "staff" ? "dara@pvdlibrary.org" : "sophea@example.com"}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="user-create-password" className="block text-sm font-medium text-gray-700 mb-1">{t("labelPassword")}</label>
                <div className="relative">
                  <input id="user-create-password" type={pwVisible ? "text" : "password"} required minLength={8}
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={t("passwordPlaceholder")}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={() => setPwVisible((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {pwVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {createMode === "staff" ? (
                <div>
                  <label htmlFor="user-create-role" className="block text-sm font-medium text-gray-700 mb-1">{t("labelStaffRole")}</label>
                  <select
                    id="user-create-role"
                    value={createForm.role}
                    onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as RoleKey }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="LIBRARIAN">{t("roleOptionLibrarian")}</option>
                    <option value="STAFF">{t("roleOptionStaff")}</option>
                    <option value="ADMIN">{t("roleOptionAdmin")}</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {t(ROLE_META[createForm.role].descKey as Parameters<typeof t>[0])}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                  <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">{t("borrowerInfo")}</p>
                </div>
              )}

              {createErr && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {createErr}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {tc("cancel")}
                </button>
                <button type="submit" disabled={createBusy}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60 ${
                    createMode === "staff" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}>
                  {createBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {createMode === "staff" ? t("createStaffBtn") : t("createBorrowerBtn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Profile Modal ───────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-indigo-100">
                  <Pencil className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t("editProfileTitle")}</h2>
                  <p className="text-xs text-gray-400">{t("editProfileSubtitle")}</p>
                </div>
              </div>
              <button onClick={() => setEditTarget(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={doEditProfile} className="space-y-4" autoComplete="off">
              <div>
                <label htmlFor="user-edit-name" className="block text-sm font-medium text-gray-700 mb-1">{t("labelFullName")}</label>
                <input id="user-edit-name" type="text" required value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dara Sok" autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="user-edit-email" className="block text-sm font-medium text-gray-700 mb-1">{t("labelEmailAddress")}</label>
                <input id="user-edit-email" type="email" required value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@pvdlibrary.org" autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {editErr && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {editErr}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {tc("cancel")}
                </button>
                <button type="submit" disabled={editBusy}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                  {editBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("saveChanges")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ─────────────────────────────── */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100">
                <KeyRound className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t("resetPasswordTitle")}</h2>
                <p className="text-xs text-gray-500">{resetTarget.name ?? resetTarget.email}</p>
              </div>
            </div>
            <div className="relative">
              <input
                id="user-reset-password"
                type={resetPwVisible ? "text" : "password"}
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                placeholder={t("newPasswordPlaceholder")}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setResetPwVisible((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {resetPwVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setResetTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                {tc("cancel")}
              </button>
              <button onClick={doResetPassword} disabled={resetBusy || resetPw.length < 8}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {resetBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("savePassword")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">{t("deleteTitle")}</h2>
            </div>
            <p className="text-sm text-gray-600">
              {t("deleteConfirm", { name: confirmDelete.name ?? confirmDelete.email })}
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                {tc("cancel")}
              </button>
              <button onClick={() => doDelete(confirmDelete)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
                {tc("delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Account Preferences Modal ────────────────────────── */}
      {prefsTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-violet-100">
                  <Settings2 className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t("titleSignInAccess")}</h2>
                  <p className="text-xs text-gray-400">{prefsTarget.name ?? prefsTarget.email}</p>
                </div>
              </div>
              <button onClick={() => setPrefsTarget(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Allowed Sign-In Methods */}
            <div className="space-y-2">
              <p className="block text-sm font-medium text-gray-700">{t("labelAuthMethods")}</p>
              <div className="space-y-1.5">
                {(["password", "google", "magic"] as const).map((method) => (
                  <label key={method}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefsForm.authMethods.includes(method)}
                      onChange={(e) =>
                        setPrefsForm((f) => ({
                          ...f,
                          authMethods: e.target.checked
                            ? [...f.authMethods, method]
                            : f.authMethods.filter((m) => m !== method),
                        }))
                      }
                      className="w-4 h-4 rounded accent-violet-600"
                    />
                    <span className="text-sm text-gray-700">
                      {method === "password"
                        ? t("authMethodPassword")
                        : method === "google"
                        ? t("authMethodGoogle")
                        : t("authMethodMagic")}
                    </span>
                  </label>
                ))}
              </div>
              {prefsForm.authMethods.length === 0 && (
                <p className="text-xs text-red-500 mt-1">{t("methodRequired")}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setPrefsTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={doSavePrefs}
                disabled={prefsBusy || prefsForm.authMethods.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
              >
                {prefsBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("savePrefs")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? <UserCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── Staff Role Dropdown ─────────────────────────────────────────── */
function RoleDropdown({
  user, availableRoles, isMe, isLastAdmin, onChangeRole,
}: {
  user:           UserRow;
  availableRoles: RoleKey[];
  isMe:           boolean;
  isLastAdmin:    boolean;
  onChangeRole:   (user: UserRow, role: RoleKey) => void;
}) {
  const t = useTranslations("users");
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect       = btnRef.current.getBoundingClientRect();
      const dropHeight = 180;
      const right      = window.innerWidth - rect.right;
      if (window.innerHeight - rect.bottom < dropHeight) {
        setDropPos({ bottom: window.innerHeight - rect.top + 4, right });
      } else {
        setDropPos({ top: rect.bottom + 4, right });
      }
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={isMe || isLastAdmin}
        title={
          isMe        ? t("titleCannotChangeSelf") :
          isLastAdmin ? t("titleCannotChangeLastAdmin") :
                        t("titleChangeRole")
        }
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("changeRole")} <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && dropPos && createPortal(
        <div
          ref={dropRef}
          style={{ position: "fixed", top: dropPos.top, bottom: dropPos.bottom, right: dropPos.right, zIndex: 9999 }}
          className="w-52 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
        >
          {availableRoles.map((role, idx) => {
            const m        = ROLE_META[role];
            const isMember = role === "MEMBER";
            return (
              <button
                key={role}
                onClick={() => { onChangeRole(user, role); setOpen(false); }}
                disabled={user.role === role}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                  isMember && idx > 0 ? "border-t border-gray-100" : ""
                }`}
              >
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.badge}`}>
                  {m.icon} {t(m.labelKey as Parameters<typeof t>[0])}
                </span>
                {user.role === role && (
                  <span className="ml-auto text-[10px] text-gray-400">{t("currentRole")}</span>
                )}
                {isMember && user.role !== role && (
                  <span className="ml-auto text-[10px] text-amber-500 font-medium">{t("moveToBorrowers")}</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

/* ── Promote Dropdown (Borrower → Staff) ─────────────────────────── */
function PromoteDropdown({
  user, onChangeRole,
}: {
  user:         UserRow;
  onChangeRole: (user: UserRow, role: RoleKey) => void;
}) {
  const t = useTranslations("users");
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect       = btnRef.current.getBoundingClientRect();
      const dropHeight = 220;
      const right      = window.innerWidth - rect.right;
      if (window.innerHeight - rect.bottom < dropHeight) {
        setDropPos({ bottom: window.innerHeight - rect.top + 4, right });
      } else {
        setDropPos({ top: rect.bottom + 4, right });
      }
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title={t("promoteTitle")}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
      >
        <ArrowUpCircle className="w-3.5 h-3.5" />
        {t("promote")}
      </button>

      {open && dropPos && createPortal(
        <div
          ref={dropRef}
          style={{ position: "fixed", top: dropPos.top, bottom: dropPos.bottom, right: dropPos.right, zIndex: 9999 }}
          className="w-60 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
        >
          <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-600">{t("promoteDropdownTitle")}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{t("promoteDropdownSubtitle")}</p>
          </div>
          {STAFF_ROLES.map((role) => {
            const m = ROLE_META[role];
            return (
              <button
                key={role}
                onClick={() => { onChangeRole(user, role); setOpen(false); }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mt-0.5 shrink-0 ${m.badge}`}>
                  {m.icon} {t(m.labelKey as Parameters<typeof t>[0])}
                </span>
                <span className="text-[11px] text-gray-400 leading-snug">
                  {t(m.descKey as Parameters<typeof t>[0])}
                </span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
