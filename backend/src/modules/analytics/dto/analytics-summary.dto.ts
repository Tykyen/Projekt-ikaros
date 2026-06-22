import type { ReferrerCategory } from '../schemas/analytics-event.schema';

/** 15B.7 — agregovaná návštěvnost pro admin dashboard (Přehled). */
export interface AnalyticsSummary {
  range: { days: number; from: string; to: string };
  totals: {
    views: number; // page views za období
    visitors: number; // distinct sessionId
    anonShare: number; // 0..1 podíl anonymních page views (authed=false)
  };
  daily: { date: string; views: number; visitors: number }[]; // vzestupně, 1 bod/den
  topPaths: { path: string; views: number }[]; // top 10
  sources: { category: ReferrerCategory; views: number }[];
  generatedAt: string;
}
