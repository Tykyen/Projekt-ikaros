import { MongoIkarosNewsRepository } from './ikaros-news.repository';

/** Helper — postaví Mongoose find().sort().skip/limit chain mock. */
function buildFindChainMock(execValue: unknown) {
  const exec = jest.fn().mockResolvedValue(execValue);
  const lean = jest.fn().mockReturnValue({ exec });
  const sortChain = { lean, skip: jest.fn(), limit: jest.fn() };
  sortChain.skip.mockReturnValue(sortChain);
  sortChain.limit.mockReturnValue(sortChain);
  const find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue(sortChain),
  });
  return { find, sortChain };
}

describe('MongoIkarosNewsRepository.findByScope', () => {
  it('default scope active — filter archived !== true', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoIkarosNewsRepository({ find } as never);
    await repo.findByScope();
    expect(find).toHaveBeenCalledWith({ archived: { $ne: true } });
  });

  it('scope archived — filter archived === true', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoIkarosNewsRepository({ find } as never);
    await repo.findByScope({ scope: 'archived' });
    expect(find).toHaveBeenCalledWith({ archived: true });
  });

  it('scope all — prázdný filter (vrátí vše)', async () => {
    const { find } = buildFindChainMock([]);
    const repo = new MongoIkarosNewsRepository({ find } as never);
    await repo.findByScope({ scope: 'all' });
    expect(find).toHaveBeenCalledWith({});
  });

  it('D-068 — uplatní skip/limit pokud jsou v opts', async () => {
    const { find, sortChain } = buildFindChainMock([]);
    const repo = new MongoIkarosNewsRepository({ find } as never);
    await repo.findByScope({ limit: 5, offset: 10 });
    expect(sortChain.skip).toHaveBeenCalledWith(10);
    expect(sortChain.limit).toHaveBeenCalledWith(5);
  });

  it('bez limit/offset — žádný skip ani limit call', async () => {
    const { find, sortChain } = buildFindChainMock([]);
    const repo = new MongoIkarosNewsRepository({ find } as never);
    await repo.findByScope();
    expect(sortChain.skip).not.toHaveBeenCalled();
    expect(sortChain.limit).not.toHaveBeenCalled();
  });
});

describe('MongoIkarosNewsRepository.countByScope', () => {
  it('default scope active — filter archived $ne true', async () => {
    const countDocuments = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(7),
    });
    const repo = new MongoIkarosNewsRepository({ countDocuments } as never);
    await expect(repo.countByScope()).resolves.toBe(7);
    expect(countDocuments).toHaveBeenCalledWith({ archived: { $ne: true } });
  });

  it('scope archived — filter archived true', async () => {
    const countDocuments = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(3),
    });
    const repo = new MongoIkarosNewsRepository({ countDocuments } as never);
    await expect(repo.countByScope('archived')).resolves.toBe(3);
    expect(countDocuments).toHaveBeenCalledWith({ archived: true });
  });

  it('scope all — prázdný filter', async () => {
    const countDocuments = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(10),
    });
    const repo = new MongoIkarosNewsRepository({ countDocuments } as never);
    await expect(repo.countByScope('all')).resolves.toBe(10);
    expect(countDocuments).toHaveBeenCalledWith({});
  });
});

describe('MongoIkarosNewsRepository.update (Spec 3.1)', () => {
  it('vrátí entitu pokud findByIdAndUpdate vrátí dokument', async () => {
    const doc = {
      _id: 'n1',
      title: 'Updated',
      content: 'Body',
      authorId: 'u1',
      createdAtUtc: new Date(),
      archived: false,
    };
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      }),
    });
    const repo = new MongoIkarosNewsRepository({ findByIdAndUpdate } as never);
    const result = await repo.update('n1', { title: 'Updated' });
    expect(result?.title).toBe('Updated');
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      'n1',
      { $set: { title: 'Updated' } },
      { new: true },
    );
  });

  it('vrátí null pro neexistující id', async () => {
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    });
    const repo = new MongoIkarosNewsRepository({ findByIdAndUpdate } as never);
    await expect(repo.update('missing', { title: 'X' })).resolves.toBeNull();
  });
});

describe('MongoIkarosNewsRepository.setArchived (Spec 3.1)', () => {
  it('archived=true — set archived + audit fields s userId', async () => {
    const doc = {
      _id: 'n1',
      title: 'T',
      content: 'C',
      authorId: 'u1',
      createdAtUtc: new Date(),
      archived: true,
    };
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      }),
    });
    const repo = new MongoIkarosNewsRepository({ findByIdAndUpdate } as never);
    await repo.setArchived('n1', true, 'adminUser');
    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({
      archived: true,
      archivedByUserId: 'adminUser',
    });
    expect(update.$set.archivedAtUtc).toBeInstanceOf(Date);
  });

  it('archived=false — set archived + unset audit fields', async () => {
    const doc = {
      _id: 'n1',
      title: 'T',
      content: 'C',
      authorId: 'u1',
      createdAtUtc: new Date(),
      archived: false,
    };
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      }),
    });
    const repo = new MongoIkarosNewsRepository({ findByIdAndUpdate } as never);
    await repo.setArchived('n1', false);
    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).toEqual({ archived: false });
    expect(update.$unset).toEqual({ archivedAtUtc: '', archivedByUserId: '' });
  });

  it('vrátí null pro neexistující id', async () => {
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    });
    const repo = new MongoIkarosNewsRepository({ findByIdAndUpdate } as never);
    await expect(repo.setArchived('x', true, 'u')).resolves.toBeNull();
  });
});
