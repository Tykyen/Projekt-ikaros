import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16WizardPreset: SystemPreset = {
  system: 'drd16-wizard',
  displayName: 'DrD 16 — Čaroděj',
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
    {
      key: 'magenergieMax',
      label: 'Magenergie max',
      type: 'number',
      order: 10,
    },
    {
      key: 'magenergieCurrent',
      label: 'Magenergie aktuální',
      type: 'number',
      order: 11,
    },
    { key: 'sfera', label: 'Sféra', type: 'text', order: 12 },
    {
      key: 'naucenaKouzla',
      label: 'Naučená kouzla',
      type: 'textarea',
      order: 13,
    },
    { key: 'komponenty', label: 'Komponenty', type: 'textarea', order: 14 },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 15 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 16 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 17 },
  ],
};
