import { AdminGrowthService } from './admin-growth.service';
import type { AnalyticsService } from '../analytics/analytics.service';

/**
 * 19.1 — growth funnel + retence. Testujeme přes přímé mocky Mongoose modelů
 * (vzor admin-stats.service.spec — žádný mongo-memory). Modely jsou chainable:
 * `countDocuments().exec()`, `find().distinct()`, `aggregate().exec()`.
 */

/** Aggregate mock, který vrací výstup podle obsahu pipeline. */
function aggregateReturning(pick: (json: string) => unknown[]) {
  return jest.fn((pipeline: unknown) => ({
    exec: () => Promise.resolve(pick(JSON.stringify(pipeline))),
  }));
}

function makeModels() {
  const userModel = {
    // recentIds — 2 nováčci
    find: jest.fn(() => ({
      distinct: jest.fn().mockResolvedValue(['u1', 'u2']),
    })),
    // registered / wau / mau
    countDocuments: jest.fn(() => ({ exec: () => Promise.resolve(50) })),
    // activation (returned) + cohorts (dateToString)
    aggregate: aggregateReturning((json) => {
      if (json.includes('returned')) return [{ total: 40, returned: 30 }];
      if (json.includes('dateToString'))
        return [
          { _id: '2026-05', registered: 12, active: 4 },
          { _id: '2026-06', registered: 8, active: 6 },
        ];
      return [];
    }),
  };
  // membership/character/chat: countDistinct → [{ n }]
  const membershipModel = { aggregate: aggregateReturning(() => [{ n: 20 }]) };
  const characterModel = { aggregate: aggregateReturning(() => [{ n: 15 }]) };
  const chatModel = {
    aggregate: aggregateReturning((json) =>
      json.includes('isDiceRoll') ? [{ n: 7 }] : [{ n: 12 }],
    ),
  };
  return { userModel, membershipModel, characterModel, chatModel };
}

function build(
  overrides: {
    analytics?: Partial<AnalyticsService>;
    models?: ReturnType<typeof makeModels>;
  } = {},
) {
  const m = overrides.models ?? makeModels();
  const analytics = {
    getSummary: jest.fn().mockResolvedValue({
      totals: { visitors: 100, views: 300, anonShare: 0.5 },
    }),
    ...overrides.analytics,
  } as unknown as AnalyticsService;
  const service = new AdminGrowthService(
    m.userModel as never,
    m.membershipModel as never,
    m.characterModel as never,
    m.chatModel as never,
    analytics,
  );
  return { service, models: m, analytics };
}

describe('AdminGrowthService', () => {
  it('sestaví funnel (5 kroků), retenci a akvizici do správného tvaru', async () => {
    const { service } = build();
    const res = await service.getGrowth(30);

    expect(res.funnel.steps.map((s) => s.key)).toEqual([
      'registered',
      'joinedWorld',
      'character',
      'action',
      'dice',
    ]);
    // registered.recent = počet nováčků (2), total = countDocuments (50)
    expect(res.funnel.steps[0]).toEqual({
      key: 'registered',
      total: 50,
      recent: 2,
    });
    expect(res.funnel.steps[4]).toMatchObject({ key: 'dice', total: 7 });

    // retence
    expect(res.retention.activationRate).toBeCloseTo(30 / 40);
    expect(res.retention.wau).toBe(50);
    expect(res.retention.mau).toBe(50);
    expect(res.retention.stickiness).toBeCloseTo(1);
    expect(res.retention.cohorts).toHaveLength(2);
    expect(res.retention.cohorts[0]).toEqual({
      month: '2026-05',
      registered: 12,
      active: 4,
    });

    // akvizice: signups = nováčci (2), visitors = 100 → rate 0.02
    expect(res.acquisition).toEqual({
      visitors: 100,
      signups: 2,
      signupRate: 0.02,
    });
    expect(res.range.days).toBe(30);
  });

  it('past: world chat filtr má worldId $nin [null, ""] (global chat se nepočítá)', async () => {
    const { service, models } = build();
    await service.getGrowth(30);

    const calls = (models.chatModel.aggregate as jest.Mock).mock.calls;
    const everyChatCallFiltersWorld = calls.every(([pipeline]) => {
      const match = (pipeline as { $match?: Record<string, unknown> }[])[0]
        ?.$match;
      return JSON.stringify(match).includes('"$nin":[null,""]');
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(everyChatCallFiltersWorld).toBe(true);
  });

  it('robustnost: když analytics selže, visitors=0 a signupRate=null', async () => {
    const { service } = build({
      analytics: {
        getSummary: jest.fn().mockRejectedValue(new Error('analytics down')),
      },
    });
    const res = await service.getGrowth(30);
    expect(res.acquisition.visitors).toBe(0);
    expect(res.acquisition.signupRate).toBeNull();
    // zbytek dashboardu nedotčený
    expect(res.funnel.steps[0].total).toBe(50);
  });

  it('cache: druhé volání se stejným days nepřepočítává', async () => {
    const { service, models } = build();
    await service.getGrowth(30);
    await service.getGrowth(30);
    // userModel.countDocuments se volá jen v 1. běhu (2. je z cache)
    const countCallsAfterTwo = (models.userModel.countDocuments as jest.Mock)
      .mock.calls.length;
    service.clearCache();
    await service.getGrowth(30);
    expect(
      (models.userModel.countDocuments as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(countCallsAfterTwo);
  });
});
