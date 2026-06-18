import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { TotpCryptoService } from './totp-crypto.service';

function makeService(key?: string): TotpCryptoService {
  const config = { get: () => key } as unknown as ConfigService;
  return new TotpCryptoService(config);
}

describe('TotpCryptoService', () => {
  const key = Buffer.alloc(32, 7).toString('base64'); // validní 32 B klíč

  it('encrypt → decrypt round-trip', () => {
    const svc = makeService(key);
    const secret = 'JBSWY3DPEHPK3PXP';
    const enc = svc.encryptSecret(secret);
    expect(enc).not.toContain(secret); // v DB není plaintext
    expect(svc.decryptSecret(enc)).toBe(secret);
  });

  it('stejný vstup → jiný ciphertext (náhodné IV)', () => {
    const svc = makeService(key);
    expect(svc.encryptSecret('x')).not.toBe(svc.encryptSecret('x'));
  });

  it('manipulace s ciphertextem → throw (GCM auth tag)', () => {
    const svc = makeService(key);
    const [iv, tag] = svc.encryptSecret('secret').split(':');
    const tampered = [iv, tag, Buffer.from('zzzzzz').toString('base64')].join(
      ':',
    );
    expect(() => svc.decryptSecret(tampered)).toThrow();
  });

  it('fail-closed bez klíče', () => {
    const svc = makeService(undefined);
    expect(svc.isConfigured).toBe(false);
    expect(() => svc.encryptSecret('x')).toThrow(ServiceUnavailableException);
  });

  it('odmítne klíč špatné délky', () => {
    expect(makeService(Buffer.alloc(16).toString('base64')).isConfigured).toBe(
      false,
    );
  });
});
