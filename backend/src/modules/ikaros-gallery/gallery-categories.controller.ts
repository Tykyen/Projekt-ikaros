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
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GalleryCategoriesService } from './gallery-categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateGalleryCategoryDto } from './dto/create-gallery-category.dto';
import { UpdateGalleryCategoryDto } from './dto/update-gallery-category.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Gallery Categories')
@Controller('gallery-categories')
export class GalleryCategoriesController {
  constructor(private readonly service: GalleryCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam kategorií galerie (public)' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vytvořit kategorii (Admin/Superadmin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  @ApiResponse({
    status: 409,
    description: 'Kategorie s tímto klíčem už existuje',
  })
  create(
    @Body() dto: CreateGalleryCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertAdmin(user.role);
    return this.service.create(dto);
  }

  @Patch(':key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upravit kategorii (Admin/Superadmin)' })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateGalleryCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertAdmin(user.role);
    return this.service.update(key, dto);
  }

  @Delete(':key')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Smazat kategorii (Superadmin only, jen pokud žádný obrázek ji nepoužívá)',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 409, description: 'Kategorii používají obrázky' })
  async delete(@Param('key') key: string, @CurrentUser() user: RequestUser) {
    if (user.role !== UserRole.Superadmin) {
      throw new ForbiddenException({
        code: 'GALLERY_CATEGORY_DELETE_FORBIDDEN',
        message: 'Mazat kategorii smí jen Superadmin',
      });
    }
    await this.service.delete(key);
  }

  private assertAdmin(role: UserRole): void {
    if (![UserRole.Superadmin, UserRole.Admin].includes(role)) {
      throw new ForbiddenException({
        code: 'GALLERY_CATEGORY_FORBIDDEN',
        message: 'Spravovat kategorie smí jen Admin/Superadmin',
      });
    }
  }
}
