/**
 * 21.5a — Plants REST controller (herbář). Community routy pod `plants/community/*`.
 *
 * POZOR na pořadí rout: statické `community` segmenty MUSÍ být před dynamickým
 * `:id` (parity s bestiae). Zde jsou VŠECHNY routy `community/*`, takže kolize
 * nehrozí, ale konvenci držíme kvůli budoucím rootovým routám.
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
import { PlantsService } from './plants.service';
import { CreatePlantDto } from './dto/create-plant.dto';
import { UpdatePlantDto } from './dto/update-plant.dto';
import type { PlantRarity } from './interfaces/plant.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('plants')
@UseGuards(JwtAuthGuard)
export class PlantsController {
  constructor(private readonly service: PlantsService) {}

  @Get('community')
  list(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('rarity') rarity: PlantRarity | undefined,
    @Query('tag') tag: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list({ status, rarity, tag }, user);
  }

  @Get('community/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post('community')
  create(@Body() dto: CreatePlantDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch('community/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlantDto,
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
