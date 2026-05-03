export interface CampaignScenario {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  title: string;
  contentData?: Record<string, unknown>;
  order: number;
  linkedPageSlug?: string;
  subjectIds: string[];
  storylineIds: string[];
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}
