import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NpcTemplatesService } from './npc-templates.service';
import { CreateNpcTemplateDto } from './dto/create-npc-template.dto';
import { UpdateNpcTemplateDto } from './dto/update-npc-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
}

@ApiTags('NPC Templates')
@ApiBearerAuth()
@Controller('worlds/:worldId/npc-templates')
export class NpcTemplatesController {
  constructor(private readonly service: NpcTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Šablony NPC pro svět' })
  @ApiResponse({ status: 200 })
  findAll(@Param('worldId') worldId: string) {
    return this.service.findAll(worldId);
  }

  @Get('global')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Globální NPC bestiář (worldId=null)' })
  @ApiResponse({ status: 200 })
  findGlobal() {
    return this.service.findGlobal();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail NPC šablony' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.findOne(id, worldId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření NPC šablony (PJ/Admin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateNpcTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.create(dto, worldId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace NPC šablony' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNpcTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.update(id, worldId, {
      name: dto.name,
      imageUrl: dto.imageUrl,
      notes: dto.notes,
      maxHp: dto.maxHp,
      armor: dto.armor,
      injury: dto.injury,
      abilities: dto.abilities,
      diarySchema: dto.diarySchema,
      diaryData: dto.diaryData,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Smazání NPC šablony' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.remove(id, worldId);
  }

  @Post(':id/import')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Import globálního NPC do světa' })
  @ApiResponse({ status: 201 })
  async importToWorld(
    @Param('worldId') worldId: string,
    @Param('id') templateId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.importToWorld(templateId, worldId);
  }
}
