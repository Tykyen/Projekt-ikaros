import { Injectable, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { MAP_OPERATION_DTOS, MapOperationPayload } from '../dto/operations';
import {
  WORLD_OPERATION_DTOS,
  WorldOperationPayload,
} from '../../worlds/dto/operations';

/**
 * 10.2-prep-1 — validátor strukturovaných operací.
 *
 * Discriminator field `type` určuje, který DTO se použije pro validaci.
 * `whitelist: true` při transform → extra fields ignorované (forward compat
 * — klient může pošle více polí než server zná, dovolíme to).
 *
 * Spec: docs/arch/maps/operations/api.md, security.md § Validace vstupů.
 */
@Injectable()
export class OperationPayloadValidator {
  validateMapOp(input: unknown): MapOperationPayload {
    return this.validate(input, MAP_OPERATION_DTOS) as MapOperationPayload;
  }

  validateWorldOp(input: unknown): WorldOperationPayload {
    return this.validate(input, WORLD_OPERATION_DTOS) as WorldOperationPayload;
  }

  private validate(
    input: unknown,
    registry: Record<string, new (...args: never[]) => object>,
  ): object {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException({
        code: 'MAP_OP_INVALID',
        message: 'Operace musí být objekt',
      });
    }
    const typed = input as { type?: unknown };
    if (typeof typed.type !== 'string') {
      throw new BadRequestException({
        code: 'MAP_OP_INVALID',
        message: 'Chybí op.type (string)',
      });
    }
    const DtoClass = registry[typed.type];
    if (!DtoClass) {
      throw new BadRequestException({
        code: 'MAP_OP_INVALID',
        message: `Neznámý typ operace: ${typed.type}`,
      });
    }
    const instance = plainToInstance(DtoClass, input);
    const errors = validateSync(instance, {
      whitelist: false, // allow extra fields (forward compat)
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'MAP_OP_INVALID',
        message: this.formatErrors(errors),
      });
    }
    return instance;
  }

  private formatErrors(errors: ValidationError[]): string {
    const parts: string[] = [];
    for (const err of errors) {
      const constraints = err.constraints;
      if (constraints) {
        for (const key of Object.keys(constraints)) {
          parts.push(`${err.property}: ${constraints[key]}`);
        }
      }
      if (err.children && err.children.length > 0) {
        parts.push(this.formatErrors(err.children));
      }
    }
    return parts.join('; ');
  }
}
