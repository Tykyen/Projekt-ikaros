import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchCoordinator } from './search.coordinator';
import { WorldsService } from '../worlds/worlds.service';
import { PagesService } from '../pages/pages.service';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

const mockCoordinator = {
  search: jest.fn().mockResolvedValue([]),
  getProviders: jest
    .fn()
    .mockReturnValue([{ key: 'combined', displayName: 'Combined' }]),
  addPageToIndex: jest.fn().mockResolvedValue(undefined),
  updatePageInIndex: jest.fn().mockResolvedValue(undefined),
  deletePageFromIndex: jest.fn().mockResolvedValue(undefined),
  rebuildIndex: jest.fn().mockResolvedValue(undefined),
};

const mockPagesRepo = {
  findAll: jest.fn().mockResolvedValue([]),
  findByWorld: jest.fn().mockResolvedValue([]),
};

// findByIdForRequester hodí při chybějícím přístupu (NotFound); jinak vrátí svět.
const mockWorldsService = {
  findByIdForRequester: jest.fn().mockResolvedValue({ id: 'world1' }),
};

// N-35 — page-level visible slugs filtr (default: vidí vše předané v mocku).
const mockPagesService = {
  findVisibleSlugs: jest.fn().mockResolvedValue(new Set<string>()),
};

const user: RequestUser = {
  id: 'u1',
  email: 'a@b.cz',
  username: 'tester',
  role: 4,
} as RequestUser;

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCoordinator.search.mockResolvedValue([]);
    mockCoordinator.getProviders.mockReturnValue([
      { key: 'combined', displayName: 'Combined' },
    ]);
    mockPagesRepo.findAll.mockResolvedValue([]);
    mockPagesRepo.findByWorld.mockResolvedValue([]);
    mockWorldsService.findByIdForRequester.mockResolvedValue({ id: 'world1' });
    mockPagesService.findVisibleSlugs.mockResolvedValue(new Set<string>());

    const module = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchCoordinator, useValue: mockCoordinator },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: WorldsService, useValue: mockWorldsService },
        { provide: PagesService, useValue: mockPagesService },
      ],
    }).compile();
    controller = module.get(SearchController);
  });

  it('search — volá coordinator.search a filtruje na svět', async () => {
    mockCoordinator.search.mockResolvedValueOnce([
      {
        slug: 'test',
        id: 't1',
        title: 'Test',
        score: 1,
        providerKey: 'meili',
        providerName: 'MeiliSearch',
      },
    ]);
    mockPagesService.findVisibleSlugs.mockResolvedValueOnce(new Set(['test']));
    const result = await controller.search(
      user,
      'hello',
      5,
      undefined,
      'world1',
    );
    expect(mockWorldsService.findByIdForRequester).toHaveBeenCalledWith(
      'world1',
      user,
    );
    expect(mockCoordinator.search).toHaveBeenCalledWith('hello', 5, undefined);
    expect(result).toHaveLength(1);
  });

  it('N-35 — odfiltruje stránky bez page-level přístupu (AKJ leak fix)', async () => {
    mockCoordinator.search.mockResolvedValueOnce([
      {
        slug: 'verejna',
        id: 'p1',
        title: 'Veřejná',
        score: 1,
        providerKey: 'm',
        providerName: 'M',
      },
      {
        slug: 'tajna',
        id: 'p2',
        title: 'Tajná',
        score: 1,
        providerKey: 'm',
        providerName: 'M',
      },
    ]);
    // requester vidí jen 'verejna'; 'tajna' je AKJ/access-chráněná.
    mockPagesService.findVisibleSlugs.mockResolvedValueOnce(
      new Set(['verejna']),
    );
    const result = await controller.search(user, 'q', 5, undefined, 'world1');
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('verejna');
  });

  it('search — bez worldId vyhodí BadRequest (zákaz globálního leaku)', async () => {
    await expect(
      controller.search(user, 'hello', 5, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockCoordinator.search).not.toHaveBeenCalled();
  });

  it('search — bez přístupu ke světu propaguje chybu z worldsService', async () => {
    mockWorldsService.findByIdForRequester.mockRejectedValueOnce(
      new Error('WORLD_NOT_FOUND'),
    );
    await expect(
      controller.search(user, 'hello', 5, undefined, 'cizi-svet'),
    ).rejects.toThrow('WORLD_NOT_FOUND');
    expect(mockCoordinator.search).not.toHaveBeenCalled();
  });

  it('getProviders — vrátí seznam providerů', () => {
    const result = controller.getProviders();
    expect(result[0].key).toBe('combined');
  });

  it('rebuild — vrátí 202', () => {
    const result = controller.rebuild();
    expect(mockCoordinator.rebuildIndex).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Rebuild zahájen.' });
  });
});
