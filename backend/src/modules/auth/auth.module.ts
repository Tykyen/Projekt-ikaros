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
          // PC-12: kratší access TTL (dřív 7d) — okno zneužití ukradeného tokenu
          // 7× menší; refresh rotace (cookie/30d) drží uživatele přihlášeného.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '1d') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
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
