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
import { SoundsService } from './sounds.service';
import { CreateSoundDto } from './dto/create-sound.dto';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}

@ApiTags('World Sounds')
@ApiBearerAuth()
@Controller('worlds/:worldId/sounds')
@UseGuards(JwtAuthGuard)
export class WorldSoundsController {
  constructor(private readonly service: SoundsService) {}

  @Get()
  @ApiOperation({ summary: 'Zvuky světa' })
  @ApiResponse({ status: 200 })
  findAll(@Param('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail world zvuku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.findOne(id, worldId);
  }

  @Post('import/:globalId')
  @ApiOperation({ summary: 'Import globálního zvuku do světa' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async importGlobal(
    @Param('worldId') worldId: string,
    @Param('globalId') globalId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.importToWorld(globalId, worldId, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Přidání zvuku do světa' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.createWorldSound(dto, worldId, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aktualizace world zvuku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
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
  @ApiOperation({ summary: 'Smazání world zvuku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.removeWorldSound(id, worldId);
  }

  @Post(':id/nominate')
  @ApiOperation({ summary: 'Nominace world zvuku pro globální databázi' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async nominate(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.nominateToGlobal(id, worldId, user.id);
  }
}
