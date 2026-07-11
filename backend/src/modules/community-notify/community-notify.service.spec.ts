import { CommunityNotifyService } from './community-notify.service';

describe('CommunityNotifyService (Discord oznámení nový svět/postava)', () => {
  function make(webhook?: string) {
    const config = { get: () => webhook } as never;
    const usersRepo = {
      findById: jest.fn().mockResolvedValue({ username: 'Tyky' }),
    } as never;
    const worldsRepo = {
      findById: jest.fn().mockResolvedValue({ name: 'Temný hvozd' }),
    } as never;
    return new CommunityNotifyService(config, usersRepo, worldsRepo);
  }

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
  });

  it('bez DISCORD_EVENTS_WEBHOOK → no-op', async () => {
    await make(undefined).notifyWorld({
      name: 'X',
      slug: 'x',
      ownerId: 'u1',
      system: 'dnd5e',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('world.created → embed s názvem světa a zakladatelem', async () => {
    await make('https://discord.com/api/webhooks/1/t').notifyWorld({
      name: 'Nová jeskyně',
      slug: 'nova',
      ownerId: 'u1',
      genre: 'fantasy',
      system: 'dnd5e',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    ) as { embeds: { title: string; description: string }[] };
    expect(body.embeds[0].title).toContain('Nový svět');
    expect(body.embeds[0].description).toContain('Nová jeskyně');
    expect(body.embeds[0].description).toContain('Tyky');
  });

  it('character.created → embed s postavou, světem a tvůrcem', async () => {
    await make('https://discord.com/api/webhooks/1/t').notifyCharacter({
      userId: 'u1',
      worldId: 'w1',
      name: 'Aragorn',
      kind: 'character',
      isNpc: false,
    });
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    ) as { embeds: { description: string }[] };
    expect(body.embeds[0].description).toContain('Aragorn');
    expect(body.embeds[0].description).toContain('Temný hvozd');
    expect(body.embeds[0].description).toContain('Tyky');
    expect(body.embeds[0].description).toContain('postava');
  });

  it('NPC bez userId → tvůrce "PJ", label NPC', async () => {
    const svc = make('https://discord.com/api/webhooks/1/t');
    await svc.notifyCharacter({
      worldId: 'w1',
      name: 'Skřet',
      isNpc: true,
    });
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    ) as { embeds: { description: string }[] };
    expect(body.embeds[0].description).toContain('NPC');
    expect(body.embeds[0].description).toContain('PJ');
  });

  it('selhání fetch NEshodí (oznámení nesmí ovlivnit tvorbu)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('net')) as never;
    await expect(
      make('https://discord.com/api/webhooks/1/t').notifyWorld({
        name: 'X',
        slug: 'x',
        ownerId: 'u1',
        system: 'dnd5e',
      }),
    ).resolves.toBeUndefined();
  });
});
