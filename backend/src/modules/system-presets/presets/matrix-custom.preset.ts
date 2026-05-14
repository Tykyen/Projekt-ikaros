import type { SystemPreset } from '../interfaces/system-preset.interface';

export const matrixCustomPreset: SystemPreset = {
  system: 'matrix-custom',
  displayName: 'Matrix custom',
  schema: [
    { key: 'jmeno', label: 'Jméno', type: 'text', order: 1 },
    { key: 'rasa', label: 'Rasa', type: 'text', order: 2 },
    { key: 'povolani', label: 'Povolání', type: 'text', order: 3 },
    { key: 'atributy', label: 'Atributy (custom)', type: 'textarea', order: 4 },
    { key: 'zivoty', label: 'Životy', type: 'text', order: 5 },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 6 },
    { key: 'inventar', label: 'Inventář', type: 'textarea', order: 7 },
    { key: 'pribeh', label: 'Příběh', type: 'textarea', order: 8 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 9 },
  ],
};
