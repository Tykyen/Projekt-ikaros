import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScheduledMessagesController } from './scheduled-messages.controller';
import { UserRole } from '../users/interfaces/user.interface';
import type { ScheduledMessage } from './interfaces/scheduled-message.interface';

/** 11.2-ext F — controller unit testy: validace + ownership. */

const pj = { id: 'pj1', role: UserRole.PJ, username: 'PJ' };
const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();

function makeMsg(over: Partial<ScheduledMessage> = {}): ScheduledMessage {
  return {
    id: 'm1',
    worldId: 'w',
    channelId: 'c1',
    ownerId: 'pj1',
    ownerName: 'PJ',
    ownerRole: UserRole.PJ,
    content: 'ahoj',
    attachments: [],
    sendAt: new Date(),
    status: 'pending',
    ...over,
  };
}

describe('ScheduledMessagesController', () => {
  const repo = {
    create: jest.fn(),
    findDue: jest.fn(),
    findPendingByOwner: jest.fn(),
    findById: jest.fn(),
    setStatus: jest.fn(),
    delete: jest.fn(),
  };
  const controller = new ScheduledMessagesController(repo);
  beforeEach(() => jest.clearAllMocks());

  it('vytvoří naplánovanou zprávu s ownerem z auth', async () => {
    repo.create.mockResolvedValue(makeMsg());
    await controller.create(
      'w',
      { channelId: 'c1', content: 'ahoj', sendAt: future },
      pj,
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        worldId: 'w',
        channelId: 'c1',
        ownerId: 'pj1',
        ownerName: 'PJ',
        ownerRole: UserRole.PJ,
        status: 'pending',
      }),
    );
  });

  it('odmítne čas v minulosti', async () => {
    await expect(
      controller.create(
        'w',
        { channelId: 'c1', content: 'x', sendAt: past },
        pj,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('odmítne prázdnou zprávu (bez textu i přílohy)', async () => {
    await expect(
      controller.create('w', { channelId: 'c1', sendAt: future }, pj),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('zrušení cizí zprávy (ne-admin) → 403', async () => {
    repo.findById.mockResolvedValue(makeMsg({ ownerId: 'jiny' }));
    await expect(controller.cancel('m1', pj)).rejects.toThrow();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('zrušení neexistující → 404', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(controller.cancel('x', pj)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('zrušení vlastní → delete', async () => {
    repo.findById.mockResolvedValue(makeMsg({ ownerId: 'pj1' }));
    repo.delete.mockResolvedValue(true);
    await controller.cancel('m1', pj);
    expect(repo.delete).toHaveBeenCalledWith('m1');
  });
});
