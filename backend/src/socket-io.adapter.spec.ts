import { wsAccountGate } from './socket-io.adapter';
import type { JwtService } from '@nestjs/jwt';
import type { UserBanCacheService } from './modules/users/services/user-ban-cache.service';
import type { Socket } from 'socket.io';

function mockSocket(auth: Record<string, unknown>): Pick<Socket, 'handshake'> {
  return { handshake: { auth } } as unknown as Pick<Socket, 'handshake'>;
}

/**
 * FIX-A část 1 (2026-07, WS reconnect-gate) — middleware musí odmítnout
 * handshake pro banned/deleted účty (`isBlocked`), ale NESMÍ rozbít guest
 * flow (žádný User účet) ani stávající tolerantní chování pro chybějící/
 * neplatný token (jiné gateways si ho stejně odmítnou samy).
 */
describe('wsAccountGate', () => {
  let jwtService: { verify: jest.Mock };
  let banCache: { isBlocked: jest.Mock };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    banCache = { isBlocked: jest.fn() };
  });

  it('bez tokenu → propustí (null), isBlocked se nevolá', async () => {
    const result = await wsAccountGate(
      mockSocket({}),
      jwtService as unknown as JwtService,
      banCache as unknown as UserBanCacheService,
    );
    expect(result).toBeNull();
    expect(banCache.isBlocked).not.toHaveBeenCalled();
  });

  it('neplatný/expirovaný token → propustí (null), nechá na per-gateway verify', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const result = await wsAccountGate(
      mockSocket({ token: 'garbage' }),
      jwtService as unknown as JwtService,
      banCache as unknown as UserBanCacheService,
    );
    expect(result).toBeNull();
    expect(banCache.isBlocked).not.toHaveBeenCalled();
  });

  it('guest token (guest:true) → propustí BEZ ban kontroly', async () => {
    jwtService.verify.mockReturnValue({ sub: 'anon1', guest: true });
    const result = await wsAccountGate(
      mockSocket({ token: 'guest-tok' }),
      jwtService as unknown as JwtService,
      banCache as unknown as UserBanCacheService,
    );
    expect(result).toBeNull();
    expect(banCache.isBlocked).not.toHaveBeenCalled();
  });

  it('platný token, účet OK → propustí (null)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'u1' });
    banCache.isBlocked.mockResolvedValue(false);
    const result = await wsAccountGate(
      mockSocket({ token: 'tok' }),
      jwtService as unknown as JwtService,
      banCache as unknown as UserBanCacheService,
    );
    expect(result).toBeNull();
    expect(banCache.isBlocked).toHaveBeenCalledWith('u1');
  });

  it('platný token, banned/deleted účet → vrátí Error (handshake se odmítne)', async () => {
    jwtService.verify.mockReturnValue({ sub: 'banned-u' });
    banCache.isBlocked.mockResolvedValue(true);
    const result = await wsAccountGate(
      mockSocket({ token: 'tok' }),
      jwtService as unknown as JwtService,
      banCache as unknown as UserBanCacheService,
    );
    expect(result).toBeInstanceOf(Error);
    expect(banCache.isBlocked).toHaveBeenCalledWith('banned-u');
  });

  it('token bez sub → propustí (null)', async () => {
    jwtService.verify.mockReturnValue({});
    const result = await wsAccountGate(
      mockSocket({ token: 'tok' }),
      jwtService as unknown as JwtService,
      banCache as unknown as UserBanCacheService,
    );
    expect(result).toBeNull();
    expect(banCache.isBlocked).not.toHaveBeenCalled();
  });
});
