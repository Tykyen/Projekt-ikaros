import { Test } from '@nestjs/testing';
import { StatsController } from './stats.controller';

const mockStatsRepo = {
  get: jest
    .fn()
    .mockResolvedValue({ status: 'Everything embedded', vectorCount: 42 }),
};

const mockCoordinator = {
  rebuildIndex: jest.fn().mockResolvedValue(undefined),
  updatePageInIndex: jest.fn().mockResolvedValue(undefined),
};

const mockPagesRepo = {
  findAll: jest.fn().mockResolvedValue([]),
};

describe('StatsController', () => {
  let controller: StatsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStatsRepo.get.mockResolvedValue({
      status: 'Everything embedded',
      vectorCount: 42,
    });
    mockCoordinator.rebuildIndex.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        { provide: 'ISearchStatsRepository', useValue: mockStatsRepo },
        { provide: 'SearchCoordinator', useValue: mockCoordinator },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
      ],
    }).compile();
    controller = module.get(StatsController);
  });

  it('getSearchStats — vrátí stats z repository', async () => {
    const result = await controller.getSearchStats();
    expect(result.status).toBe('Everything embedded');
    expect(result.vectorCount).toBe(42);
  });

  it('triggerRebuild — spustí rebuild a vrátí 202', () => {
    controller.triggerRebuild();
    expect(mockCoordinator.rebuildIndex).toHaveBeenCalled();
  });
});
