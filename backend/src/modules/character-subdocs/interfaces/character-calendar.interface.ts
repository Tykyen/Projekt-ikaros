export interface CalendarDisplaySettings {
  defaultView?: 'month' | 'week' | 'day';
  isHiddenInAggregate?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  hourStart?: string;
  hourEnd?: string;
  description?: string;
}

export interface CharacterCalendar {
  id: string;
  characterId: string;
  worldId: string;
  color: string;
  displaySettings: CalendarDisplaySettings;
  events: CalendarEvent[];
}
