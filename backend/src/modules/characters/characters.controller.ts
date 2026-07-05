import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CharactersService } from './characters.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { ConvertCharacterDto } from './dto/convert-character.dto';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('Characters')
@ApiBearerAuth()
@Controller('worlds/:worldId/characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Seznam postav světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  findAll(@Param('worldId') worldId: string) {
    return this.charactersService.findByWorld(worldId);
  }

  @Get('players')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Hráčské postavy světa (isNpc=false + userId set)' })
  @ApiResponse({ status: 200, description: 'OK' })
  getPlayerCharacters(@Param('worldId') worldId: string) {
    return this.charactersService.getPlayerCharacters(worldId);
  }

  @Get('directory')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Adresář postav (veřejný svět = veřejně, privátní = jen členové)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403 })
  async getDirectory(
    @Param('worldId') worldId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    // R-RUN-02 — OptionalJwt: anonym smí veřejný svět, privátní jen členové.
    // Brána je v controlleru (HTTP vrstva); service.getDirectory zůstává bez ní,
    // protože ho volá i chat.service interně (enrich).
    await this.charactersService.assertCanViewDirectory(
      worldId,
      user?.id,
      user?.role,
      user?.elevatedWorldIds,
    );
    return this.charactersService.getDirectory(worldId);
  }

  @Get('by-user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Postavy konkrétního uživatele ve světě' })
  @ApiResponse({ status: 200, description: 'OK' })
  findByUser(
    @Param('worldId') worldId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.findByUser(userId, worldId, user.id);
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detail postavy dle slugu' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Postava nenalezena' })
  findOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.findBySlug(slug, worldId, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vytvoření postavy' })
  @ApiResponse({ status: 201, description: 'Postava vytvořena' })
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user, worldId);
    return this.charactersService.create(dto, worldId);
  }

  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Aktualizace postavy (diaryData deep-merge, extraBlocks replace)',
  })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  @ApiResponse({ status: 404, description: 'Postava nenalezena' })
  update(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.update(slug, worldId, dto, user);
  }

  @Patch(':slug/convert')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Konverze postavy (NPC ↔ hráčská)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async convert(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: ConvertCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user, worldId);
    return this.charactersService.convert(slug, worldId, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Smazání postavy' })
  @ApiResponse({ status: 204, description: 'Smazáno' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async remove(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user, worldId);
    return this.charactersService.delete(slug, worldId);
  }
}
