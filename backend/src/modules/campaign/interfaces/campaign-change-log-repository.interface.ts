import type { CampaignChangeLog } from './campaign-change-log.interface';

export interface ICampaignChangeLogRepository {
  append(entry: Omit<CampaignChangeLog, 'id'>): Promise<void>;
  findMany(filter: Record<string, unknown>, limit: number): Promise<CampaignChangeLog[]>;
}
