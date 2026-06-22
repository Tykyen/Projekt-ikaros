import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEventSchemaClass } from './schemas/analytics-event.schema';
import { PageviewDto } from './dto/pageview.dto';

type FacetResult = {
  totals: { views: number; anon: number; visitors: number }[];
  daily: { date: string; views: number; visitors: number }[];
  topPaths: { path: string; views: number }[];
  sources: { category: string; views: number }[];
};

function pv(over: Partial<PageviewDto> = {}): PageviewDto {
  return { path: '/', sessionId: 's1', ...over };
}

const HUMAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

describe('AnalyticsService', () => {
  const OLD_ENV = process.env.FRONTEND_URL;
  let service: AnalyticsService;
  let eventModel: { create: jest.Mock; aggregate: jest.Mock };
  let facet: FacetResult;

  function setupAggregate() {
    eventModel.aggregate.mockReturnValue({
      allowDiskUse: () => ({ exec: () => Promise.resolve([facet]) }),
    });
  }

  beforeEach(async () => {
    process.env.FRONTEND_URL = 'https://www.projekt-ikaros.com';
    facet = { totals: [], daily: [], topPaths: [], sources: [] };
    eventModel = {
      create: jest.fn((doc) => Promise.resolve(doc)),
      aggregate: jest.fn(),
    };
    setupAggregate();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getModelToken(AnalyticsEventSchemaClass.name),
          useValue: eventModel,
        },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  afterAll(() => {
    process.env.FRONTEND_URL = OLD_ENV;
  });

  // ─── record: filtr botů / prerenderu ───────────────────────────────────────

  it('ignoruje bota (UA regex) — neukládá', async () => {
    const ok = await service.record(pv(), 'Googlebot/2.1 (+http://google.com)');
    expect(ok).toBe(false);
    expect(eventModel.create).not.toHaveBeenCalled();
  });

  it('ignoruje prerender sidecar (marker v UA)', async () => {
    const ok = await service.record(pv(), `${HUMAN_UA} Ikaros-Prerender`);
    expect(ok).toBe(false);
    expect(eventModel.create).not.toHaveBeenCalled();
  });

  it('ignoruje request bez user-agent', async () => {
    const ok = await service.record(pv(), undefined);
    expect(ok).toBe(false);
    expect(eventModel.create).not.toHaveBeenCalled();
  });

  it('uloží normální návštěvu člověka', async () => {
    const ok = await service.record(pv({ authed: true }), HUMAN_UA);
    expect(ok).toBe(true);
    expect(eventModel.create).toHaveBeenCalledTimes(1);
    expect(eventModel.create.mock.calls[0][0]).toMatchObject({
      path: '/',
      authed: true,
    });
  });

  it('normalizuje path — ořízne query a hash', async () => {
    await service.record(pv({ path: '/svet/aralon?tab=x#kotva' }), HUMAN_UA);
    expect(eventModel.create.mock.calls[0][0].path).toBe('/svet/aralon');
  });

  // ─── kategorizace referreru ────────────────────────────────────────────────

  it.each([
    ['', 'direct'],
    [undefined, 'direct'],
    ['https://www.google.com/search?q=ikaros', 'search'],
    ['https://www.seznam.cz/', 'search'],
    ['https://www.facebook.com/', 'social'],
    ['https://discord.com/channels/x', 'social'],
    ['https://www.projekt-ikaros.com/ikaros/clanky', 'internal'],
    ['https://nejaky-blog.cz/clanek', 'referral'],
  ])('referrer %s → %s', async (referrer, expected) => {
    await service.record(pv({ referrer: referrer as string }), HUMAN_UA);
    expect(eventModel.create.mock.calls[0][0].referrerCategory).toBe(expected);
  });

  // ─── summary aggregation ───────────────────────────────────────────────────

  it('summary spočítá totals + anonShare', async () => {
    facet.totals = [{ views: 10, anon: 4, visitors: 3 }];
    const s = await service.getSummary(7);
    expect(s.totals).toEqual({ views: 10, visitors: 3, anonShare: 0.4 });
  });

  it('summary: anonShare 0 při nulových views (žádné dělení nulou)', async () => {
    const s = await service.getSummary(7);
    expect(s.totals).toEqual({ views: 0, visitors: 0, anonShare: 0 });
  });

  it('summary doplní chybějící dny nulou (souvislý graf)', async () => {
    facet.daily = [{ date: isoDay(0), views: 5, visitors: 2 }];
    const s = await service.getSummary(7);
    expect(s.daily).toHaveLength(7);
    expect(s.daily.every((d) => typeof d.views === 'number')).toBe(true);
    expect(s.daily.filter((d) => d.views === 5)).toHaveLength(1);
  });

  it('summary propustí topPaths a sources', async () => {
    facet.topPaths = [{ path: '/', views: 7 }];
    facet.sources = [{ category: 'search', views: 7 }];
    const s = await service.getSummary(30);
    expect(s.topPaths).toEqual([{ path: '/', views: 7 }]);
    expect(s.sources).toEqual([{ category: 'search', views: 7 }]);
    expect(s.range.days).toBe(30);
  });

  it('cache: druhý summary(7) nedotazuje DB znovu', async () => {
    await service.getSummary(7);
    await service.getSummary(7);
    expect(eventModel.aggregate).toHaveBeenCalledTimes(1);
  });

  it('uložení nové návštěvy invaliduje summary cache', async () => {
    await service.getSummary(7);
    await service.record(pv(), HUMAN_UA);
    await service.getSummary(7);
    expect(eventModel.aggregate).toHaveBeenCalledTimes(2);
  });
});

/** YYYY-MM-DD pro „dnes mínus n dní" v UTC (sedí na fillDays v service). */
function isoDay(daysAgo: number): string {
  const t = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}
