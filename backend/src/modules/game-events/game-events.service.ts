import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { GameEvent } from './interfaces/game-event.interface';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';

@Injectable()
export class GameEventsService {
  constructor(
    @Inject('IGameEventRepository') private readonly repo: IGameEventRepository,
  ) {}

  async findByWorld(worldId: string): Promise<GameEvent[]> {
    return this.repo.findByWorld(worldId);
  }

  async findOne(id: string): Promise<GameEvent> {
    const event = await this.repo.findOne(id);
    if (!event) throw new NotFoundException(`Event ${id} nenalezen`);
    return event;
  }

  async create(dto: CreateGameEventDto): Promise<GameEvent> {
    return this.repo.create({ ...dto, reminderSent: false });
  }

  async update(id: string, dto: UpdateGameEventDto): Promise<GameEvent> {
    await this.findOne(id);
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundException(`Event ${id} nenalezen`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  async confirm(id: string): Promise<GameEvent> {
    await this.findOne(id);
    const updated = await this.repo.confirm(id);
    if (!updated) throw new NotFoundException(`Event ${id} nenalezen`);
    return updated;
  }
}
