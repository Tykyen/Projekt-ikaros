import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { MapSceneSchemaClass } from '../schemas/map-scene.schema';
import type {
  MapScene,
  HexConfig,
  MapToken,
  MapSceneNpc,
  MapEffect,
  MapDrawing,
  MapWall,
  MapLight,
  HexCoord,
  ScenePlayerState,
} from '../interfaces/map-scene.interface';
import type { IMapsRepository } from '../interfaces/maps-repository.interface';

@Injectable()
export class MongoMapsRepository
  extends BaseMongoRepository<MapScene>
  implements IMapsRepository
{
  constructor(
    @InjectModel(MapSceneSchemaClass.name) model: Model<MapSceneSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<MapScene[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findActiveByWorld(worldId: string): Promise<MapScene | null> {
    const doc = await this.model
      .findOne({ worldId, isActive: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findById(id: string): Promise<MapScene | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Partial<MapScene>): Promise<MapScene> {
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  // 10.2c-edit-3 — uvolněná isActive semantika dovoluje víc paralelně
  // aktivních scén ve světě (per memory project_takticka_mapa_assignment).
  // Dřívější updateMany({worldId, isActive: true}, {isActive: false})
  // deaktivoval všechny ostatní → "+ Nová" v PJ panelu pak nahradila
  // současné aktivní scény místo přidání další. Bug fix:
  // worldId param zůstává v signatuře pro BC s controller (ale neuse).
  async setActive(id: string, _worldId: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { $set: { isActive: true } }).exec();
  }

  async replace(id: string, data: Partial<MapScene>): Promise<MapScene | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { ...data, lastModified: new Date() },
        { new: true, overwrite: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  /**
   * 10.2-prep-1 — atomic update. `updateOne` s arbitrary Mongo update operators.
   * `lastModified` se NEnastavuje automaticky — volající si přidá `$set lastModified`
   * pokud chce. (Operations API tak činí v každém update.)
   *
   * Filter i update přicházejí jako `Record<string, unknown>` (raw Mongo) —
   * Mongoose `updateOne` umí konzumovat raw objekty.
   */
  async atomicUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const result = await this.model.updateOne(filter, update).exec();
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  /**
   * 10.2-prep-1 — list aktivních scén ve světě. PJ orchestrator panel
   * `GET /maps?worldId=&isActive=true` zobrazí všechny.
   */
  async findActiveScenesByWorld(worldId: string): Promise<MapScene[]> {
    const docs = await this.model
      .find({ worldId, isActive: true })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  protected toEntity(doc: Record<string, unknown>): MapScene {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: (doc.name as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? '',
      folder: doc.folder as string | undefined,
      config: (doc.config as HexConfig) ?? {
        size: 40,
        originX: 0,
        originY: 0,
        showGrid: true,
      },
      tokens: ((doc.tokens as Record<string, unknown>[]) ?? []).map((t) =>
        this.toToken(t),
      ),
      npcTemplates: ((doc.npcTemplates as Record<string, unknown>[]) ?? []).map(
        (n) => this.toSceneNpc(n),
      ),
      effects: (doc.effects as MapEffect[]) ?? [],
      drawings: (doc.drawings as MapDrawing[]) ?? [],
      // 17.2 — walls/lights musí být ve whitelistu, jinak GET vrací [] (field-drift).
      walls: (doc.walls as MapWall[]) ?? [],
      lights: (doc.lights as MapLight[]) ?? [],
      fogEnabled: (doc.fogEnabled as boolean) ?? false,
      revealedHexes: (doc.revealedHexes as HexCoord[]) ?? [],
      templateId: doc.templateId as string | undefined,
      isActive: (doc.isActive as boolean) ?? false,
      isHidden: (doc.isHidden as boolean) ?? false,
      isLocked: (doc.isLocked as boolean) ?? false,
      // 10.2n — per-hráč override skrytí/zámku.
      playerStates: ((doc.playerStates as Record<string, unknown>[]) ?? []).map(
        (p) => this.toPlayerState(p),
      ),
      activeSoundIds: (doc.activeSoundIds as string[]) ?? [],
      lastModified: doc.lastModified as Date | undefined,
      lastSeqNumber: (doc.lastSeqNumber as number | undefined) ?? 0,
      combat:
        (doc.combat as Record<string, unknown> | null | undefined) ?? null,
      // 10.2c-edit-7 — per-scéna whitelist (PJ orchestrace).
      activeCharacterIds: (doc.activeCharacterIds as string[]) ?? [],
      activeBestieIds: (doc.activeBestieIds as string[]) ?? [],
      // 10.2j — D-bug-audit N-25: diceRolls byl ve schématu, ale chyběl ve
      // whitelist mapperu → log hodů se po reloadu/refetchi mazal.
      diceRolls: (doc.diceRolls as Record<string, unknown>[]) ?? [],
    };
  }

  private toToken(t: Record<string, unknown>): MapToken {
    return {
      id: (t.id as string) ?? '',
      characterId: (t.characterId as string) ?? '',
      characterSlug: (t.characterSlug as string) ?? '',
      q: (t.q as number) ?? 0,
      r: (t.r as number) ?? 0,
      isNpc: (t.isNpc as boolean) ?? false,
      templateId: t.templateId as string | undefined,
      instanceName: t.instanceName as string | undefined,
      currentHp: (t.currentHp as number) ?? 0,
      maxHp: (t.maxHp as number) ?? 0,
      baseHp: (t.baseHp as number) ?? 0,
      armor: (t.armor as number) ?? 0,
      baseArmor: (t.baseArmor as number) ?? 0,
      injury: (t.injury as number) ?? 0,
      initiative: (t.initiative as number) ?? 0,
      initiativeBase: (t.initiativeBase as number) ?? 0,
      inCombat: (t.inCombat as boolean) ?? false,
      // D-066 — per-token lock. Bez tohoto mapování GET token.update zahodí
      // (write do Mixed schema projde, ale read-mapper pole vynechal) → UI
      // se „zamkne a hned odemkne" po refetchi. Field-drift fix.
      isLocked: (t.isLocked as boolean) ?? false,
      movement: (t.movement as number) ?? 5,
      abilities: (t.abilities as { name: string; description: string }[]) ?? [],
      // Per-instance poznámky bestie tokenu. Bez tohoto mapování by GET token
      // notes zahodil (write do Mixed projde, read-mapper vynechá) — field-drift
      // past viz [[project_map_token_tomapper_whitelist]].
      notes: t.notes as string | undefined,
      // 10.2d-prep-A — per-system staty (health.current/max, armor, …). Whitelist
      // mapper je dosud VYNECHÁVAL → bestie HP (health.current) se zapsalo, ale
      // GET ho zahodil a HP padalo zpět na stale currentHp/maxHp. Stejná drift
      // past jako notes výše.
      systemStats: t.systemStats as Record<string, unknown> | undefined,
      personalDiarySchema: t.personalDiarySchema as
        | Record<string, unknown>[]
        | undefined,
      customData: (t.customData as Record<string, unknown>) ?? {},
    };
  }

  private toPlayerState(p: Record<string, unknown>): ScenePlayerState {
    const entry: ScenePlayerState = { userId: (p.userId as string) ?? '' };
    if (typeof p.isHidden === 'boolean') entry.isHidden = p.isHidden;
    if (typeof p.isLocked === 'boolean') entry.isLocked = p.isLocked;
    return entry;
  }

  private toSceneNpc(n: Record<string, unknown>): MapSceneNpc {
    return {
      id: (n.id as string) ?? '',
      originTemplateId: n.originTemplateId as string | undefined,
      name: (n.name as string) ?? '',
      imageUrl: n.imageUrl as string | undefined,
      notes: (n.notes as string) ?? '',
      maxHp: (n.maxHp as number) ?? 5,
      armor: (n.armor as number) ?? 0,
      injury: (n.injury as number) ?? 0,
      movement: (n.movement as number) ?? 5,
      initiativeBase: (n.initiativeBase as number) ?? 0,
      abilities: (n.abilities as { label: string; value: string }[]) ?? [],
      personalDiarySchema: n.personalDiarySchema as
        | Record<string, unknown>[]
        | undefined,
      customData: (n.customData as Record<string, unknown>) ?? {},
    };
  }
}
