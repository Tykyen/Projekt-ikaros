# Krok 1 — Základ (NestJS + MongoDB + Auth + WebSocket) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit funkční NestJS backend základ s MongoDB, JWT autentifikací, User modulem a WebSocket infrastrukturou — vše testované, připravené pro navazující moduly.

**Architecture:** NestJS moduly s repository pattern pro DB abstrakci. Každý write přes service → EventEmitter → Gateway broadcast. JWT autentifikace přes Passport.js s guards na kontrollerech.

**Tech Stack:** NestJS 10, TypeScript 5, Mongoose 8, @nestjs/jwt + passport-jwt, @nestjs/websockets + socket.io, @nestjs/event-emitter, class-validator, @nestjs/config

---

## Struktura souborů

```
backend/                              ← root nového NestJS projektu
  src/
    main.ts                           ← bootstrap, port, CORS, validace pipe
    app.module.ts                     ← root modul, importuje vše
    app.controller.ts                 ← GET /api/health

    common/
      filters/
        http-exception.filter.ts      ← globální error handler → { error: { code, message } }
        http-exception.filter.spec.ts
      interceptors/
        response.interceptor.ts       ← wrap odpovědí do { data, meta }
        response.interceptor.spec.ts
      guards/
        jwt-auth.guard.ts             ← ověří JWT, přidá user do request
        roles.guard.ts                ← ověří UserRole claim
      decorators/
        current-user.decorator.ts     ← @CurrentUser() → User z JWT
        roles.decorator.ts            ← @Roles(UserRole.Admin)
      interfaces/
        base-repository.interface.ts  ← IBaseRepository<T> generický interface

    database/
      database.module.ts              ← MongooseModule.forRootAsync
      mongo/
        base-mongo.repository.ts      ← BaseMongoRepository<T> abstraktní třída

    modules/
      auth/
        auth.module.ts
        auth.controller.ts            ← POST /api/auth/login, POST /api/auth/register
        auth.controller.spec.ts
        auth.service.ts               ← register, login, validateUser
        auth.service.spec.ts
        strategies/
          jwt.strategy.ts             ← Passport JWT strategie, validate() → User payload
        dto/
          login.dto.ts                ← email, password
          register.dto.ts             ← email, password, username
          auth-response.dto.ts        ← accessToken, user

      users/
        users.module.ts
        users.controller.ts           ← GET /api/users/:id, PATCH /api/users/:id, GET /api/users/me
        users.controller.spec.ts
        users.service.ts              ← findById, findByEmail, update, hashPassword
        users.service.spec.ts
        users.repository.ts           ← MongoUsersRepository implements IUsersRepository
        users.repository.spec.ts
        schemas/
          user.schema.ts              ← Mongoose schema + document type
        interfaces/
          user.interface.ts           ← User doménový typ
          users-repository.interface.ts ← IUsersRepository
        dto/
          create-user.dto.ts
          update-user.dto.ts

    gateways/
      gateways.module.ts
      base.gateway.ts                 ← handleConnection, handleDisconnect, joinRoom, leaveRoom
      app.gateway.ts                  ← room:join, room:leave eventy
      app.gateway.spec.ts

  test/
    app.e2e-spec.ts                   ← health check e2e test

  .env.example
  package.json
  tsconfig.json
  nest-cli.json
  jest.config.ts
```

---

## Task 1: Inicializace projektu

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/nest-cli.json`
- Create: `backend/jest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/app.controller.ts`

- [ ] **Step 1: Vytvoř složku a inicializuj NestJS projekt**

```bash
cd c:\Matrix\ProjektIkaros\Projekt-ikaros
npm install -g @nestjs/cli
nest new backend --package-manager npm --skip-git
cd backend
```

- [ ] **Step 2: Nainstaluj závislosti**

```bash
npm install @nestjs/mongoose mongoose @nestjs/jwt @nestjs/passport passport passport-jwt @nestjs/websockets @nestjs/platform-socket.io socket.io @nestjs/event-emitter @nestjs/config class-validator class-transformer bcrypt
npm install -D @types/passport-jwt @types/bcrypt @types/socket.io
```

- [ ] **Step 3: Nastav .env.example**

```env
# .env.example
PORT=3000
MONGODB_URI=mongodb://localhost:27017/ikaros
JWT_SECRET=change-this-secret-in-production
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
```

Zkopíruj do `.env` a vyplň hodnoty.

- [ ] **Step 4: Nastav jest.config.ts**

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
```

