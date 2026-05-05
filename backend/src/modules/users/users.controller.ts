import {
  Controller, Get, Patch, Put, Delete, Param, Body,
  UseGuards, ForbiddenException, HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './interfaces/user.interface';

type Requester = { id: string; role: UserRole };

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: Requester) {
    return this.usersService.findById(user.id);
  }

  @Get('exists/:username')
  async existsByUsername(@Param('username') username: string) {
    const exists = await this.usersService.existsByUsername(username);
    return { exists };
  }

  @Get('profile/:id')
  publicProfile(@Param('id') id: string) {
    return this.usersService.publicProfile(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    if (dto.username !== undefined && requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException('Změnu username může provést jen Superadmin');
    }
    return this.usersService.update(id, dto);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() requester: Requester,
  ) {
    return this.usersService.changePassword(requester.id, dto);
  }

  @Put(':id/reset-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  resetPassword(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
    @Body() dto: ResetPasswordDto,
  ) {
    if (requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException('Reset hesla může provést jen Superadmin');
    }
    return this.usersService.resetPassword(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  delete(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.delete(id);
  }
}
