import {
  CalendarEvent,
  CalendarDisplaySettings,
} from '../../character-subdocs/interfaces/character-calendar.interface';

export interface CalendarCharacterInfo {
  characterId: string;
  slug: string;
  name: string;
  color: string;
  displaySettings: CalendarDisplaySettings;
}

export interface AggregatedCalendarEvent extends CalendarEvent {
  characterId: string;
  slug: string;
  name: string;
  color: string;
}

export interface CalendarAggregateResponse {
  characters: CalendarCharacterInfo[];
  events: AggregatedCalendarEvent[];
}

export interface UpdateCalendarSettingsDto {
  color?: string;
  displaySettings?: Partial<CalendarDisplaySettings>;
}
