import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { TwoFactorController } from './two-factor.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { TotpService } from './services/totp.service';
import { TotpCryptoService } from './services/totp-crypto.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { TrustedDevicesModule } from '../trusted-devices/trusted-devices.module';
import {
  RefreshTokenSchemaClass,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { MongoRefreshTokenRepository } from './repositories/refresh-token.repository';

@Module({
  imports: [
    UsersModule,
    TrustedDevicesModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ??
          (() => {
            throw new Error('JWT_SECRET is not set');
          })(),
        signOptions: {
          // Access TTL 3 dny (uživatelské rozhodnutí 2026-06-21): pohodlí vs.
          // bezpečnost — i bez funkčního refreshe vydrží uživatel 3 dny. Refresh
          // rotace (cookie, sliding 3d) drží AKTIVNÍHO uživatele přihlášeného dál;
          // 3 dny nečinnosti = odhlášení. (Pozn.: delší access = větší okno pro
          // zneužití ukradeného tokenu — vědomý trade-off, dřív PC-12 mělo 1d.)
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '3d') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: RefreshTokenSchemaClass.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    CaptchaService,
    TotpService,
    TotpCryptoService,
    JwtStrategy,
    {
      provide: 'IRefreshTokenRepository',
      useClass: MongoRefreshTokenRepository,
    },
  ],
  exports: [JwtModule, 'IRefreshTokenRepository'],
})
export class AuthModule {}
