import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { logWarn } from '../../common/logging/log-error.util';
import { DAY_MS } from '../../common/constants/time.constants';
import { UserSchemaClass } from '../users/schemas/user.schema';
import { WorldMembershipSchemaClass } from '../worlds/schemas/world-membership.schema';
import { CharacterSchemaClass } from '../characters/schemas/character.schema';
import { ChatMessageSchemaClass } from '../chat/schemas/chat-message.schema';
import { AnalyticsService } from '../analytics/analytics.service';
import type {
  GrowthStats,
  GrowthCohort,
  FunnelStepKey,
} from './dto/growth-stats.dto';

const CACHE_TTL_MS = 15 * 60 * 1000; // agregace přes chatmessages je dražší → 15 min
const COHORT_MONTHS = 6;
const ACTIVATION_GAP_MS = DAY_MS; // vrátil se, když lastSeenAt - createdAt > 24 h

/**
 * 19.1 — onboarding funnel + retence odvozené z DB (žádný nový tracking).
 *
 * ⚠️ Limity (spec 19.1 §1): pravá week-over-week kohortní retence NEJDE — v DB je
 * jen přepisovaný `lastSeenAt` bez historie. Proto retence = snapshot k dnešku
 * (aktivace / stickiness / survival kohorty). Global chat (`worldId:null`) má TTL
 * 1 h → do funnelu se nepočítá, jen world chat (`worldId` set).
 *
 * Robustnost: dílčí bloky přes `safe()` (chyba → prázdná/0 hodnota + warning),
 * jeden rozbitý dotaz neshodí dashboard. Cache 15 min per `days`.
 */
@Injectable()
export class AdminGrowthService {
  private readonly logger = new Logger(AdminGrowthService.name);
  private cache = new Map<number, { data: GrowthStats; at: number }>();

  constructor(
    @InjectModel(UserSchemaClass.name)
    private readonly userModel: Model<UserSchemaClass>,
    @InjectModel(WorldMembershipSchemaClass.name)
    private readonly membershipModel: Model<WorldMembershipSchemaClass>,
    @InjectModel(CharacterSchemaClass.name)
    private readonly characterModel: Model<CharacterSchemaClass>,
    @InjectModel(ChatMessageSchemaClass.name)
    private readonly chatModel: Model<ChatMessageSchemaClass>,
    private readonly analytics: AnalyticsService,
  ) {}

  async getGrowth(days: number): Promise<GrowthStats> {
    const now = Date.now();
    const cached = this.cache.get(days);
    if (cached && now - cached.at < CACHE_TTL_MS) return cached.data;
    const data = await this.build(days, now);
    this.cache.set(days, { data, at: now });
    return data;
  }

  /** Invalidace cache (testy). */
  clearCache(): void {
    this.cache.clear();
  }

  private async build(days: number, now: number): Promise<GrowthStats> {
    const since = new Date(now - days * DAY_MS);

    // Nováčci v okně — malý set; `_id` je ObjectId, cizí kolekce drží userId jako
    // string, proto mapujeme na string pro `$in`.
    const recentIds = await this.safeArr('funnel.recentIds', async () => {
      const ids = (await this.userModel
        .find({ isDeleted: { $ne: true }, createdAt: { $gte: since } })
        .distinct('_id')) as unknown[];
      return ids.map((id) => String(id));
    });

    const [funnelSteps, retention, visitors] = await Promise.all([
      this.buildFunnel(recentIds),
      this.buildRetention(now),
      this.safeNum('acquisition.visitors', async () => {
        const summary = await this.analytics.getSummary(days);
        return summary.totals.visitors;
      }),
    ]);

    const signups = recentIds.length;
    const signupRate = visitors > 0 ? signups / visitors : null;

    return {
      range: { days, generatedAt: new Date(now).toISOString() },
      funnel: { steps: funnelSteps },
      retention,
      acquisition: { visitors, signups, signupRate },
    };
  }

