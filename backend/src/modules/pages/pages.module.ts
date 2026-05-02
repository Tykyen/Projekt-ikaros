import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PageSchemaClass, PageSchema } from './schemas/page.schema';
import { MongoPagesRepository } from './repositories/pages.repository';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PageSchemaClass.name, schema: PageSchema }]),
    WorldsModule,
  ],
  controllers: [PagesController],
  providers: [
    PagesService,
    { provide: 'IPagesRepository', useClass: MongoPagesRepository },
  ],
  exports: [PagesService, 'IPagesRepository'],
})
export class PagesModule {}
