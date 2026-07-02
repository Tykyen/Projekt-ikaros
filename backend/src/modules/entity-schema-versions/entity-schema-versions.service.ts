import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IEntitySchemaVersionsRepository } from './entity-schema-versions-repository.interface';
import type {
  EntitySchemaVersion,
  EntitySchemaVersionMeta,
} from './entity-schema-version.interface';
import type { CreateEntitySchemaVersionDto } from './dto/create-entity-schema-version.dto';
import { WorldsService } from '../worlds/worlds.service';
import type { RequestUser } from '../worlds/worlds.service';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import type {
  SystemEntitySchema,
  SystemEntityType,
  SchemaSection,
} from '../maps/schemas/system-entity-schema/system-entity-schema.types';

/**
 * 16.2g F2 — per-svět schéma bestie/token pro „Vlastní Systém".
 *
 * Read = member; create (nová verze, archivuje předchozí) = PJ+
 * (`WorldsService.assertCanAdminWorld`). `getActiveSchema` je interní (pro
 * `BestiaeService` validaci) — bez user gate.
 */
@Injectable()
export class EntitySchemaVersionsService {
  constructor(
    @Inject('IEntitySchemaVersionsRepository')
    private readonly repo: IEntitySchemaVersionsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly memberRepo: IWorldMembershipRepository,
    private readonly worldsService: WorldsService,
  ) {}

  async getMeta(
    worldId: string,
    entityType: string,
    requester: RequestUser,
  ): Promise<EntitySchemaVersionMeta[]> {
    await this.assertMember(worldId, requester);
    return this.repo.findMetaByWorld(worldId, entityType);
  }

  async getVersion(
    worldId: string,
    entityType: string,
    version: number,
    requester: RequestUser,
  ): Promise<EntitySchemaVersion> {
    await this.assertMember(worldId, requester);
    const v = await this.repo.findByWorldEntityVersion(
      worldId,
      entityType,
      version,
    );
    if (!v) throw new NotFoundException('Verze schématu nenalezena');
    return v;
  }

  async getActiveForMember(
    worldId: string,
    entityType: string,
    requester: RequestUser,
  ): Promise<EntitySchemaVersion | null> {
    await this.assertMember(worldId, requester);
    return this.repo.findActive(worldId, entityType);
  }

  /**
   * Interní — aktivní schéma jako `SystemEntitySchema` pro validaci bestií.
   * Bez user gate (volá se z `BestiaeService`, které si autorizaci řeší samo).
   */
  async getActiveSchema(
    worldId: string,
    entityType: SystemEntityType,
  ): Promise<SystemEntitySchema | null> {
    const v = await this.repo.findActive(worldId, entityType);
    if (!v) return null;
    return {
      systemId: v.system,
      entityType: v.entityType as SystemEntityType,
      version: v.version,
      sections: v.sections,
    };
  }

  async create(
    worldId: string,
    dto: CreateEntitySchemaVersionDto,
    requester: RequestUser,
  ): Promise<EntitySchemaVersion> {
    // PJ+ (stejná brána jako šablona deníku).
    const world = await this.worldsService.assertCanAdminWorld(
      worldId,
      requester,
    );

    const active = await this.repo.findActive(worldId, dto.entityType);
    if (active) {
      await this.repo.archive(worldId, dto.entityType, active.version);
    }
    const lastVersion = await this.repo.findLastVersion(
      worldId,
      dto.entityType,
    );
    return this.repo.create({
      worldId,
      entityType: dto.entityType,
      version: lastVersion + 1,
      system: world.system,
      sections: dto.sections as unknown as SchemaSection[],
      archivedAt: null,
    });
  }

  private async assertMember(
    worldId: string,
    requester: RequestUser,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const member = await this.memberRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!member) {
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'Do tohoto světa zatím nemáš přístup.',
      });
    }
  }
}
