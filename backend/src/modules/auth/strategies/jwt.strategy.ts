import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

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
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      characterPath: payload.characterPath,
    };
  }
}
