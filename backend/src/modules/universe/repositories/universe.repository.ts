import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniverseMapSchemaClass } from '../schemas/universe-map.schema';
import type {
  UniverseMap,
  UniverseNode,
  UniverseLink,
  UniverseNodeType,
} from '../interfaces/universe-map.interface';
import type { IUniverseRepository } from '../interfaces/universe-repository.interface';

@Injectable()
export class MongoUniverseRepository implements IUniverseRepository {
  constructor(
    @InjectModel(UniverseMapSchemaClass.name)
    private readonly model: Model<UniverseMapSchemaClass>,
  ) {}

  async findByWorld(worldId: string): Promise<UniverseMap | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async upsert(
    worldId: string,
    nodes: UniverseNode[],
    links: UniverseLink[],
  ): Promise<UniverseMap> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId },
        { $set: { nodes, links } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async updateNodeVisibility(
    worldId: string,
    nodeId: string,
    isPublic: boolean,
    visibleToPlayerIds: string[],
  ): Promise<UniverseMap | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    if (!doc) return null;

    const nodes = doc.nodes ?? [];
    const nodeIndex = nodes.findIndex((n) => n['id'] === nodeId);
    if (nodeIndex === -1) return null;

    const updated = await this.model
      .findOneAndUpdate(
        { worldId, 'nodes.id': nodeId },
        {
          $set: {
            'nodes.$.isPublic': isPublic,
            'nodes.$.visibleToPlayerIds': visibleToPlayerIds,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return updated
      ? this.toEntity(updated as unknown as Record<string, unknown>)
      : null;
  }

  private toEntity(doc: Record<string, unknown>): UniverseMap {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      nodes: ((doc.nodes as Record<string, unknown>[]) ?? []).map((n) => ({
        id: n['id'] as string,
        name: n['name'] as string,
        type: n['type'] as UniverseNodeType | undefined,
        color: (n['color'] as string) ?? '#ffffff',
        size: (n['size'] as number) ?? 5,
        img: n['img'] as string | undefined,
        alliance: n['alliance'] as string | undefined,
        x: n['x'] as number | undefined,
        y: n['y'] as number | undefined,
        z: n['z'] as number | undefined,
        isPublic: (n['isPublic'] as boolean) ?? false,
        visibleToPlayerIds: (n['visibleToPlayerIds'] as string[]) ?? [],
      })),
      links: ((doc.links as Record<string, unknown>[]) ?? []).map((l) => ({
        source: l['source'] as string,
        target: l['target'] as string,
        isOrbit: (l['isOrbit'] as boolean) ?? false,
      })),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
