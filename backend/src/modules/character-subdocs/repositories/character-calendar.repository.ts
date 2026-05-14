import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterCalendarSchemaClass } from '../schemas/character-calendar.schema';
import {
  CharacterCalendar,
  CalendarDisplaySettings,
} from '../interfaces/character-calendar.interface';

@Injectable()
export class CharacterCalendarRepository {
  constructor(
    @InjectModel(CharacterCalendarSchemaClass.name)
    private readonly model: Model<CharacterCalendarSchemaClass>,
  ) {}

  async findByCharacterId(
    characterId: string,
  ): Promise<CharacterCalendar | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByWorldId(worldId: string): Promise<CharacterCalendar[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async create(
    characterId: string,
    worldId: string,
  ): Promise<CharacterCalendar> {
    const created = new this.model({
      characterId,
      worldId,
      color: '#3B82F6',
      displaySettings: {},
      events: [],
    });
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    characterId: string,
    data: Partial<CharacterCalendar>,
  ): Promise<CharacterCalendar | null> {
    const doc = await this.model
      .findOneAndUpdate({ characterId }, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterCalendar {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      worldId: doc.worldId as string,
      color: (doc.color as string) ?? '#3B82F6',
      displaySettings: (doc.displaySettings as CalendarDisplaySettings) ?? {},
      events: ((doc.events as Record<string, unknown>[]) ?? []).map((e) => ({
        id: e.id as string,
        title: (e.title as string) ?? '',
        start: e.start as string | undefined,
        end: e.end as string | undefined,
        allDay: e.allDay as boolean | undefined,
        hourStart: e.hourStart as string | undefined,
        hourEnd: e.hourEnd as string | undefined,
        description: e.description as string | undefined,
      })),
    };
  }
}