  /** Trychtýř: distinct uživatelé per milník (total) + z nováčků (recent). */
  private async buildFunnel(recentIds: string[]) {
    const inRecent = { $in: recentIds };
    // world chat = worldId je nastaveno (ne null / prázdné); system zprávy pryč.
    const worldChat = {
      worldId: { $nin: [null, ''] },
      senderId: { $ne: 'system' },
    };

    const [
      regTotal,
      joinTotal,
      charTotal,
      actionTotal,
      diceTotal,
      joinRecent,
      charRecent,
      actionRecent,
      diceRecent,
    ] = await Promise.all([
      this.safeNum('funnel.registered', () =>
        this.userModel.countDocuments({ isDeleted: { $ne: true } }).exec(),
      ),
      this.countDistinct(
        'funnel.joinedWorld',
        this.membershipModel,
        'userId',
        {},
      ),
      this.countDistinct('funnel.character', this.characterModel, 'userId', {
        isNpc: false,
        userId: { $ne: null },
      }),
      this.countDistinct(
        'funnel.action',
        this.chatModel,
        'senderId',
        worldChat,
      ),
      this.countDistinct('funnel.dice', this.chatModel, 'senderId', {
        ...worldChat,
        isDiceRoll: true,
      }),
      // recent = z nováčků; prázdný set nováčků → 0 (distinct { $in: [] } = [])
      this.countDistinct(
        'funnel.joinedWorld.recent',
        this.membershipModel,
        'userId',
        {
          userId: inRecent,
        },
      ),
      this.countDistinct(
        'funnel.character.recent',
        this.characterModel,
        'userId',
        {
          isNpc: false,
          userId: inRecent,
        },
      ),
      this.countDistinct('funnel.action.recent', this.chatModel, 'senderId', {
        ...worldChat,
        senderId: inRecent,
      }),
      this.countDistinct('funnel.dice.recent', this.chatModel, 'senderId', {
        ...worldChat,
        isDiceRoll: true,
        senderId: inRecent,
      }),
    ]);

    const steps: { key: FunnelStepKey; total: number; recent: number }[] = [
      { key: 'registered', total: regTotal, recent: recentIds.length },
      { key: 'joinedWorld', total: joinTotal, recent: joinRecent },
      { key: 'character', total: charTotal, recent: charRecent },
      { key: 'action', total: actionTotal, recent: actionRecent },
      { key: 'dice', total: diceTotal, recent: diceRecent },
    ];
    return steps;
  }

  /** Retence: co JDE odvodit (spec §4) — aktivace, stickiness, survival kohorty. */
  private async buildRetention(now: number) {
    const active7 = new Date(now - 7 * DAY_MS);
    const active30 = new Date(now - 30 * DAY_MS);
    const cohortFrom = new Date(now - COHORT_MONTHS * 31 * DAY_MS);

    const [wau, mau, activationRate, cohorts] = await Promise.all([
      this.safeNum('retention.wau', () =>
        this.userModel
          .countDocuments({
            isDeleted: { $ne: true },
            lastSeenAt: { $gte: active7 },
          })
          .exec(),
      ),
      this.safeNum('retention.mau', () =>
        this.userModel
          .countDocuments({
            isDeleted: { $ne: true },
            lastSeenAt: { $gte: active30 },
          })
          .exec(),
      ),
      this.safeNum('retention.activation', async () => {
        const [row] = await this.userModel
          .aggregate<{ total: number; returned: number }>([
            { $match: { isDeleted: { $ne: true } } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                returned: {
                  $sum: {
                    $cond: [
                      {
                        $gt: [
                          { $subtract: ['$lastSeenAt', '$createdAt'] },
                          ACTIVATION_GAP_MS,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ])
          .exec();
        return row && row.total > 0 ? row.returned / row.total : 0;
      }),
      this.safeArr<GrowthCohort>('retention.cohorts', async () => {
        const rows = await this.userModel
          .aggregate<{ _id: string; registered: number; active: number }>([
            {
              $match: {
                isDeleted: { $ne: true },
                createdAt: { $gte: cohortFrom },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                registered: { $sum: 1 },
                active: {
                  $sum: {
                    $cond: [{ $gte: ['$lastSeenAt', active30] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .exec();
        return rows.map((r) => ({
          month: r._id,
          registered: r.registered,
          active: r.active,
        }));
      }),
    ]);

    const stickiness = mau > 0 ? wau / mau : 0;
    return { activationRate, stickiness, wau, mau, cohorts };
  }

  /** distinct hodnot pole s filtrem → počet (aggregation, ať nevrací velké pole). */
  private async countDistinct(
    metric: string,
    model: Model<unknown>,
    field: string,
    match: Record<string, unknown>,
  ): Promise<number> {
    return this.safeNum(metric, async () => {
      const [row] = await model
        .aggregate<{
          n: number;
        }>([
          { $match: match },
          { $group: { _id: `$${field}` } },
          { $count: 'n' },
        ])
        .exec();
      return row?.n ?? 0;
    });
  }

  private async safeNum(
    metric: string,
    fn: () => Promise<number>,
  ): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      logWarn(this.logger, `Growth metric "${metric}" selhala, vracím 0`, err);
      return 0;
    }
  }

  private async safeArr<T>(
    metric: string,
    fn: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await fn();
    } catch (err) {
      logWarn(this.logger, `Growth metric "${metric}" selhala, vracím []`, err);
      return [];
    }
  }
}
