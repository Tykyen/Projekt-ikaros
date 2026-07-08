/**
 * 19.1 — onboarding funnel + retenční ukazatele pro admin dashboard.
 * Vše odvozené z DB timestampů (žádný nový tracking) — spec 19.1.
 * FE zrcadlo: `src/features/admin/api/growth.types.ts`.
 */

export type FunnelStepKey =
  | 'registered'
  | 'joinedWorld'
  | 'character'
  | 'action'
  | 'dice';

export interface GrowthFunnelStep {
  key: FunnelStepKey;
  /** distinct uživatelé, kteří milníku dosáhli (all-time). */
  total: number;
  /** z nich registrovaní v okně `days` (kohorta nováčků). */
  recent: number;
}

export interface GrowthCohort {
  /** měsíc registrace `YYYY-MM`. */
  month: string;
  registered: number;
  /** z kohorty aktivních k dnešku (lastSeenAt ≤ 30 d). */
  active: number;
}

export interface GrowthStats {
  range: { days: number; generatedAt: string };
  funnel: {
    steps: GrowthFunnelStep[];
  };
  retention: {
    activationRate: number; // 0..1 — vrátili se po registraci (> 24 h)
    stickiness: number; // 0..1 — WAU/MAU
    wau: number;
    mau: number;
    cohorts: GrowthCohort[];
  };
  acquisition: {
    visitors: number; // z 15B.7 analytics summary (days)
    signups: number; // registrace v okně
    signupRate: number | null; // signups/visitors, null když visitors=0
  };
}
