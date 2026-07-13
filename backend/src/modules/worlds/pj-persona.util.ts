import { WorldRole } from './interfaces/world-membership.interface';
import type { PjChatPersona } from './interfaces/world-settings.interface';

/** Zobrazená identita vedení pod personou (6.8). */
export interface PjPersonaDisplay {
  name: string;
  avatarUrl: string | null;
}

/** Minimum z membershipu potřebné pro resolver (repo doc i enriched member). */
export interface PjPersonaMember {
  userId: string;
  role: WorldRole;
  /** 6.8-followup — vlastní avatar vedení (režim `individual`). */
  pjPersonaAvatarUrl?: string;
}

/** Persona konfigurace — tolerantní tvar (schema má `mode`/`enabled` optional). */
export type PjPersonaConfig =
  | (Pick<PjChatPersona, 'name' | 'avatarUrl'> &
      Partial<Omit<PjChatPersona, 'name' | 'avatarUrl'>>)
  | null
  | undefined;

/** Role label vedení pro režim `individual`. */
function leaderRoleLabel(role: WorldRole): string {
  return role >= WorldRole.PJ ? 'PJ' : 'Pomocný PJ';
}

/**
 * D-NEW-INV-SEC „persona-on-server" — BE zrcadlo FE resolveru
 * (FE: `src/features/world/chat/lib/pjPersona.ts`). PJ persona (6.8) se na FE
 * aplikuje render-time; serverové cesty, kde jméno autora odchází MIMO
 * render-time FE (push payload, chat feed/search, export světa, komentáře
 * herních akcí), musí personu dosadit samy — jinak hráčům prosákne reálné
 * jméno PJ.
 *
 * Sémantika (identická s FE `makePjDisplayResolver`):
 *  - vedení = world role ≥ PomocnyPJ; ostatní → `null` (použij reálné jméno),
 *  - `unified` (default i bez nastavení) → jednotné jméno (`persona.name`,
 *    fallback „PJ") + sdílený avatar,
 *  - `individual` → role label („PJ" / „Pomocný PJ") + vlastní
 *    `membership.pjPersonaAvatarUrl`. FE navíc padá na avatar účtu — BE vrací
 *    `null` (fallback/iniciálu řeší konzument, jméno je to podstatné),
 *  - `enabled` flag se (stejně jako na FE) nevyhodnocuje.
 *
 * POZOR: world-scoped. Mimo světy (platform chat, Hospoda, pošta) se persona
 * NEaplikuje. NPC override (`overrideName`) má VŽDY přednost — řeší konzument
 * (`overrideName ?? persona?.name ?? reálné jméno`). Historická uložená data
 * se NEmění — resolvuje se při odesílání/čtení/exportu.
 */
export function makePjPersonaResolver(
  members: readonly PjPersonaMember[],
  persona: PjPersonaConfig,
): (userId: string) => PjPersonaDisplay | null {
  const leaders = new Map<string, PjPersonaMember>();
  for (const m of members) {
    if (m.role >= WorldRole.PomocnyPJ) leaders.set(m.userId, m);
  }
  if (leaders.size === 0) return () => null;

  // `undefined`/`null` (nenastaveno) = výchozí `unified` (FE chování).
  const mode = persona?.mode ?? 'unified';

  if (mode === 'individual') {
    return (userId: string) => {
      const m = leaders.get(userId);
      if (!m) return null;
      return {
        name: leaderRoleLabel(m.role),
        avatarUrl: m.pjPersonaAvatarUrl ?? null,
      };
    };
  }

  // unified — jednotná anonymní identita „PJ" + sdílený avatar.
  const display: PjPersonaDisplay = {
    name: persona?.name?.trim() || 'PJ',
    avatarUrl: persona?.avatarUrl ?? null,
  };
  return (userId: string) => (leaders.has(userId) ? display : null);
}

/** Persona jednoho člena (single-shot, např. push od odesílatele zprávy). */
export function resolvePjPersona(
  member: PjPersonaMember | null | undefined,
  persona: PjPersonaConfig,
): PjPersonaDisplay | null {
  if (!member) return null;
  return makePjPersonaResolver([member], persona)(member.userId);
}
