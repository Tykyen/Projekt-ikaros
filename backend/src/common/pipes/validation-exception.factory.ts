import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * exceptionFactory pro globální ValidationPipe (error-contract audit, F2).
 *
 * Řeší EC-02: class-validator defaultně vrací anglické hlášky bez field-mappingu.
 * Tato factory:
 *  - lokalizuje nejčastější constraint hlášky do češtiny,
 *  - přidá `code: 'VALIDATION'` (doménový — FE pozná validační chybu),
 *  - zachová `message: string[]` (zpětná kompatibilita s toast cestou / parseApiError).
 *
 * FIX-24 — dřív navíc emitovala `fields: { [pole]: string[] }` pro field-level
 * mapping ve formuláři; FE ho ale nikde nekonzumoval (0 výskytů `.error.fields`)
 * — mrtvý kód, odstraněno spolu s propagací v `HttpExceptionFilter`.
 *
 * Výsledek projde HttpExceptionFilter → `{ error: { code:'VALIDATION', message, timestamp } }`.
 */

/**
 * FIX-45 — rozpoznávací fragmenty výchozích (EN) hlášek class-validatoru pro
 * pokryté constrainty (beze $property/$constraint1 částí, které se interpolují
 * na konkrétní hodnoty a nejdou tedy porovnat 1:1). Pokud `fallback` NEODPOVÍDÁ
 * defaultnímu EN tvaru, jde o custom hlášku z dekorátoru (`@MinLength(1, {message: '...'})`)
 * — tu respektujeme beze změny, ať ji šablona níže nepřepíše (regrese F2).
 */
const DEFAULT_EN_SIGNATURE: Partial<Record<string, RegExp>> = {
  isNotEmpty: /should not be empty/i,
  isEmail: /must be an email/i,
  isString: /must be a string/i,
  isInt: /must be an integer number/i,
  isNumber: /must be a number conforming to the specified constraints/i,
  isNumberString: /must be a number string/i,
  isBoolean: /must be a boolean value/i,
  isEnum: /must be a valid enum value/i,
  minLength: /must be longer than or equal to/i,
  maxLength: /must be shorter than or equal to/i,
  min: /must not be less than/i,
  max: /must not be greater than/i,
  isUrl: /must be a URL address/i,
  isMongoId: /must be a mongodb id/i,
  isArray: /must be an array/i,
  whitelistValidation: /should not exist/i,
};

function csMessage(
  constraint: string,
  property: string,
  fallback: string,
): string {
  const signature = DEFAULT_EN_SIGNATURE[constraint];
  if (signature && !signature.test(fallback)) {
    // Custom hláška z dekorátoru — vývojář si ji zvolil schválně, nepřepisuj.
    return fallback;
  }
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

function collect(errors: ValidationError[], flat: string[]): void {
  for (const err of errors) {
    if (err.constraints) {
      const msgs = Object.entries(err.constraints).map(
        ([constraint, fallback]) =>
          csMessage(constraint, err.property, fallback),
      );
      flat.push(...msgs);
    }
    if (err.children?.length) {
      collect(err.children, flat);
    }
  }
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const flat: string[] = [];
  collect(errors, flat);

  return new BadRequestException({
    code: 'VALIDATION',
    message: flat.length ? flat : ['Neplatný vstup.'],
  });
}
