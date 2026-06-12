import { MongoChatMessageRepository } from './chat-message.repository';

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
});
