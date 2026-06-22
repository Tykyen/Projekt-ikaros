import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AnalyticsEventSchemaClass,
  ReferrerCategory,
} from './schemas/analytics-event.schema';
import { PageviewDto } from './dto/pageview.dto';
import { AnalyticsSummary } from './dto/analytics-summary.dto';

/**
 * Boti — kopie nginx mapy z `default.conf.template` (15B.1).
 * ⚠️ DUAL-SOURCE: při změně seznamu sjednoť nginx i tuhle konstantu.
 */
const BOT_UA_RE =
  /(googlebot|bingbot|seznambot|yandex|duckduckbot|baiduspider|applebot|facebookexternalhit|facebot|twitterbot|discordbot|slackbot|linkedinbot|whatsapp|telegrambot|pinterest|redditbot|embedly|crawler|spider|bot\b)/i;

/** Marker, který do UA vkládá prerender sidecar (15B.1) → tahle „návštěva" se nepočítá. */
const PRERENDER_MARKER = 'Ikaros-Prerender';

const SEARCH_RE = /(google|seznam|bing|duckduckgo|yandex|search\.)/i;
const SOCIAL_RE =
  /(facebook|fb\.com|twitter|x\.com|t\.co|instagram|discord|reddit|linkedin|youtube|tiktok)/i;

const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — dashboard nemlátí DB aggregation
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  private summaryCache = new Map<
    number,
    { data: AnalyticsSummary; at: number }
  >();

  constructor(
    @InjectModel(AnalyticsEventSchemaClass.name)
    private readonly eventModel: Model<AnalyticsEventSchemaClass>,
  ) {}

  /**
   * Zapíše page-view. Boty a prerender sidecar tiše ignoruje (return false).
   * Nikdy nevyhodí — ping nesmí rozbít stránku návštěvníka.
   */
  async record(
    dto: PageviewDto,
    userAgent: string | undefined,
  ): Promise<boolean> {
    if (this.isExcluded(userAgent)) return false;
    try {
      await this.eventModel.create({
        path: this.normalizePath(dto.path),
        referrerCategory: this.categorizeReferrer(dto.referrer),
        sessionId: dto.sessionId,
        authed: dto.authed === true,
        createdAt: new Date(),
      });
      this.summaryCache.clear(); // čerstvý event → zneplatni cache
      return true;
    } catch {
      return false;
    }
  }

  /** true = bot nebo prerender sidecar → nezapočítávat. */
  private isExcluded(ua: string | undefined): boolean {
    if (!ua) return true; // bez UA = podezřelé (skript/scanner)
    if (ua.includes(PRERENDER_MARKER)) return true;
    return BOT_UA_RE.test(ua);
  }

  private normalizePath(raw: string): string {
    const noQuery = raw.split(/[?#]/)[0] || '/';
    return noQuery.slice(0, 200);
  }

  private categorizeReferrer(referrer: string | undefined): ReferrerCategory {
    if (!referrer || !referrer.trim()) return 'direct';
    let host: string;
    try {
      host = new URL(referrer).host.toLowerCase();
    } catch {
      return 'direct';
    }
    const ownHost = this.ownHost();
    if (ownHost && (host === ownHost || host.endsWith('.' + ownHost))) {
      return 'internal';
    }
    if (SEARCH_RE.test(host)) return 'search';
    if (SOCIAL_RE.test(host)) return 'social';
    return 'referral';
  }

  private ownHost(): string | null {
    const raw = process.env.FRONTEND_URL;
    if (!raw) return null;
    try {
      return new URL(raw).host.toLowerCase();
    } catch {
      return null;
    }
  }

  async getSummary(days: number): Promise<AnalyticsSummary> {
    const cached = this.summaryCache.get(days);
    if (cached && Date.now() - cached.at < SUMMARY_CACHE_TTL_MS) {
      return cached.data;
    }
    const data = await this.buildSummary(days);
    this.summaryCache.set(days, { data, at: Date.now() });
    return data;
  }

  /** Invalidace cache (testy). */
  clearCache(): void {
    this.summaryCache.clear();
  }

  private async buildSummary(days: number): Promise<AnalyticsSummary> {
    // Pracujeme v UTC (CZ posun pár hodin — pro agregát návštěvnosti zanedbatelný).
    const to = new Date();
    const todayUtc = Date.UTC(
      to.getUTCFullYear(),
      to.getUTCMonth(),
      to.getUTCDate(),
    );
    const from = new Date(todayUtc - (days - 1) * MS_PER_DAY);

    const [facet] = await this.eventModel
      .aggregate<{
        totals: { views: number; anon: number; visitors: number }[];
        daily: { date: string; views: number; visitors: number }[];
        topPaths: { path: string; views: number }[];
        sources: { category: ReferrerCategory; views: number }[];
      }>([
        { $match: { createdAt: { $gte: from } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  views: { $sum: 1 },
                  anon: {
                    $sum: { $cond: [{ $eq: ['$authed', false] }, 1, 0] },
                  },
                  sessions: { $addToSet: '$sessionId' },
                },
              },
              {
                $project: {
                  _id: 0,
                  views: 1,
                  anon: 1,
                  visitors: { $size: '$sessions' },
                },
              },
            ],
            daily: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                  },
                  views: { $sum: 1 },
                  sessions: { $addToSet: '$sessionId' },
                },
              },
              {
                $project: {
                  _id: 0,
                  date: '$_id',
                  views: 1,
                  visitors: { $size: '$sessions' },
                },
              },
            ],
            topPaths: [
              { $group: { _id: '$path', views: { $sum: 1 } } },
              { $sort: { views: -1 } },
              { $limit: 10 },
              { $project: { _id: 0, path: '$_id', views: 1 } },
            ],
            sources: [
              { $group: { _id: '$referrerCategory', views: { $sum: 1 } } },
              { $sort: { views: -1 } },
              { $project: { _id: 0, category: '$_id', views: 1 } },
            ],
          },
        },
      ])
      .allowDiskUse(true)
      .exec();

    const t = facet?.totals?.[0] ?? { views: 0, anon: 0, visitors: 0 };
    const dailyMap = new Map((facet?.daily ?? []).map((d) => [d.date, d]));

    return {
      range: {
        days,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        views: t.views,
        visitors: t.visitors,
        anonShare: t.views > 0 ? t.anon / t.views : 0,
      },
      daily: this.fillDays(from, days, dailyMap),
      topPaths: facet?.topPaths ?? [],
      sources: facet?.sources ?? [],
      generatedAt: to.toISOString(),
    };
  }

  /** Doplní chybějící dny nulou → souvislý graf bez děr. */
  private fillDays(
    from: Date,
    days: number,
    have: Map<string, { date: string; views: number; visitors: number }>,
  ): { date: string; views: number; visitors: number }[] {
    const out: { date: string; views: number; visitors: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * MS_PER_DAY);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      out.push(have.get(key) ?? { date: key, views: 0, visitors: 0 });
    }
    return out;
  }
}
