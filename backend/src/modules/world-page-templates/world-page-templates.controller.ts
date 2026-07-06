import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorldPageTemplatesService } from './world-page-templates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateWorldPageTemplateDto } from './dto/create-world-page-template.dto';
import { UpdateWorldPageTemplateDto } from './dto/update-world-page-template.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  role: UserRole;
  /** World elevation (platform Admin bypass jen pro tyto světy) — viz worldAdminBypass. */
  elevatedWorldIds?: string[];
}

@ApiTags('WorldPageTemplates')
@ApiBearerAuth()
@Controller('worlds/:worldId/page-templates')
export class WorldPageTemplatesController {
  constructor(private readonly service: WorldPageTemplatesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Seznam šablon stránek pro daný svět' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  findAll(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    return this.service.findByWorld(worldId, user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření šablony (Korektor+ ve světě)' })
  @ApiResponse({ status: 201, description: 'Šablona vytvořena' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 409, description: 'Klíč už existuje' })
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateWorldPageTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(worldId, dto, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Aktualizace šablony (Korektor+ ve světě)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Šablona nenalezena' })
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorldPageTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(worldId, id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání šablony (Korektor+ ve světě)' })
  @ApiResponse({ status: 204, description: 'Smazáno' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Šablona nenalezena' })
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.delete(worldId, id, user);
  }
}