- [ ] **Step 5: Nastav main.ts**

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 6: Nastav app.controller.ts**

```typescript
// src/app.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 7: Spusť aplikaci a ověř**

```bash
npm run start:dev
```

Otevři `http://localhost:3000/api/health` — očekáváš `{ "status": "ok" }`.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: initialize nestjs backend project"
```

---

## Task 2: Databázový modul

**Files:**
- Create: `backend/src/database/database.module.ts`
- Create: `backend/src/common/interfaces/base-repository.interface.ts`
- Create: `backend/src/database/mongo/base-mongo.repository.ts`

- [ ] **Step 1: Vytvoř IBaseRepository interface**

```typescript
// src/common/interfaces/base-repository.interface.ts
export interface IBaseRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: Partial<T>): Promise<T[]>;
  save(entity: Partial<T>): Promise<T>;
  update(id: string, entity: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 2: Vytvoř DatabaseModule**

```typescript
// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
```

- [ ] **Step 3: Vytvoř BaseMongoRepository**

```typescript
// src/database/mongo/base-mongo.repository.ts
import { Model, Types } from 'mongoose';
import { IBaseRepository } from '../../common/interfaces/base-repository.interface';

export abstract class BaseMongoRepository<T> implements IBaseRepository<T> {
  constructor(protected readonly model: Model<T & { _id: Types.ObjectId }>) {}

  async findById(id: string): Promise<T | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findAll(filter: Record<string, unknown> = {}): Promise<T[]> {
    const docs = await this.model.find(filter).lean().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async save(entity: Partial<T>): Promise<T> {
    const created = new this.model(entity);
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(id: string, entity: Partial<T>): Promise<T | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: entity }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected abstract toEntity(doc: Record<string, unknown>): T;
}
```

- [ ] **Step 4: Přidej ConfigModule a DatabaseModule do AppModule**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/ backend/src/common/interfaces/ backend/src/app.module.ts
git commit -m "feat: add database module and base repository"
```

---

## Task 3: Globální error handling a response formát

**Files:**
- Create: `backend/src/common/filters/http-exception.filter.ts`
- Create: `backend/src/common/filters/http-exception.filter.spec.ts`
- Create: `backend/src/common/interceptors/response.interceptor.ts`
- Create: `backend/src/common/interceptors/response.interceptor.spec.ts`

- [ ] **Step 1: Napiš test pro HttpExceptionFilter**

```typescript
// src/common/filters/http-exception.filter.spec.ts
import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should return error object with code and message', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Not found' }),
      }),
    );
  });
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```bash
cd backend && npx jest http-exception.filter --no-coverage
```

Očekáváš: `FAIL — Cannot find module`

- [ ] **Step 3: Implementuj HttpExceptionFilter**

```typescript
// src/common/filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as Record<string, unknown>).message ?? 'Error';

    response.status(status).json({
      error: {
        code: HttpStatus[status] ?? 'UNKNOWN_ERROR',
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
```

- [ ] **Step 4: Spusť test — ověř že projde**

```bash
npx jest http-exception.filter --no-coverage
```

Očekáváš: `PASS`

- [ ] **Step 5: Napiš test pro ResponseInterceptor**

```typescript
// src/common/interceptors/response.interceptor.spec.ts
import { ResponseInterceptor } from './response.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('ResponseInterceptor', () => {
  it('should wrap response in { data }', (done) => {
    const interceptor = new ResponseInterceptor();
    const mockContext = {} as ExecutionContext;
    const mockCallHandler: CallHandler = { handle: () => of({ id: '1' }) };

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result).toEqual({ data: { id: '1' } });
      done();
    });
  });
});
```

- [ ] **Step 6: Spusť test — ověř že selže**

```bash
npx jest response.interceptor --no-coverage
```

- [ ] **Step 7: Implementuj ResponseInterceptor**

```typescript
// src/common/interceptors/response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
```

- [ ] **Step 8: Spusť test — ověř že projde**

```bash
npx jest response.interceptor --no-coverage
```

- [ ] **Step 9: Registruj filter a interceptor globálně v main.ts**

```typescript
// src/main.ts — přidej importy a globalní registraci
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/common/
git commit -m "feat: add global error filter and response interceptor"
```

---

## Task 4: User modul — schema, interface, repository

