import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { NpcTemplatesService } from './npc-templates.service';
import { CreateNpcTemplateDto } from './dto/create-npc-template.dto';
import { UpdateNpcTemplateDto } from './dto/update-npc-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('worlds/:worldId/npc-templates')
export class NpcTemplatesController {
  constructor(private readonly service: NpcTemplatesService) {}

  @Get()
  findAll(@Param('worldId') worldId: string) {
    return this.service.findAll(worldId);
  }

  @Get(':id')
  findOne(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.findOne(id, worldId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
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
  async update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNpcTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.update(id, worldId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.remove(id, worldId);
  }
}
