import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CampaignSubjectSchemaClass,
  CampaignSubjectSchema,
} from './schemas/campaign-subject.schema';
import {
  CampaignRelationshipSchemaClass,
  CampaignRelationshipSchema,
} from './schemas/campaign-relationship.schema';
import {
  CampaignStorylineSchemaClass,
  CampaignStorylineSchema,
} from './schemas/campaign-storyline.schema';
import {
  CampaignScenarioSchemaClass,
  CampaignScenarioSchema,
} from './schemas/campaign-scenario.schema';
import {
  CampaignQuickNoteSchemaClass,
  CampaignQuickNoteSchema,
} from './schemas/campaign-quick-note.schema';
import {
  CampaignShopItemSchemaClass,
  CampaignShopItemSchema,
} from './schemas/campaign-shop-item.schema';
import {
  CampaignChangeLogSchemaClass,
  CampaignChangeLogSchema,
} from './schemas/campaign-change-log.schema';
import { MongoCampaignSubjectRepository } from './repositories/campaign-subject.repository';
import { MongoCampaignRelationshipRepository } from './repositories/campaign-relationship.repository';
import { MongoCampaignStorylineRepository } from './repositories/campaign-storyline.repository';
import { MongoCampaignScenarioRepository } from './repositories/campaign-scenario.repository';
import { MongoCampaignQuickNoteRepository } from './repositories/campaign-quick-note.repository';
import { MongoCampaignShopItemRepository } from './repositories/campaign-shop-item.repository';
import { MongoCampaignChangeLogRepository } from './repositories/campaign-change-log.repository';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CampaignSubjectSchemaClass.name, schema: CampaignSubjectSchema },
      {
        name: CampaignRelationshipSchemaClass.name,
        schema: CampaignRelationshipSchema,
      },
      {
        name: CampaignStorylineSchemaClass.name,
        schema: CampaignStorylineSchema,
      },
      {
        name: CampaignScenarioSchemaClass.name,
        schema: CampaignScenarioSchema,
      },
      {
        name: CampaignQuickNoteSchemaClass.name,
        schema: CampaignQuickNoteSchema,
      },
      {
        name: CampaignShopItemSchemaClass.name,
        schema: CampaignShopItemSchema,
      },
      {
        name: CampaignChangeLogSchemaClass.name,
        schema: CampaignChangeLogSchema,
      },
    ]),
    WorldsModule,
  ],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    {
      provide: 'ICampaignSubjectRepository',
      useClass: MongoCampaignSubjectRepository,
    },
    {
      provide: 'ICampaignRelationshipRepository',
      useClass: MongoCampaignRelationshipRepository,
    },
    {
      provide: 'ICampaignStorylineRepository',
      useClass: MongoCampaignStorylineRepository,
    },
    {
      provide: 'ICampaignScenarioRepository',
      useClass: MongoCampaignScenarioRepository,
    },
    {
      provide: 'ICampaignQuickNoteRepository',
      useClass: MongoCampaignQuickNoteRepository,
    },
    {
      provide: 'ICampaignShopItemRepository',
      useClass: MongoCampaignShopItemRepository,
    },
    {
      provide: 'ICampaignChangeLogRepository',
      useClass: MongoCampaignChangeLogRepository,
    },
  ],
})
export class CampaignModule {}
