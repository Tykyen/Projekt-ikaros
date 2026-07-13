import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NaboryService } from './nabory.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { INaboryRepository } from './interfaces/nabory-repository.interface';
import type { Nabor } from './interfaces/nabor.interface';

function makeNabor(over: Partial<Nabor> = {}): Nabor {
  return {
    id: 'n1',
    strana: 'hledam-hrace',
    motiv: 'fantasy',
    title: 'T',
    body: 'b',
    mode: 'online',
    status: 'open',
    authorId: 'author',
    authorName: 'Author',
    seatsTaken: 0,
    createdAtUtc: new Date(),
    ...over,
  };
}

describe('NaboryService', () => {
  let repo: jest.Mocked<INaboryRepository>;
  let msg: { create: jest.Mock };
  let service: NaboryService;

  beforeEach(() => {
    repo = {
      findActive: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      addReport: jest.fn(),
      countAll: jest.fn(),
      countActiveByAuthor: jest.fn().mockResolvedValue(0),
    };
    msg = { create: jest.fn().mockResolvedValue({}) };
    service = new NaboryService(
      repo,
      msg as unknown as ConstructorParameters<typeof NaboryService>[1],
    );
  });

  it('create nastaví autora, status open a expiraci', async () => {
    repo.create.mockImplementation((d) => Promise.resolve({ id: 'n1', ...d }));
    const res = await service.create(
      {
        strana: 'hledam-hrace',
        motiv: 'fantasy',
        title: 'T',
        body: 'b',
        mode: 'online',
        worldId: 'w',
        seatsTotal: 5,
      },
      'author',
      'Author',
    );
    const arg = repo.create.mock.calls[0][0];
    expect(arg.authorId).toBe('author');
    expect(arg.authorName).toBe('Author');
    expect(arg.status).toBe('open');
    expect(arg.worldId).toBe('w');
    expect(arg.expiresAtUtc).toBeInstanceOf(Date);
    expect(res.id).toBe('n1');
  });

  it('create „hledam-hru" nedrží worldId ani seatsTotal', async () => {
    repo.create.mockImplementation((d) => Promise.resolve({ id: 'n1', ...d }));
    await service.create(
      {
        strana: 'hledam-hru',
        motiv: 'ikaros',
        title: 'T',
        body: 'b',
        mode: 'online',
        worldId: 'w',
        seatsTotal: 5,
      },
      'u',
      'U',
    );
    const arg = repo.create.mock.calls[0][0];
    expect(arg.worldId).toBeUndefined();
    expect(arg.seatsTotal).toBeUndefined();
  });

  it('delete: cizí ne-admin → Forbidden', async () => {
    repo.findById.mockResolvedValue(makeNabor());
    await expect(
      service.delete('n1', 'someone', UserRole.Hrac),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('delete: autor smí', async () => {
    repo.findById.mockResolvedValue(makeNabor());
    repo.delete.mockResolvedValue(true);
    await service.delete('n1', 'author', UserRole.Hrac);
    expect(repo.delete).toHaveBeenCalledWith('n1');
  });

  it('delete: Správce diskuzí smí (moderace)', async () => {
    repo.findById.mockResolvedValue(makeNabor());
    repo.delete.mockResolvedValue(true);
    await service.delete('n1', 'someone', UserRole.SpravceDiskuzi);
    expect(repo.delete).toHaveBeenCalledWith('n1');
  });

  it('ozvatSe: pošle zprávu autorovi', async () => {
    repo.findById.mockResolvedValue(makeNabor());
    await service.ozvatSe('n1', 'ahoj', 'sender', 'Sender');
    expect(msg.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'author', body: 'ahoj' }),
      { id: 'sender', username: 'Sender' },
    );
  });

  it('ozvatSe: na vlastní nábor → Forbidden', async () => {
    repo.findById.mockResolvedValue(makeNabor());
    await expect(
      service.ozvatSe('n1', 'x', 'author', 'Author'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(msg.create).not.toHaveBeenCalled();
  });

  it('findById: neexistuje → NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('report: idempotentně přidá nahlášení', async () => {
    repo.findById.mockResolvedValue(makeNabor());
    repo.addReport.mockResolvedValue(makeNabor());
    await service.report('n1', 'reporter');
    expect(repo.addReport).toHaveBeenCalledWith('n1', 'reporter');
  });
});
