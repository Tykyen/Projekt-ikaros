import type { CampaignRelationship } from './campaign-relationship.interface';

export interface ICampaignRelationshipRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignRelationship[]>;
  findById(id: string): Promise<CampaignRelationship | null>;
  create(data: Partial<CampaignRelationship>): Promise<CampaignRelationship>;
  update(id: string, data: Partial<CampaignRelationship>): Promise<CampaignRelationship | null>;
  delete(id: string): Promise<boolean>;
}
