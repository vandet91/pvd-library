import { prisma } from "@/lib/prisma";

export interface ResolvedRule {
  loanDays: number;
  maxLoans: number;
  maxRenewals: number;
  renewalDays: number;
  finePerDay: number;
  allowHomeLoan: boolean;
  /** true when an explicit CirculationRule matched; false = global defaults used */
  isDefault: boolean;
  ruleName?: string;
}

interface GlobalDefaults {
  DEFAULT_LOAN_DAYS: number;
  MAX_LOANS_PER_MEMBER: number;
  MAX_RENEWALS: number;
  FINE_PER_DAY: number;
}

async function getGlobalDefaults(): Promise<GlobalDefaults> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: ["DEFAULT_LOAN_DAYS", "MAX_LOANS_PER_MEMBER", "MAX_RENEWALS", "FINE_PER_DAY"] } },
  });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    DEFAULT_LOAN_DAYS:    Number(m.DEFAULT_LOAN_DAYS    ?? "14"),
    MAX_LOANS_PER_MEMBER: Number(m.MAX_LOANS_PER_MEMBER ?? "3"),
    MAX_RENEWALS:         Number(m.MAX_RENEWALS         ?? "2"),
    FINE_PER_DAY:         Number(m.FINE_PER_DAY         ?? "0.50"),
  };
}

/**
 * Resolve the most specific active CirculationRule for a given
 * memberType × materialType × branchId combination.
 *
 * Specificity order (highest wins):
 *   1. memberType + materialType + branchId
 *   2. memberType + materialType
 *   3. memberType + branchId
 *   4. materialType + branchId
 *   5. memberType only
 *   6. materialType only
 *   7. branchId only
 *   8. Global defaults from Settings
 */
export async function resolveCirculationRule(opts: {
  memberType?: string | null;
  materialType?: string | null;
  branchId?: string | null;
}): Promise<ResolvedRule> {
  const { memberType, materialType, branchId } = opts;

  // Fetch all active rules then filter + score in JS.
  // A rule matches if every non-null criterion on the rule matches the request.
  // (A null criterion on the rule means "applies to all".)
  const allRules = await prisma.circulationRule.findMany({
    where: { isActive: true },
  });

  function score(r: typeof allRules[number]): number {
    return (r.memberType   ? 4 : 0)
         + (r.materialType ? 2 : 0)
         + (r.branchId     ? 1 : 0);
  }

  const best = allRules
    .filter((r) => {
      if (r.memberType   && r.memberType   !== memberType)   return false;
      if (r.materialType && r.materialType !== materialType) return false;
      if (r.branchId     && r.branchId     !== branchId)     return false;
      return true;
    })
    .sort((a, b) => score(b) - score(a))[0];

  if (best) {
    return {
      loanDays:      best.loanDays,
      maxLoans:      best.maxLoans,
      maxRenewals:   best.maxRenewals,
      renewalDays:   best.renewalDays,
      finePerDay:    best.finePerDay,
      allowHomeLoan: best.allowHomeLoan,
      isDefault:     false,
      ruleName:      best.name,
    };
  }

  const g = await getGlobalDefaults();
  return {
    loanDays:      g.DEFAULT_LOAN_DAYS,
    maxLoans:      g.MAX_LOANS_PER_MEMBER,
    maxRenewals:   g.MAX_RENEWALS,
    renewalDays:   g.DEFAULT_LOAN_DAYS,
    finePerDay:    g.FINE_PER_DAY,
    allowHomeLoan: true,
    isDefault:     true,
  };
}
