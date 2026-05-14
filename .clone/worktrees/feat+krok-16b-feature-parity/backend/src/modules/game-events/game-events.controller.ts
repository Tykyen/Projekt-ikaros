import {
  Controller, Get, Post, Put, Delete, Param, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GameEventsService } from './game-events.service';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';
import type { GameEvent } from './interfaces/game-event.interface';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class GameEventsController {
  constructor(private readonly service: GameEventsService) {}

  @Get('world/:worldId')
  findByWorld(@Param('worldId') worldId: string): Promise<GameEvent[]> {
    return this.service.findByWorld(worldId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<GameEvent> {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateGameEventDto): Promise<GameEvent> {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGameEventDto,
  ): Promise<GameEvent> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.service.delete(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string): Promise<GameEvent> {
    return this.service.confirm(id);
  }
}
