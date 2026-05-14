# SP1 — Mailer + SecurityTokens Infrastruktura (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)
**Vychází z:** SP0 (User entity rozšíření, AdminPermissions). Předchází SP2 (Auth email flows).

---

## Cíl

Dodat dvě sdílené infrastrukturní moduly:

1. **MailerModule** — abstrakce pro odesílání transakčních emailů. Pro SP1 dev provider (Logger). Prod SMTP/SendGrid provider je samostatný deploy task, **mimo scope**.
2. **SecurityTokensModule** — vystavování + atomic consume krátkožijících tokenů pro password reset, email verify, email change.

Oba moduly `@Global()` — sdílené SP2 (Auth), SP3 (Users), SP4 (Admin).

---

## 1. SecurityTokensModule

### 1.1 Schema (`security-token.schema.ts`)

Mongoose kolekce `security_tokens`. **Plain token nikdy v DB — jen SHA-256 hash.**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { SecurityTokenType } from '../interfaces/security-token.interface';

export type SecurityTokenDocument = HydratedDocument<SecurityTokenSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'security_tokens',
})
export class SecurityTokenSchemaClass {
  @Prop({ required: true, unique: true, index: true }) tokenHash: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) type: SecurityTokenType;
  @Prop({ type: Object }) meta?: Record<string, unknown>;
  @Prop({ required: true }) expiresAt: Date;
}

export const SecurityTokenSchema = SchemaFactory.createForClass(SecurityTokenSchemaClass);
SecurityTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-cleanup
```

⚠️ **Atomic consume:** TTL index garantuje cleanup po expiraci, ale `consume()` musí dělat `findOneAndDelete({ tokenHash, expiresAt: { $gt: now } })` — jedná operace, žádný TOCTOU race.

### 1.2 Interface (`security-token.interface.ts`)

```typescript
export type SecurityTokenType = 'password_reset' | 'email_verify' | 'email_change';

