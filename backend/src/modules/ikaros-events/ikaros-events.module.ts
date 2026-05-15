import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosEventSchemaClass,
  IkarosEventSchema,
} from './schemas/ikaros-event.schema';
import { MongoIkarosEventRepository } from './repositories/ikaros-event.repository';
import { IkarosEventsService } from './ikaros-events.service';
import { IkarosEventsController } from './ikaros-events.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosEventSchemaClass.name, schema: IkarosEventSchema },
    ]),
  ],
  controllers: [IkarosEventsController],
  providers: [
    IkarosEventsService,
    { provide: 'IIkarosEventRepository', useClass: MongoIkarosEventRepository },
  ],
})
export class IkarosEventsModule {}
