import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module';
import { CommunityNotifyService } from './community-notify.service';

/**
 * Komunitní oznámení do Discordu (nový svět / nová postava). Naslouchá eventům
 * přes @OnEvent (EventEmitterModule je globální). IUsersRepository je @Global;
 * WorldsModule importujeme kvůli IWorldsRepository (jméno světa v oznámení).
 */
@Module({
  imports: [WorldsModule],
  providers: [CommunityNotifyService],
})
export class CommunityNotifyModule {}
