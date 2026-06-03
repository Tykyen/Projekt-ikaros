import { Module, forwardRef } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';
import { PresenceGateway } from './presence.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  // N-5 — AuthModule poskytuje JwtService pro PresenceGateway.handleConnection
  // (verifikace handshake tokenu). forwardRef kvůli možnému cyklu přes AuthModule.
  imports: [forwardRef(() => AuthModule)],
  controllers: [PresenceController],
  providers: [PresenceService, PresenceGateway],
})
export class PresenceModule {}
