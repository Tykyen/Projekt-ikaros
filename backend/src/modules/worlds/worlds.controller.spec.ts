import { Test } from '@nestjs/testing';
import { WorldsController } from './worlds.controller';
import { WorldsService } from './worlds.service';
import { WorldElevationsService } from '../world-elevations/world-elevations.service';

describe('WorldsController', () => {
  let controller: WorldsController;
  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    findMyWorlds: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    join: jest.fn(),
    getMembers: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    updateMemberRole: jest.fn(),
    updateMemberGroup: jest.fn(),
    updateMemberAkj: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorldsController],
      providers: [
        { provide: WorldsService, useValue: mockService },
        {
          provide: WorldElevationsService,
          useValue: { listWorldIdsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    controller = module.get(WorldsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all worlds', async () => {
    const result = await controller.findAll();
    expect(mockService.findAll).toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
