import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SearchIndexStatsSchemaClass,
  IndexingFailureSchemaClass,
} from '../schemas/search-index-stats.schema';
import type {
  ISearchStatsRepository,
  SearchIndexStats,
  IndexingFailure,
} from '../interfaces/search-stats-repository.interface';

const STATS_ID = 'embedding-search';

const DEFAULT_STATS: SearchIndexStats = {
  provider: 'embedding',
  status: 'Unknown',
  processedPages: 0,
  totalPages: 0,
  indexedCount: 0,
  vectorCount: 0,
  pendingPages: 0,
};

@Injectable()
export class MongoSearchStatsRepository implements ISearchStatsRepository {
  constructor(
    @InjectModel(SearchIndexStatsSchemaClass.name)
    private readonly statsModel: Model<SearchIndexStatsSchemaClass>,
    @InjectModel(IndexingFailureSchemaClass.name)
    private readonly failureModel: Model<IndexingFailureSchemaClass>,
  ) {}

  async get(): Promise<SearchIndexStats> {
    const doc = await this.statsModel.findOne({ _id: STATS_ID }).lean().exec();
    if (!doc) return { ...DEFAULT_STATS };
    return {
      provider: doc.provider,
      status: doc.status as SearchIndexStats['status'],
      processedPages: doc.processedPages,
      totalPages: doc.totalPages,
      indexedCount: doc.indexedCount,
      vectorCount: doc.vectorCount,
      pendingPages: doc.pendingPages,
      lastEmbeddedPageSlug: doc.lastEmbeddedPageSlug,
      lastEmbeddedAtUtc: doc.lastEmbeddedAtUtc,
    };
  }

  async update(partial: Partial<SearchIndexStats>): Promise<void> {
    await this.statsModel
      .findOneAndUpdate(
        { _id: STATS_ID },
        { $set: partial },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }

  async saveFailure(failure: IndexingFailure): Promise<void> {
    await this.failureModel.create(failure);
  }
}
