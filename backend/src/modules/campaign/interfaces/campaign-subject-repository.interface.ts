import type { CampaignSubject } from './campaign-subject.interface';

export interface ICampaignSubjectRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignSubject[]>;
  findById(id: string): Promise<CampaignSubject | null>;
  create(data: Partial<CampaignSubject>): Promise<CampaignSubject>;
  update(id: string, data: Partial<CampaignSubject>): Promise<CampaignSubject | null>;
  delete(id: string): Promise<boolean>;
}
