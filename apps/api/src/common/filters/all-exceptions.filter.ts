import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorEnvelope {
  success: false;
  message: string;
  error: {
    code: string;
    details: string[];
  };
}

/** Stable, client-facing codes so the frontend can branch on `error.code`. */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

/**
 * Emits the error half of the PRTS §A8 envelope:
 *
 *   { "success": false, "message": "...", "error": { "code", "details" } }
 *
 * `message` is always a plain string and `details` always an array, so the
 * client never has to guess at the shape. Full detail is logged server-side;
 * unexpected (non-HttpException) errors deliberately return a generic message
 * so internals are not leaked to callers — PRTS §A11.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, details } = this.describe(exception, isHttpException);

    this.logger.error(
      `${request.method} ${request.url} -> ${status}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: ErrorEnvelope = {
      success: false,
      message,
      error: {
        code: CODE_BY_STATUS[status] ?? 'ERROR',
        details,
      },
    };

    response.status(status).json(body);
  }

  /**
   * Flattens the several shapes a NestJS exception can carry into one string
   * plus a details array.
   *
   * `HttpException.getResponse()` may be a bare string, or an object whose
   * `message` is itself a string or — for class-validator failures — an array
   * of messages. Previously all of that was passed through untouched, which is
   * why clients had to normalize three different shapes.
   */
  private describe(
    exception: unknown,
    isHttpException: boolean,
  ): { message: string; details: string[] } {
    if (!isHttpException) {
      return { message: 'Internal server error', details: [] };
    }

    const raw = (exception as HttpException).getResponse();

    if (typeof raw === 'string') {
      return { message: raw, details: [] };
    }

    const body = raw as { message?: unknown };

    if (Array.isArray(body.message)) {
      const details = body.message.map((m) => String(m));
      return {
        message: details[0] ?? 'Validation failed',
        details,
      };
    }

    if (typeof body.message === 'string') {
      return { message: body.message, details: [] };
    }

    return { message: (exception as HttpException).message, details: [] };
  }
}
