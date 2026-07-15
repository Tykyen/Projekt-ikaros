import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { logWarn } from '../../common/logging/log-error.util';
import { UserSchemaClass } from '../users/schemas/user.schema';
import { WorldSchemaClass } from '../worlds/schemas/world.schema';
import { WorldMembershipSchemaClass } from '../worlds/schemas/world-membership.schema';
import type { ThemeUsageStats, DimensionUsage } from './dto/theme-usage.dto';

const CACHE_TTL_MS = 15 * 60 * 1000; // snapshot; agregace levná, ale zbytečně neběhat

/** Řádek z `$group` per hodnotu pole. */
interface GroupRow {
  _id: string | null;
  n: number;
}

const EMPTY_DIMENSION: DimensionUsage = { total: 0, noChoice: 0, counts: {} };

/**
 * Skupinové řádky → `DimensionUsage`. `null`/`''` (= bez volby, dědí default)
 * jde do `noChoice`, ostatní hodnoty do `counts`. Klíče counts = syrová ID z DB
 * (i legacy/neznámá — klasifikaci a názvy řeší FE přes theme registry).
 */
function toDimension(rows: GroupRow[]): DimensionUsage {
  let total = 0;
  let noChoice = 0;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    total += r.n;
    if (r._id == null || r._id === '') noChoice += r.n;
    else counts[r._id] = (counts[r._id] ?? 0) + r.n;
  }
  return { total, noChoice, counts };
}

/**
 * 20.6 — využití motivů a skinů (admin přehled, podklad pro osekání).
 *
 * 5 dimenzí, vše čistá agregace stavu DB (žádný nový tracking):
 *  1. platformTheme — `User.themeId`
 *  2. worldTheme    — `World.themeId`
 *  3. memberTheme   — `WorldMembership.themeId` (5.9b override)
 *  4. diarySkin     — `WorldMembership.diarySkin` (16.2c)
 *  5. chatSkin      — `WorldMembership.chatSkin` (16.1d)
 *
 * BE je „hloupé": vrací syrové počty per hodnota + `noChoice` (bez volby).
 * `null` NENÍ „nevyužité" — dědí default (spec 20.6 §4); rozlišení řeší FE.
 *
 * Robustnost: dílčí dimenze přes `safe()` (chyba → prázdná dimenze + warning),
 * jeden rozbitý dotaz neshodí celý přehled. Cache 15 min (single-slot, bez param).
 */
@Injectable()
export class AdminThemeUsageService {
  private readonly logger = new Logger(AdminThemeUsageService.name);
  private cache: { data: ThemeUsageStats; at: number } | null = null;

  constructor(
    @InjectModel(UserSchemaClass.name)
    private readonly userModel: Model<UserSchemaClass>,
    @InjectModel(WorldSchemaClass.name)
    private readonly worldModel: Model<WorldSchemaClass>,
    @InjectModel(WorldMembershipSchemaClass.name)
    private readonly membershipModel: Model<WorldMembershipSchemaClass>,
  ) {}

  async getThemeUsage(): Promise<ThemeUsageStats> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS)
      return this.cache.data;
    const data = await this.build(now);
    this.cache = { data, at: now };
    return data;
  }

  /** Invalidace cache (testy). */
  clearCache(): void {
    this.cache = null;
  }

  private async build(now: number): Promise<ThemeUsageStats> {
    const [platformTheme, worldTheme, membership] = await Promise.all([
      // Aktivní účty (soft-delete pryč — konzistentní s growth funnelem).
      this.groupField('platformTheme', this.userModel, 'themeId', {
        isDeleted: { $ne: true },
      }),
      // Světy mimo 30denní soft-delete okno (`deletedAt` == null).
      this.groupField('worldTheme', this.worldModel, 'themeId', {
        deletedAt: null,
      }),
      // 3 membership pole jedním scanem přes `$facet`.
      this.membershipFacet(),
    ]);

    return {
      generatedAt: new Date(now).toISOString(),
      platformTheme,
      worldTheme,
      memberTheme: membership.memberTheme,
      diarySkin: membership.diarySkin,
      chatSkin: membership.chatSkin,
    };
  }

  /** `$group` per hodnota jednoho pole → `DimensionUsage`. */
  private async groupField(
    metric: string,
    model: Model<unknown>,
    field: string,
    match: Record<string, unknown>,
  ): Promise<DimensionUsage> {
    return this.safe(metric, async () => {
      const rows = await model
        .aggregate<GroupRow>([
          { $match: match },
          { $group: { _id: `$${field}`, n: { $sum: 1 } } },
        ])
        .exec();
      return toDimension(rows);
    });
  }

  /**
   * 3 membership dimenze (themeId / diarySkin / chatSkin) jedním průchodem
   * přes `$facet`. Selhání → všechny tři prázdné (celý facet v jednom `safe`).
   */
  private async membershipFacet(): Promise<{
    memberTheme: DimensionUsage;
    diarySkin: DimensionUsage;
    chatSkin: DimensionUsage;
  }> {
    const groupBy = (field: string) => [
      { $group: { _id: `$${field}`, n: { $sum: 1 } } },
    ];
    const empty = {
      memberTheme: EMPTY_DIMENSION,
      diarySkin: EMPTY_DIMENSION,
      chatSkin: EMPTY_DIMENSION,
    };
    try {
      const [row] = await this.membershipModel
        .aggregate<{
          themeId: GroupRow[];
          diarySkin: GroupRow[];
          chatSkin: GroupRow[];
        }>([
          {
            $facet: {
              themeId: groupBy('themeId'),
              diarySkin: groupBy('diarySkin'),
              chatSkin: groupBy('chatSkin'),
            },
          },
        ])
        .exec();
      return {
        memberTheme: toDimension(row?.themeId ?? []),
        diarySkin: toDimension(row?.diarySkin ?? []),
        chatSkin: toDimension(row?.chatSkin ?? []),
      };
    } catch (err) {
      logWarn(
        this.logger,
        'Theme usage membership facet selhal, vracím 0',
        err,
      );
      return empty;
    }
  }

  private async safe(
    metric: string,
    fn: () => Promise<DimensionUsage>,
  ): Promise<DimensionUsage> {
    try {
      return await fn();
    } catch (err) {
      logWarn(
        this.logger,
        `Theme usage "${metric}" selhala, vracím prázdnou dimenzi`,
        err,
      );
      return EMPTY_DIMENSION;
    }
  }
}
