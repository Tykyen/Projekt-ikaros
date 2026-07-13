import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersModerationEnforcementListener } from './moderation-enforcement.listener';
import { ModerationAction } from '../moderation/enums/moderation.enums';
import type { ModerationEnforcePayload } from '../moderation/events/moderation-events';
import type { UserBanCacheService } from './services/user-ban-cache.service';

/**
 * D-065 — revert (overturned odvolání) smí odbanovat JEN účet zabanovaný TÍMTO
 * moderačním rozhodnutím. Nezávislý admin ban / novější moderační ban musí
 * revert přežít.
 */
describe('UsersModerationEnforcementListener', () => {
  const usersRepo = {
    findById: jest.fn(),
    update: jest.fn(),
  };
  const banCache = {
    set: jest.fn(),
    invalidate: jest.fn(),
  };
  const emitter = { emit: jest.fn() };

  const listener = new UsersModerationEnforcementListener(
    usersRepo as never,
    banCache as unknown as UserBanCacheService,
    emitter as unknown as EventEmitter2,
  );

  const revertPayload = (decisionId: string): ModerationEnforcePayload =>
    ({
      decisionId,
      action: ModerationAction.RestrictAccount,
      targetType: 'profile',
      targetId: 'u1',
      targetAuthorId: 'u1',
    }) as unknown as ModerationEnforcePayload;

  beforeEach(() => jest.clearAllMocks());

  it('ban ukládá zdroj `moderation:<decisionId>` do bannedBy', async () => {
    usersRepo.findById.mockResolvedValue({ id: 'u1' });
    usersRepo.update.mockResolvedValue({});

    await listener.onEnforce(revertPayload('dec1'));

    expect(usersRepo.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ bannedBy: 'moderation:dec1' }),
    );
  });

  it('revert odbanuje ban pocházející z tohoto rozhodnutí', async () => {
    usersRepo.findById.mockResolvedValue({
      id: 'u1',
      bannedAt: new Date(),
      bannedBy: 'moderation:dec1',
      banReason: 'Moderační zásah — rozhodnutí dec1',
    });
    usersRepo.update.mockResolvedValue({});

    await listener.onRevert(revertPayload('dec1'));

    expect(usersRepo.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ bannedAt: undefined, bannedBy: undefined }),
    );
    expect(banCache.invalidate).toHaveBeenCalledWith('u1');
  });

  it('revert NEodbanuje nezávislý admin ban (bannedBy = admin userId)', async () => {
    usersRepo.findById.mockResolvedValue({
      id: 'u1',
      bannedAt: new Date(),
      bannedBy: 'admin42',
      banReason: 'Podvod — ruční ban adminem',
    });

    await listener.onRevert(revertPayload('dec1'));

    expect(usersRepo.update).not.toHaveBeenCalled();
    expect(banCache.invalidate).not.toHaveBeenCalled();
  });

  it('revert NEodbanuje novější moderační ban (jiné decisionId — eskalace M5→M6)', async () => {
    usersRepo.findById.mockResolvedValue({
      id: 'u1',
      bannedAt: new Date(),
      bannedBy: 'moderation:dec2',
      banReason: 'Moderační zásah — rozhodnutí dec2',
    });

    await listener.onRevert(revertPayload('dec1'));

    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  it('revert odbanuje legacy moderační ban bez markeru (decisionId v banReason)', async () => {
    usersRepo.findById.mockResolvedValue({
      id: 'u1',
      bannedAt: new Date(),
      bannedBy: undefined,
      banReason:
        'Moderační zásah — dočasné omezení účtu (M5, 30 dní), rozhodnutí dec1',
    });
    usersRepo.update.mockResolvedValue({});

    await listener.onRevert(revertPayload('dec1'));

    expect(usersRepo.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ bannedAt: undefined }),
    );
  });

  // D-066 — content-level M2–M4: profil zůstává logWarn no-op; character_diary
  // a chat_message už users listener NEřeší (enforcement mají content moduly
  // character-subdocs / chat), takže žádný warn ani zásah do účtu.
  describe('content-level M2–M4 (D-066)', () => {
    const contentPayload = (
      targetType: string,
      action: ModerationAction,
    ): ModerationEnforcePayload =>
      ({
        decisionId: 'dec1',
        action,
        targetType,
        targetId: 't1',
        targetAuthorId: 'u1',
      }) as unknown as ModerationEnforcePayload;

    it('M2–M4 na profil jen zaloguje (logWarn zůstává, žádný ban)', async () => {
      const warnSpy = jest
        .spyOn(listener['logger'], 'warn')
        .mockImplementation(() => undefined);
      for (const action of [
        ModerationAction.HidePart,
        ModerationAction.HideTemp,
        ModerationAction.Remove,
      ]) {
        await listener.onEnforce(contentPayload('profile', action));
      }
      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(usersRepo.update).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it.each(['character_diary', 'chat_message'])(
      'M2–M4 na %s neřeší (enforcement má content modul) — žádný warn ani ban',
      async (targetType) => {
        const warnSpy = jest
          .spyOn(listener['logger'], 'warn')
          .mockImplementation(() => undefined);
        for (const action of [
          ModerationAction.HidePart,
          ModerationAction.HideTemp,
          ModerationAction.Remove,
        ]) {
          await listener.onEnforce(contentPayload(targetType, action));
        }
        expect(warnSpy).not.toHaveBeenCalled();
        expect(usersRepo.update).not.toHaveBeenCalled();
        expect(usersRepo.findById).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      },
    );
  });
});
