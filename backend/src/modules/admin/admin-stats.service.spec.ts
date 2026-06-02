import { ConfigService } from '@nestjs/config';
import { AdminStatsService } from './admin-stats.service';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-requests-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { IIkarosArticlesRepository } from '../ikaros-articles/interfaces/ikaros-articles-repository.interface';
import type { IIkarosGalleryRepository } from '../ikaros-gallery/interfaces/ikaros-gallery-repository.interface';
import type { IIkarosDiscussionsRepository } from '../ikaros-discussions/interfaces/ikaros-discussions-repository.interface';

describe('AdminStatsService', () => {
  let usersRepo: jest.Mocked<
    Pick<
      IUsersRepository,
      | 'findAllPaginated'
      | 'findOnlineSince'
      | 'countCreatedSince'
      | 'countPendingDeletion'
    >
  >;
  let usernameRepo: jest.Mocked<
    Pick<IUsernameChangeRequestsRepository, 'listPaginated'>
  >;
  let worldsRepo: jest.Mocked<Pick<IWorldsRepository, 'findAll'>>;
  let articlesRepo: jest.Mocked<Pick<IIkarosArticlesRepository, 'countAll'>>;
  let galleryRepo: jest.Mocked<Pick<IIkarosGalleryRepository, 'countAll'>>;
  let discussionsRepo: jest.Mocked<
    Pick<IIkarosDiscussionsRepository, 'countAll'>
  >;

  function build(): AdminStatsService {
    return new AdminStatsService(
      usersRepo as unknown as IUsersRepository,
      usernameRepo as unknown as IUsernameChangeRequestsRepository,
      worldsRepo as unknown as IWorldsRepository,
      articlesRepo as unknown as IIkarosArticlesRepository,
      galleryRepo as unknown as IIkarosGalleryRepository,
      discussionsRepo as unknown as IIkarosDiscussionsRepository,
      new ConfigService(),
    );
  }

  beforeEach(() => {
    usersRepo = {
      findAllPaginated: jest.fn().mockResolvedValue({ items: [], total: 42 }),
      findOnlineSince: jest.fn().mockResolvedValue(['a', 'b', 'c']),
      countCreatedSince: jest.fn().mockResolvedValue(5),
      countPendingDeletion: jest.fn().mockResolvedValue(2),
    };
    usernameRepo = {
      listPaginated: jest.fn().mockResolvedValue({ items: [], total: 3 }),
    };
    worldsRepo = {
      findAll: jest.fn().mockResolvedValue([{}, {}, {}, {}]),
    };
    articlesRepo = { countAll: jest.fn().mockResolvedValue(10) };
    galleryRepo = { countAll: jest.fn().mockResolvedValue(20) };
    discussionsRepo = { countAll: jest.fn().mockResolvedValue(7) };
  });

  it('agreguje všechny metriky do správného tvaru', async () => {
    const result = await build().getOverview();

    expect(result.users).toEqual({
      total: 42,
      online: 3,
      newLast7Days: 5,
      pendingDeletion: 2,
    });
    expect(result.worlds).toEqual({ total: 4 });
    expect(result.content).toEqual({
      articles: 10,
      galleryImages: 20,
      discussions: 7,
    });
    expect(result.queue).toEqual({ pendingUsernameRequests: 3 });
    expect(typeof result.generatedAt).toBe('string');
    expect(usernameRepo.listPaginated).toHaveBeenCalledWith({
      status: 'pending',
      page: 1,
      limit: 1,
    });
  });

  it('robustnost: když jeden repo selže, metrika = 0 a odpověď nepadne', async () => {
    articlesRepo.countAll.mockRejectedValue(new Error('articles down'));
    worldsRepo.findAll.mockRejectedValue(new Error('worlds down'));

    const result = await build().getOverview();

    expect(result.content.articles).toBe(0);
    expect(result.worlds.total).toBe(0);
    // ostatní metriky nedotčené
    expect(result.users.total).toBe(42);
    expect(result.content.galleryImages).toBe(20);
  });
});
