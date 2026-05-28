# API

Endpointy mají dnešní cesty, ale **mění chování** a body shape.

## `GET /map-templates`

### Před

```ts
@Get()
findAll() { return this.repo.findAll(); }  // všechny šablony, žádný filter
```

### Po

```ts
@Get()
@UseGuards(JwtAuthGuard)
async findAll(@CurrentUser() user: RequestUser) {
  if (user.role <= UserRole.ADMIN) {
    return this.repo.findAll();  // Admin+Superadmin vidí vše
  }
  return this.repo.findByOwner(user.id);  // PJ jen své
}
```

**Response:** `MapTemplate[]` seřazené `updatedAt desc`.

## `GET /map-templates/:id`

### Po

```ts
@Get(':id')
@UseGuards(JwtAuthGuard)
async findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
  const tpl = await this.repo.findById(id);
  if (!tpl) throw new NotFoundException({ code: 'MAP_TEMPLATE_NOT_FOUND', ... });
  if (user.role > UserRole.ADMIN && tpl.ownerId !== user.id) {
    throw new ForbiddenException({ code: 'MAP_TEMPLATE_FORBIDDEN_OWNER', ... });
  }
  return tpl;
}
```

## `POST /map-templates`

### Před

```ts
async create(@Body() dto, @CurrentUser() user) {
  if (user.role > UserRole.PJ) throw NotFoundException(...);  // ⚠️ wrong exception type
  return this.repo.create(dto);
}
```

### Po

```ts
async create(@Body() dto: CreateMapTemplateDto, @CurrentUser() user: RequestUser) {
  if (user.role > UserRole.PJ) {
    throw new ForbiddenException({ code: 'MAP_TEMPLATE_FORBIDDEN', message: 'Nedostatečná oprávnění' });
  }
  // Server-side ownership: ignorovat case kdy klient pošle ownerId; vždy přepsat
  const payload = {
    ...dto,
    ownerId: user.id,
    tokens: filterOutPcTokens(dto.tokens ?? []),  // serverside PC strip
  };
  // Validace
  if (!payload.name?.trim()) throw new BadRequestException({ code: 'MAP_TEMPLATE_INVALID', message: 'Jméno povinné' });
  if (!payload.imageUrl) throw new BadRequestException({ code: 'MAP_TEMPLATE_INVALID', message: 'Pozadí povinné' });

  return this.repo.create(payload);
}
```

**`CreateMapTemplateDto`** (nový):

```ts
class CreateMapTemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsString() @MinLength(1) imageUrl: string;
  @IsObject() config: Record<string, unknown>;
  @IsArray() tokens?: unknown[];
  @IsArray() npcTemplates?: unknown[];
  @IsArray() effects?: unknown[];
  @IsBoolean() fogEnabled?: boolean;
  @IsArray() revealedHexes?: unknown[];
  @IsArray() @IsString({ each: true }) activeSoundIds?: string[];
}
```

**Bug fix:** dnes je `throw new NotFoundException` u 403 případu — zachovat původní bug? **NE, opravit** (`ForbiddenException`). Standardní HTTP semantika.

## `PUT /map-templates/:id`

```ts
async replace(@Param('id') id, @Body() dto, @CurrentUser() user) {
  const existing = await this.repo.findById(id);
  if (!existing) throw NotFoundException(...);
  if (user.role > UserRole.ADMIN && existing.ownerId !== user.id) {
    throw new ForbiddenException({ code: 'MAP_TEMPLATE_FORBIDDEN_OWNER', ... });
  }
  // ownerId zachovat, ignorovat hodnotu z bodyu (nelze měnit)
  const payload = { ...dto, ownerId: existing.ownerId, tokens: filterOutPcTokens(dto.tokens ?? []) };
  await this.repo.replace(id, payload);
}
```

## `DELETE /map-templates/:id`

