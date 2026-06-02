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
  CampaignShopGroupSchemaClass,
  CampaignShopGroupSchema,
} from './schemas/campaign-shop-group.schema';
import {
  CampaignPurchaseSchemaClass,
  CampaignPurchaseSchema,
} from './schemas/campaign-purchase.schema';
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
import { MongoCampaignShopGroupRepository } from './repositories/campaign-shop-group.repository';
import { MongoCampaignPurchaseRepository } from './repositories/campaign-purchase.repository';
import { CampaignPurchaseService } from './services/campaign-purchase.service';
import { CharacterSubdocsModule } from '../character-subdocs/character-subdocs.module';
import { WorldCurrenciesModule } from '../world-currencies/world-currencies.module';
import { CharactersModule } from '../characters/characters.module';
import { MongoCampaignChangeLogRepository } from './repositories/campaign-change-log.repository';
import {
  ScenarioTemplateSchemaClass,
  ScenarioTemplateSchema,
} from './schemas/scenario-template.schema';
import { MongoScenarioTemplateRepository } from './repositories/scenario-template.repository';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { ScenarioTemplatesController } from './scenario-templates.controller';
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
        name: CampaignShopGroupSchemaClass.name,
        schema: CampaignShopGroupSchema,
      },
      {
        name: CampaignPurchaseSchemaClass.name,
        schema: CampaignPurchaseSchema,
      },
      {
        name: CampaignChangeLogSchemaClass.name,
        schema: CampaignChangeLogSchema,
      },
      {
        name: ScenarioTemplateSchemaClass.name,
        schema: ScenarioTemplateSchema,
      },
    ]),
    WorldsModule,
    CharacterSubdocsModule,
    WorldCurrenciesModule,
    CharactersModule,
  ],
  controllers: [CampaignController, ScenarioTemplatesController],
  providers: [
    CampaignService,
    CampaignPurchaseService,
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
      provide: 'ICampaignShopGroupRepository',
      useClass: MongoCampaignShopGroupRepository,
    },
    {
      provide: 'ICampaignPurchaseRepository',
      useClass: MongoCampaignPurchaseRepository,
    },
    {
      provide: 'ICampaignChangeLogRepository',
      useClass: MongoCampaignChangeLogRepository,
    },
    {
      provide: 'IScenarioTemplateRepository',
      useClass: MongoScenarioTemplateRepository,
    },
  ],
})
export class CampaignModule {}
