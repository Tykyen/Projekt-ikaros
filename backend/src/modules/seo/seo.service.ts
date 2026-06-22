import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorldSchemaClass } from '../worlds/schemas/world.schema';
import { IkarosArticleSchemaClass } from '../ikaros-articles/schemas/ikaros-article.schema';
import { IkarosGallerySchemaClass } from '../ikaros-gallery/schemas/ikaros-gallery.schema';

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

/** Statické veřejné routy (15B.1 whitelist). */
const STATIC_ROUTES: ReadonlyArray<{
  path: string;
  changefreq: string;
  priority: string;
}> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/ikaros/vesmiry', changefreq: 'daily', priority: '0.8' },
  { path: '/ikaros/clanky', changefreq: 'daily', priority: '0.7' },
  { path: '/ikaros/galerie', changefreq: 'daily', priority: '0.7' },
  { path: '/ikaros/novinky', changefreq: 'weekly', priority: '0.6' },
  { path: '/ikaros/napoveda', changefreq: 'monthly', priority: '0.5' },
  { path: '/podminky', changefreq: 'yearly', priority: '0.3' },
];

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h — crawler nesmí tlouct DB každým dotazem

/**
 * 15B.2 — generátor `sitemap.xml`. Leak-safe: zařazuje JEN veřejné entity
 * (public/open světy, Published články/galerie) — stejné filtry jako veřejné
 * přehledy. Privátní obsah se do mapy nikdy nedostane.
 */
@Injectable()
export class SeoService {
  private cache: { xml: string; at: number } | null = null;

  constructor(
    @InjectModel(WorldSchemaClass.name)
    private readonly worldModel: Model<WorldSchemaClass>,
    @InjectModel(IkarosArticleSchemaClass.name)
    private readonly articleModel: Model<IkarosArticleSchemaClass>,
    @InjectModel(IkarosGallerySchemaClass.name)
    private readonly galleryModel: Model<IkarosGallerySchemaClass>,
  ) {}

  async getSitemapXml(): Promise<string> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.xml;
    }
    const xml = await this.buildSitemap();
    this.cache = { xml, at: Date.now() };
    return xml;
  }

  /** Invalidace cache (testy / případný admin hook po publikaci). */
  clearCache(): void {
    this.cache = null;
  }

  private baseUrl(): string {
    const raw = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    return raw.replace(/\/+$/, '');
  }

  private async buildSitemap(): Promise<string> {
    const base = this.baseUrl();
    const entries: SitemapEntry[] = STATIC_ROUTES.map((r) => ({
      loc: base + r.path,
      changefreq: r.changefreq,
      priority: r.priority,
    }));

    // Veřejné světy (public/open, aktivní).
    const worlds = await this.worldModel
      .find(
        { isActive: true, accessMode: { $in: ['public', 'open'] } },
        { slug: 1, updatedAt: 1 },
      )
      .lean<{ slug?: string; updatedAt?: Date }[]>()
      .exec();
    for (const w of worlds) {
      if (!w.slug) continue;
      entries.push({
        loc: `${base}/svet/${encodeURIComponent(w.slug)}`,
        lastmod: toIso(w.updatedAt),
        changefreq: 'weekly',
        priority: '0.6',
      });
    }

    // Published články (URL = _id, FE routa /ikaros/clanky/:id).
    const articles = await this.articleModel
      .find({ status: 'Published' }, { updatedAtUtc: 1 })
      .lean<{ _id: Types.ObjectId; updatedAtUtc?: Date }[]>()
      .exec();
    for (const a of articles) {
      entries.push({
        loc: `${base}/ikaros/clanky/${String(a._id)}`,
        lastmod: toIso(a.updatedAtUtc),
        changefreq: 'monthly',
        priority: '0.5',
      });
    }

    // Published galerie.
    const galleries = await this.galleryModel
      .find({ status: 'Published' }, { updatedAtUtc: 1 })
      .lean<{ _id: Types.ObjectId; updatedAtUtc?: Date }[]>()
      .exec();
    for (const g of galleries) {
      entries.push({
        loc: `${base}/ikaros/galerie/${String(g._id)}`,
        lastmod: toIso(g.updatedAtUtc),
        changefreq: 'monthly',
        priority: '0.4',
      });
    }

    return renderXml(entries);
  }
}

function toIso(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const XML_ESCAPE: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => XML_ESCAPE[c]);
}

function renderXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const lines = [`    <loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) lines.push(`    <lastmod>${e.lastmod}</lastmod>`);
      lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
      lines.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
