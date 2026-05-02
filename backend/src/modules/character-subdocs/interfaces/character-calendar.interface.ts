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
  events: CalendarEvent[];
}
