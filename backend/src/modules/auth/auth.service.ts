import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email již existuje');

    const existingUsername = await this.usersRepo.findByUsername(dto.username);
    if (existingUsername) throw new ConflictException('Username již existuje');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepo.save({
      email: dto.email.toLowerCase(),
      username: dto.username,
      passwordHash,
      role: UserRole.Hrac,
      isOnline: true,
      lastSeenAt: new Date(),
    });

    return { accessToken: this.generateToken(user), user: this.sanitize(user) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Neplatné přihlašovací údaje');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Neplatné přihlašovací údaje');

    await this.usersRepo.updateLastSeen(user.id);
    return { accessToken: this.generateToken(user), user: this.sanitize(user) };
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      characterPath: user.characterPath ?? '',
      ikarosSkin: user.ikarosSkin ?? 'default',
    });
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }
}