**Files:**
- Create: `backend/src/modules/users/schemas/user.schema.ts`
- Create: `backend/src/modules/users/interfaces/user.interface.ts`
- Create: `backend/src/modules/users/interfaces/users-repository.interface.ts`
- Create: `backend/src/modules/users/users.repository.ts`
- Create: `backend/src/modules/users/users.repository.spec.ts`

- [ ] **Step 1: Vytvoř User interface (doménový typ)**

```typescript
// src/modules/users/interfaces/user.interface.ts
export enum UserRole {
  Superadmin = 1,
  Admin = 2,
  PJ = 3,
  Korektor = 4,
  Hrac = 5,
  Ctenar = 6,
  Zadatel = 7,
  Zakaz = 8,
  Ikarus = 9,
}

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  ikarosSkin?: string;
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Vytvoř IUsersRepository interface**

```typescript
// src/modules/users/interfaces/users-repository.interface.ts
import { User } from './user.interface';

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Vytvoř Mongoose schema**

```typescript
// src/modules/users/schemas/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../interfaces/user.interface';

export type UserDocument = HydratedDocument<UserSchemaClass>;

@Schema({ timestamps: true, collection: 'users' })
export class UserSchemaClass {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Number, enum: UserRole, default: UserRole.Hrac })
  role: UserRole;

  @Prop() displayName?: string;
  @Prop() avatarUrl?: string;
  @Prop() characterPath?: string;
  @Prop() ikarosSkin?: string;

  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: Date.now }) lastSeenAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);
```

- [ ] **Step 4: Napiš test pro UsersRepository**

```typescript
// src/modules/users/users.repository.spec.ts
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
```

- [ ] **Step 5: Spusť test — ověř že selže**

```bash
npx jest users.repository --no-coverage
```

- [ ] **Step 6: Implementuj MongoUsersRepository**

```typescript
// src/modules/users/users.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../database/mongo/base-mongo.repository';
import { UserSchemaClass } from './schemas/user.schema';
import { User } from './interfaces/user.interface';
import { IUsersRepository } from './interfaces/users-repository.interface';

@Injectable()
export class MongoUsersRepository
  extends BaseMongoRepository<User>
  implements IUsersRepository
{
  constructor(
    @InjectModel(UserSchemaClass.name)
    model: Model<UserSchemaClass>,
  ) {
    super(model as never);
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.model.findOne({ email: email.toLowerCase() }).lean().exec();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const doc = await this.model.findOne({ username }).lean().exec();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { lastSeenAt: new Date(), isOnline: true })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): User {
    return {
      id: String(doc._id),
      email: doc.email as string,
      username: doc.username as string,
      passwordHash: doc.passwordHash as string,
      role: doc.role as number,
      displayName: doc.displayName as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      ikarosSkin: doc.ikarosSkin as string | undefined,
      isOnline: (doc.isOnline as boolean) ?? false,
      lastSeenAt: doc.lastSeenAt as Date,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 7: Spusť test — ověř že projde**

```bash
npx jest users.repository --no-coverage
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/users/
git commit -m "feat: add user schema, interface and repository"
```

---

## Task 5: Auth modul — register, login, JWT

**Files:**
- Create: `backend/src/modules/auth/auth.module.ts`
- Create: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/src/modules/auth/auth.service.spec.ts`
- Create: `backend/src/modules/auth/auth.controller.ts`
- Create: `backend/src/modules/auth/auth.controller.spec.ts`
- Create: `backend/src/modules/auth/strategies/jwt.strategy.ts`
- Create: `backend/src/modules/auth/dto/login.dto.ts`
- Create: `backend/src/modules/auth/dto/register.dto.ts`
- Create: `backend/src/common/guards/jwt-auth.guard.ts`
- Create: `backend/src/common/decorators/current-user.decorator.ts`
- Create: `backend/src/common/decorators/roles.decorator.ts`
- Create: `backend/src/common/guards/roles.guard.ts`

- [ ] **Step 1: Vytvoř DTOs**

```typescript
// src/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}
```

```typescript
// src/modules/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(3) @MaxLength(32) username: string;
  @IsString() @MinLength(6) password: string;
}
```

- [ ] **Step 2: Napiš testy pro AuthService**

