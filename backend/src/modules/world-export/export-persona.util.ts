import type { PjPersonaDisplay } from '../worlds/pj-persona.util';

/** Minimum z chat zprávy potřebné pro persona přepis v exportu. */
interface ExportChatMessageLike {
  id: string;
  senderId: string;
  senderName: string;
  overrideName?: string;
  replyToId?: string;
  replyToSenderName?: string;
}

/**
 * D-NEW-INV-SEC persona-on-server — export světa (14.7c) serializuje chat
 * zprávy jako surový JSON: uložené `senderName` od vedení (PomocnyPJ+) je
 * reálné přihlašovací jméno a archiv se může sdílet dál. Přepíšeme ho na
 * personu PJ (6.8); `senderId` zůstává (import fidelity) a NPC override
 * (`overrideName`) se nemění — má při zobrazení přednost tak jako tak.
 * `replyToSenderName` (jméno citovaného autora zafixované při odpovědi) se
 * přepíše stejně, pokud citovaná zpráva je od vedení bez NPC overridu.
 * DB se nemění — mapuje se jen odchozí export.
 */
export function applyPjPersonaToExportMessages<T extends ExportChatMessageLike>(
  messages: T[],
  personaFor: (userId: string) => PjPersonaDisplay | null,
): T[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  return messages.map((m) => {
    const persona = personaFor(m.senderId);
    const cited = m.replyToId ? byId.get(m.replyToId) : undefined;
    const citedPersona =
      cited && !cited.overrideName ? personaFor(cited.senderId) : null;
    if (!persona && !citedPersona) return m;
    return {
      ...m,
      ...(persona ? { senderName: persona.name } : {}),
      ...(citedPersona && m.replyToSenderName
        ? { replyToSenderName: citedPersona.name }
        : {}),
    };
  });
}
