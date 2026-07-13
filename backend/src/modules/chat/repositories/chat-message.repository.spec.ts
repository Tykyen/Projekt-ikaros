import {
  MongoChatMessageRepository,
  MODERATION_HIDDEN_CONTENT,
} from './chat-message.repository';

/** Helper — postaví Mongoose find().sort().limit().lean().exec() chain mock. */
function buildFindChainMock(execValue: unknown) {
  const exec = jest.fn().mockResolvedValue(execValue);
  const lean = jest.fn().mockReturnValue({ exec });
  const sortChain = { lean, limit: jest.fn() };
  sortChain.limit.mockReturnValue(sortChain);
  const find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue(sortChain),
  });
  return { find };
}

describe('MongoChatMessageRepository.findFeed (13.2a — souhrn chatů)', () => {
  const baseOpts = {
    managerChannelIds: ['c1'],
    memberChannelIds: ['c2'],
    userId: 'me',
    limit: 50,
  };

  it('vylučuje vlastní zprávy — filter senderId $ne userId', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoChatMessageRepository({ find } as never);
    await repo.findFeed(baseOpts);
    const filter = find.mock.calls[0][0];
    expect(filter.senderId).toEqual({ $ne: 'me' });
  });

  it('nevrací smazané zprávy a respektuje přístupové kanály (OR větve)', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoChatMessageRepository({ find } as never);
    await repo.findFeed(baseOpts);
    const filter = find.mock.calls[0][0];
    expect(filter.isDeleted).toEqual({ $ne: true });
    expect(filter.$or).toHaveLength(2);
    // member větev pouští veřejné zprávy + vlastní whispery (visibleTo: userId).
    const memberBranch = filter.$or.find((b: Record<string, unknown>) =>
      JSON.stringify(b).includes('c2'),
    );
    expect(JSON.stringify(memberBranch)).toContain('me');
  });

  it('bez přístupových kanálů — vrátí [] a DB se nedotáže', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoChatMessageRepository({ find } as never);
    const res = await repo.findFeed({
      managerChannelIds: [],
      memberChannelIds: [],
      userId: 'me',
      limit: 50,
    });
    expect(res).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('D-066 — nevrací moderačně skryté zprávy (filter moderationHidden $ne true)', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoChatMessageRepository({ find } as never);
    await repo.findFeed(baseOpts);
    const filter = find.mock.calls[0][0];
    expect(filter.moderationHidden).toEqual({ $ne: true });
  });
});

/**
 * D-066 (spec 20B B4b) — maska moderačně skryté zprávy. Originál zůstává v DB
 * (revert M2/M3), ale `toEntity` NIKDY nepustí ven content / attachments /
 * mapRef / dicePayload — pro žádného viewera (vlastník i PJ vidí jen masku;
 * moderátor má snapshot v moderačním logu).
 */
describe('MongoChatMessageRepository — maska moderačně skryté zprávy (D-066)', () => {
  const hiddenDoc = {
    _id: 'm1',
    channelId: 'c1',
    senderId: 'u1',
    senderName: 'Autor',
    content: 'TAJNÝ závadný obsah',
    moderationHidden: true,
    moderationHiddenReason: 'Skryto moderací — rozhodnutí dec1',
    attachments: [{ url: 'https://x/att.png' }],
    mapRef: { worldMapId: 'map1', worldId: 'w1', title: 'Mapa' },
    dicePayload: { total: 7 },
  };

  it('skrytá zpráva odchází maskovaná (content/attachments/mapRef/dicePayload)', async () => {
    const { find } = buildFindChainMock([hiddenDoc]);
    const repo = new MongoChatMessageRepository({ find } as never);
    const [msg] = await repo.findByChannelId('c1', { limit: 10 });
    expect(msg.content).toBe(MODERATION_HIDDEN_CONTENT);
    expect(msg.content).not.toContain('TAJNÝ');
    expect(msg.attachments).toEqual([]);
    expect(msg.mapRef).toBeNull();
    expect(msg.dicePayload).toBeNull();
    expect(msg.moderationHidden).toBe(true);
  });

  it('neskrytá zpráva odchází beze změny', async () => {
    const { find } = buildFindChainMock([
      { ...hiddenDoc, moderationHidden: false },
    ]);
    const repo = new MongoChatMessageRepository({ find } as never);
    const [msg] = await repo.findByChannelId('c1', { limit: 10 });
    expect(msg.content).toBe('TAJNÝ závadný obsah');
    expect(msg.attachments).toHaveLength(1);
    expect(msg.moderationHidden).toBe(false);
  });

  it('substring hledání skryté zprávy vynechává (filter moderationHidden $ne true)', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoChatMessageRepository({ find } as never);
    await repo.searchInChannels(['c1'], 'tajný', 10);
    const filter = find.mock.calls[0][0];
    expect(filter.moderationHidden).toEqual({ $ne: true });
  });
});
