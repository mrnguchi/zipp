import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiError } from '../errors/api-error.js';

export class SchemaPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new ApiError('VALIDATION_ERROR', 400, 'Check the request fields');
    return result.data;
  }
}
