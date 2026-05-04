import type { CampaignQuickNote } from './campaign-quick-note.interface';

export interface ICampaignQuickNoteRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignQuickNote[]>;
  findById(id: string): Promise<CampaignQuickNote | null>;
  create(data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote>;
  update(id: string, data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote | null>;
  delete(id: string): Promise<boolean>;
}
