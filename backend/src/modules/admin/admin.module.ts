import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PagesModule } from '../pages/pages.module';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [PagesModule, WorldsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
