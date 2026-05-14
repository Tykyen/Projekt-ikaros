import { User, UserRole } from './user.interface';

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findFirstByRole(role: UserRole): Promise<User | null>;
  findByRoles(roles: UserRole[]): Promise<User[]>;
  findOnlineSince(since: Date): Promise<string[]>;
  findAllPaginated(opts: {
    username?: string;
    role?: UserRole;
    page: number;
    limit: number;
  }): Promise<{ items: User[]; total: number }>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;

  // Migration support pro case-insensitive username (viz UsersService.onModuleInit).
  findUsernameCaseConflicts(): Promise<
    Array<{ lower: string; usernames: string[] }>
  >;
  backfillUsernameLower(): Promise<{ updated: number }>;
}
