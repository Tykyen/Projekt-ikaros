/**
 * 21.5a — Plants modul (herbář, komunitní katalog rostlin). Vzor: bestiae.module,
 * silně zjednodušeno — jen community scope, žádné boj/spawn/svět, žádný gateway,
 * žádné komentáře/statblok endpointy. JwtAuthGuard se resolvne z globálních
 * modulů (UsersModule/WorldElevationsModule), proto AuthModule netřeba importovat.
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlantSchema, PlantSchemaClass } from './schemas/plant.schema';
import { PlantsRepository } from './repositories/plants.repository';
import { PlantsService } from './plants.service';
import { PlantsController } from './plants.controller';
import { CommunityPlantReviewProvider } from './community-plant-review.provider';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlantSchemaClass.name, schema: PlantSchema },
    ]),
  ],
  controllers: [PlantsController],
  providers: [
    PlantsRepository,
    PlantsService,
    // 21.5a — pending fronta „rostliny ke schválení".
    CommunityPlantReviewProvider,
  ],
  exports: [PlantsService],
})
export class PlantsModule implements OnModuleInit {
  constructor(
    private readonly pendingActions: PendingActionsService,
    private readonly reviewProvider: CommunityPlantReviewProvider,
  ) {}

  /** 21.5a — registrace review provideru v globální PendingActionsService. */
  onModuleInit() {
    this.pendingActions.register(this.reviewProvider);
  }
}
