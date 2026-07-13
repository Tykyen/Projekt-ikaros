import { ChatModerationEnforcementListener } from './moderation-enforcement.listener';
import {
  ModerationAction,
  ReportTargetType,
} from '../moderation/enums/moderation.enums';
import type { ModerationEnforcePayload } from '../moderation/events/moderation-events';

/**
 * D-066 (spec 20B B4b) — enforcement chatové zprávy: M2/M3 skryje
 * (`moderationHidden` + maska v repo `toEntity`), M4 smaže (soft delete jako
 * PJ mazání + WS `chat:message:deleted`), revert M2/M3 odkryje, revert M4 je
 * nevratný. Cizí targetType ignoruje; chyba service neshodí listener.
 */
describe('ChatModerationEnforcementListener', () => {
  const service = {
    moderationSetMessageHidden: jest.fn(),
    moderationRemoveMessage: jest.fn(),
  };
  const listener = new ChatModerationEnforcementListener(service as never);

  const payload = (
    action: ModerationAction,
    targetType: ReportTargetType = ReportTargetType.ChatMessage,
  ): ModerationEnforcePayload => ({
    targetType,
    targetId: 'msg1',
    targetAuthorId: 'u1',
    worldId: 'w1',
    action,
    decisionId: 'dec1',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.moderationSetMessageHidden.mockResolvedValue(true);
    service.moderationRemoveMessage.mockResolvedValue(true);
  });

  it.each([ModerationAction.HidePart, ModerationAction.HideTemp])(
    '%s skryje zprávu (moderationHidden=true + důvod s decisionId)',
    async (action) => {
      await listener.onEnforce(payload(action));
      expect(service.moderationSetMessageHidden).toHaveBeenCalledWith(
        'msg1',
        true,
        expect.stringContaining('dec1'),
      );
      expect(service.moderationRemoveMessage).not.toHaveBeenCalled();
    },
  );

  it('M4 smaže zprávu', async () => {
    await listener.onEnforce(payload(ModerationAction.Remove));
    expect(service.moderationRemoveMessage).toHaveBeenCalledWith('msg1');
    expect(service.moderationSetMessageHidden).not.toHaveBeenCalled();
  });

  it('revert M2/M3 zprávu odkryje (moderationHidden=false)', async () => {
    await listener.onRevert(payload(ModerationAction.HidePart));
    expect(service.moderationSetMessageHidden).toHaveBeenCalledWith(
      'msg1',
      false,
      undefined,
    );
  });

  it('revert M4 je nevratný — jen log, žádný zásah do dat', async () => {
    await listener.onRevert(payload(ModerationAction.Remove));
    expect(service.moderationRemoveMessage).not.toHaveBeenCalled();
    expect(service.moderationSetMessageHidden).not.toHaveBeenCalled();
  });

  it('cizí targetType (page) ignoruje', async () => {
    await listener.onEnforce(
      payload(ModerationAction.Remove, ReportTargetType.Page),
    );
    expect(service.moderationRemoveMessage).not.toHaveBeenCalled();
    expect(service.moderationSetMessageHidden).not.toHaveBeenCalled();
  });

  it('M5–M7 (account-level) ignoruje — řeší users listener', async () => {
    await listener.onEnforce(payload(ModerationAction.RestrictAccount));
    expect(service.moderationRemoveMessage).not.toHaveBeenCalled();
    expect(service.moderationSetMessageHidden).not.toHaveBeenCalled();
  });

  it('chyba service neshodí listener (best-effort)', async () => {
    service.moderationSetMessageHidden.mockRejectedValue(new Error('boom'));
    await expect(
      listener.onEnforce(payload(ModerationAction.HidePart)),
    ).resolves.toBeUndefined();
  });
});
