import type { SystemPreset } from '../interfaces/system-preset.interface';

export const gurpsPreset: SystemPreset = {
  system: 'gurps',
  displayName: 'GURPS',
  schema: [
    { key: 'pointsTotal', label: 'Body celkem', type: 'number', order: 1 },
    { key: 'pointsSpent', label: 'Body utracené', type: 'number', order: 2 },
    { key: 'st', label: 'ST (Strength)', type: 'number', order: 3 },
    { key: 'dx', label: 'DX (Dexterity)', type: 'number', order: 4 },
    { key: 'iq', label: 'IQ (Intelligence)', type: 'number', order: 5 },
    { key: 'ht', label: 'HT (Health)', type: 'number', order: 6 },
    { key: 'hp', label: 'HP', type: 'number', order: 7 },
    { key: 'fp', label: 'FP (Fatigue Points)', type: 'number', order: 8 },
    { key: 'will', label: 'Will', type: 'number', order: 9 },
    { key: 'per', label: 'Per (Perception)', type: 'number', order: 10 },
    { key: 'speed', label: 'Speed', type: 'number', order: 11 },
    { key: 'move', label: 'Move', type: 'number', order: 12 },
    { key: 'advantages', label: 'Advantages', type: 'textarea', order: 13 },
    {
      key: 'disadvantages',
      label: 'Disadvantages',
      type: 'textarea',
      order: 14,
    },
    { key: 'quirks', label: 'Quirks', type: 'textarea', order: 15 },
    { key: 'skills', label: 'Skills', type: 'textarea', order: 16 },
    { key: 'languages', label: 'Languages', type: 'textarea', order: 17 },
    { key: 'equipment', label: 'Equipment', type: 'textarea', order: 18 },
    { key: 'notes', label: 'Notes', type: 'textarea', order: 19 },
  ],
};
