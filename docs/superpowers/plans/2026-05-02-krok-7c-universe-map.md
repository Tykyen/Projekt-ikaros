# Krok 7c — Universe Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat UniverseMap modul — 3D vesmírná mapa per-world s uzly, spojeními, visibility filterem, real-time WebSocket broadcastem a Matrix world seedem.

**Architecture:** Standalone repository (ne BaseMongoRepository — operace jsou per-worldId, ne per-_id). Service obsahuje visibility filtr a lazy-init logiku. Gateway naslouchá na EventEmitter a broadcastuje do `world:{worldId}` roomu. Matrix seed data jsou statická konstanta importovaná při lazy-init.

**Tech Stack:** NestJS, Mongoose, class-validator, EventEmitter2, Socket.IO, Jest (unit testy, mocked repository)

---

## Mapování souborů

| Akce | Soubor |
|------|--------|
| Create | `backend/src/modules/universe/schemas/universe-map.schema.ts` |
| Create | `backend/src/modules/universe/interfaces/universe-map.interface.ts` |
| Create | `backend/src/modules/universe/interfaces/universe-repository.interface.ts` |
| Create | `backend/src/modules/universe/seed/matrix-universe.seed.ts` |
| Create | `backend/src/modules/universe/universe.service.spec.ts` |
| Create | `backend/src/modules/universe/repositories/universe.repository.ts` |
| Create | `backend/src/modules/universe/universe.service.ts` |
| Create | `backend/src/modules/universe/dto/update-universe.dto.ts` |
| Create | `backend/src/modules/universe/dto/update-node-visibility.dto.ts` |
| Create | `backend/src/modules/universe/universe.gateway.ts` |
| Create | `backend/src/modules/universe/universe.controller.ts` |
| Create | `backend/src/modules/universe/universe.module.ts` |
| Modify | `backend/src/app.module.ts` |

---

## Task 1: Schema + Interfaces

**Files:**
- Create: `backend/src/modules/universe/schemas/universe-map.schema.ts`
- Create: `backend/src/modules/universe/interfaces/universe-map.interface.ts`
- Create: `backend/src/modules/universe/interfaces/universe-repository.interface.ts`

- [ ] **Step 1: Vytvoř schema**

Vytvoř `backend/src/modules/universe/schemas/universe-map.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UniverseMapDocument = HydratedDocument<UniverseMapSchemaClass>;

@Schema({ timestamps: true, collection: 'universeMaps' })
export class UniverseMapSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) nodes: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) links: Record<string, unknown>[];
}

export const UniverseMapSchema = SchemaFactory.createForClass(UniverseMapSchemaClass);
UniverseMapSchema.index({ worldId: 1 }, { unique: true });
```

- [ ] **Step 2: Vytvoř interface**

Vytvoř `backend/src/modules/universe/interfaces/universe-map.interface.ts`:

```typescript
export type UniverseNodeType = 'planet' | 'star' | 'nebula' | 'asteroid' | 'moon' | 'blackhole';

export interface UniverseNode {
  id: string;
  name: string;
  type?: UniverseNodeType;
  color: string;
  size: number;
  img?: string;
  alliance?: string;
  x?: number;
  y?: number;
  z?: number;
  isPublic: boolean;
  visibleToPlayerIds: string[];
}

export interface UniverseLink {
  source: string;
  target: string;
  isOrbit: boolean;
}

export interface UniverseMap {
  id: string;
  worldId: string;
  nodes: UniverseNode[];
  links: UniverseLink[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 3: Vytvoř repository interface**

Vytvoř `backend/src/modules/universe/interfaces/universe-repository.interface.ts`:

```typescript
import type { UniverseMap, UniverseNode, UniverseLink } from './universe-map.interface';

