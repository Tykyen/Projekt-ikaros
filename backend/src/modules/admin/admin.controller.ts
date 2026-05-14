import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { IsEnum } from 'class-validator';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';

class UpdateRoleDto {
  @IsEnum(UserRole) role: UserRole;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Seznam uživatelů s filtrací (username/role) a stránkováním',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  getUsers(
    @Query('username') username?: string,
    @Query('role') role?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getUsers({
      username,
      role: role !== undefined ? Number(role) : undefined,
      page: Math.max(1, Number(page)),
      limit: Math.min(100, Math.max(1, Number(limit))),
    });
  }

  @Patch('users/:id/role')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Změna role uživatele' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Post('users')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Vytvoření uživatele adminem' })
  @ApiResponse({ status: 201, description: 'Uživatel vytvořen' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 409, description: 'Username nebo email již existuje' })
  createUser(@Body() dto: CreateUserAdminDto) {
    return this.adminService.createUser(dto);
  }

  @Get('recent-pages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Superadmin, UserRole.Admin, UserRole.PJ)
  @ApiOperation({
    summary: 'Nedávno upravené stránky (Superadmin vidí vše, PJ jen své světy)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  getRecentPages(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getRecentPages(
      user,
      Math.min(100, Math.max(1, Number(limit))),
    );
  }
}
