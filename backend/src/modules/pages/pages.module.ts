import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PageSchemaClass, PageSchema } from './schemas/page.schema';
import { MongoPagesRepository } from './repositories/pages.repository';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';
import { WorldsModule } from '../worlds/worlds.module';
import { TipTapExtractor } from './tiptap-extractor.service';
import { PagesWorldSeedListener } from './pages-world-seed.listener';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PageSchemaClass.name, schema: PageSchema },
    ]),
    forwardRef(() => WorldsModule),
  ],
  controllers: [PagesController],
  providers: [
    PagesService,
    TipTapExtractor,
    { provide: 'IPagesRepository', useClass: MongoPagesRepository },
    PagesWorldSeedListener,
  ],
  exports: [PagesService, 'IPagesRepository'],
})
export class PagesModule {}
