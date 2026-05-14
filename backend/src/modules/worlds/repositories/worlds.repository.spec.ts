import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoWorldsRepository } from './worlds.repository';
import { WorldSchemaClass } from '../schemas/world.schema';

describe('MongoWorldsRepository', () => {
  let repository: MongoWorldsRepository;

  const mockWorld = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Matrix',
    slug: 'matrix',
    ownerId: 'owner1',
    isActive: true,
    accessMode: 'private',
    playerCount: 0,
    system: 'matrix',
    tones: [],
    dice: [],
    offeredCharacters: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockModel = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoWorldsRepository,
        { provide: getModelToken(WorldSchemaClass.name), useValue: mockModel },
      ],
    }).compile();
    repository = module.get(MongoWorldsRepository);
  });

  it('should find world by slug', async () => {
    mockModel.findOne.mockReturnValue({
      lean: () => ({ exec: () => mockWorld }),
    });
    const world = await repository.findBySlug('matrix');
    expect(world).not.toBeNull();
    expect(world!.slug).toBe('matrix');
    expect(world!.id).toBe('507f1f77bcf86cd799439011');
  });

  it('should return null for unknown slug', async () => {
    mockModel.findOne.mockReturnValue({ lean: () => ({ exec: () => null }) });
    const world = await repository.findBySlug('unknown');
    expect(world).toBeNull();
  });

  it('should find all active worlds', async () => {
    mockModel.find.mockReturnValue({
      lean: () => ({ exec: () => [mockWorld] }),
    });
    const worlds = await repository.findAll();
    expect(worlds).toHaveLength(1);
    expect(worlds[0].name).toBe('Matrix');
  });
});
