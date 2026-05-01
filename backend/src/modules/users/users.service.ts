import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IUsersRepository } from './interfaces/users-repository.interface';
import { User } from './interfaces/user.interface';
import { UpdateUserDto } from './dto/update-user.dto';

type PublicUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    @Inject('IUsersRepository') private readonly repo: IUsersRepository,
  ) {}

  async findById(id: string): Promise<PublicUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(updated);
  }

  private sanitize(user: User): PublicUser {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }
}
