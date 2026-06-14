import { Injectable, Inject, Logger } from '@nestjs/common';
import { logWarn } from '../../common/logging/log-error.util';
import { ConfigService } from '@nestjs/config';
import { DAY_MS, HOUR_MS } from '../../common/constants/time.constants';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-requests-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IIkarosArticlesRepository } from '../ikaros-articles/interfaces/ikaros-articles-repository.interface';
import type { IIkarosGalleryRepository } from '../ikaros-gallery/interfaces/ikaros-gallery-repository.interface';
import type { IIkarosDiscussionsRepository } from '../ikaros-discussions/interfaces/ikaros-discussions-repository.interface';
import type { AdminStatsOverview } from './dto/admin-stats-overview.dto';

/**
 * 12.1 — agregace platformových statistik pro admin dashboard.
 *
 * Princip robustnosti: každá dílčí metrika běží přes `safe()`, který při chybě
 * dílčího modulu/repozitáře vrátí `0` a zaloguje warning. Jeden rozbitý modul
 * tak nikdy neshodí celý dashboard (spec 12.1 §6).
 */
@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);
  private readonly onlineThresholdMs: number;

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IUsernameChangeRequestsRepository')
    private readonly usernameRequestsRepo: IUsernameChangeRequestsRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IIkarosArticlesRepository')
    private readonly articlesRepo: IIkarosArticlesRepository,
    @Inject('IIkarosGalleryRepository')
    private readonly galleryRepo: IIkarosGalleryRepository,
    @Inject('IIkarosDiscussionsRepository')
    private readonly discussionsRepo: IIkarosDiscussionsRepository,
    private readonly configService: ConfigService,
  ) {
    const hours = Number(
      this.configService.get('PRESENCE_THRESHOLD_HOURS', 25),
    );
    this.onlineThresholdMs =
      (Number.isFinite(hours) && hours > 0 ? hours : 25) * HOUR_MS;
  }

  async getOverview(): Promise<AdminStatsOverview> {
    const now = Date.now();
    const since7d = new Date(now - 7 * DAY_MS);
    const onlineSince = new Date(now - this.onlineThresholdMs);

    const [
      usersTotal,
      online,
      newLast7Days,
      pendingDeletion,
      worldsTotal,
      articles,
      galleryImages,
      discussions,
      pendingUsernameRequests,
    ] = await Promise.all([
      this.safe('users.total', async () => {
        const res = await this.usersRepo.findAllPaginated({
          page: 1,
          limit: 1,
        });
        return res.total;
      }),
      this.safe('users.online', async () => {
        const ids = await this.usersRepo.findOnlineSince(onlineSince);
        return ids.length;
      }),
      this.safe('users.newLast7Days', () =>
        this.usersRepo.countCreatedSince(since7d),
      ),
      this.safe('users.pendingDeletion', () =>
        this.usersRepo.countPendingDeletion(),
      ),
      this.safe('worlds.total', async () => {
        const all = await this.worldsRepo.findAll();
        return all.length;
      }),
      this.safe('content.articles', () => this.articlesRepo.countAll()),
      this.safe('content.galleryImages', () => this.galleryRepo.countAll()),
      this.safe('content.discussions', () => this.discussionsRepo.countAll()),
      this.safe('queue.pendingUsernameRequests', async () => {
        const res = await this.usernameRequestsRepo.listPaginated({
          status: 'pending',
          page: 1,
          limit: 1,
        });
        return res.total;
      }),
    ]);

    return {
      users: { total: usersTotal, online, newLast7Days, pendingDeletion },
      worlds: { total: worldsTotal },
      content: { articles, galleryImages, discussions },
      queue: { pendingUsernameRequests },
      generatedAt: new Date(now).toISOString(),
    };
  }

  /** Spustí počítací funkci; při chybě vrátí 0 a zaloguje warning. */
  private async safe(
    metric: string,
    fn: () => Promise<number>,
  ): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      logWarn(this.logger, `Stat metric "${metric}" selhala, vracím 0`, err);
      return 0;
    }
  }
}
