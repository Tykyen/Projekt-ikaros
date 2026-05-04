import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoUsersRepository } from './users.repository';
import { UserSchemaClass } from './schemas/user.schema';
import { UserRole } from './interfaces/user.interface';

describe('MongoUsersRepository', () => {
  let repository: MongoUsersRepository;
  const mockUser = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    email: 'test@test.com',
    username: 'testuser',
    passwordHash: 'hash',
    role: UserRole.Hrac,
    isOnline: false,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoUsersRepository,
        { provide: getModelToken(UserSchemaClass.name), useValue: mockModel },
      ],
    }).compile();
    repository = module.get(MongoUsersRepository);
  });

  it('should find user by email', async () => {
    mockModel.findOne.mockReturnValue({ lean: () => ({ exec: () => mockUser }) });
    const user = await repository.findByEmail('test@test.com');
    expect(user).not.toBeNull();
    expect(user!.email).toBe('test@test.com');
    expect(user!.id).toBe('507f1f77bcf86cd799439011');
  });

  it('should return null for unknown email', async () => {
    mockModel.findOne.mockReturnValue({ lean: () => ({ exec: () => null }) });
    const user = await repository.findByEmail('unknown@test.com');
    expect(user).toBeNull();
  });
});

describe('MongoUsersRepository.findByRoles', () => {
  let repository: MongoUsersRepository;
  const mockModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoUsersRepository,
        { provide: getModelToken(UserSchemaClass.name), useValue: mockModel },
      ],
    }).compile();
    repository = module.get(MongoUsersRepository);
    jest.clearAllMocks();
  });

  it('volá find s $in query pro zadané role', async () => {
    mockModel.find.mockReturnValue({ lean: () => ({ exec: () => [] }) });
    await repository.findByRoles([UserRole.Admin, UserRole.PJ]);
    expect(mockModel.find).toHaveBeenCalledWith({ role: { $in: [UserRole.Admin, UserRole.PJ] } });
  });
});
