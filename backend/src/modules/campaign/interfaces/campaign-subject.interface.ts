export type CampaignSubjectType = 'PC' | 'NPC' | 'LOCATION' | 'ORG' | 'FACTION';
export type CampaignSubjectStatus = 'active' | 'archived';

export interface CampaignSubject {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  type: CampaignSubjectType;
  name: string;
  avatarUrl?: string;
  tags: string[];
  status: CampaignSubjectStatus;
  linkedPageSlug?: string;
  linkedCharacterSlug?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
