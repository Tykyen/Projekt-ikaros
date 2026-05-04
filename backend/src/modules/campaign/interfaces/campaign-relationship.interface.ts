export type CampaignRelationshipStatus = 'active' | 'dormant' | 'crisis' | 'closed';

export interface RelationshipShared {
  whatHappened?: string;
  behindTheScenes?: string;
}

export interface RelationshipSide {
  tone?: string;
  behavior?: string;
  gmIntent?: string;
  strength?: number;
}

export interface CampaignRelationship {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  subjectAId: string;
  subjectBId: string;
  shared: RelationshipShared;
  sideA: RelationshipSide;
  sideB: RelationshipSide;
  status: CampaignRelationshipStatus;
  priority: number;
  storylineIds: string[];
  lastChangeNote?: string;
  createdAt: Date;
  updatedAt: Date;
}
