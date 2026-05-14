import type { SystemPreset } from '../interfaces/system-preset.interface';

export const fatePreset: SystemPreset = {
  system: 'fate',
  displayName: 'Fate Core',
  schema: [
    { key: 'highConcept', label: 'High Concept', type: 'text', order: 1 },
    { key: 'trouble', label: 'Trouble', type: 'text', order: 2 },
    { key: 'aspect1', label: 'Aspect 1', type: 'text', order: 3 },
    { key: 'aspect2', label: 'Aspect 2', type: 'text', order: 4 },
    { key: 'aspect3', label: 'Aspect 3', type: 'text', order: 5 },
    { key: 'refresh', label: 'Refresh', type: 'number', order: 6 },
    { key: 'fatePoints', label: 'Fate Points', type: 'number', order: 7 },
    { key: 'skills', label: 'Skills (Pyramid)', type: 'textarea', order: 8 },
    { key: 'stunts', label: 'Stunts', type: 'textarea', order: 9 },
    {
      key: 'physicalStress',
      label: 'Physical Stress',
      type: 'text',
      order: 10,
    },
    { key: 'mentalStress', label: 'Mental Stress', type: 'text', order: 11 },
    {
      key: 'mildConsequence',
      label: 'Mild Consequence',
      type: 'text',
      order: 12,
    },
    {
      key: 'moderateConsequence',
      label: 'Moderate Consequence',
      type: 'text',
      order: 13,
    },
    {
      key: 'severeConsequence',
      label: 'Severe Consequence',
      type: 'text',
      order: 14,
    },
    { key: 'extras', label: 'Extras', type: 'textarea', order: 15 },
    { key: 'notes', label: 'Notes', type: 'textarea', order: 16 },
  ],
};
