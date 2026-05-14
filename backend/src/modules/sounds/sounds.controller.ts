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
import { RejectSoundDto } from './dto/reject-sound.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}

@ApiTags('Sounds')
@ApiBearerAuth()
@Controller('sounds')
@UseGuards(JwtAuthGuard)
export class SoundsController {
  constructor(private readonly service: SoundsService) {}

  @Get()
  @ApiOperation({ summary: 'Globálně schválené zvuky' })
  @ApiResponse({ status: 200 })
  findAll() {
    return this.service.findGlobal();
  }

  @Get('pending')
  @ApiOperation({ summary: 'Zvuky čekající na schválení (Admin+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async getPending(@CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.findGlobalPending();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail zvuku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string) {
    return this.service.findGlobalById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Přidání zvuku do globální databáze (Admin+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  async create(@Body() dto: CreateSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.createGlobalSound(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aktualizace zvuku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertIsAdmin(user.role);
    return this.service.updateGlobalSound(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Smazání zvuku' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.removeGlobalSound(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Schválení zvuku (Admin+)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.approveNomination(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Zamítnutí zvuku' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertIsAdmin(user.role);
    return this.service.rejectNomination(id, dto.reason);
  }
}
