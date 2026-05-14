import { Global, Module } from '@nestjs/common';
import { PendingActionsController } from './pending-actions.controller';
import { PendingActionsService } from './pending-actions.service';

/**
 * Spec 1.4 — global modul (provider registry potřebují další moduly při
 * `onModuleInit()`). Žádné DB schema — providery drží data ve svých modulech.
 */
@Global()
@Module({
  controllers: [PendingActionsController],
  providers: [PendingActionsService],
  exports: [PendingActionsService],
})
export class PendingActionsModule {}
