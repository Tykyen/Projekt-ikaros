import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { EntitySchemaVersionsService } from './entity-schema-versions.service';
import { CreateEntitySchemaVersionDto } from './dto/create-entity-schema-version.dto';

/**
 * 16.2g F2 — per-svět schéma bestie/token pro „Vlastní Systém".
 * `?entityType=bestie|token` (default `bestie`).
 */
@ApiTags('entity-schema-versions')
@Controller('worlds/:worldId/entity-schema-versions')
export class EntitySchemaVersionsController {
  constructor(private readonly service: EntitySchemaVersionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seznam verzí schématu entity (member)' })
  @ApiResponse({ status: 200 })
  getVersions(
    @Param('worldId') worldId: string,
    @Query('entityType') entityType: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getMeta(worldId, entityType || 'bestie', user);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aktivní schéma entity (member)' })
  @ApiResponse({ status: 200 })
  getActive(
    @Param('worldId') worldId: string,
    @Query('entityType') entityType: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getActiveForMember(
      worldId,
      entityType || 'bestie',
      user,
    );
  }

  @Get(':version')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detail verze schématu entity (member)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  getVersion(
    @Param('worldId') worldId: string,
    @Param('version') version: string,
    @Query('entityType') entityType: string,
    @CurrentUser() user: RequestUser,
  ) {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 1) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'version musí být kladné celé číslo',
      });
    }
    return this.service.getVersion(worldId, entityType || 'bestie', v, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nová verze schématu entity světa (PJ+)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateEntitySchemaVersionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(worldId, dto, user);
  }
}
