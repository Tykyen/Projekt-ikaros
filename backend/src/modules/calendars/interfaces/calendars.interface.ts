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
  /** Spec 9.2 — FE rozliší persona vs location (ikona, link, filter). */
  kind: 'persona' | 'location';
  /** 9.2d — FE rozliší PostavaHrace (false) vs NPC (true) ve filter sidebaru. */
  isNpc: boolean;
}

export interface AggregatedCalendarEvent extends CalendarEvent {
  characterId: string;
  slug: string;
  name: string;
  color: string;
  /** Spec 9.2 — FE může filtrovat agregát na location only / persona only. */
  kind: 'persona' | 'location';
  /** 9.2d — pro PJ aggregate filtrování. */
  isNpc: boolean;
}

export interface CalendarAggregateResponse {
  characters: CalendarCharacterInfo[];
  events: AggregatedCalendarEvent[];
}

export interface UpdateCalendarSettingsDto {
  color?: string;
  displaySettings?: Partial<CalendarDisplaySettings>;
}
