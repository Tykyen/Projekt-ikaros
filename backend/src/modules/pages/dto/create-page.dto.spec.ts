import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePageDto } from './create-page.dto';

/** Validní základ — focal pole se testují nad ním. */
const base = { slug: 'mesto', type: 'Ostatní', title: 'Hlavní město' };

async function focalErrorProps(
  patch: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(CreatePageDto, { ...base, ...patch });
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('CreatePageDto — focal/zoom/fit (parita s GameEvent)', () => {
  it('akceptuje krajní validní hodnoty', async () => {
    expect(
      await focalErrorProps({
        imageFocalX: 0,
        imageFocalY: 100,
        imageZoom: 100,
        imageFit: 'cover',
      }),
    ).toEqual([]);
    expect(
      await focalErrorProps({
        imageFocalX: 50,
        imageFocalY: 50,
        imageZoom: 400,
        imageFit: 'contain',
      }),
    ).toEqual([]);
  });

  it('akceptuje null (clear při odebrání obrázku přes ValidateIf)', async () => {
    expect(
      await focalErrorProps({
        imageFocalX: null,
        imageFocalY: null,
        imageZoom: null,
        imageFit: null,
      }),
    ).toEqual([]);
  });

  it('odmítne focal mimo 0–100', async () => {
    expect(await focalErrorProps({ imageFocalX: -1 })).toContain('imageFocalX');
    expect(await focalErrorProps({ imageFocalY: 101 })).toContain(
      'imageFocalY',
    );
  });

  it('odmítne zoom mimo 100–400', async () => {
    expect(await focalErrorProps({ imageZoom: 99 })).toContain('imageZoom');
    expect(await focalErrorProps({ imageZoom: 401 })).toContain('imageZoom');
  });

  it('odmítne neznámý fit', async () => {
    expect(await focalErrorProps({ imageFit: 'stretch' })).toContain(
      'imageFit',
    );
  });
});
