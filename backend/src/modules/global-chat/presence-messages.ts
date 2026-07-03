import type { RoomKey } from './global-chat.service';

/**
 * Narativní hláška o příchodu/odchodu uživatele (krok 4.2d §2).
 * Hospoda má krčmářský tón, Camp poutnický. Ukládá se jako systémová
 * zpráva do kanálu — proto generuje text BE, ne FE.
 */
export function presenceLine(
  room: RoomKey,
  action: 'join' | 'leave',
  name: string,
): string {
  if (room === 'hospoda') {
    return action === 'join'
      ? `🍺 Dveře krčmy zavrzaly — vchází ${name}.`
      : `${name} dopíjí a opouští krčmu.`;
  }
  return action === 'join'
    ? `Na rozcestí se objevuje ${name}.`
    : `${name} se vydává dál a mizí v dáli.`;
}
