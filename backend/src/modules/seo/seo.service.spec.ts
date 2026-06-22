import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SeoService } from './seo.service';
import { WorldSchemaClass } from '../worlds/schemas/world.schema';
import { IkarosArticleSchemaClass } from '../ikaros-articles/schemas/ikaros-article.schema';
import { IkarosGallerySchemaClass } from '../ikaros-gallery/schemas/ikaros-gallery.schema';

function modelReturning(rows: unknown[]): { find: jest.Mock } {
  return {
    find: jest.fn(() => ({
      lean: () => ({ exec: () => Promise.resolve(rows) }),
    })),
  };
}

describe('SeoService', () => {
  const OLD_ENV = process.env.FRONTEND_URL;
  let service: SeoService;
  let worldModel: { find: jest.Mock };
  let articleModel: { find: jest.Mock };
  let galleryModel: { find: jest.Mock };

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
