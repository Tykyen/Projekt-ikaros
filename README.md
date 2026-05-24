# Projekt Ikaros — Backend (Nest.js + MongoDB)

## Lokální vývoj

### Předpoklady

- Node.js 20+
- Docker Desktop (pro Mongo replica set + Redis)

### První spuštění

```bash
# 1. Spustit infrastrukturu (Mongo replica set + Redis)
docker compose up -d

# 2. Backend
cd backend
npm install
npm run start:dev

# 3. Frontend (samostatný repo Projekt-ikaros-FE)
cd ../../Projekt-ikaros-FE
npm install
npm run dev
```

### Connection string

`backend/.env`:

```
MONGODB_URI=mongodb://localhost:27017/ikaros?replicaSet=rs0
REDIS_URL=redis://localhost:6379

# Cloudflare Turnstile (captcha pro registraci)
# Pro lokální dev test keys (always pass) — pro produkci vygenerovat reálné v Cloudflare dashboardu.
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

`Projekt-ikaros-FE/.env`:

```
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

### Replica set

`docker compose up -d` při prvním spuštění automaticky inicializuje 1-node replica set `rs0`. Mongo transakce (`session.withTransaction`) fungují.

### Redis

Cache pro ban check (`UserBanCacheService`), online presence registry, Socket.IO adapter pro multi-instance.

### Migrace

Jednorázové datové migrace v `backend/scripts/migrate-*` (8.6 multi-account, accessLocation backfill, atd.). Spouštět ručně dle README v každém adresáři.

## Produkce (budoucí)

- **Mongo** — 3-node replica set (Atlas nebo self-host) nebo Mongo cluster
- **Redis** — sentinel nebo cluster pro HA
- **Backend + FE** — kontejnerizované (Dockerfile přidáme samostatně)
- **Captcha** — vygenerovat reálné Cloudflare Turnstile site key + secret

## Dokumentace

- [`docs/arch/infrastructure-spec.md`](../Projekt-ikaros-FE/docs/arch/infrastructure-spec.md) — infrastructure rollout
- [`Projekt-ikaros-FE/docs/roadmap-fe.md`](../Projekt-ikaros-FE/docs/roadmap-fe.md) — celkový plán
- [`Projekt-ikaros-FE/docs/dluhy.md`](../Projekt-ikaros-FE/docs/dluhy.md) — technické dluhy
