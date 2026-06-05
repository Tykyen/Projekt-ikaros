import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosEventSchemaClass,
  IkarosEventSchema,
} from './schemas/ikaros-event.schema';
import { MongoIkarosEventRepository } from './repositories/ikaros-event.repository';
import { IkarosEventsService } from './ikaros-events.service';
import { IkarosEventsController } from './ikaros-events.controller';
import { IkarosEventsGateway } from './ikaros-events.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosEventSchemaClass.name, schema: IkarosEventSchema },
    ]),
  ],
  controllers: [IkarosEventsController],
  providers: [
    IkarosEventsService,
    IkarosEventsGateway,
    { provide: 'IIkarosEventRepository', useClass: MongoIkarosEventRepository },
  ],
})
export class IkarosEventsModule {}
