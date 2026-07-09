import {
  dedupeKey,
  mapLegacyReport,
  type LegacyDiscussionReport,
} from './mapper';

const legacy: LegacyDiscussionReport = {
  _id: 'abc',
  discussionId: 'disc1',
  discussionTitle: 'Diskuze',
  postId: 'post1',
  postContentSnapshot: '<p>Sporný obsah</p>',
  postAuthorName: 'Autor',
  reporterId: 'user5',
  reporterName: 'Reportér',
  reason: 'Spam',
  createdAtUtc: new Date('2026-01-01T10:00:00.000Z'),
  resolved: false,
};

describe('migrate-discussion-reports mapper', () => {
  it('mapuje legacy report na content_report s defaulty', () => {
    const out = mapLegacyReport(legacy);
    expect(out).toMatchObject({
      targetType: 'discussion_post',
      targetId: 'post1',
      targetUrl: '/ikaros/diskuze/disc1',
      targetSnapshot: '<p>Sporný obsah</p>',
      targetAuthorName: 'Autor',
      category: 'other',
      reason: 'Spam',
      reporterId: 'user5',
      reporterName: 'Reportér',
      goodFaith: true,
      notifyMe: false,
      anonymous: false,
      status: 'pending',
    });
    expect(out.createdAtUtc).toEqual(legacy.createdAtUtc);
  });

  it('resolved=true → status resolved', () => {
    expect(mapLegacyReport({ ...legacy, resolved: true }).status).toBe(
      'resolved',
    );
  });

  it('dedupeKey je stabilní pro tentýž targetId+čas', () => {
    const d = new Date('2026-01-01T10:00:00.000Z');
    expect(dedupeKey('post1', d)).toBe(dedupeKey('post1', new Date(d)));
    expect(dedupeKey('post1', d)).not.toBe(dedupeKey('post2', d));
  });
});
