import { Test } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchCoordinator } from './search.coordinator';

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

    const module = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchCoordinator, useValue: mockCoordinator },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
      ],
    }).compile();
    controller = module.get(SearchController);
  });

  it('search — volá coordinator.search se správnými parametry', async () => {
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
    mockPagesRepo.findByWorld.mockResolvedValueOnce([{ slug: 'test' }]);
    const result = await controller.search('hello', 5, undefined, 'world1');
    expect(mockCoordinator.search).toHaveBeenCalledWith('hello', 5, undefined);
    expect(result).toHaveLength(1);
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
