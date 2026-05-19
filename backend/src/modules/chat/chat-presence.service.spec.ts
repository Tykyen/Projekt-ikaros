import { ChatPresenceService, PresenceUser } from './chat-presence.service';

const userA: PresenceUser = {
  userId: 'a',
  username: 'Aragorn',
  worldRole: 5,
};
const userB: PresenceUser = {
  userId: 'b',
  username: 'Boromir',
  worldRole: 2,
};

describe('ChatPresenceService', () => {
  let svc: ChatPresenceService;

  beforeEach(() => {
    svc = new ChatPresenceService();
  });

  it('join přidá uživatele a list ho vrátí', () => {
    const res = svc.join('ch1', 'sock1', userA);
    expect(res.alreadyPresent).toBe(false);
    expect(svc.list('ch1')).toEqual([userA]);
  });

  it('list deduplikuje uživatele s víc sockety', () => {
    svc.join('ch1', 'sock1', userA);
    const res = svc.join('ch1', 'sock2', userA);
    expect(res.alreadyPresent).toBe(true);
    expect(svc.list('ch1')).toHaveLength(1);
  });

  it('leave odebere socket; stillPresent=false když odešel poslední', () => {
    svc.join('ch1', 'sock1', userA);
    const left = svc.leave('ch1', 'sock1');
    expect(left?.user.userId).toBe('a');
    expect(left?.stillPresent).toBe(false);
    expect(svc.list('ch1')).toHaveLength(0);
  });

  it('leave: stillPresent=true když uživateli zůstal jiný socket', () => {
    svc.join('ch1', 'sock1', userA);
    svc.join('ch1', 'sock2', userA);
    const left = svc.leave('ch1', 'sock1');
    expect(left?.stillPresent).toBe(true);
    expect(svc.list('ch1')).toHaveLength(1);
  });

  it('leave neznámého socketu vrátí null', () => {
    expect(svc.leave('ch1', 'ghost')).toBeNull();
  });

  it('leaveAll odebere socket ze všech konverzací', () => {
    svc.join('ch1', 'sock1', userA);
    svc.join('ch2', 'sock1', userA);
    svc.join('ch1', 'sock1b', userB);
    const removed = svc.leaveAll('sock1');
    expect(removed.map((r) => r.channelId).sort()).toEqual(['ch1', 'ch2']);
    expect(svc.list('ch1')).toEqual([userB]);
    expect(svc.list('ch2')).toHaveLength(0);
  });

  it('list neznámé konverzace vrátí prázdné pole', () => {
    expect(svc.list('nope')).toEqual([]);
  });
});
