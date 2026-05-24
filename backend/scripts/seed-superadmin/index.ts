/* eslint-disable no-console */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import {
  UserSchema,
  UserSchemaClass,
} from '../../src/modules/users/schemas/user.schema';
import { UserRole } from '../../src/modules/users/interfaces/user.interface';

// Účel: vytvořit nebo povýšit Superadmin účet (idempotentně).
//
// SPOUŠTĚNÍ:
//   `SEED_SUPERADMIN_EMAIL=... SEED_SUPERADMIN_USERNAME=... SEED_SUPERADMIN_PASSWORD=... npm run seed:superadmin`
//   nebo SEED_* zapsat do `.env.local` (gitignored) a jen `npm run seed:superadmin`.
//
// BEZPEČNOST:
//   - Heslo NIKDY NEloguje skript ani jeho chybové hlášky.
//   - `.env.local` MUSÍ zůstat v `.gitignore` (root repo: ano).
//   - Skript NESMÍ být součástí `start:prod` / CI / `prepare` hooku.

interface SeedConfig {
  email: string;
  username: string;
  password: string;
  mongoUri: string;
}

function loadEnvFiles(): void {
  const cwd = process.cwd();
  dotenv.config({ path: path.resolve(cwd, '.env') });
  const envLocal = path.resolve(cwd, '.env.local');
  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal, override: true });
  }
}

function readConfigOrExit(): SeedConfig {
  loadEnvFiles();

  const email = process.env.SEED_SUPERADMIN_EMAIL ?? '';
  const username = process.env.SEED_SUPERADMIN_USERNAME ?? '';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? '';
  const mongoUri = process.env.MONGODB_URI ?? '';

  const missing: string[] = [];
  if (!email) missing.push('SEED_SUPERADMIN_EMAIL');
  if (!username) missing.push('SEED_SUPERADMIN_USERNAME');
  if (!password) missing.push('SEED_SUPERADMIN_PASSWORD');
  if (!mongoUri) missing.push('MONGODB_URI');

  if (missing.length) {
    console.error(`✗ Chybí ENV proměnné: ${missing.join(', ')}`);
    console.error(
      '  Předej buď inline (`KEY=value npm run …`) nebo zapiš do .env / .env.local.',
    );
    process.exit(1);
  }

  if (!email.includes('@') || email.length > 255) {
    console.error(
      '✗ SEED_SUPERADMIN_EMAIL: neplatný formát nebo příliš dlouhý',
    );
    process.exit(1);
  }
  if (username.length < 3 || username.length > 32 || username.includes('@')) {
    console.error('✗ SEED_SUPERADMIN_USERNAME: 3–32 znaků, bez @');
    process.exit(1);
  }
  if (password.length < 6 || password.length > 128) {
    console.error('✗ SEED_SUPERADMIN_PASSWORD: 6–128 znaků');
    process.exit(1);
  }

  return { email, username, password, mongoUri };
}

async function main(): Promise<void> {
  const cfg = readConfigOrExit();

  await mongoose.connect(cfg.mongoUri);

  const UserModel = mongoose.model<UserSchemaClass>('User', UserSchema);
  const emailLower = cfg.email.toLowerCase();
  const existing = await UserModel.findOne({ email: emailLower });

  if (existing) {
    if (existing.role === UserRole.Superadmin) {
      console.log(`✓ Uživatel ${cfg.email} už je Superadmin — žádná změna.`);
    } else {
      existing.role = UserRole.Superadmin;
      await existing.save();
      console.log(`✓ Uživatel ${cfg.email} povýšen na Superadmin.`);
    }
  } else {
    const passwordHash = await bcrypt.hash(cfg.password, 10);
    await UserModel.create({
      email: emailLower,
      username: cfg.username,
      usernameLower: cfg.username.toLowerCase(),
      passwordHash,
      role: UserRole.Superadmin,
      isOnline: false,
      lastSeenAt: new Date(),
      themeSettings: {},
      chatPreferences: {},
      favoriteDiscussionIds: [],
    });
    console.log(`✓ Vytvořen Superadmin: ${cfg.username} <${cfg.email}>.`);
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('✗ Seed selhal:', msg);
  process.exit(1);
});
