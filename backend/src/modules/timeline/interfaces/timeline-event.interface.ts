export interface CelestialOverride {
  bodyId: string;
  value: string;
}

export interface TimelineEvent {
  id: string;
  worldId: string;
  year: number;
  month: number; // 1-based
  day: number; // 1-based
  hour?: number; // 0..23
  title: string;
  text: string;
  imageUrl: string | null;
  link: string | null;
  celestialOverrides: CelestialOverride[];
  createdAt: Date;
  updatedAt: Date;
}

// Response s placeholder celestialStates (Fáze 4.1 ho začne plnit)
export interface CelestialState {
  bodyId: string;
  name: string;
  type: 'moon' | 'sun' | 'planet' | 'comet' | 'other';
  state: string;
  isManualOverride: boolean;
}

export interface TimelineEventResponse extends TimelineEvent {
  celestialStates: CelestialState[]; // Fáze 3.2: vždy []
}
