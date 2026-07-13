import { applyPjPersonaToExportMessages } from './export-persona.util';
import { makePjPersonaResolver } from '../worlds/pj-persona.util';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

/**
 * D-NEW-INV-SEC persona-on-server — export světa (14.7c) nesmí v chatu vynést
 * reálné jméno vedení: `senderName` (i `replyToSenderName`) od PomocnyPJ+ se
 * přepisuje na personu PJ (6.8). NPC override zůstává (a při zobrazení vyhrává),
 * zprávy hráčů se nemění.
 */
describe('applyPjPersonaToExportMessages', () => {
  const personaFor = makePjPersonaResolver(
    [
      { userId: 'pj', role: WorldRole.PJ },
      { userId: 'hrac', role: WorldRole.Hrac },
    ],
    { enabled: true, name: 'Vypravěč', avatarUrl: null, mode: 'unified' },
  );

  interface TestMsg {
    id: string;
    senderId: string;
    senderName: string;
    overrideName?: string;
    replyToId?: string;
    replyToSenderName?: string;
  }

  const msg = (over: Partial<TestMsg> & Pick<TestMsg, 'id'>): TestMsg => ({
    senderId: 'hrac',
    senderName: 'hrac-login',
    ...over,
  });

  it('zpráva vedení → senderName = persona, hráč beze změny', () => {
    const out = applyPjPersonaToExportMessages(
      [
        msg({ id: 'm1', senderId: 'pj', senderName: 'pj-realne-jmeno' }),
        msg({ id: 'm2' }),
      ],
      personaFor,
    );
    expect(out[0].senderName).toBe('Vypravěč');
    expect(out[1].senderName).toBe('hrac-login');
  });

  it('NPC override zůstává zachován (vyhrává při zobrazení), senderName se přesto anonymizuje', () => {
    const out = applyPjPersonaToExportMessages(
      [
        msg({
          id: 'm1',
          senderId: 'pj',
          senderName: 'pj-realne-jmeno',
          overrideName: 'Hostinský Baram',
        }),
      ],
      personaFor,
    );
    expect(out[0].overrideName).toBe('Hostinský Baram');
    expect(out[0].senderName).toBe('Vypravěč');
  });

  it('replyToSenderName na zprávu vedení → persona; na NPC override zůstává', () => {
    const out = applyPjPersonaToExportMessages(
      [
        msg({ id: 'pj-msg', senderId: 'pj', senderName: 'pj-realne-jmeno' }),
        msg({
          id: 'npc-msg',
          senderId: 'pj',
          senderName: 'pj-realne-jmeno',
          overrideName: 'Hostinský Baram',
        }),
        msg({
          id: 'reply-1',
          replyToId: 'pj-msg',
          replyToSenderName: 'pj-realne-jmeno',
        }),
        msg({
          id: 'reply-2',
          replyToId: 'npc-msg',
          replyToSenderName: 'Hostinský Baram',
        }),
      ],
      personaFor,
    );
    expect(out[2].replyToSenderName).toBe('Vypravěč');
    expect(out[3].replyToSenderName).toBe('Hostinský Baram');
  });

  it('citovaná zpráva mimo export (limit/smazaná) → replyToSenderName beze změny', () => {
    const out = applyPjPersonaToExportMessages(
      [
        msg({
          id: 'reply-x',
          replyToId: 'neexistuje',
          replyToSenderName: 'kdovi',
        }),
      ],
      personaFor,
    );
    expect(out[0].replyToSenderName).toBe('kdovi');
  });
});
