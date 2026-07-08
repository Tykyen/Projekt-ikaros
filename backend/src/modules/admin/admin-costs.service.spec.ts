import { ConfigService } from '@nestjs/config';

// Cloudinary SDK je globální singleton — mockneme celý modul.
jest.mock('cloudinary', () => ({
  v2: { config: jest.fn(), api: { usage: jest.fn() } },
}));
import { v2 as cloudinary } from 'cloudinary';
import { AdminCostsService } from './admin-costs.service';

type ModelOpts = { count?: number; agg?: unknown[]; find?: unknown[] };
function model({ count = 0, agg = [], find = [] }: ModelOpts = {}) {
  return {
    countDocuments: jest.fn(() => ({ exec: () => Promise.resolve(count) })),
    aggregate: jest.fn(() => ({ exec: () => Promise.resolve(agg) })),
    find: jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve(find) }),
    })),
  };
}

function build(opts: {
  url?: string | undefined;
  usage?: () => Promise<unknown>;
  models?: Record<string, ReturnType<typeof model>>;
}) {
  const m = opts.models ?? {};
  const gallery = m.gallery ?? model({ count: 5 });
  const worldMap =
    m.worldMap ?? model({ count: 3, agg: [{ _id: 'w1', count: 3 }] });
  const scene = m.scene ?? model({ count: 2, agg: [{ _id: 'w1', count: 2 }] });
  const emote = m.emote ?? model({ count: 4 });
  const page = m.page ?? model({ count: 6, agg: [{ _id: 'w2', count: 6 }] });
  const bestie = m.bestie ?? model({ count: 1, agg: [] });
  const world =
    m.world ??
    model({
      count: 2,
      find: [
        { _id: 'w1', name: 'Aralon' },
        { _id: 'w2', name: 'Nix' },
      ],
    });
  const chat = m.chat ?? model({ agg: [{ bytes: 123456 }] });
  const doc = m.doc ?? model({ agg: [{ bytes: 7890 }] });

  const config = {
    get: jest.fn(() => opts.url),
  } as unknown as ConfigService;

  (cloudinary.api.usage as jest.Mock).mockImplementation(
    opts.usage ?? (() => Promise.reject(new Error('no usage'))),
  );

  const service = new AdminCostsService(
    gallery as never,
    worldMap as never,
    scene as never,
    emote as never,
    page as never,
    bestie as never,
    world as never,
    chat as never,
    doc as never,
    config,
  );
  return {
    service,
    models: { gallery, worldMap, scene, page, world, chat, doc },
  };
}

beforeEach(() => jest.clearAllMocks());

describe('AdminCostsService', () => {
  it('sestaví počty per typ (filtruje nuly), byty a top světy', async () => {
    const { service } = build({ url: undefined });
    const res = await service.getCosts();

    // byType: 7 typů, ale bestie má count 1 → zůstane; žádná nula tu není
    const types = Object.fromEntries(
      res.blobs.byType.map((b) => [b.type, b.count]),
    );
    expect(types.gallery).toBe(5);
    expect(types.pages).toBe(6);
    expect(res.blobs.total).toBe(5 + 3 + 2 + 4 + 6 + 1 + 2);

    // topWorlds: w1 = 3+2 = 5, w2 = 6 → seřazeno w2, w1
    expect(res.blobs.topWorlds[0]).toEqual({
      worldId: 'w2',
      worldName: 'Nix',
      count: 6,
    });
    expect(res.blobs.topWorlds[1]).toEqual({
      worldId: 'w1',
      worldName: 'Aralon',
      count: 5,
    });

    // měřené byty
    expect(res.measuredBytes.chatAttachments).toBe(123456);
    expect(res.measuredBytes.adminDocuments).toBe(7890);
    // AI placeholder
    expect(res.ai).toEqual({ available: false });
  });

  it('Cloudinary bez creds → available:false (vrstva C skrytá)', async () => {
    const { service } = build({ url: undefined });
    const res = await service.getCosts();
    expect(res.cloudinary).toEqual({ available: false });
    expect(cloudinary.config).not.toHaveBeenCalled();
  });

  it('Cloudinary usage OK → available:true s mapovanými poli', async () => {
    const { service } = build({
      url: 'cloudinary://key:secret@democloud',
      usage: () =>
        Promise.resolve({
          plan: 'Free',
          storage: { usage: 1000 },
          bandwidth: { usage: 2000 },
          transformations: { usage: 50 },
          credits: { usage: 0.5, limit: 25 },
        }),
    });
    const res = await service.getCosts();
    expect(res.cloudinary).toEqual({
      available: true,
      storageBytes: 1000,
      bandwidthBytes: 2000,
      transformations: 50,
      credits: { used: 0.5, limit: 25 },
      plan: 'Free',
    });
    expect(cloudinary.config).toHaveBeenCalled();
  });

  it('Cloudinary usage vyhodí → available:false, endpoint nespadne', async () => {
    const { service } = build({
      url: 'cloudinary://key:secret@democloud',
      usage: () => Promise.reject(new Error('rate limit')),
    });
    const res = await service.getCosts();
    expect(res.cloudinary).toEqual({ available: false });
    // zbytek dat je pořád tam
    expect(res.blobs.total).toBeGreaterThan(0);
  });

  it('cache: druhé volání nepřepočítává', async () => {
    const { service, models } = build({ url: undefined });
    await service.getCosts();
    await service.getCosts();
    const callsAfterTwo = models.gallery.countDocuments.mock.calls.length;
    service.clearCache();
    await service.getCosts();
    expect(models.gallery.countDocuments.mock.calls.length).toBeGreaterThan(
      callsAfterTwo,
    );
  });
});
