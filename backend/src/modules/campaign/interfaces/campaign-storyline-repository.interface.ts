import type { CampaignStoryline } from './campaign-storyline.interface';

export interface ICampaignStorylineRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignStoryline[]>;
  findById(id: string): Promise<CampaignStoryline | null>;
  create(data: Partial<CampaignStoryline>): Promise<CampaignStoryline>;
  update(id: string, data: Partial<CampaignStoryline>): Promise<CampaignStoryline | null>;
  delete(id: string): Promise<boolean>;
}