```ts
async delete(@Param('id') id, @CurrentUser() user) {
  const existing = await this.repo.findById(id);
  if (!existing) throw NotFoundException(...);
  if (user.role > UserRole.ADMIN && existing.ownerId !== user.id) {
    throw new ForbiddenException({ code: 'MAP_TEMPLATE_FORBIDDEN_OWNER', ... });
  }
  await this.repo.delete(id);
}
```

## FE — save behavior

[`MapLibraryModal.tsx`](../../../../Projekt-ikaros-FE/src/features/world/tactical-map/components/pj-panel/MapLibraryModal.tsx) — současný `saveMutation`:

### Před

```ts
return api.post<MapTemplate>('/map-templates', {
  name: saveName.trim(),
  imageUrl: scene.imageUrl,
  config: scene.config,
  tokens: [],          // ← ochuzeno
  npcTemplates: [],    // ← ochuzeno
  effects: [],         // ← ochuzeno
  revealedHexes: [],   // ← ochuzeno
});
```

### Po

```ts
return api.post<MapTemplate>('/map-templates', {
  name: saveName.trim(),
  imageUrl: scene.imageUrl,
  config: scene.config,
  tokens: scene.tokens.filter(t => t.isNpc),  // ← PC tokens vyhazujeme
  npcTemplates: scene.npcTemplates,
  effects: scene.effects,
  fogEnabled: scene.fogEnabled ?? false,
  revealedHexes: scene.revealedHexes ?? [],
  activeSoundIds: scene.activeSoundIds ?? [],
});
```

## FE — load behavior

### Před

```ts
const ops: MapOperation[] = [];
if (template.imageUrl !== scene.imageUrl) ops.push({ type: 'scene.image', ... });
if (template.config) ops.push({ type: 'scene.config', ... });
for (const op of ops) await postMapOperation(scene.id, op);
```

### Po (10.2c-edit-3 — nová scéna místo přepisu)

```ts
// 1. Confirm dialog
if (!await confirm('Vytvořím novou aktivní scénu se vším z šablony…')) return;

// 2. Vytvořit novou scénu se full snapshot v jednom POST
const newScene = await api.post('/maps', {
  worldId,
  name: template.name,
  imageUrl: template.imageUrl,
  config: template.config,
  tokens: template.tokens.filter(t => t.isNpc === true),
  npcTemplates: template.npcTemplates,
  effects: template.effects,
  fogEnabled: template.fogEnabled,
  revealedHexes: template.revealedHexes,
  activeSoundIds: template.activeSoundIds,
});

// 3. Aktivovat (paralelní — netýká se ostatních scén díky setActive fixu z 10.2c-edit-3)
await apiClient.post(`/maps/${newScene.id}/active`, { params: { worldId } });

// 4. Přepnout PJ na novou scénu
await postWorldOperation(worldId, {
  type: 'member.assignToScene',
  userId: currentUser.id,
  sceneId: newScene.id,
});
```

**5 op types pro overwrite v existing scéně** (alternativní flow, ne default v UI):

- `scene.fog.replace`
- `scene.effects.replace`
- `scene.npc-templates.replace`
- `scene.tokens.replace-npc` — speciální: bulk replace **jen** non-PC tokenů; PC tokeny ve scéně zůstávají nedotčené
- `scene.sounds.set`

Tyto ops zůstávají v BE i FE union pro budoucí použití (např. „obnov starou scénu z šablony" advanced flow). Default UX je vytvořit novou scénu (viz výše).

**Per-op handlers v `MapOperationsService`:**

- Standard pattern (assertCanManage PJ-only, atomic mongo update, log + broadcast).
- Inverse pro 10.2m undo: každá op má `inverse` v response (snapshot předchozí hodnoty toho pole).

## Confirm dialog — UX detail

Místo `window.confirm` použít projektový `ConfirmModal` (existuje v shared/ui? **Ověřit**, jinak vytvořit). Důvod: stylový soulad s appkou; `window.confirm` zobrazuje native browser modal který se neumí ztemnit pod ním atd.
