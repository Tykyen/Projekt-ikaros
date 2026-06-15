import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateScheduledMessageDto } from './create-scheduled-message.dto';

/** Validní základ — attachments se testují nad ním. */
const base = {
  channelId: 'chan-1',
  sendAt: '2030-01-01T00:00:00.000Z',
};

const validAttachment = {
  url: 'https://example.com/a.png',
  publicId: 'pub-1',
  type: 'image',
  mimeType: 'image/png',
  filename: 'a.png',
  size: 1024,
};

async function errorProps(patch: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateScheduledMessageDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreateScheduledMessageDto — F-19 (attachments @ValidateNested)', () => {
  it('F-19 — přijme validní attachment', async () => {
    expect(await errorProps({ attachments: [validAttachment] })).toEqual([]);
  });

  it('F-19 — přijme bez attachments (volitelné)', async () => {
    expect(await errorProps({})).toEqual([]);
  });

  it('F-19 — odmítne libovolný objekt protlačený do attachments', async () => {
    // Bez nested validace by cron/přímý zápis dostal {foo:'bar'} do ChatMessage.
    expect(await errorProps({ attachments: [{ foo: 'bar' }] })).toContain(
      'attachments',
    );
  });

  it('F-19 — odmítne neplatné url / type / přílišný size', async () => {
    expect(
      await errorProps({
        attachments: [{ ...validAttachment, url: 'not-a-url' }],
      }),
    ).toContain('attachments');
    expect(
      await errorProps({
        attachments: [{ ...validAttachment, type: 'exe' }],
      }),
    ).toContain('attachments');
    expect(
      await errorProps({
        attachments: [{ ...validAttachment, size: 99999999999 }],
      }),
    ).toContain('attachments');
  });

  it('F-19 — odmítne víc než 10 attachmentů (ArrayMaxSize)', async () => {
    expect(
      await errorProps({ attachments: Array(11).fill(validAttachment) }),
    ).toContain('attachments');
  });
});
