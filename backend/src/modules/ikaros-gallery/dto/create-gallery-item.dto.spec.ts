import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGalleryItemDto } from './create-gallery-item.dto';

/**
 * Regrese 400 na POST /ikaros-gallery — multipart/form-data posílá `submit`
 * jako string "true"/"false". Bez @Transform by @IsBoolean validace spadla.
 * Test simuluje co dělá globální ValidationPipe(transform: true).
 */
describe('CreateGalleryItemDto', () => {
  async function check(plain: Record<string, unknown>) {
    const dto = plainToInstance(CreateGalleryItemDto, plain);
    const errors = await validate(dto);
    return { dto, errors };
  }

  it('submit "true" (multipart string) → boolean true, validní', async () => {
    const { dto, errors } = await check({ title: 'X', submit: 'true' });
    expect(errors).toHaveLength(0);
    expect(dto.submit).toBe(true);
  });

  it('submit "false" (multipart string) → boolean false, validní', async () => {
    const { dto, errors } = await check({ title: 'X', submit: 'false' });
    expect(errors).toHaveLength(0);
    expect(dto.submit).toBe(false);
  });

  it('submit chybí → undefined, validní', async () => {
    const { dto, errors } = await check({ title: 'X' });
    expect(errors).toHaveLength(0);
    expect(dto.submit).toBeUndefined();
  });

  it('submit skutečný boolean → zůstává zachován', async () => {
    const { dto, errors } = await check({ title: 'X', submit: true });
    expect(errors).toHaveLength(0);
    expect(dto.submit).toBe(true);
  });

  it('prázdný title → validační chyba', async () => {
    const { errors } = await check({ title: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('category s neplatným slugem → validační chyba', async () => {
    const { errors } = await check({ title: 'X', category: 'Velké Písmo' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
