import { ForbiddenException } from '@nestjs/common';
import { GlobalChatController } from './global-chat.controller';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../worlds/worlds.service';

describe('GlobalChatController — guest scope (15.8)', () => {
  let controller: GlobalChatController;
  const service = {
    getChannelId: jest.fn().mockReturnValue('ch'),
    getMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({}),
  };
  const gateway = { getPresence: jest.fn().mockReturnValue([]) };
  const upload = { uploadGlobalChatFile: jest.fn() };
  const anonBanService = { ban: jest.fn() };

  const guest: RequestUser = {
    id: 'anon_1',
    username: 'anonym1234',
    role: UserRole.Guest,
    isGuest: true,
  };
  const member: RequestUser = {
    id: 'u1',
    username: 'gandalf',
    role: UserRole.Hrac,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new GlobalChatController(
      service as never,
      gateway as never,
      upload as never,
      anonBanService as never,
    );
  });

  it('host getRoomInfo na Rozcestí → 403', () => {
    expect(() => controller.getRoomInfo(guest, 'rozcesti-1')).toThrow(
      ForbiddenException,
    );
  });

  it('host getMessages na Rozcestí → 403', () => {
    expect(() => controller.getMessages(guest, 'rozcesti-1')).toThrow(
      ForbiddenException,
    );
  });

  it('host getMessages na Hospodě → deleguje na service', () => {
    void controller.getMessages(guest, 'hospoda');
    expect(service.getMessages).toHaveBeenCalledWith(
      'hospoda',
      'anon_1',
      expect.anything(),
    );
  });

  it('host sendMessage na Rozcestí → 403', () => {
    expect(() =>
      controller.sendMessage({ content: 'x' }, guest, 'rozcesti-2'),
    ).toThrow(ForbiddenException);
  });

  it('host upload → 403 (jen text)', () => {
    expect(() =>
      controller.uploadAttachment(guest, {} as never, 'hospoda'),
    ).toThrow(ForbiddenException);
  });

  it('člen na Rozcestí → projde (deleguje na service)', () => {
    void controller.getMessages(member, 'rozcesti-1');
    expect(service.getMessages).toHaveBeenCalledWith(
      'rozcesti-1',
      'u1',
      expect.anything(),
    );
  });

  it('banAnon → deleguje na AnonBanService.ban(anonId, adminId)', () => {
    const admin: RequestUser = {
      id: 'admin1',
      username: 'boss',
      role: UserRole.Admin,
    };
    void controller.banAnon({ anonId: 'anon_x' }, admin);
    expect(anonBanService.ban).toHaveBeenCalledWith('anon_x', 'admin1');
  });
});
