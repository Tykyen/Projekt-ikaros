import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateScenarioTemplateDto } from './dto/create-scenario-template.dto';
import type { IScenarioTemplateRepository } from './interfaces/scenario-template-repository.interface';
import type { ScenarioTemplate } from './interfaces/scenario-template.interface';

interface RequestUser {
  id: string;
  role: UserRole;
}

/**
 * 11.2-ext E — knihovna scén (šablony). Per-PJ cross-world, vzor MapTemplate.
 * Role gate: PJ+ (`role <= UserRole.PJ`); Admin+ vidí všechny.
 */
@Controller('scenario-templates')
@UseGuards(JwtAuthGuard)
export class ScenarioTemplatesController {
  constructor(
    @Inject('IScenarioTemplateRepository')
    private readonly repo: IScenarioTemplateRepository,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser): Promise<ScenarioTemplate[]> {
    if (user.role <= UserRole.Admin) {
      return this.repo.findAll();
    }
    return this.repo.findByOwner(user.id);
  }

  @Post()
  async create(
    @Body() dto: CreateScenarioTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScenarioTemplate> {
    if (user.role > UserRole.PJ) {
      throw new ForbiddenException({
        code: 'SCENARIO_TEMPLATE_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return this.repo.create({ ...dto, ownerId: user.id });
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    if (user.role > UserRole.PJ) {
      throw new ForbiddenException({
        code: 'SCENARIO_TEMPLATE_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        code: 'SCENARIO_TEMPLATE_NOT_FOUND',
        message: 'Šablona nenalezena',
      });
    }
    if (user.role > UserRole.Admin && existing.ownerId !== user.id) {
      throw new ForbiddenException({
        code: 'SCENARIO_TEMPLATE_FORBIDDEN_OWNER',
        message: 'Šablona patří jinému PJ',
      });
    }
    await this.repo.delete(id);
  }
}
