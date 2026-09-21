import { Body, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { validationError } from "./errors";

/**
 * Validates and normalizes input with a Zod schema (R10). Schemas are strict, so unknown
 * fields — role, roles, permissions, isAdmin… — reject the request with 400 VALIDATION_ERROR.
 * Issue details are not echoed back: they could reflect submitted values.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) throw validationError();
    return result.data;
  }
}

/** `@ZodBody(schema) body: z.output<typeof schema>` — validated request body. */
export const ZodBody = <S extends z.ZodType>(schema: S): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));
