import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SoundsService } from './sounds.service';
import { CreateSoundDto } from './dto/create-sound.dto';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { RejectSoundDto } from './dto/reject-sound.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole; username: string }

@Controller('sounds')
@UseGuards(JwtAuthGuard)
export class SoundsController {
  constructor(private readonly service: SoundsService) {}

  @Get()
  findAll() {
    return this.service.findGlobal();
  }

  @Get('pending')
  async getPending(@CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.findGlobalPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findGlobalById(id);
  }

  @Post()
  async create(@Body() dto: CreateSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.createGlobalSound(dto, user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.updateGlobalSound(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.removeGlobalSound(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.approveNomination(id);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.rejectNomination(id, dto.reason);
  }
}
