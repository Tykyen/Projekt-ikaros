import { Module } from '@nestjs/common';
import { SystemPresetsController } from './system-presets.controller';
import { SystemPresetsService } from './system-presets.service';

@Module({
  controllers: [SystemPresetsController],
  providers: [SystemPresetsService],
  exports: [SystemPresetsService],
})
export class SystemPresetsModule {}