```typescript
// src/modules/auth/auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { UserRole } from '../users/interfaces/user.interface';

const mockUser = {
  id: '1',
  email: 'test@test.com',
  username: 'testuser',
  passwordHash: '',
  role: UserRole.Hrac,
  isOnline: false,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const mockUsersRepository = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
    updateLastSeen: jest.fn(),
  };
  const mockJwtService = { sign: jest.fn().mockReturnValue('token') };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'IUsersRepository', useValue: mockUsersRepository },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('should throw ConflictException if email already exists', async () => {
    mockUsersRepository.findByEmail.mockResolvedValue(mockUser);
    await expect(
      service.register({ email: 'test@test.com', username: 'new', password: '123456' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw UnauthorizedException for wrong password', async () => {
    mockUsersRepository.findByEmail.mockResolvedValue({
      ...mockUser,
      passwordHash: '$2b$10$invalidhash',
    });
    await expect(
      service.login({ email: 'test@test.com', password: 'wrongpass' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should return accessToken on successful login', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('correctpass', 10);
    mockUsersRepository.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hash });
    mockUsersRepository.updateLastSeen.mockResolvedValue(undefined);
    const result = await service.login({ email: 'test@test.com', password: 'correctpass' });
    expect(result.accessToken).toBe('token');
  });
});
```

- [ ] **Step 3: Spusť testy — ověř že selžou**

```bash
npx jest auth.service --no-coverage
```

- [ ] **Step 4: Implementuj AuthService**

```typescript
// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { IUsersRepository } from '../users/interfaces/users-repository.interface';
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
```

- [ ] **Step 5: Spusť testy — ověř že projdou**

```bash
npx jest auth.service --no-coverage
```

- [ ] **Step 6: Vytvoř JWT strategii a guardy**

```typescript
// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  validate(payload: Record<string, unknown>) {
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      characterPath: payload.characterPath,
      ikarosSkin: payload.ikarosSkin,
    };
  }
}
```

```typescript
// src/common/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```typescript
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

```typescript
// src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/interfaces/user.interface';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// src/common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../modules/users/interfaces/user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

- [ ] **Step 7: Vytvoř AuthController**

```typescript
// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

- [ ] **Step 8: Vytvoř AuthModule a UsersModule a zaregistruj**

```typescript
// src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import { MongoUsersRepository } from './users.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserSchemaClass.name, schema: UserSchema }])],
  providers: [{ provide: 'IUsersRepository', useClass: MongoUsersRepository }],
  exports: ['IUsersRepository'],
})
export class UsersModule {}
```

```typescript
// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
```

Přidej `AuthModule` do `AppModule`:

```typescript
// src/app.module.ts — přidej do imports
import { AuthModule } from './modules/auth/auth.module';
// ...
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  EventEmitterModule.forRoot(),
  DatabaseModule,
  AuthModule,
],
```

- [ ] **Step 9: Ověř manuálně**

```bash
npm run start:dev
# V druhém terminálu:
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"testuser","password":"heslo123"}'
# Očekáváš: { "data": { "accessToken": "...", "user": { ... } } }
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/auth/ backend/src/modules/users/ backend/src/common/guards/ backend/src/common/decorators/ backend/src/app.module.ts
git commit -m "feat: add auth module with JWT register/login"
```

---

## Task 6: Users modul — CRUD endpointy

**Files:**
- Create: `backend/src/modules/users/users.service.ts`
- Create: `backend/src/modules/users/users.service.spec.ts`
- Create: `backend/src/modules/users/users.controller.ts`
- Create: `backend/src/modules/users/dto/update-user.dto.ts`

- [ ] **Step 1: Vytvoř UpdateUserDto**

```typescript
// src/modules/users/dto/update-user.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(32) displayName?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() characterPath?: string;
  @IsOptional() @IsString() ikarosSkin?: string;
}
```

- [ ] **Step 2: Napiš testy pro UsersService**

```typescript
// src/modules/users/users.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from './interfaces/user.interface';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'x', role: UserRole.Hrac,
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  const mockRepo = {
    findById: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'IUsersRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('should throw NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
  });

  it('should return user without passwordHash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.findById('1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.id).toBe('1');
  });
});
```

- [ ] **Step 3: Spusť testy — ověř že selžou**

```bash
npx jest users.service --no-coverage
```

- [ ] **Step 4: Implementuj UsersService**

```typescript
// src/modules/users/users.service.ts
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IUsersRepository } from './interfaces/users-repository.interface';
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
```

