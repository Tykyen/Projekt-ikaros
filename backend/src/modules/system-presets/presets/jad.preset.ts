import type { SystemPreset } from '../interfaces/system-preset.interface';

export const jadPreset: SystemPreset = {
  system: 'jad',
  displayName: 'Jad',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'class', label: 'Povolání', type: 'text', order: 3 },
    { key: 'attribute1', label: 'Atribut 1', type: 'number', order: 4 },
    { key: 'attribute2', label: 'Atribut 2', type: 'number', order: 5 },
    { key: 'attribute3', label: 'Atribut 3', type: 'number', order: 6 },
    { key: 'attribute4', label: 'Atribut 4', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    {
      key: 'zivotyCurrent',
      label: 'Životy aktuální',
      type: 'number',
      order: 9,
    },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 10 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 11 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 12 },
  ],
};
