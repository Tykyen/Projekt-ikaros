import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUsersRepository } from './interfaces/users-repository.interface';
import { User, PublicUser } from './interfaces/user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type SanitizedUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject('IUsersRepository') private readonly repo: IUsersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    // Migration: case-insensitive username (usernameLower index).
    // 1) Detekce existujících case-konfliktů (Karel + karel) → log + abort.
    // 2) Backfill usernameLower pro pre-migration záznamy.
    const conflicts = await this.repo.findUsernameCaseConflicts();
    if (conflicts.length > 0) {
      this.logger.error(
        `Username case konflikt — manuální zásah nutný před backfillem: ${JSON.stringify(conflicts)}`,
      );
      return;
    }
    const result = await this.repo.backfillUsernameLower();
    if (result.updated > 0) {
      this.logger.log(
        `Backfill usernameLower: aktualizováno ${result.updated} záznamů`,
      );
    }
  }

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
      if (taken && taken.id !== id)
        throw new ConflictException('Username je již obsazeno');
    }

    const updateData: Partial<User> = {};
    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl;
    if (dto.characterPath !== undefined)
      updateData.characterPath = dto.characterPath;
    if (dto.ikarosSkin !== undefined) updateData.ikarosSkin = dto.ikarosSkin;
    if (dto.username !== undefined) updateData.username = dto.username;
    if (dto.themeSettings != null) {
      updateData.themeSettings = {
        ...existing.themeSettings,
        ...dto.themeSettings,
      };
    }
    if (dto.chatPreferences != null) {
      updateData.chatPreferences = {
        ...existing.chatPreferences,
        ...dto.chatPreferences,
      };
    }

    const updated = await this.repo.update(id, updateData);
    if (!updated) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(updated);
  }

  async exists(username: string): Promise<{ exists: boolean }> {
    if (username.length > 64)
      throw new BadRequestException('Username je příliš dlouhé');
    const user = await this.repo.findByUsername(username);
    return { exists: user != null };
  }

  async updateTheme(
    id: string,
    themeSettings: Record<string, unknown>,
  ): Promise<SanitizedUser> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Uživatel nenalezen');

    const merged = { ...(existing.themeSettings ?? {}), ...themeSettings };
    const updated = await this.repo.update(id, { themeSettings: merged });
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
    this.eventEmitter.emit('user.password.changed', { userId });
  }

  async resetPassword(userId: string, dto: ResetPasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
    this.eventEmitter.emit('user.password.changed', { userId });
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
