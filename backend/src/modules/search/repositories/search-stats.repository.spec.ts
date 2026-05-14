import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoSearchStatsRepository } from './search-stats.repository';
import {
  SearchIndexStatsSchemaClass,
  IndexingFailureSchemaClass,
} from '../schemas/search-index-stats.schema';

describe('MongoSearchStatsRepository', () => {
  let repo: MongoSearchStatsRepository;
  const mockStatsModel = {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  };
  const mockFailureModel = { create: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoSearchStatsRepository,
        {
          provide: getModelToken(SearchIndexStatsSchemaClass.name),
          useValue: mockStatsModel,
        },
        {
          provide: getModelToken(IndexingFailureSchemaClass.name),
          useValue: mockFailureModel,
        },
      ],
    }).compile();
    repo = module.get(MongoSearchStatsRepository);
  });

  it('get — vrátí výchozí stats pokud dokument neexistuje', async () => {
    mockStatsModel.findOne.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    });
    const stats = await repo.get();
    expect(stats.status).toBe('Unknown');
    expect(stats.processedPages).toBe(0);
  });

  it('update — upsertuje dokument', async () => {
    mockStatsModel.findOneAndUpdate.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve({}) }),
    });
    await repo.update({ status: 'Embedding in progress' });
    expect(mockStatsModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'embedding-search' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'Embedding in progress' }),
      }),
      expect.anything(),
    );
  });
});