export interface IUniverseRepository {
  findByWorld(worldId: string): Promise<UniverseMap | null>;
  upsert(worldId: string, nodes: UniverseNode[], links: UniverseLink[]): Promise<UniverseMap>;
  updateNodeVisibility(
    worldId: string,
    nodeId: string,
    isPublic: boolean,
    visibleToPlayerIds: string[],
  ): Promise<UniverseMap | null>;
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/universe/schemas/universe-map.schema.ts \
        backend/src/modules/universe/interfaces/universe-map.interface.ts \
        backend/src/modules/universe/interfaces/universe-repository.interface.ts
git commit -m "feat(universe): přidat schema a interfaces"
```

---

## Task 2: Matrix seed data

**Files:**
- Create: `backend/src/modules/universe/seed/matrix-universe.seed.ts`

- [ ] **Step 1: Vytvoř seed soubor**

Vytvoř `backend/src/modules/universe/seed/matrix-universe.seed.ts`:

```typescript
import type { UniverseNode, UniverseLink } from '../interfaces/universe-map.interface';

export const MATRIX_UNIVERSE_NODES: UniverseNode[] = [
  { id: 'Svar', name: 'Svar', color: '#00bfff', size: 5, img: 'svar.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Bhuuvar', name: 'Bhuvar', color: '#00bfff', size: 5, img: 'bhuvar.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Bhur', name: 'Bhúr', color: '#ffee00', size: 5, img: 'bhur.jpg', alliance: 'Asgardská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Eden', name: 'Eden', color: '#ffee00', size: 6, img: 'eden.jpg', alliance: 'Asgardská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'MaanAshwada', name: "Ma'an Ashwada", color: '#ffee00', size: 5, img: 'maan_alfawda.jpg', alliance: 'Asgardská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Yume', name: 'Yume', color: '#b24bf3', size: 5, img: 'yume.png', alliance: 'Alfská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Asgard', name: 'Asgard', color: '#ffee00', size: 6, img: 'asgard.jpg', alliance: 'Asgardská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'AleasrAlthalith', name: 'Aleasr althalith', color: '#00bfff', size: 5, img: 'alqas_althalith.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Muspelheim', name: 'Muspelheim', color: '#222222', size: 6, img: 'muspelheim.png', alliance: 'Svobodná', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Alfheim', name: 'Alfheim', color: '#b24bf3', size: 6, img: 'alfheim.jpg', alliance: 'Alfská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Vanaheim', name: 'Vanaheim', color: '#11bb55', size: 6, img: 'vanaheim.jpg', alliance: 'Vanirská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Qiunxun', name: 'Qiunxun', color: '#11bb55', size: 5, img: 'qiunxun.jpg', alliance: 'Vanirská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Folkvangr', name: 'Folkvangr', color: '#11bb55', size: 5, img: 'folkvangr.jpg', alliance: 'Vanirská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Purgatorium', name: 'Purgatorium', color: '#11bb55', size: 5, img: 'purgatorium.jpg', alliance: 'Vanirská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'AlsiniAlththani', name: 'Alsini alththani', color: '#00bfff', size: 5, img: 'alsini_alththani.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Simheim', name: 'Simheim', color: '#00bfff', size: 5, img: 'simheim.jpg', alliance: 'Svobodná', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Midgard', name: 'Midgard', color: '#ffffff', size: 8, img: 'midgard.jpg', alliance: 'Lidská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Noutun', name: 'Noutun', color: '#11bb55', size: 5, img: 'noutun.jpg', alliance: 'Vanirská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'AlsinuAlAwal', name: "Alsinu al'awal", color: '#00bfff', size: 5, img: 'alsinu_al_awal.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Jotunheim', name: 'Jotunheim', color: '#00bfff', size: 6, img: 'jotunheim.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Svartalfheim', name: 'Svartalfheim', color: '#aa0000', size: 6, img: 'svartalfheim.jpg', alliance: 'Trpasličí', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Niflheim', name: 'Niflheim', color: '#00bfff', size: 6, img: 'niflheim.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Babylon', name: 'Babylon', color: '#00bfff', size: 5, img: 'babylon.jpg', alliance: 'Glacijská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Troja', name: 'Trója', color: '#222222', size: 5, img: 'troja.png', alliance: 'Svobodná', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Olymp', name: 'Olymp', color: '#aa0000', size: 6, img: 'olymp.jpg', alliance: 'Trpasličí', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Hellheim', name: 'Hellheim', color: '#ffee00', size: 6, img: 'hellheim.jpg', alliance: 'Asgardská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Hvelgelmir', name: 'Hvelgelmir', color: '#888888', size: 5, img: 'hvelgelmir.jpg', alliance: 'Nordská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Urdarbrunnr', name: 'Urdarbrunnr', color: '#888888', size: 5, img: 'urdarbrunnr.jpg', alliance: 'Nordská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'VeschonechyeLesa', name: 'Veschonechye Lesa', color: '#aa0000', size: 5, img: 'veschonechye_lesa.jpg', alliance: 'Trpasličí', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Mimirunnr', name: 'Mímismundr', color: '#888888', size: 5, img: 'mimirunnr.jpg', alliance: 'Nordská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Nav', name: 'Nav', color: '#888888', size: 5, img: 'nav.jpg', alliance: 'Nordská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Lachesis', name: 'Lachesis', color: '#888888', size: 5, img: 'lachesis.jpg', alliance: 'Nordská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Tim', name: 'Tim', color: '#888888', size: 5, img: 'tim.png', alliance: 'Nordská', isPublic: true, visibleToPlayerIds: [] },
  { id: 'Tartaros', name: 'Tartaros', color: '#aa0000', size: 5, img: 'tartaros.jpg', alliance: 'Trpasličí', isPublic: true, visibleToPlayerIds: [] },
  { id: 'NeoKosmos', name: 'Neo Kosmos', color: '#aa0000', size: 5, img: 'neo_kosmos.jpg', alliance: 'Svobodná', isPublic: true, visibleToPlayerIds: [] },
  { id: 'FranangrskeVodopady', name: 'Fránangrské vodopády', color: '#888888', size: 5, img: 'franangrske_vodopady.jpg', alliance: 'Svobodná', isPublic: true, visibleToPlayerIds: [] },
  { id: 'MoonMidgard', name: 'Měsíc', color: '#888888', size: 2, img: 'moon.jpg', type: 'moon', isPublic: true, visibleToPlayerIds: [] },
  { id: 'MoonAsgard', name: 'Měsíc', color: '#888888', size: 2, img: 'moon_asgard.jpg', type: 'moon', isPublic: true, visibleToPlayerIds: [] },
  { id: 'MoonInfernun', name: 'Infernun', color: '#888888', size: 2, img: 'infernun.png', type: 'moon', isPublic: true, visibleToPlayerIds: [] },
  { id: 'MoonCaelum', name: 'Caelum', color: '#888888', size: 2, img: 'caelum.png', type: 'moon', isPublic: true, visibleToPlayerIds: [] },
];

export const MATRIX_UNIVERSE_LINKS: UniverseLink[] = [
  { source: 'Svar', target: 'Bhuuvar', isOrbit: false },
  { source: 'Svar', target: 'AlsiniAlththani', isOrbit: false },
  { source: 'Bhuuvar', target: 'Bhur', isOrbit: false },
  { source: 'Bhuuvar', target: 'AleasrAlthalith', isOrbit: false },
  { source: 'Bhuuvar', target: 'AlsiniAlththani', isOrbit: false },
  { source: 'Bhur', target: 'Eden', isOrbit: false },
  { source: 'Bhur', target: 'AleasrAlthalith', isOrbit: false },
  { source: 'Eden', target: 'Asgard', isOrbit: false },
  { source: 'Eden', target: 'AleasrAlthalith', isOrbit: false },
  { source: 'Eden', target: 'Muspelheim', isOrbit: false },
  { source: 'Eden', target: 'Qiunxun', isOrbit: false },
  { source: 'MaanAshwada', target: 'Asgard', isOrbit: false },
  { source: 'Yume', target: 'Asgard', isOrbit: false },
  { source: 'Yume', target: 'Alfheim', isOrbit: false },
  { source: 'Asgard', target: 'Alfheim', isOrbit: false },
  { source: 'Asgard', target: 'Muspelheim', isOrbit: false },
  { source: 'Asgard', target: 'Vanaheim', isOrbit: false },
  { source: 'AleasrAlthalith', target: 'Muspelheim', isOrbit: false },
  { source: 'AleasrAlthalith', target: 'Simheim', isOrbit: false },
  { source: 'AleasrAlthalith', target: 'AlsiniAlththani', isOrbit: false },
  { source: 'Muspelheim', target: 'Alfheim', isOrbit: false },
  { source: 'Muspelheim', target: 'Simheim', isOrbit: false },
  { source: 'Muspelheim', target: 'Midgard', isOrbit: false },
  { source: 'Alfheim', target: 'Midgard', isOrbit: false },
  { source: 'Alfheim', target: 'Vanaheim', isOrbit: false },
  { source: 'Vanaheim', target: 'Midgard', isOrbit: false },
  { source: 'Vanaheim', target: 'Qiunxun', isOrbit: false },
  { source: 'Vanaheim', target: 'Noutun', isOrbit: false },
  { source: 'Vanaheim', target: 'Folkvangr', isOrbit: false },
  { source: 'Qiunxun', target: 'Folkvangr', isOrbit: false },
  { source: 'Qiunxun', target: 'Purgatorium', isOrbit: false },
  { source: 'Qiunxun', target: 'FranangrskeVodopady', isOrbit: false },
  { source: 'Folkvangr', target: 'Noutun', isOrbit: false },
  { source: 'Folkvangr', target: 'Purgatorium', isOrbit: false },
  { source: 'AlsiniAlththani', target: 'Simheim', isOrbit: false },
  { source: 'AlsiniAlththani', target: 'AlsinuAlAwal', isOrbit: false },
  { source: 'Simheim', target: 'Midgard', isOrbit: false },
  { source: 'Simheim', target: 'AlsinuAlAwal', isOrbit: false },
  { source: 'Simheim', target: 'Jotunheim', isOrbit: false },
  { source: 'Simheim', target: 'Svartalfheim', isOrbit: false },
  { source: 'Midgard', target: 'Jotunheim', isOrbit: false },
  { source: 'Midgard', target: 'Svartalfheim', isOrbit: false },
  { source: 'Midgard', target: 'Niflheim', isOrbit: false },
  { source: 'Midgard', target: 'Noutun', isOrbit: false },
  { source: 'Noutun', target: 'Niflheim', isOrbit: false },
  { source: 'AlsinuAlAwal', target: 'Jotunheim', isOrbit: false },
  { source: 'AlsinuAlAwal', target: 'Babylon', isOrbit: false },
  { source: 'Jotunheim', target: 'Babylon', isOrbit: false },
  { source: 'Jotunheim', target: 'Svartalfheim', isOrbit: false },
  { source: 'Jotunheim', target: 'Hellheim', isOrbit: false },
  { source: 'Svartalfheim', target: 'Hellheim', isOrbit: false },
  { source: 'Svartalfheim', target: 'Niflheim', isOrbit: false },
  { source: 'Niflheim', target: 'Hellheim', isOrbit: false },
  { source: 'Niflheim', target: 'Hvelgelmir', isOrbit: false },
  { source: 'Niflheim', target: 'Urdarbrunnr', isOrbit: false },
  { source: 'Babylon', target: 'VeschonechyeLesa', isOrbit: false },
  { source: 'Babylon', target: 'Troja', isOrbit: false },
  { source: 'Troja', target: 'VeschonechyeLesa', isOrbit: false },
  { source: 'Troja', target: 'Olymp', isOrbit: false },
  { source: 'VeschonechyeLesa', target: 'Olymp', isOrbit: false },
  { source: 'VeschonechyeLesa', target: 'Nav', isOrbit: false },
  { source: 'Olymp', target: 'Hellheim', isOrbit: false },
  { source: 'Olymp', target: 'Tartaros', isOrbit: false },
  { source: 'Olymp', target: 'Svartalfheim', isOrbit: false },
  { source: 'Tartaros', target: 'Hellheim', isOrbit: false },
  { source: 'Tartaros', target: 'Lachesis', isOrbit: false },
  { source: 'Tartaros', target: 'NeoKosmos', isOrbit: false },
  { source: 'MoonMidgard', target: 'Midgard', isOrbit: true },
  { source: 'MoonAsgard', target: 'Asgard', isOrbit: true },
  { source: 'MoonCaelum', target: 'Tartaros', isOrbit: true },
  { source: 'MoonInfernun', target: 'Purgatorium', isOrbit: true },
  { source: 'Mimirunnr', target: 'Nav', isOrbit: false },
  { source: 'Mimirunnr', target: 'Hvelgelmir', isOrbit: false },
  { source: 'Mimirunnr', target: 'Lachesis', isOrbit: false },
  { source: 'Mimirunnr', target: 'Urdarbrunnr', isOrbit: false },
  { source: 'Mimirunnr', target: 'Jotunheim', isOrbit: false },
  { source: 'Hvelgelmir', target: 'Urdarbrunnr', isOrbit: false },
  { source: 'Hvelgelmir', target: 'Tim', isOrbit: false },
  { source: 'Urdarbrunnr', target: 'Tim', isOrbit: false },
  { source: 'Nav', target: 'Lachesis', isOrbit: false },
  { source: 'Lachesis', target: 'NeoKosmos', isOrbit: false },
];
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/universe/seed/matrix-universe.seed.ts
git commit -m "feat(universe): přidat Matrix world seed data (40 uzlů, 78 spojení)"
```

---

## Task 3: Unit testy (failing)

**Files:**
- Create: `backend/src/modules/universe/universe.service.spec.ts`

- [ ] **Step 1: Vytvoř testovací soubor**

Vytvoř `backend/src/modules/universe/universe.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UniverseService } from './universe.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { UniverseMap } from './interfaces/universe-map.interface';

const mockMap: UniverseMap = {
  id: 'map1',
  worldId: 'world1',
  nodes: [
    { id: 'Midgard', name: 'Midgard', color: '#ffffff', size: 8, isPublic: true, visibleToPlayerIds: [] },
    { id: 'Asgard', name: 'Asgard', color: '#ffee00', size: 6, isPublic: false, visibleToPlayerIds: ['player1'] },
    { id: 'Niflheim', name: 'Niflheim', color: '#00bfff', size: 6, isPublic: false, visibleToPlayerIds: [] },
  ],
  links: [
    { source: 'Midgard', target: 'Asgard', isOrbit: false },
    { source: 'Midgard', target: 'Niflheim', isOrbit: false },
    { source: 'Asgard', target: 'Niflheim', isOrbit: false },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UniverseService', () => {
  let service: UniverseService;
  const mockRepo = {
    findByWorld: jest.fn(),
    upsert: jest.fn(),
    updateNodeVisibility: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UniverseService,
        { provide: 'IUniverseRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(UniverseService);
  });

  describe('findByWorld', () => {
    it('vrátí existující mapu', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', null, false);
      expect(result).toBeDefined();
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('vrátí prázdnou mapu pro neexistující svět (ne Matrix)', async () => {
      mockRepo.findByWorld.mockResolvedValue(null);
      mockRepo.upsert.mockResolvedValue({ ...mockMap, nodes: [], links: [] });
      const result = await service.findByWorld('other-world', null, false);
      expect(result.nodes).toHaveLength(0);
      expect(mockRepo.upsert).toHaveBeenCalledWith('other-world', [], []);
    });
  });

  describe('visibility filtr', () => {
    it('PJ vidí všechny uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'pj1', true);
      expect(result.nodes).toHaveLength(3);
      expect(result.links).toHaveLength(3);
    });

    it('hráč vidí jen isPublic=true uzly a uzly kde je v visibleToPlayerIds', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'player1', false);
      // Midgard (isPublic) + Asgard (player1 v visibleToPlayerIds)
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['Midgard', 'Asgard']));
    });

