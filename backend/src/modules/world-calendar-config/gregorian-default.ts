import type { WorldCalendarConfig } from './interfaces/world-calendar-config.interface';

/**
 * 9.2b — Gregoriánský default config pro auto-seed nového světa.
 *
 * Shape mirror FE `src/shared/lib/calendarEngine/gregorianDefault.ts`.
 * Drift risk: změna shape musí být synchronizována. Sketch test parity
 * (BE utils spec vs FE engine spec) ověří.
 *
 * `MOON_EPOCH_REFERENCE_ABSDAY = 730490` = absolutní den 6. 1. 2000
 * (astronomický nov), spočítáno přes `toAbsDay({2000, 0, 6})`.
 */
export const MOON_EPOCH_REFERENCE_ABSDAY = 730490;

export const GREGORIAN_DEFAULT_TEMPLATE: Omit<
  WorldCalendarConfig,
  'id' | 'worldId' | 'createdAt' | 'updatedAt'
> = {
  slug: 'gregorian',
  name: 'Gregoriánský kalendář',
  hoursPerDay: 24,
  daysOfWeek: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],
  months: [
    { name: 'Leden', daysCount: 31 },
    { name: 'Únor', daysCount: 28 },
    { name: 'Březen', daysCount: 31 },
    { name: 'Duben', daysCount: 30 },
    { name: 'Květen', daysCount: 31 },
    { name: 'Červen', daysCount: 30 },
    { name: 'Červenec', daysCount: 31 },
    { name: 'Srpen', daysCount: 31 },
    { name: 'Září', daysCount: 30 },
    { name: 'Říjen', daysCount: 31 },
    { name: 'Listopad', daysCount: 30 },
    { name: 'Prosinec', daysCount: 31 },
  ],
  celestialBodies: [
    {
      id: 'moon',
      name: 'Měsíc',
      orbitalPeriodDays: 29.5306,
      color: '#c0c8d0',
      epochOffset: MOON_EPOCH_REFERENCE_ABSDAY,
    },
  ],
  seasons: [
    {
      id: 'jaro',
      name: 'Jaro',
      startMonthIndex: 2,
      startDay: 21,
      color: '#7cb342',
      icon: '🌸',
    },
    {
      id: 'leto',
      name: 'Léto',
      startMonthIndex: 5,
      startDay: 21,
      color: '#fbc02d',
      icon: '☀️',
    },
    {
      id: 'podzim',
      name: 'Podzim',
      startMonthIndex: 8,
      startDay: 23,
      color: '#e65100',
      icon: '🍂',
    },
    {
      id: 'zima',
      name: 'Zima',
      startMonthIndex: 11,
      startDay: 21,
      color: '#42a5f5',
      icon: '❄️',
    },
  ],
  epochOffset: 0,
};
