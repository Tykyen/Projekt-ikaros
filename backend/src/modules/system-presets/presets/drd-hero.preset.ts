import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drdHeroPreset: SystemPreset = {
  system: 'drd-hero',
  displayName: 'DrD Hero',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'sila', label: 'Síla', type: 'number', order: 4 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 5 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 6 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 7 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 8 },
    { key: 'bystrost', label: 'Bystrost', type: 'number', order: 9 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 10 },
    {
      key: 'zivotyCurrent',
      label: 'Životy aktuální',
      type: 'number',
      order: 11,
    },
    { key: 'magenergie', label: 'Magenergie', type: 'number', order: 12 },
    { key: 'utok', label: 'Útok', type: 'number', order: 13 },
    { key: 'obrana', label: 'Obrana', type: 'number', order: 14 },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 15 },
    { key: 'zkusenosti', label: 'Zkušenosti', type: 'number', order: 16 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 17 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 18 },
  ],
};