    it('hráč nevidí uzly kde není ani isPublic ani v visibleToPlayerIds', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'player2', false);
      // jen Midgard (isPublic)
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
    });

    it('filtruje linky na skryté uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', 'player2', false);
      // player2 vidí jen Midgard → žádný link není platný (Asgard a Niflheim skryté)
      expect(result.links).toHaveLength(0);
    });

    it('anon uživatel (null userId) vidí jen isPublic uzly', async () => {
      mockRepo.findByWorld.mockResolvedValue(mockMap);
      const result = await service.findByWorld('world1', null, false);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('Midgard');
    });
  });

  describe('update', () => {
    it('uloží celou mapu a vrátí výsledek', async () => {
      mockRepo.upsert.mockResolvedValue(mockMap);
      const result = await service.update('world1', { nodes: mockMap.nodes, links: mockMap.links });
      expect(mockRepo.upsert).toHaveBeenCalledWith('world1', mockMap.nodes, mockMap.links);
      expect(result).toBeDefined();
    });
  });

  describe('updateNodeVisibility', () => {
    it('vrátí aktualizovanou mapu při úspěchu', async () => {
      mockRepo.updateNodeVisibility.mockResolvedValue(mockMap);
      const result = await service.updateNodeVisibility('world1', 'Midgard', { isPublic: false, visibleToPlayerIds: ['p1'] });
      expect(result).toBeDefined();
    });

    it('vyhodí NotFoundException pokud nodeId neexistuje', async () => {
      mockRepo.updateNodeVisibility.mockResolvedValue(null);
      await expect(
        service.updateNodeVisibility('world1', 'NEEXISTUJE', { isPublic: true, visibleToPlayerIds: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že selhávají**

```bash
cd backend && npx jest universe.service.spec --no-coverage 2>&1 | tail -5
```

Očekáváno: `Cannot find module './universe.service'` nebo `FAIL`

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/universe/universe.service.spec.ts
git commit -m "test(universe): přidat failing unit testy pro UniverseService"
```

---

## Task 4: Repository implementace

**Files:**
- Create: `backend/src/modules/universe/repositories/universe.repository.ts`

- [ ] **Step 1: Vytvoř repository**

Vytvoř `backend/src/modules/universe/repositories/universe.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UniverseMapSchemaClass } from '../schemas/universe-map.schema';
import type { UniverseMap, UniverseNode, UniverseLink } from '../interfaces/universe-map.interface';
import type { IUniverseRepository } from '../interfaces/universe-repository.interface';

@Injectable()
export class MongoUniverseRepository implements IUniverseRepository {
  constructor(
    @InjectModel(UniverseMapSchemaClass.name) private readonly model: Model<UniverseMapSchemaClass>,
  ) {}

  async findByWorld(worldId: string): Promise<UniverseMap | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc ? this.toEntity(doc as Record<string, unknown>) : null;
  }

  async upsert(worldId: string, nodes: UniverseNode[], links: UniverseLink[]): Promise<UniverseMap> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId },
        { $set: { nodes, links } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as Record<string, unknown>);
  }

  async updateNodeVisibility(
    worldId: string,
    nodeId: string,
    isPublic: boolean,
    visibleToPlayerIds: string[],
  ): Promise<UniverseMap | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    if (!doc) return null;

    const nodes = (doc.nodes as Record<string, unknown>[]) ?? [];
    const nodeIndex = nodes.findIndex((n) => n['id'] === nodeId);
    if (nodeIndex === -1) return null;

    const updated = await this.model
      .findOneAndUpdate(
        { worldId, 'nodes.id': nodeId },
        { $set: { 'nodes.$.isPublic': isPublic, 'nodes.$.visibleToPlayerIds': visibleToPlayerIds } },
        { new: true },
      )
      .lean()
      .exec();

    return updated ? this.toEntity(updated as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): UniverseMap {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      nodes: ((doc.nodes as Record<string, unknown>[]) ?? []).map((n) => ({
        id: n['id'] as string,
        name: n['name'] as string,
        type: n['type'] as UniverseMap['nodes'][0]['type'],
        color: (n['color'] as string) ?? '#ffffff',
        size: (n['size'] as number) ?? 5,
        img: n['img'] as string | undefined,
        alliance: n['alliance'] as string | undefined,
        x: n['x'] as number | undefined,
        y: n['y'] as number | undefined,
        z: n['z'] as number | undefined,
        isPublic: (n['isPublic'] as boolean) ?? false,
        visibleToPlayerIds: (n['visibleToPlayerIds'] as string[]) ?? [],
      })),
      links: ((doc.links as Record<string, unknown>[]) ?? []).map((l) => ({
        source: l['source'] as string,
        target: l['target'] as string,
        isOrbit: (l['isOrbit'] as boolean) ?? false,
      })),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/universe/repositories/universe.repository.ts
git commit -m "feat(universe): implementovat MongoUniverseRepository"
```

---

## Task 5: Service implementace (zprovoznění testů)

**Files:**
- Create: `backend/src/modules/universe/universe.service.ts`

- [ ] **Step 1: Vytvoř service**

Vytvoř `backend/src/modules/universe/universe.service.ts`:

```typescript
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUniverseRepository } from './interfaces/universe-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { UniverseMap, UniverseNode, UniverseLink } from './interfaces/universe-map.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { MATRIX_UNIVERSE_NODES, MATRIX_UNIVERSE_LINKS } from './seed/matrix-universe.seed';
import { MATRIX_WORLD_ID } from '../../database/seed/matrix-world.seed';

export interface UpdateUniverseInput {
  nodes: UniverseNode[];
  links: UniverseLink[];
}

export interface UpdateNodeVisibilityInput {
  isPublic: boolean;
  visibleToPlayerIds: string[];
}

@Injectable()
export class UniverseService {
  constructor(
    @Inject('IUniverseRepository') private readonly repo: IUniverseRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findByWorld(worldId: string, userId: string | null, isPjOrAdmin: boolean): Promise<UniverseMap> {
    let map = await this.repo.findByWorld(worldId);

    if (!map) {
      const isMatrix = worldId === MATRIX_WORLD_ID;
      const nodes = isMatrix ? MATRIX_UNIVERSE_NODES : [];
      const links = isMatrix ? MATRIX_UNIVERSE_LINKS : [];
      map = await this.repo.upsert(worldId, nodes, links);
    }

    if (isPjOrAdmin) return map;
    return this.applyVisibilityFilter(map, userId);
  }

  async update(worldId: string, dto: UpdateUniverseInput): Promise<UniverseMap> {
    const map = await this.repo.upsert(worldId, dto.nodes, dto.links);
    this.eventEmitter.emit('universe.updated', { worldId, map });
    return map;
  }

  async updateNodeVisibility(
    worldId: string,
    nodeId: string,
    dto: UpdateNodeVisibilityInput,
  ): Promise<UniverseMap> {
    const map = await this.repo.updateNodeVisibility(worldId, nodeId, dto.isPublic, dto.visibleToPlayerIds);
    if (!map) throw new NotFoundException('Uzel nenalezen');
    this.eventEmitter.emit('universe.updated', { worldId, map });
    return map;
  }

  private applyVisibilityFilter(map: UniverseMap, userId: string | null): UniverseMap {
    const visibleIds = new Set(
      map.nodes
        .filter((n) => n.isPublic || (userId !== null && n.visibleToPlayerIds.includes(userId)))
        .map((n) => n.id),
    );
    return {
      ...map,
      nodes: map.nodes.filter((n) => visibleIds.has(n.id)),
      links: map.links.filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target)),
    };
  }
}
```

- [ ] **Step 2: Spusť testy — ověř že procházejí**

```bash
cd backend && npx jest universe.service.spec --no-coverage 2>&1 | tail -10
```

Očekáváno: `PASS`, všechny testy zelené.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/universe/universe.service.ts
git commit -m "feat(universe): implementovat UniverseService, všechny testy prochází"
```

---

## Task 6: DTOs

**Files:**
- Create: `backend/src/modules/universe/dto/update-universe.dto.ts`
- Create: `backend/src/modules/universe/dto/update-node-visibility.dto.ts`

- [ ] **Step 1: Vytvoř UpdateUniverseDto**

Vytvoř `backend/src/modules/universe/dto/update-universe.dto.ts`:

```typescript
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UniverseNodeDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsOptional() @IsString() type?: string;
  @IsString() color: string;
  @IsNumber() size: number;
  @IsOptional() @IsString() img?: string;
  @IsOptional() @IsString() alliance?: string;
  @IsOptional() @IsNumber() x?: number;
  @IsOptional() @IsNumber() y?: number;
  @IsOptional() @IsNumber() z?: number;
  @IsBoolean() isPublic: boolean;
  @IsArray() @IsString({ each: true }) visibleToPlayerIds: string[];
}

export class UniverseLinkDto {
  @IsString() source: string;
  @IsString() target: string;
  @IsBoolean() isOrbit: boolean;
}

export class UpdateUniverseDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => UniverseNodeDto) nodes: UniverseNodeDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => UniverseLinkDto) links: UniverseLinkDto[];
}
```

- [ ] **Step 2: Vytvoř UpdateNodeVisibilityDto**

Vytvoř `backend/src/modules/universe/dto/update-node-visibility.dto.ts`:

```typescript
import { IsArray, IsBoolean, IsString } from 'class-validator';

export class UpdateNodeVisibilityDto {
  @IsBoolean() isPublic: boolean;
  @IsArray() @IsString({ each: true }) visibleToPlayerIds: string[];
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/universe/dto/
git commit -m "feat(universe): přidat DTOs"
```

---

## Task 7: Gateway

**Files:**
- Create: `backend/src/modules/universe/universe.gateway.ts`

- [ ] **Step 1: Vytvoř gateway**

Vytvoř `backend/src/modules/universe/universe.gateway.ts`:

```typescript
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import type { UniverseMap } from './interfaces/universe-map.interface';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class UniverseGateway {
  @WebSocketServer() server: Server;

  @OnEvent('universe.updated')
  handleUniverseUpdated(payload: { worldId: string; map: UniverseMap }) {
    this.server.to(`world:${payload.worldId}`).emit('universe:updated', payload.map);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/universe/universe.gateway.ts
git commit -m "feat(universe): přidat UniverseGateway pro real-time broadcast"
```

---

## Task 8: Controller + Module + registrace

**Files:**
- Create: `backend/src/modules/universe/universe.controller.ts`
- Create: `backend/src/modules/universe/universe.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř controller**

Vytvoř `backend/src/modules/universe/universe.controller.ts`:

```typescript
import { Controller, Get, Put, Patch, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { UniverseService } from './universe.service';
import { UpdateUniverseDto } from './dto/update-universe.dto';
import { UpdateNodeVisibilityDto } from './dto/update-node-visibility.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('universe')
export class UniverseController {
  constructor(private readonly service: UniverseService) {}

  @Get()
  async findByWorld(@Query('worldId') worldId: string, @Req() req: Request) {
    const user = (req as Request & { user?: RequestUser }).user;
    const userId = user?.id ?? null;
    const isPjOrAdmin = user ? user.role <= UserRole.Admin : false;

    if (!isPjOrAdmin && userId) {
      // zkontroluj world membership pro PJ roli — delegujeme na service, které zná MATRIX_WORLD_ID
    }

    return this.service.findByWorld(worldId, userId, isPjOrAdmin);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async update(
    @Query('worldId') worldId: string,
    @Body() dto: UpdateUniverseDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.update(worldId, dto);
  }

  @Patch(':worldId/nodes/:nodeId/visibility')
  @UseGuards(JwtAuthGuard)
  async updateNodeVisibility(
    @Param('worldId') worldId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeVisibilityDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.updateNodeVisibility(worldId, nodeId, dto);
  }
}
```

> **Poznámka:** GET endpoint je veřejný (bez JwtAuthGuard), ale optionálně čte user z requestu pro visibility filtr. JwtAuthGuard není použit — user může být null (anon). PJ roli v GET nedetekujeme přes membership (overhead); PJ vidí vše jen přes `role <= Admin` check. Pokud chceme PJ world-role aware GET, přidáme v iteraci 2.

- [ ] **Step 2: Vytvoř module**

Vytvoř `backend/src/modules/universe/universe.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UniverseMapSchemaClass, UniverseMapSchema } from './schemas/universe-map.schema';
import { MongoUniverseRepository } from './repositories/universe.repository';
import { UniverseService } from './universe.service';
import { UniverseController } from './universe.controller';
import { UniverseGateway } from './universe.gateway';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UniverseMapSchemaClass.name, schema: UniverseMapSchema }]),
    WorldsModule,
  ],
  controllers: [UniverseController],
  providers: [
    UniverseService,
    UniverseGateway,
    { provide: 'IUniverseRepository', useClass: MongoUniverseRepository },
  ],
  exports: [UniverseService],
})
export class UniverseModule {}
```

- [ ] **Step 3: Registruj v app.module.ts**

V `backend/src/app.module.ts` přidej import:

```typescript
import { UniverseModule } from './modules/universe/universe.module';
```

A do pole `imports` přidej `UniverseModule` za `NpcTemplatesModule`:

```typescript
imports: [
  // ... stávající moduly ...
  NpcTemplatesModule,
  UniverseModule,   // ← přidat
  GatewaysModule,
],
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/universe/universe.controller.ts \
        backend/src/modules/universe/universe.module.ts \
        backend/src/app.module.ts
