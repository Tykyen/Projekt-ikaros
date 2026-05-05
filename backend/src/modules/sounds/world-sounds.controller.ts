import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SoundsService } from './sounds.service';
import { CreateSoundDto } from './dto/create-sound.dto';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole; username: string }

@Controller('worlds/:worldId/sounds')
@UseGuards(JwtAuthGuard)
export class WorldSoundsController {
  constructor(private readonly service: SoundsService) {}

  @Get()
  findAll(@Param('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Get(':id')
  findOne(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.findOne(id, worldId);
  }

  @Post('import/:globalId')
  async importGlobal(
    @Param('worldId') worldId: string,
    @Param('globalId') globalId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.importToWorld(globalId, worldId, user.id);
  }

  @Post()
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.createWorldSound(dto, worldId, user.id);
  }

  @Put(':id')
  async update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.updateWorldSound(id, worldId, dto);
  }

  @Delete(':id')
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.removeWorldSound(id, worldId);
  }

  @Post(':id/nominate')
  async nominate(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.nominateToGlobal(id, worldId, user.id);
  }
}
