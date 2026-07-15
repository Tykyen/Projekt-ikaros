import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SeoService } from './seo.service';
import { WorldSchemaClass } from '../worlds/schemas/world.schema';
import { IkarosArticleSchemaClass } from '../ikaros-articles/schemas/ikaros-article.schema';
import { IkarosGallerySchemaClass } from '../ikaros-gallery/schemas/ikaros-gallery.schema';
// 22.4 vitrína — wiki stránky vitrínových světů v sitemapě.
import { PageSchemaClass } from '../pages/schemas/page.schema';

// Chain podporuje `.find().lean().exec()` i `.find().limit().lean().exec()`
// (22.4 — stránky se čtou se stropem per svět).
function modelReturning(rows: unknown[]): { find: jest.Mock } {
  return {
    find: jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve(rows) }),
      limit: () => ({
        lean: () => ({ exec: () => Promise.resolve(rows) }),
      }),
    })),
  };
}

describe('SeoService', () => {
  const OLD_ENV = process.env.FRONTEND_URL;
  let service: SeoService;
  let worldModel: { find: jest.Mock };
  let articleModel: { find: jest.Mock };
  let galleryModel: { find: jest.Mock };
  let pageModel: { find: jest.Mock };

  beforeEach(async () => {
    process.env.FRONTEND_URL = 'https://www.projekt-ikaros.com';
    worldModel = modelReturning([
      { slug: 'aralon', updatedAt: new Date('2026-06-01T00:00:00Z') },
    ]);
    articleModel = modelReturning([
      { _id: 'a1', updatedAtUtc: new Date('2026-06-02T00:00:00Z') },
    ]);
    galleryModel = modelReturning([
      { _id: 'g1', updatedAtUtc: new Date('2026-06-03T00:00:00Z') },
    ]);
    pageModel = modelReturning([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SeoService,
        { provide: getModelToken(WorldSchemaClass.name), useValue: worldModel },
        {
          provide: getModelToken(IkarosArticleSchemaClass.name),
          useValue: articleModel,
        },
        {
          provide: getModelToken(IkarosGallerySchemaClass.name),
          useValue: galleryModel,
        },
        { provide: getModelToken(PageSchemaClass.name), useValue: pageModel },
      ],
    }).compile();
    service = moduleRef.get(SeoService);
  });

  afterAll(() => {
    process.env.FRONTEND_URL = OLD_ENV;
  });

  it('vrátí validní XML se statickými routami a base URL z FRONTEND_URL', async () => {
    const xml = await service.getSitemapXml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<loc>https://www.projekt-ikaros.com/</loc>');
    expect(xml).toContain(
      '<loc>https://www.projekt-ikaros.com/ikaros/vesmiry</loc>',
    );
  });

  it('zařadí veřejné světy / Published články / galerie + lastmod', async () => {
    const xml = await service.getSitemapXml();
    expect(xml).toContain('/svet/aralon</loc>');
    expect(xml).toContain('/ikaros/clanky/a1</loc>');
    expect(xml).toContain('/ikaros/galerie/g1</loc>');
    expect(xml).toContain('<lastmod>2026-06-01T00:00:00.000Z</lastmod>');
  });

  it('leak-safe filtry: svět public/open+active, články/galerie jen Published', async () => {
    await service.getSitemapXml();
    expect(worldModel.find).toHaveBeenCalledWith(
      { isActive: true, accessMode: { $in: ['public', 'open'] } },
      expect.anything(),
    );
    expect(articleModel.find).toHaveBeenCalledWith(
      { status: 'Published' },
      expect.anything(),
    );
    expect(galleryModel.find).toHaveBeenCalledWith(
      { status: 'Published' },
      expect.anything(),
    );
  });

  it('cache: druhý dotaz nedotazuje DB znovu', async () => {
    await service.getSitemapXml();
    await service.getSitemapXml();
    expect(worldModel.find).toHaveBeenCalledTimes(1);
  });

  it('clearCache vynutí nový build', async () => {
    await service.getSitemapXml();
    service.clearCache();
    await service.getSitemapXml();
    expect(worldModel.find).toHaveBeenCalledTimes(2);
  });

  it('22.4 vitrína: sekce + wiki stránky JEN pro publicShowcase svět', async () => {
    service.clearCache();
    worldModel.find.mockReturnValueOnce({
      lean: () => ({
        exec: () =>
          Promise.resolve([
            {
              _id: 'w1',
              slug: 'vitrina',
              updatedAt: new Date(),
              publicShowcase: true,
            },
            { _id: 'w2', slug: 'bez-vitriny', updatedAt: new Date() },
          ]),
      }),
    });
    pageModel.find.mockReturnValueOnce({
      limit: () => ({
        lean: () => ({
          exec: () =>
            Promise.resolve([
              { slug: 'hrdinove', updatedAt: new Date() },
              // rezervovaný slug = už je v sekcích, nesmí se zdvojit
              { slug: 'pravidla', updatedAt: new Date() },
            ]),
        }),
      }),
    });
    const xml = await service.getSitemapXml();
    expect(xml).toContain('/svet/vitrina/stranky</loc>');
    expect(xml).toContain('/svet/vitrina/bestiar</loc>');
    expect(xml).toContain('/svet/vitrina/hrdinove</loc>');
    expect(xml).not.toContain('/svet/bez-vitriny/stranky');
    // `pravidla` jen jednou (sekce), ne podruhé jako wiki stránka.
    expect(xml.match(/\/svet\/vitrina\/pravidla<\/loc>/g)).toHaveLength(1);
    // Leak-safe: čtou se jen stránky bez moderationHidden (+ bez accessRequirements).
    expect(pageModel.find).toHaveBeenCalledTimes(1);
    expect(pageModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        worldId: 'w1',
        moderationHidden: { $ne: true },
      }),
      expect.anything(),
    );
  });

  it('slug se URL-enkóduje (žádný rozbitý XML)', async () => {
    service.clearCache();
    worldModel.find.mockReturnValueOnce({
      lean: () => ({
        exec: () => Promise.resolve([{ slug: 'a&b', updatedAt: new Date() }]),
      }),
    });
    const xml = await service.getSitemapXml();
    expect(xml).toContain('/svet/a%26b</loc>');
  });
});