git commit -m "feat(universe): přidat controller, module, registrovat v AppModule"
```

---

## Task 9: Ověření + roadmap

- [ ] **Step 1: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -15
```

Očekáváno: všechny testy prochází, žádné regrese.

- [ ] **Step 2: TypeScript build check**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Očekáváno: žádné chyby.

- [ ] **Step 3: Aktualizuj roadmap**

V `docs/roadmap.md` najdi sekci `## Krok 7c — Universe Map ⬜` a aktualizuj:

```markdown
## Krok 7c — Universe Map ✅

> 3D vesmírná mapa světa — uzly, spoje, postupné odhalování, real-time sync, legacy seed pro Matrix.

- [x] **UniverseMap schema**: worldId, nodes (id/name/type/color/size/img/alliance/x/y/z/isPublic/visibleToPlayerIds), links (source/target/isOrbit)
- [x] Node typy: planet/star/nebula/asteroid/moon/blackhole
- [x] Visibility filter: PJ/Admin vidí vše; hráči vidí isPublic=true NEBO v visibleToPlayerIds; links filtrovat aby neodhalily skryté uzly
- [x] Lazy init: Matrix world → seed (40 uzlů, 78 spojení); ostatní světy → prázdná mapa
- [x] GET /api/universe?worldId=:id, PUT (full replace), PATCH /:worldId/nodes/:nodeId/visibility
- [x] Real-time: universe:updated event přes world:{worldId} room
```

Také aktualizuj tabulku stavu dole: `| 7c | Universe Map | ✅ |`

- [ ] **Step 4: Final commit**

```bash
git add docs/roadmap.md
git commit -m "docs: označit Krok 7c jako hotový"
```
