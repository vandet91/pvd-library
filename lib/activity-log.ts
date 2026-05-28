/**
 * Activity logging helper.
 * Call this after every successful mutation in an API route.
 * Errors are swallowed — logging must never block the main operation.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface LogActor {
  id?:   string | null;
  name?: string | null;
  role?: string | null;
}

export interface LogParams {
  entityType:  string;
  entityId?:   string;
  entityName?: string;
  /** Free-form context: { before, after } for edits, { count } for imports, etc. */
  detail?:     Record<string, unknown>;
  ip?:         string;
}

/**
 * Record an activity log entry.
 *
 * @param actor   Session user (or null for system / cron / self-service)
 * @param action  Dot-namespaced action: "member.approved", "loan.checkout", …
 * @param params  Entity info + optional diff/detail
 */
export async function logActivity(
  actor: LogActor | null,
  action: string,
  params: LogParams,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action,
        entityType: params.entityType,
        entityId:   params.entityId   ?? null,
        entityName: params.entityName ?? null,
        actorId:    actor?.id         ?? null,
        actorName:  actor?.name       ?? null,
        actorRole:  actor?.role       ?? null,
        detail:     params.detail as Prisma.InputJsonValue | undefined,
        ip:         params.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[ActivityLog] failed to write log:", err);
  }
}

// ─── Convenience action constants ────────────────────────────────────────────
export const Actions = {
  // Members
  MEMBER_CREATED:       "member.created",
  MEMBER_SELF_REGISTER: "member.self_registered",
  MEMBER_APPROVED:      "member.approved",
  MEMBER_UPDATED:       "member.updated",
  MEMBER_DEACTIVATED:   "member.deactivated",
  MEMBER_DELETED:       "member.deleted",
  MEMBER_PORTAL_SET:    "member.portal_set",
  MEMBER_IMPORTED:      "member.imported",
  MEMBER_RESTRICTED:    "member.restricted",
  MEMBER_RESTRICTION_LIFTED: "member.restriction_lifted",
  MEMBER_INCIDENT_LOGGED: "member.incident_logged",
  MEMBER_INCIDENT_RESOLVED: "member.incident_resolved",
  // Books
  BOOK_CREATED:         "book.created",
  BOOK_UPDATED:         "book.updated",
  BOOK_DELETED:         "book.deleted",
  BOOK_IMPORTED:        "book.imported",
  BOOK_COPY_ADDED:      "book.copy_added",
  BOOK_COPY_UPDATED:    "book.copy_updated",
  BOOK_COPY_DELETED:    "book.copy_deleted",
  // Loans
  LOAN_CHECKOUT:        "loan.checkout",
  LOAN_RETURNED:        "loan.returned",
  LOAN_RENEWED:         "loan.renewed",
  LOAN_LOST:            "loan.lost",
  // Fines
  FINE_PAID:            "fine.paid",
  FINE_WAIVED:          "fine.waived",
  // Reservations
  RESERVATION_CREATED:  "reservation.created",
  RESERVATION_UPDATED:  "reservation.updated",
  RESERVATION_READY:    "reservation.ready",
  RESERVATION_FULFILLED:"reservation.fulfilled",
  RESERVATION_CANCELLED:"reservation.cancelled",
  RESERVATION_EXPIRED:  "reservation.expired",
  RESERVATION_DELETED:  "reservation.deleted",
  // Authentication
  AUTH_LOGIN:           "auth.login",
  AUTH_LOGIN_FAILED:    "auth.login_failed",
  AUTH_LOGOUT:          "auth.logout",
  // Settings
  SETTINGS_UPDATED:     "settings.updated",
  // Users (staff)
  USER_CREATED:         "user.created",
  USER_UPDATED:         "user.updated",
  USER_DELETED:         "user.deleted",
} as const;

/** Pull actor info from a next-auth session object. */
export function actorFromSession(session: {
  user?: { id?: string | null; name?: string | null; role?: string | null } | null
} | null): LogActor {
  return {
    id:   session?.user?.id   ?? null,
    name: session?.user?.name ?? null,
    role: session?.user?.role ?? null,
  };
}
