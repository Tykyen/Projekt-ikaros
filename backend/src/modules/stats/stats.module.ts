import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { PagesModule } from '../pages/pages.module';

@Module({
  imports: [PagesModule],
  controllers: [StatsController],
})
export class StatsModule {}
