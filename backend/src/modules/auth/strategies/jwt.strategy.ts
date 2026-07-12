import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../users/interfaces/user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        config.get<string>('JWT_SECRET') ??
        (() => {
          throw new Error('JWT_SECRET is not set');
        })(),
    });
  }

  validate(payload: Record<string, unknown>) {
    // 15.8 — host (guest) token: žádný DB účet, identita jen z claims.
    // `role: UserRole.Guest` (sentinel) → neprojde role gating; `isGuest`
    // říká GuestOrMemberGuard, ať pro hosta přeskočí member DB gate.
    if (payload.guest === true) {
      return {
        id: payload.sub,
        username: payload.username,
        role: UserRole.Guest,
        isGuest: true,
      };
    }
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      characterPath: payload.characterPath,
      // SESS (pentest PT-35e) — verze tokenu (undefined u starých tokenů bez claimu).
      tokenVersion: payload.tv as number | undefined,
    };
  }
}
