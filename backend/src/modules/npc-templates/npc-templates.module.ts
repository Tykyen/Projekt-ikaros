import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NpcTemplateSchemaClass, NpcTemplateSchema } from './schemas/npc-template.schema';
import { MongoNpcTemplatesRepository } from './repositories/npc-templates.repository';
import { NpcTemplatesService } from './npc-templates.service';
import { NpcTemplatesController } from './npc-templates.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: NpcTemplateSchemaClass.name, schema: NpcTemplateSchema }]),
    WorldsModule,
  ],
  controllers: [NpcTemplatesController],
  providers: [
    NpcTemplatesService,
    { provide: 'INpcTemplatesRepository', useClass: MongoNpcTemplatesRepository },
  ],
  exports: [NpcTemplatesService, 'INpcTemplatesRepository'],
})
export class NpcTemplatesModule {}
