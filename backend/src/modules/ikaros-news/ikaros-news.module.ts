import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosNewsSchemaClass,
  IkarosNewsSchema,
} from './schemas/ikaros-news.schema';
import { MongoIkarosNewsRepository } from './repositories/ikaros-news.repository';
import { IkarosNewsService } from './ikaros-news.service';
import { IkarosNewsController } from './ikaros-news.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosNewsSchemaClass.name, schema: IkarosNewsSchema },
    ]),
  ],
  controllers: [IkarosNewsController],
  providers: [
    IkarosNewsService,
    { provide: 'IIkarosNewsRepository', useClass: MongoIkarosNewsRepository },
  ],
})
export class IkarosNewsModule {}
