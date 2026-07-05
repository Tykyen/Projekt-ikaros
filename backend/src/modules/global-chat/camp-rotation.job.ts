import { Injectable, Logger } from '@nestjs/common';
import { logError } from '../../common/logging/log-error.util';
import { Cron } from '@nestjs/schedule';
import { GlobalChatGateway } from './global-chat.gateway';
import { CAMP_ROOM_KEYS } from './global-chat.service';

/**
 * Spec 16.6a — auto-rotace scény Campu ve 12:00 a 00:00. Každé okno nastaví
 * v každém Campu default žánr (admin override → fallback `CAMP_DEFAULT_GENRE`)
 * + náhodnou lokaci a vyresetuje „Tady jste skončili". Tím se jakýkoli ruční
 * staff/load override „dojede" a scéna se vrátí na domovský žánr.
 */
@Injectable()
export class CampRotationJob {
  private readonly logger = new Logger(CampRotationJob.name);

  constructor(private readonly gateway: GlobalChatGateway) {}

  @Cron('0 0,12 * * *')
  async rotate(): Promise<void> {
    try {
      for (const room of CAMP_ROOM_KEYS) {
        await this.gateway.applyRotation(room);
      }
      this.logger.log(
        'CampRotation: scéna Campů rotována (default žánr + náhodná lokace)',
      );
    } catch (err) {
      logError(this.logger, 'CampRotation: chyba při rotaci scény', err);
    }
  }
}
