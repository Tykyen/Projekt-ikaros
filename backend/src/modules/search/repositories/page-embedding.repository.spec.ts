import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoPageEmbeddingRepository } from './page-embedding.repository';
import { PageEmbeddingSchemaClass } from '../schemas/page-embedding.schema';

describe('MongoPageEmbeddingRepository', () => {
  let repo: MongoPageEmbeddingRepository;
  const mockModel = {
    find: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoPageEmbeddingRepository,
        {
          provide: getModelToken(PageEmbeddingSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoPageEmbeddingRepository);
  });

  it('findByModelKey — vrátí embeddingy pro daný model', async () => {
    const doc = {
      _id: 'id1',
      pageId: 'p1',
      slug: 's1',
      modelKey: 'granite-107',
      pageHash: 'abc',
      chunkId: 'p1-0',
      chunkTitle: 'Title',
      chunkPreview: 'Preview',
      chunkOrder: 0,
      vector: [0.1, 0.2],
      createdAt: new Date(),
    };
    mockModel.find.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve([doc]) }),
    });
    const result = await repo.findByModelKey('granite-107');
    expect(result).toHaveLength(1);
    expect(result[0].modelKey).toBe('granite-107');
  });

  it('deleteAll — zavolá deleteMany bez filtru', async () => {
    mockModel.deleteMany.mockReturnValue({ exec: () => Promise.resolve() });
    await repo.deleteAll();
    expect(mockModel.deleteMany).toHaveBeenCalledWith({});
  });
});
