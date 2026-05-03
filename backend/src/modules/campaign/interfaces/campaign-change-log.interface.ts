export type CampaignEntityType = 'subject' | 'relationship' | 'storyline' | 'scenario' | 'quicknote' | 'shopitem';
export type CampaignChangeType = 'created' | 'updated' | 'deleted';

export interface CampaignChangeLog {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  entityType: CampaignEntityType;
  entityId: string;
  entityName: string;
  changeType: CampaignChangeType;
  changedByUserId: string;
  changedByName: string;
  changedAt: Date;
}
