export type CampaignStorylineLevel = 'macro' | 'mid' | 'micro';
export type CampaignStorylineStatus = 'active' | 'dormant' | 'escalating' | 'climax' | 'closed';

export interface CampaignStoryline {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  level: CampaignStorylineLevel;
  title: string;
  status: CampaignStorylineStatus;
  phase?: string;
  summary?: string;
  whatHappened?: string;
  truth?: string;
  playersBelief?: string;
  gmIntent?: string;
  nextStep?: string;
  subjectIds: string[];
  relationshipIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
