/**
 * 10.2d-prep-B — Bestiae REST controller.
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
import { BestiaeService } from './bestiae.service';
import { CreateBestieDto } from './dto/create-bestie.dto';
import { UpdateBestieDto } from './dto/update-bestie.dto';
import { CloneBestieDto } from './dto/clone-bestie.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Controller('bestiae')
@UseGuards(JwtAuthGuard)
export class BestiaeController {
  constructor(private readonly service: BestiaeService) {}

  @Get()
  list(
    @Query('systemId') systemId: string,
    @Query('worldId') worldId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list(systemId, user, worldId);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post()
  create(@Body() dto: CreateBestieDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBestieDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.softDelete(id, user);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.restore(id, user);
  }

  @Post(':id/clone')
  clone(
    @Param('id') id: string,
    @Body() dto: CloneBestieDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.clone(id, dto, user);
  }
}
