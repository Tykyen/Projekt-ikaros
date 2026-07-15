import { AdminThemeUsageService } from './admin-theme-usage.service';

/**
 * 20.6 — využití motivů a skinů. Testujeme přes přímé mocky Mongoose modelů
 * (vzor admin-growth.service.spec — žádný mongo-memory). `aggregate().exec()`
 * je chainable; každý model vrací vlastní skupinové řádky / facet.
 */

function aggregateReturning(rows: unknown[]) {
  return jest.fn(() => ({ exec: () => Promise.resolve(rows) }));
}

function makeModels() {
  const userModel = {
    // platformTheme: 10 modre-nebe + 2 mesic explicitně, 38 bez volby (null)
    aggregate: aggregateReturning([
      { _id: 'modre-nebe', n: 10 },
      { _id: 'mesic', n: 2 },
      { _id: null, n: 38 },
    ]),
  };
  const worldModel = {
    // worldTheme: 5 ikaros + 3 fantasy, 1 prázdný string (→ noChoice)
    aggregate: aggregateReturning([
      { _id: 'ikaros', n: 5 },
      { _id: 'fantasy', n: 3 },
      { _id: '', n: 1 },
    ]),
  };
  const membershipModel = {
    // facet → 3 pole jedním scanem
    aggregate: aggregateReturning([
      {
        themeId: [
          { _id: 'fantasy', n: 10 },
          { _id: null, n: 90 },
        ],
        diarySkin: [
          { _id: 'scifi', n: 20 },
          { _id: null, n: 80 },
        ],
        chatSkin: [{ _id: null, n: 100 }],
      },
    ]),
  };
  return { userModel, worldModel, membershipModel };
}

function build(models = makeModels()) {
  const service = new AdminThemeUsageService(
    models.userModel as never,
    models.worldModel as never,
    models.membershipModel as never,
  );
  return { service, models };
}

describe('AdminThemeUsageService', () => {
  it('rozdělí explicitní volby (counts) od děděných defaultů (noChoice)', async () => {
    const { service } = build();
    const res = await service.getThemeUsage();

    // platformTheme: null → noChoice, ostatní → counts; total = součet
    expect(res.platformTheme).toEqual({
      total: 50,
      noChoice: 38,
      counts: { 'modre-nebe': 10, mesic: 2 },
    });
    expect(typeof res.generatedAt).toBe('string');
  });

  it('past: prázdný string se počítá jako noChoice, ne jako motiv ""', async () => {
    const { service } = build();
    const res = await service.getThemeUsage();

    expect(res.worldTheme).toEqual({
      total: 9,
      noChoice: 1, // prázdný string
      counts: { ikaros: 5, fantasy: 3 },
    });
    expect(res.worldTheme.counts['']).toBeUndefined();
  });

  it('membership facet → 3 dimenze (memberTheme / diarySkin / chatSkin)', async () => {
    const { service } = build();
    const res = await service.getThemeUsage();

    expect(res.memberTheme).toEqual({
      total: 100,
      noChoice: 90,
      counts: { fantasy: 10 },
    });
    expect(res.diarySkin).toEqual({
      total: 100,
      noChoice: 80,
      counts: { scifi: 20 },
    });
    // chatSkin: nikdo nevybral vědomě → prázdné counts, vše noChoice
    expect(res.chatSkin).toEqual({ total: 100, noChoice: 100, counts: {} });
  });

  it('robustnost: selhání jedné dimenze nevyhodí zbytek', async () => {
    const models = makeModels();
    models.userModel.aggregate = jest.fn(() => ({
      exec: () => Promise.reject(new Error('users down')),
    }));
    const { service } = build(models);
    const res = await service.getThemeUsage();

    // platformTheme prázdná, ostatní netknuté
    expect(res.platformTheme).toEqual({ total: 0, noChoice: 0, counts: {} });
    expect(res.worldTheme.total).toBe(9);
    expect(res.diarySkin.counts).toEqual({ scifi: 20 });
  });

  it('robustnost: selhání membership facetu → 3 prázdné dimenze', async () => {
    const models = makeModels();
    models.membershipModel.aggregate = jest.fn(() => ({
      exec: () => Promise.reject(new Error('memberships down')),
    }));
    const { service } = build(models);
    const res = await service.getThemeUsage();

    expect(res.memberTheme).toEqual({ total: 0, noChoice: 0, counts: {} });
    expect(res.diarySkin).toEqual({ total: 0, noChoice: 0, counts: {} });
    expect(res.chatSkin).toEqual({ total: 0, noChoice: 0, counts: {} });
    // platformTheme stále OK
    expect(res.platformTheme.total).toBe(50);
  });

  it('cache: druhé volání nepřepočítává (a clearCache vynutí přepočet)', async () => {
    const { service, models } = build();
    await service.getThemeUsage();
    await service.getThemeUsage();
    const callsAfterTwo = (models.userModel.aggregate as jest.Mock).mock.calls
      .length;
    expect(callsAfterTwo).toBe(1); // 2. běh z cache

    service.clearCache();
    await service.getThemeUsage();
    expect((models.userModel.aggregate as jest.Mock).mock.calls.length).toBe(2);
  });
});
