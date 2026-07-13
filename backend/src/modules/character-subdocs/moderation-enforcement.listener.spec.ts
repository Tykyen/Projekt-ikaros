import { CharacterDiaryModerationEnforcementListener } from './moderation-enforcement.listener';
import {
  ModerationAction,
  ReportTargetType,
} from '../moderation/enums/moderation.enums';
import type { ModerationEnforcePayload } from '../moderation/events/moderation-events';

/**
 * D-066 (spec 20B B4b) — enforcement deníku postavy: M2/M3 skryje
 * (`moderationHidden`), M4 smaže subdokument, revert M2/M3 odkryje, revert M4
 * je nevratný. Cizí targetType ignoruje; chyba service neshodí listener.
 */
describe('CharacterDiaryModerationEnforcementListener', () => {
  const service = {
    setDiaryModerationHidden: jest.fn(),
    moderationRemoveDiary: jest.fn(),
  };
  const listener = new CharacterDiaryModerationEnforcementListener(
    service as never,
  );

  const payload = (
    action: ModerationAction,
    targetType: ReportTargetType = ReportTargetType.CharacterDiary,
  ): ModerationEnforcePayload => ({
    targetType,
    targetId: 'char1',
    targetAuthorId: 'u1',
    worldId: 'w1',
    action,
    decisionId: 'dec1',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.setDiaryModerationHidden.mockResolvedValue(true);
    service.moderationRemoveDiary.mockResolvedValue(true);
  });

  it.each([ModerationAction.HidePart, ModerationAction.HideTemp])(
    '%s skryje deník (moderationHidden=true + důvod s decisionId)',
    async (action) => {
      await listener.onEnforce(payload(action));
      expect(service.setDiaryModerationHidden).toHaveBeenCalledWith(
        'char1',
        true,
        expect.stringContaining('dec1'),
      );
      expect(service.moderationRemoveDiary).not.toHaveBeenCalled();
    },
  );

  it('M4 smaže deníkový subdokument', async () => {
    await listener.onEnforce(payload(ModerationAction.Remove));
    expect(service.moderationRemoveDiary).toHaveBeenCalledWith('char1');
    expect(service.setDiaryModerationHidden).not.toHaveBeenCalled();
  });

  it('revert M2/M3 deník odkryje (moderationHidden=false)', async () => {
    await listener.onRevert(payload(ModerationAction.HideTemp));
    expect(service.setDiaryModerationHidden).toHaveBeenCalledWith(
      'char1',
      false,
      undefined,
    );
  });

  it('revert M4 je nevratný — jen log, žádný zásah do dat', async () => {
    await listener.onRevert(payload(ModerationAction.Remove));
    expect(service.moderationRemoveDiary).not.toHaveBeenCalled();
    expect(service.setDiaryModerationHidden).not.toHaveBeenCalled();
  });

  it('cizí targetType (bestie) ignoruje', async () => {
    await listener.onEnforce(
      payload(ModerationAction.Remove, ReportTargetType.Bestie),
    );
    expect(service.moderationRemoveDiary).not.toHaveBeenCalled();
    expect(service.setDiaryModerationHidden).not.toHaveBeenCalled();
  });

  it('M5–M7 (account-level) ignoruje — řeší users listener', async () => {
    await listener.onEnforce(payload(ModerationAction.TerminateAccount));
    expect(service.moderationRemoveDiary).not.toHaveBeenCalled();
    expect(service.setDiaryModerationHidden).not.toHaveBeenCalled();
  });

  it('chyba service neshodí listener (best-effort)', async () => {
    service.moderationRemoveDiary.mockRejectedValue(new Error('boom'));
    await expect(
      listener.onEnforce(payload(ModerationAction.Remove)),
    ).resolves.toBeUndefined();
  });
});
