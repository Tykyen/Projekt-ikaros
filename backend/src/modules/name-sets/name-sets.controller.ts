/**
 * 21.2a — NameSets REST controller. Community routy pod `name-sets/community/*`.
 * Celý controller login-required (parita rodiny Společné tvorby).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { NameSetsService } from './name-sets.service';
import { CreateNameSetDto } from './dto/create-name-set.dto';
import { UpdateNameSetDto } from './dto/update-name-set.dto';
import type { NameSetCategory } from './interfaces/name-set.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('name-sets')
@UseGuards(JwtAuthGuard)
export class NameSetsController {
  constructor(private readonly service: NameSetsService) {}

  @Get('community')
  list(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('category') category: NameSetCategory | undefined,
    @Query('tag') tag: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list({ status, category, tag }, user);
  }

  @Get('community/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post('community')
  create(@Body() dto: CreateNameSetDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch('community/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNameSetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post('community/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user);
  }

  @Delete('community/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.remove(id, user);
  }
}
