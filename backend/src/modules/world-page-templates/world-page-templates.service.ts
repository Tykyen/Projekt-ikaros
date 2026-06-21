import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { IWorldPageTemplatesRepository } from './interfaces/world-page-templates-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { WorldPageTemplate } from './interfaces/world-page-template.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { worldAdminBypass } from '../../common/utils/world-elevation';
import { sanitizeRichText } from '../../common/utils/sanitize-rich-text';
import type { CreateWorldPageTemplateDto } from './dto/create-world-page-template.dto';
import type { UpdateWorldPageTemplateDto } from './dto/update-world-page-template.dto';

export interface TemplateRequester {
  id: string;
  role: UserRole;
  elevatedWorldIds?: string[];
}

@Injectable()
export class WorldPageTemplatesService {
  constructor(
    @Inject('IWorldPageTemplatesRepository')
    private readonly repo: IWorldPageTemplatesRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  /** GET — všichni přihlášení mohou číst seznam. */
  async findByWorld(worldId: string): Promise<WorldPageTemplate[]> {
    return this.repo.findByWorld(worldId);
  }

  async create(
    worldId: string,
    dto: CreateWorldPageTemplateDto,
    requester: TemplateRequester,
  ): Promise<WorldPageTemplate> {
    await this.assertCanManage(worldId, requester);
    const exists = await this.repo.existsByKey(worldId, dto.key);
    if (exists) {
      throw new ConflictException({
        code: 'TEMPLATE_KEY_TAKEN',
        message: `Šablona s klíčem '${dto.key}' už existuje v tomto světě`,
      });
    }
    return this.repo.save({
      worldId,
      key: dto.key,
      label: dto.label,
      headers: dto.headers,
      defaultTitle: dto.defaultTitle,
      // 15.5 — osnova je HTML co poteče do page.content → sanitizace u zdroje.
      contentOutline: dto.contentOutline
        ? sanitizeRichText(dto.contentOutline)
        : undefined,
      icon: dto.icon,
      order: dto.order ?? 0,
    });
  }

  async update(
    worldId: string,
    id: string,
    dto: UpdateWorldPageTemplateDto,
    requester: TemplateRequester,
  ): Promise<WorldPageTemplate> {
    await this.assertCanManage(worldId, requester);
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    if (existing.worldId !== worldId) {
      throw new ForbiddenException({
        code: 'TEMPLATE_WORLD_MISMATCH',
        message: 'Šablona nepatří do tohoto světa',
      });
    }
    // Key change → unique check (přeskočit, pokud `key` stejný jako existující).
    if (dto.key && dto.key !== existing.key) {
      const taken = await this.repo.existsByKey(worldId, dto.key);
      if (taken) {
        throw new ConflictException({
          code: 'TEMPLATE_KEY_TAKEN',
          message: `Šablona s klíčem '${dto.key}' už existuje`,
        });
      }
    }
    // 15.5 — sanitizace osnovy při změně; prázdný string = mazání osnovy.
    const patch =
      dto.contentOutline !== undefined
        ? {
            ...dto,
            contentOutline: dto.contentOutline
              ? sanitizeRichText(dto.contentOutline)
              : '',
          }
        : dto;
    const updated = await this.repo.update(id, patch);
    if (!updated) {
      // Race s delete — vyhodíme 404.
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    return updated;
  }

  async delete(
    worldId: string,
    id: string,
    requester: TemplateRequester,
  ): Promise<void> {
    await this.assertCanManage(worldId, requester);
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    if (existing.worldId !== worldId) {
      throw new ForbiddenException({
        code: 'TEMPLATE_WORLD_MISMATCH',
        message: 'Šablona nepatří do tohoto světa',
      });
    }
    await this.repo.delete(id);
  }

  /**
   * Permise: globální Admin/Superadmin vždy projdou; jinak musí být v world
   * membership s rolí >= Korektor (konzistentní s `Vzhled` tabem ve Settings —
   * šablony jsou meta-struktura světa).
   */
  private async assertCanManage(
    worldId: string,
    requester: TemplateRequester,
  ): Promise<void> {
    if (worldAdminBypass(requester, worldId)) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    }
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership || membership.role < WorldRole.Korektor) {
      throw new ForbiddenException({
        code: 'TEMPLATE_FORBIDDEN',
        message: 'Nedostatečná oprávnění pro správu šablon',
      });
    }
  }
}
