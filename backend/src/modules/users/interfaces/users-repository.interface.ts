import { User, UserRole } from './user.interface';

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findFirstByRole(role: UserRole): Promise<User | null>;
  findOnlineSince(since: Date): Promise<string[]>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}
