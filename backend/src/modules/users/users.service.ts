import {
  Injectable, Inject, NotFoundException, ConflictException, UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { IUsersRepository } from './interfaces/users-repository.interface';
import { User, PublicUser } from './interfaces/user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type SanitizedUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    @Inject('IUsersRepository') private readonly repo: IUsersRepository,
  ) {}

  async findById(id: string): Promise<SanitizedUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(user);
  }

  async publicProfile(id: string): Promise<PublicUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async update(id: string, dto: UpdateUserDto): Promise<SanitizedUser> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Uživatel nenalezen');

    if (dto.username !== undefined) {
      const taken = await this.repo.findByUsername(dto.username);
      if (taken && taken.id !== id) throw new ConflictException('Username je již obsazeno');
    }

    const updateData: Partial<User> = {};
    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl;
    if (dto.characterPath !== undefined) updateData.characterPath = dto.characterPath;
    if (dto.ikarosSkin !== undefined) updateData.ikarosSkin = dto.ikarosSkin;
    if (dto.username !== undefined) updateData.username = dto.username;
    if (dto.themeSettings != null) {
      updateData.themeSettings = { ...existing.themeSettings, ...dto.themeSettings };
    }
    if (dto.chatPreferences != null) {
      updateData.chatPreferences = { ...existing.chatPreferences, ...dto.chatPreferences };
    }

    const updated = await this.repo.update(id, updateData);
    if (!updated) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Nesprávné heslo');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
  }

  async resetPassword(userId: string, dto: ResetPasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
  }

  async existsByUsername(username: string): Promise<boolean> {
    const user = await this.repo.findByUsername(username);
    return !!user;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Uživatel nenalezen');
  }

  private sanitize(user: User): SanitizedUser {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }
}
