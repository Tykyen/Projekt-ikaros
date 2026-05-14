import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemPresetsService } from './system-presets.service';

@ApiTags('System Presets')
@Controller('system-presets')
export class SystemPresetsController {
  constructor(private readonly service: SystemPresetsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seznam všech systémů (anonymní, bez schema[] pro úsporu bandwidth)',
  })
  @ApiResponse({ status: 200 })
  findAll() {
    return this.service.findAll();
  }

  @Get(':system')
  @ApiOperation({ summary: 'Detail presetu (anonymní) — plné schema[]' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('system') system: string) {
    const preset = this.service.findOne(system);
    if (!preset) throw new NotFoundException('Systém nenalezen');
    return preset;
  }
}