- [ ] **Step 5: Spusť testy — ověř že projdou**

```bash
npx jest users.service --no-coverage
```

- [ ] **Step 6: Vytvoř UsersController**

```typescript
// src/modules/users/users.controller.ts
import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.findById(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
```

- [ ] **Step 7: Aktualizuj UsersModule**

```typescript
// src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import { MongoUsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserSchemaClass.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
  ],
  exports: ['IUsersRepository', UsersService],
})
export class UsersModule {}
```

- [ ] **Step 8: Spusť všechny testy**

```bash
npx jest --no-coverage
```

Očekáváš: všechny PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/users/
git commit -m "feat: add users service and controller"
```

---

## Task 7: WebSocket infrastruktura

**Files:**
- Create: `backend/src/gateways/gateways.module.ts`
- Create: `backend/src/gateways/base.gateway.ts`
- Create: `backend/src/gateways/app.gateway.ts`
- Create: `backend/src/gateways/app.gateway.spec.ts`

- [ ] **Step 1: Napiš test pro AppGateway**

```typescript
// src/gateways/app.gateway.spec.ts
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppGateway } from './app.gateway';

describe('AppGateway', () => {
  let gateway: AppGateway;
  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AppGateway, { provide: EventEmitter2, useValue: new EventEmitter2() }],
    }).compile();
    gateway = module.get(AppGateway);
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```bash
npx jest app.gateway --no-coverage
```

- [ ] **Step 3: Implementuj BaseGateway**

```typescript
// src/gateways/base.gateway.ts
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export abstract class BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  protected readonly logger = new Logger(this.constructor.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  protected joinRoom(client: Socket, room: string) {
    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
  }

  protected leaveRoom(client: Socket, room: string) {
    client.leave(room);
  }

  protected broadcastToRoom(room: string, event: string, data: unknown) {
    this.server.to(room).emit(event, data);
  }
}
```

- [ ] **Step 4: Implementuj AppGateway**

```typescript
// src/gateways/app.gateway.ts
import { SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { BaseGateway } from './base.gateway';

export class AppGateway extends BaseGateway {
  @SubscribeMessage('room:join')
  handleJoinRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.joinRoom(client, room);
    return { event: 'room:joined', data: room };
  }

  @SubscribeMessage('room:leave')
  handleLeaveRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.leaveRoom(client, room);
    return { event: 'room:left', data: room };
  }
}
```

- [ ] **Step 5: Vytvoř GatewaysModule**

```typescript
// src/gateways/gateways.module.ts
import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';

@Module({ providers: [AppGateway], exports: [AppGateway] })
export class GatewaysModule {}
```

Přidej `GatewaysModule` do `AppModule`:

```typescript
// src/app.module.ts — přidej do imports
import { GatewaysModule } from './gateways/gateways.module';
// imports: [..., GatewaysModule]
```

- [ ] **Step 6: Spusť všechny testy**

```bash
npx jest --no-coverage
```

Očekáváš: všechny PASS.

- [ ] **Step 7: Ověř WebSocket manuálně**

```bash
npm run start:dev
```

Připoj se přes wscat nebo browser konzoli:
```javascript
const socket = io('http://localhost:3000');
socket.emit('room:join', 'world:test123');
socket.on('room:joined', (room) => console.log('Joined:', room));
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/gateways/
git commit -m "feat: add websocket gateway infrastructure"
```

---

## Task 8: Finální ověření a push

- [ ] **Step 1: Spusť kompletní test suite**

```bash
cd backend && npx jest --coverage
```

Očekáváš: všechny testy PASS, žádné TS chyby.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Očekáváš: `Successfully compiled` bez chyb.

- [ ] **Step 3: Finální commit**

```bash
git add .
git commit -m "feat: complete backend foundation - nestjs, mongodb, auth, websockets"
```

---

## Co je připraveno po Kroku 1

- ✅ NestJS projekt s TypeScript
- ✅ MongoDB připojení přes Mongoose s repository abstrakcí
- ✅ JWT autentifikace (register, login)
- ✅ User modul (CRUD, role)
- ✅ Globální error handling + response formát
- ✅ WebSocket infrastruktura (rooms, join/leave)
- ✅ EventEmitter připraven pro domain eventy
- ✅ Testy pro každý modul

**Následující krok:** Krok 2 — Světy (World modul, WorldSettings, WorldMembership, Matrix World seed)
