import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16RangerPreset: SystemPreset = {
  system: 'drd16-ranger',
  displayName: 'DrD 16 — Hraničář',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'sila', label: 'Síla', type: 'number', order: 3 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 4 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 5 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    {
      key: 'zivotyCurrent',
      label: 'Životy aktuální',
      type: 'number',
      order: 9,
    },
    { key: 'unava', label: 'Únava', type: 'number', order: 10 },
    {
      key: 'loveckeDovednosti',
      label: 'Lovecké dovednosti',
      type: 'textarea',
      order: 11,
    },
    { key: 'stopovani', label: 'Stopování', type: 'textarea', order: 12 },
    {
      key: 'spolecnik',
      label: 'Společník (zvíře)',
      type: 'textarea',
      order: 13,
    },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 14 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 15 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 16 },
  ],
};
