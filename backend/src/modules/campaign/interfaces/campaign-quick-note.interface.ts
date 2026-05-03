export type CampaignQuickNoteStatus = 'open' | 'done';

export interface CampaignQuickNote {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  title: string;
  body?: string;
  status: CampaignQuickNoteStatus;
  pinned: boolean;
  subjectIds: string[];
  storylineIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