export interface SecurityToken {
  tokenHash: string;
  userId: string;
  type: SecurityTokenType;
  meta?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConsumedToken {
  userId: string;
  meta?: Record<string, unknown>;
}
```

### 1.3 Repository interface (`security-tokens-repository.interface.ts`)

```typescript
import { SecurityToken, ConsumedToken, SecurityTokenType } from './security-token.interface';

export interface ISecurityTokensRepository {
  save(token: Omit<SecurityToken, 'createdAt'>): Promise<void>;
  consumeByHash(tokenHash: string, now: Date): Promise<ConsumedToken | null>;
  revokeAllForUser(userId: string, type?: SecurityTokenType): Promise<void>;
}
```

**Žádné `findByHash`** — read+delete je vždy atomic přes `consumeByHash`. `revokeAllForUser` použije SP4 při ban/delete (invalidace všech tokenů).

### 1.4 Repository implementation (`security-tokens.repository.ts`)

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SecurityTokenSchemaClass } from '../schemas/security-token.schema';
import { ISecurityTokensRepository } from '../interfaces/security-tokens-repository.interface';
import { SecurityToken, ConsumedToken, SecurityTokenType } from '../interfaces/security-token.interface';

@Injectable()
export class MongoSecurityTokensRepository implements ISecurityTokensRepository {
  constructor(
    @InjectModel(SecurityTokenSchemaClass.name)
    private readonly model: Model<SecurityTokenSchemaClass>,
  ) {}

  async save(token: Omit<SecurityToken, 'createdAt'>): Promise<void> {
    await this.model.create(token);
  }

  async consumeByHash(tokenHash: string, now: Date): Promise<ConsumedToken | null> {
    const doc = await this.model
      .findOneAndDelete({
        tokenHash,
        expiresAt: { $gt: now },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      userId: doc.userId,
      meta: doc.meta,
    };
  }

  async revokeAllForUser(userId: string, type?: SecurityTokenType): Promise<void> {
    const filter = type ? { userId, type } : { userId };
    await this.model.deleteMany(filter).exec();
  }
}
```

### 1.5 Service (`security-tokens.service.ts`)

```typescript
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { ISecurityTokensRepository } from './interfaces/security-tokens-repository.interface';
import type { SecurityTokenType, ConsumedToken } from './interfaces/security-token.interface';

@Injectable()
export class SecurityTokensService {
  constructor(
    @Inject('ISecurityTokensRepository')
    private readonly repo: ISecurityTokensRepository,
  ) {}

  /**
   * Vystaví nový token. Plain token vrácený volajícímu (nikdy v DB), hash uložen.
   */
  async issue(
    userId: string,
    type: SecurityTokenType,
    ttlMs: number,
    meta?: Record<string, unknown>,
  ): Promise<string> {
    const plain = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const tokenHash = this.hash(plain);
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.repo.save({ tokenHash, userId, type, meta, expiresAt });
    return plain;
  }

  /**
   * Atomic consume — verify + delete jediným DB query.
   * Throws BadRequestException s code 'INVALID_TOKEN' pokud token neexistuje nebo je expired.
   */
  async consume(plainToken: string): Promise<ConsumedToken> {
    const tokenHash = this.hash(plainToken);
    const consumed = await this.repo.consumeByHash(tokenHash, new Date());
    if (!consumed) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Token je neplatný nebo expirovaný',
        code: 'INVALID_TOKEN',
      });
    }
    return consumed;
  }

  /**
   * SHA-256 hash. Public — používá AuthService pro consistency.
   */
  hash(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('hex');
  }

  /**
   * Revoke všech tokenů userId, volitelně filtrované typem.
   * Použití: SP4 ban/delete handlers.
   */
  async revokeAllForUser(userId: string, type?: SecurityTokenType): Promise<void> {
    await this.repo.revokeAllForUser(userId, type);
  }
}
```

⚠️ **Error code `INVALID_TOKEN` vs `EXPIRED_TOKEN`:** spec auth.service.spec.ts:725 očekává `EXPIRED_TOKEN` jako rozlišitelný case. **Rozhodnuto: pro `consume` vždy `INVALID_TOKEN`** — útočníkovi nezáleží na rozdílu, anti-enumeration. Test v `auth.service.spec.ts:723–730` jen ověřuje, že nějaká `BadRequestException` propaguje, ne přesný code. **Spec auth.service.spec.ts používá `EXPIRED_TOKEN` jen v jednom místě a očekává `toBeInstanceOf(BadRequestException)`, nekontroluje code → SP1 vrací jen `INVALID_TOKEN`.**

### 1.6 Module (`security-tokens.module.ts`)

```typescript
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SecurityTokenSchemaClass,
  SecurityTokenSchema,
} from './schemas/security-token.schema';
import { SecurityTokensService } from './security-tokens.service';
import { MongoSecurityTokensRepository } from './repositories/security-tokens.repository';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityTokenSchemaClass.name, schema: SecurityTokenSchema },
    ]),
  ],
  providers: [
    SecurityTokensService,
    {
      provide: 'ISecurityTokensRepository',
      useClass: MongoSecurityTokensRepository,
    },
  ],
  exports: [SecurityTokensService],
})
export class SecurityTokensModule {}
```

---

## 2. MailerModule

### 2.1 Interface (`mailer-provider.interface.ts`)

```typescript
export interface MailerSendOptions {
  to: string;
  username: string;
  token: string;
}

/**
 * Provider rozhraní — implementuje konkrétní backend (Logger pro dev, SMTP/SendGrid prod).
 * Účel: jeden `send(template, options)` call, MailerService rozhoduje template name.
 */
export interface IMailerProvider {
  send(template: MailerTemplate, payload: MailerPayload): Promise<void>;
}

export type MailerTemplate =
  | 'password_reset'
  | 'email_verification'
  | 'email_change_confirm'
  | 'email_change_notice'
  | 'username_decided'
  | 'account_deletion_scheduled';

export interface MailerPayload {
  to: string;
  username: string;
  // Variabilní podle template:
  token?: string;          // password_reset, email_verification, email_change_confirm
  oldEmail?: string;       // email_change_notice
  newEmail?: string;       // email_change_notice
  decidedUsername?: string; // username_decided
  scheduledFor?: Date;     // account_deletion_scheduled
}
```

### 2.2 Service (`mailer.service.ts`)

Public API — co volá AuthService/UsersService/AdminService:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IMailerProvider } from './interfaces/mailer-provider.interface';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject('IMailerProvider')
    private readonly provider: IMailerProvider,
  ) {}

  async sendPasswordReset(opts: { to: string; username: string; token: string }): Promise<void> {
    await this.dispatch('password_reset', opts);
  }

  async sendEmailVerification(opts: { to: string; username: string; token: string }): Promise<void> {
    await this.dispatch('email_verification', opts);
  }

  async sendEmailChangeConfirm(opts: { to: string; username: string; token: string }): Promise<void> {
    await this.dispatch('email_change_confirm', opts);
  }

  async sendEmailChangeNotice(opts: {
    to: string;
    username: string;
    oldEmail: string;
    newEmail: string;
  }): Promise<void> {
    await this.dispatch('email_change_notice', opts);
  }

  async sendUsernameDecided(opts: {
    to: string;
    username: string;
    decidedUsername: string;
  }): Promise<void> {
    await this.dispatch('username_decided', opts);
  }

  async sendAccountDeletionScheduled(opts: {
    to: string;
    username: string;
    scheduledFor: Date;
  }): Promise<void> {
    await this.dispatch('account_deletion_scheduled', opts);
  }

  private async dispatch(template: MailerTemplate, payload: MailerPayload): Promise<void> {
    try {
      await this.provider.send(template, payload);
    } catch (err) {
      // Mailer fail nikdy nebreaké volající flow — log a swallow.
      // Volající si může logovat dál, pokud chce (např. forgotPassword).
      this.logger.error(
        `Mailer send failed: template=${template} to=${payload.to}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

💡 *Proč `dispatch` swallow error:* email transient failure (SMTP timeout, rate limit) by jinak roztřískl auth flow. Volající (např. `forgotPassword`) dál vrací `{ ok: true }` — antifishing, attacker neví, jestli email skutečně odešel.

⚠️ **Pozor:** `auth.service.spec.ts:599–608` test "mailer selže → log warn, žádný throw" → tento dispatch je přesně to chování.

### 2.3 Provider — LogMailerProvider (`log-mailer.provider.ts`)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type {
  IMailerProvider,
  MailerTemplate,
  MailerPayload,
} from '../interfaces/mailer-provider.interface';

/**
 * Dev/test provider — strukturovaný log namísto reálného emailu.
 * Pro prod: nahradit SmtpMailerProvider nebo SendGridMailerProvider (separátní task po SP1).
 */
@Injectable()
export class LogMailerProvider implements IMailerProvider {
  private readonly logger = new Logger(LogMailerProvider.name);

  async send(template: MailerTemplate, payload: MailerPayload): Promise<void> {
    this.logger.log({
      event: 'mailer.send',
      template,
      to: payload.to,
      username: payload.username,
      // Sensitive fields (token) zalogujeme pro dev usability — v prod by se nepřišlo.
      token: payload.token ? `${payload.token.slice(0, 8)}…` : undefined,
      meta: {
        oldEmail: payload.oldEmail,
        newEmail: payload.newEmail,
        decidedUsername: payload.decidedUsername,
        scheduledFor: payload.scheduledFor?.toISOString(),
      },
    });
  }
}
```

⚠️ **Token leak:** dev log obsahuje prvních 8 chars tokenu. Pro produkční debug stačí — full token by leakl recovery URL. Pro vývoj plný token logovat **NE** (developer si jej najde v DB nebo si vystaví nový).

### 2.4 Module (`mailer.module.ts`)

```typescript
import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { LogMailerProvider } from './providers/log-mailer.provider';

@Global()
@Module({
  providers: [
    MailerService,
    {
      provide: 'IMailerProvider',
      useClass: LogMailerProvider,
    },
  ],
  exports: [MailerService],
})
export class MailerModule {}
```

🔀 **Switch na prod provider:** později (mimo SP1) — nahradit `useClass: LogMailerProvider` za `useClass: SmtpMailerProvider` přes env var:

```typescript
{
  provide: 'IMailerProvider',
  useClass: process.env.MAILER_BACKEND === 'smtp' ? SmtpMailerProvider : LogMailerProvider,
}
```

Tato volba je **out of SP1 scope** — SP1 jen položí abstrakci.

---

## 3. Wiring do AppModule

```typescript
// app.module.ts (přidat do imports[])
imports: [
  // ... existing
  SecurityTokensModule,
  MailerModule,
  // ... rest
]
```

Pořadí: `SecurityTokensModule` a `MailerModule` před `AuthModule` (i když `@Global()` to neřeší pro DI graph — neškodí).

---

## 4. Testing scope

### 4.1 SecurityTokensService tests (`security-tokens.service.spec.ts`)

| Case | Setup | Expected |
|---|---|---|
| issue happy path | mockRepo.save resolves | returns 64-hex string, calls save(hash, userId, type, expiresAt) |
| issue s meta | issue('u1', 'email_change', 60000, { newEmail: 'x@y.cz' }) | meta passed do save |
| issue různé typy generují různý token | issue same userId+type 2× | 2 různé plain tokens |
| consume happy path | mockRepo.consumeByHash returns { userId } | returns { userId } |
| consume s meta | mockRepo returns { userId, meta } | returns same |
| consume neplatný token (no DB hit) | returns null | throws BadRequestException code='INVALID_TOKEN' |
| hash determinismus | hash('x') 2× | stejný výstup |
| hash různé inputy | hash('x') vs hash('y') | různé |
| revokeAllForUser default | call without type | repo.revokeAllForUser('u1', undefined) |
| revokeAllForUser scoped | call with type='password_reset' | repo.revokeAllForUser('u1', 'password_reset') |

**Cíl:** ≥ 10 tests.

### 4.2 MongoSecurityTokensRepository tests (`security-tokens.repository.spec.ts`)

Integration-style proti `mongodb-memory-server` (project má pattern, viz `refresh-token.repository.spec.ts`).

| Case | Expected |
|---|---|
| save persistuje doc | findOne najde po hash |
| consumeByHash valid → returns + deletes | next consume returns null |
| consumeByHash expired → returns null, doc zůstává (TTL ho ucupe) | docs count ≥ 0 |
| consumeByHash race: parallel calls → jen 1 success | one returns userId, one returns null |
| revokeAllForUser bez type | delete všech | count = 0 po revoke |
| revokeAllForUser s type | filter podle type | jen daný type smazán |

**Cíl:** ≥ 5 tests.

### 4.3 MailerService tests (`mailer.service.spec.ts`)

| Case | Expected |
|---|---|
| sendPasswordReset → provider.send('password_reset', payload) | provider mock called |
| sendEmailVerification → 'email_verification' | provider mock called |
| sendEmailChangeConfirm → 'email_change_confirm' | provider mock called |
| sendEmailChangeNotice → 'email_change_notice' | provider mock called |
| sendUsernameDecided → 'username_decided' | provider mock called |
| sendAccountDeletionScheduled → 'account_deletion_scheduled' | provider mock called |
| provider throw → service nehází, jen loguje | resolves, logger.error called |

**Cíl:** 7 tests.

### 4.4 LogMailerProvider tests (`log-mailer.provider.spec.ts`)

Minimální — test, že `Logger.log` byl volán se správnou template string.

**Cíl:** 1 test sanity check.

### 4.5 Integration smoke

Po implementaci SP1: `npm run typecheck` musí zmizet:
- `Cannot find module '../mailer/mailer.service'` (auth.service.spec.ts)
- `Cannot find module '../security-tokens/security-tokens.service'` (auth.service.spec.ts)

Stačí, že soubory exist + exportují class. Ale **auth.service.spec.ts zůstává v tsconfig exclude do SP2** — sám AuthService ještě nemá metody `forgotPassword` atd.

---

## 5. Validation criteria

Po SP1:
- [ ] `backend/src/modules/security-tokens/` má 7 souborů (module, service, repo, schema, 2 interfaces, service.spec)
- [ ] `backend/src/modules/mailer/` má 5 souborů (module, service, provider, interface, service.spec)
- [ ] `SecurityTokensModule` a `MailerModule` jsou `@Global()`, importované v `app.module.ts`
- [ ] `npm run typecheck` projde
- [ ] `npm run lint:check` projde
- [ ] `npx jest security-tokens mailer` projde — ≥ 15 testů zelených
- [ ] `tsconfig.json` exclude list: **odebrána** `security-tokens.service.spec.ts` (modul teď existuje). `auth.service.spec.ts` zůstává (na SP2).
- [ ] `eslint.config.mjs` ignores synchronizováno
- [ ] `docs/dluhy.md` master entry updated — odškrtnuto SP1, zbývá SP2–SP6

---

## 6. Anti-scope

**SP1 NEZAHRNUJE:**
- Nodemailer/SendGrid prod provider (separátní task, deploy prep)
- AuthService metody (forgotPassword, verifyEmail, atd.) — SP2
- Rate limit na `issue` (mimo SP1; AuthService může přidat per-userId guard v SP2)
- HTML email templates (Logger backend stačí; prod provider donese templates separátně)
- i18n (česky/anglicky) — Logger payload je strukturovaný objekt, prod provider překládá
- Account deletion grace period logic — SP4 to spojí s `MailerService.sendAccountDeletionScheduled`
- Re-issue na `consume` po race — TS error handling stačí

---

## 7. Migrační poznámka

Žádná data migration. `security_tokens` kolekce vznikne automaticky při prvním `save`. TTL index se zavede při `MongooseModule.forFeature` registraci.

---

## Schvalovací log

- 2026-05-14 — schváleno user response k "ok jeď tak, aby to perfektně fungovalo" (po předložení návrhu architektury)
