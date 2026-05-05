import {
  Controller, Get, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { IsNumber, IsBoolean } from 'class-validator';

class UpdateRoleDto {
  @IsNumber() role: UserRole;
}
class UpdateAkjDto {
  @IsBoolean() akj: boolean;
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @UseGuards(AdminGuard)
  getUsers(
    @Query('username') username?: string,
    @Query('role') role?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getUsers({
      username,
      role: role !== undefined ? Number(role) as UserRole : undefined,
      page: Math.max(1, Number(page)),
      limit: Math.min(100, Math.max(1, Number(limit))),
    });
  }

  @Patch('users/:id/role')
  @UseGuards(AdminGuard)
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Patch('users/:id/akj')
  @UseGuards(AdminGuard)
  updateUserAkj(@Param('id') id: string, @Body() dto: UpdateAkjDto) {
    return this.adminService.updateUserAkj(id, dto.akj);
  }

  @Get('recent-pages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Superadmin, UserRole.Admin, UserRole.PJ)
  getRecentPages(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getRecentPages(user, Math.min(100, Math.max(1, Number(limit))));
  }
}
