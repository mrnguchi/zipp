import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AppLogger } from '../../platform/observability/app-logger.js';
import { ApiError } from './api-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { BusinessError } from './business-error.js';

function businessStatus(error: BusinessError): number {
  if (error.code === 'VALIDATION_ERROR') return 400;
  if (error.code === 'UNAUTHENTICATED') return 401;
  if (['FORBIDDEN', 'RECENT_MFA_REQUIRED'].includes(error.code)) return 403;
  if (error.code === 'NOT_FOUND') return 404;
  return 409;
}

function storageStatus(error: unknown): number | undefined {
  if (error instanceof Prisma.PrismaClientInitializationError) return 503;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError))
    return undefined;
  if (
    [
      'P1001',
      'P1002',
      'P1008',
      'P1017',
      'P2021',
      'P2022',
      'P2024',
      'P2028',
    ].includes(error.code)
  )
    return 503;
  if (error.code === 'P2002' || error.code === 'P2034') return 409;
  if (error.code === 'P2025') return 404;
  return undefined;
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    // A disconnected/partially streamed response cannot accept another JSON envelope.
    if (response.headersSent || response.writableEnded || response.destroyed) {
      this.logger.output.warn(
        { requestId: response.locals['requestId'] },
        'Response already closed',
      );
      return;
    }
    const parserType =
      typeof exception === 'object' && exception !== null && 'type' in exception
        ? exception.type
        : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserType === 'entity.too.large'
          ? 413
          : parserType === 'entity.parse.failed'
            ? 400
            : exception instanceof BusinessError
              ? businessStatus(exception)
              : (storageStatus(exception) ?? 500);
    const safeCodes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      429: 'RATE_LIMITED',
      503: 'DEPENDENCY_UNAVAILABLE',
      500: 'INTERNAL_ERROR',
    };
    if (exception instanceof ApiError && exception.retryAfter)
      response.setHeader('Retry-After', exception.retryAfter);
    response.setHeader('Cache-Control', 'no-store');
    const requestId: unknown = response.locals['requestId'];
    if (status >= 500)
      this.logger.output.error({ requestId, status }, 'Request failed');
    response.status(status).json({
      code:
        exception instanceof ApiError || exception instanceof BusinessError
          ? exception.code
          : (safeCodes[status] ?? 'REQUEST_FAILED'),
      message:
        exception instanceof ApiError || exception instanceof BusinessError
          ? exception.message
          : status >= 500
            ? 'Service unavailable'
            : 'Request could not be processed',
      requestId,
      ...(exception instanceof BusinessError && exception.operationId
        ? { operationId: exception.operationId }
        : {}),
    });
  }
}
