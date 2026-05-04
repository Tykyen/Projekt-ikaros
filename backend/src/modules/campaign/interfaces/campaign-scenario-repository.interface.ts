import type { CampaignScenario } from './campaign-scenario.interface';

export interface ICampaignScenarioRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignScenario[]>;
  findById(id: string): Promise<CampaignScenario | null>;
  create(data: Partial<CampaignScenario>): Promise<CampaignScenario>;
  update(id: string, data: Partial<CampaignScenario>): Promise<CampaignScenario | null>;
  delete(id: string): Promise<boolean>;
  maxOrder(filter: Record<string, unknown>): Promise<number>;
}
