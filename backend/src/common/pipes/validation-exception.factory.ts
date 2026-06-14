import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * exceptionFactory pro globální ValidationPipe (error-contract audit, F2).
 *
 * Řeší EC-02: class-validator defaultně vrací anglické hlášky bez field-mappingu.
 * Tato factory:
 *  - lokalizuje nejčastější constraint hlášky do češtiny,
 *  - přidá `code: 'VALIDATION'` (doménový — FE pozná validační chybu),
 *  - přidá `fields: { [pole]: string[] }` pro field-level mapping ve formuláři,
 *  - zachová `message: string[]` (zpětná kompatibilita s toast cestou / parseApiError).
 *
 * Výsledek projde HttpExceptionFilter → `{ error: { code:'VALIDATION', message, fields, timestamp } }`.
 */

function csMessage(
  constraint: string,
  property: string,
  fallback: string,
): string {
  switch (constraint) {
    case 'isNotEmpty':
      return `Pole „${property}" je povinné.`;
    case 'isEmail':
      return 'Neplatná e-mailová adresa.';
    case 'isString':
      return `Pole „${property}" musí být text.`;
    case 'isInt':
    case 'isNumber':
    case 'isNumberString':
      return `Pole „${property}" musí být číslo.`;
    case 'isBoolean':
      return `Pole „${property}" musí být ano/ne.`;
    case 'isEnum':
      return `Pole „${property}" má neplatnou hodnotu.`;
    case 'minLength':
      return `Pole „${property}" je příliš krátké.`;
    case 'maxLength':
      return `Pole „${property}" je příliš dlouhé.`;
    case 'min':
      return `Pole „${property}" je příliš malé.`;
    case 'max':
      return `Pole „${property}" je příliš velké.`;
    case 'isUrl':
      return `Pole „${property}" musí být platná URL.`;
    case 'isMongoId':
      return `Pole „${property}" má neplatný identifikátor.`;
    case 'isArray':
      return `Pole „${property}" musí být seznam.`;
    case 'whitelistValidation':
      return `Neznámé pole „${property}".`;
    default:
      // neznámý constraint → ponech původní (EN) hlášku, ať se info neztratí
      return fallback;
  }
}

interface FieldErrors {
  [property: string]: string[];
}

function collect(
  errors: ValidationError[],
  parentPath: string,
  fields: FieldErrors,
  flat: string[],
): void {
  for (const err of errors) {
    const path = parentPath ? `${parentPath}.${err.property}` : err.property;
    if (err.constraints) {
      const msgs = Object.entries(err.constraints).map(
        ([constraint, fallback]) =>
          csMessage(constraint, err.property, fallback),
      );
      fields[path] = (fields[path] ?? []).concat(msgs);
      flat.push(...msgs);
    }
    if (err.children?.length) {
      collect(err.children, path, fields, flat);
    }
  }
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fields: FieldErrors = {};
  const flat: string[] = [];
  collect(errors, '', fields, flat);

  return new BadRequestException({
    code: 'VALIDATION',
    message: flat.length ? flat : ['Neplatný vstup.'],
    fields,
  });
}
