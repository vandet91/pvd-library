/**
 * Role-Based Access Control helpers.
 *
 * Hierarchy (lowest → highest):
 *   MEMBER < STAFF < LIBRARIAN < ADMIN
 *
 * Usage in API routes:
 *   if (!session || !can(session.user?.role, "STAFF"))
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */

export type AppRole = "ADMIN" | "LIBRARIAN" | "STAFF" | "MEMBER";

const LEVEL: Record<string, number> = {
  MEMBER:    0,
  STAFF:     1,
  LIBRARIAN: 2,
  ADMIN:     3,
};

/** Returns true if `userRole` meets the minimum required role. */
export function can(userRole: string | null | undefined, minRole: AppRole): boolean {
  return (LEVEL[userRole ?? ""] ?? -1) >= (LEVEL[minRole] ?? 99);
}
