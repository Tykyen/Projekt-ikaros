import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalChatController } from './global-chat.controller';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../worlds/worlds.service';

describe('GlobalChatController — guest scope (15.8)', () => {
  let controller: GlobalChatController;
  const service = {
    getChannelId: jest.fn().mockReturnValue('ch'),
    getMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({}),
    saveGame: jest.fn().mockResolvedValue({}),
    getSavedGame: jest.fn().mockResolvedValue(null),
    loadGame: jest.fn().mockResolvedValue({}),
    deleteSavedGame: jest.fn().mockResolvedValue(undefined),
    getRoomDefaults: jest.fn().mockResolvedValue({}),
    setRoomDefault: jest.fn().mockResolvedValue({}),
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

  it('host getRoomInfo na Camp → 403', () => {
    expect(() => controller.getRoomInfo(guest, 'camp-1')).toThrow(
      ForbiddenException,
    );
  });

  it('host getMessages na Camp → 403', () => {
    expect(() => controller.getMessages(guest, 'camp-1')).toThrow(
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

  it('host sendMessage na Camp → 403', () => {
    expect(() =>
      controller.sendMessage({ content: 'x' }, guest, 'camp-2'),
    ).toThrow(ForbiddenException);
  });

  it('host upload → 403 (jen text)', () => {
    expect(() =>
      controller.uploadAttachment(guest, {} as never, 'hospoda'),
    ).toThrow(ForbiddenException);
  });

  it('člen na Camp → projde (deleguje na service)', () => {
    void controller.getMessages(member, 'camp-1');
    expect(service.getMessages).toHaveBeenCalledWith(
      'camp-1',
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

  // ── 16.6 — uložení/načtení hry + admin default ─────────────────────
  describe('saved-game + defaults (16.6)', () => {
    it('host saveGame → 403', () => {
      expect(() => controller.saveGame('camp-1', guest)).toThrow(
        ForbiddenException,
      );
    });

    it('host getSavedGame → 403', () => {
      expect(() => controller.getSavedGame(guest)).toThrow(ForbiddenException);
    });

    it('host loadGame → 403', () => {
      expect(() => controller.loadGame(guest)).toThrow(ForbiddenException);
    });

    it('host deleteSavedGame → 403', () => {
      expect(() => controller.deleteSavedGame(guest)).toThrow(
        ForbiddenException,
      );
    });

    it('člen saveGame → deleguje na service (userId, room)', () => {
      void controller.saveGame('camp-1', member);
      expect(service.saveGame).toHaveBeenCalledWith('u1', 'camp-1');
    });

    it('člen loadGame → deleguje na service (userId, username)', () => {
      void controller.loadGame(member);
      expect(service.loadGame).toHaveBeenCalledWith('u1', 'gandalf');
    });

    it('člen getRoomDefaults → deleguje na service', () => {
      void controller.getRoomDefaults(member);
      expect(service.getRoomDefaults).toHaveBeenCalled();
    });

    it('PUT rooms/:room/default: RolesGuard pustí jen Admin+ (hráč 403)', () => {
      const guard = new RolesGuard(new Reflector());
      const ctx = (role: UserRole): ExecutionContext =>
        ({
          getHandler: () => GlobalChatController.prototype.setRoomDefault,
          getClass: () => GlobalChatController,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        }) as unknown as ExecutionContext;
      expect(guard.canActivate(ctx(UserRole.Hrac))).toBe(false);
      expect(guard.canActivate(ctx(UserRole.Admin))).toBe(true);
      expect(guard.canActivate(ctx(UserRole.Superadmin))).toBe(true);
    });
  });
});
