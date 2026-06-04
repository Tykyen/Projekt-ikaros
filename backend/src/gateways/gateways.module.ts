import { Module, forwardRef } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { ChatModule } from '../modules/chat/chat.module';

// R-04 — AppGateway potřebuje ChatService pro access gate na `room:join chat:{id}`.
// forwardRef je defenzivní pojistka proti scan-time pořadí (ChatModule táhne
// rozsáhlý graf přes forwardRef WorldsModule).
@Module({
  imports: [forwardRef(() => ChatModule)],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class GatewaysModule {}
