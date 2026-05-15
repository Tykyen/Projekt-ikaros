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
import { IkarosCategoriesService } from './ikaros-categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateArticleCategoryDto } from './dto/create-article-category.dto';
import { UpdateArticleCategoryDto } from './dto/update-article-category.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@ApiTags('Article Categories')
@Controller('article-categories')
export class IkarosCategoriesController {
  constructor(private readonly service: IkarosCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam kategorií článků (public)' })
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
    @Body() dto: CreateArticleCategoryDto,
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
    @Body() dto: UpdateArticleCategoryDto,
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
      'Smazat kategorii (Superadmin only, jen pokud žádný článek ji nepoužívá)',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 409, description: 'Kategorii používají články' })
  async delete(@Param('key') key: string, @CurrentUser() user: RequestUser) {
    if (user.role !== UserRole.Superadmin) {
      throw new ForbiddenException({
        code: 'CATEGORY_DELETE_FORBIDDEN',
        message: 'Mazat kategorii smí jen Superadmin',
      });
    }
    await this.service.delete(key);
  }

  private assertAdmin(role: UserRole): void {
    if (![UserRole.Superadmin, UserRole.Admin].includes(role)) {
      throw new ForbiddenException({
        code: 'CATEGORY_FORBIDDEN',
        message: 'Spravovat kategorie smí jen Admin/Superadmin',
      });
    }
  }
}
