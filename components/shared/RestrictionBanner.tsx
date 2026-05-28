"use client";

/**
 * Fetches the current member's restriction status and shows a dismissible
 * warning banner when they are suspended or limited.
 *
 * BLOCKED / BLACKLISTED members can't log in at all, so this banner is only
 * ever shown for IN_LIBRARY_ONLY and SUSPENDED.
 */

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldOff, X } from "lucide-react";

interface RestrictionInfo {
  restrictionStatus: string;
  restrictionReason: string | null;
  restrictionExpiry: string | null;
}

const CONFIG: Record<string, { label: string; desc: string; bg: string; border: string; icon: typeof ShieldAlert }> = {
  IN_LIBRARY_ONLY: {
    label:  "In-Library Access Only",
    desc:   "Home loans and reservations are not available for your account.",
    bg:     "bg-blue-50",
    border: "border-blue-200",
    icon:   ShieldOff,
  },
  SUSPENDED: {
    label:  "Account Suspended",
    desc:   "Borrowing and reservations are temporarily unavailable for your account.",
    bg:     "bg-amber-50",
    border: "border-amber-200",
    icon:   ShieldAlert,
  },
};

export default function RestrictionBanner() {
  const [info,      setInfo]      = useState<RestrictionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/member/status")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && data.restrictionStatus && data.restrictionStatus !== "NONE") {
          setInfo(data);
        }
      })
      .catch(() => {});
  }, []);

  if (!info || dismissed) return null;
  const cfg = CONFIG[info.restrictionStatus];
  if (!cfg) return null;

  const Icon = cfg.icon;

  return (
    <div className={`mx-4 mt-3 rounded-xl border ${cfg.bg} ${cfg.border} px-4 py-3 flex items-start gap-3`}>
      <Icon className="w-5 h-5 text-current flex-shrink-0 mt-0.5 opacity-70" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{cfg.label}</p>
        <p className="text-xs opacity-70 mt-0.5">{cfg.desc}</p>
        {info.restrictionReason && (
          <p className="text-xs italic mt-0.5 opacity-60">Reason: {info.restrictionReason}</p>
        )}
        {info.restrictionExpiry && (
          <p className="text-xs opacity-60 mt-0.5">
            Until {new Date(info.restrictionExpiry).toLocaleDateString()}
          </p>
        )}
        <p className="text-xs opacity-60 mt-1">Please visit the library counter for assistance.</p>
      </div>
      <button onClick={() => setDismissed(true)} className="opacity-40 hover:opacity-70 transition-opacity flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
