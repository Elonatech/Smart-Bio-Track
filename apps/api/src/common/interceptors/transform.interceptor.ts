import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
}

const DEFAULT_MESSAGE = 'Request successful.';

/**
 * Wraps every successful response in the shape PRTS §A8 mandates:
 *
 *   { "success": true, "message": "...", "data": { ... } }
 *
 * The message is resolved in this order:
 *   1. an @ResponseMessage('...') decorator on the handler or controller;
 *   2. a `message` string on the object the handler returned — which is then
 *      lifted out of `data`, so a service returning { message: 'Signed out' }
 *      produces { success, message: 'Signed out', data: null } rather than
 *      nesting the message one level deep;
 *   3. a generic default.
 *
 * Applied globally in main.ts, so no controller has to remember it.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<unknown>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<unknown>> {
    const declaredMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((payload) => {
        const { message, data } = this.split(payload);

        return {
          success: true as const,
          message: declaredMessage ?? message ?? DEFAULT_MESSAGE,
          data,
        };
      }),
    );
  }

  /** Pulls a `message` out of the handler's return value, if it has one. */
  private split(payload: unknown): { message?: string; data: unknown } {
    if (
      payload === null ||
      payload === undefined ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return { data: payload ?? null };
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.message !== 'string') {
      return { data: payload };
    }

    const { message, ...rest } = record;
    // An object that carried nothing but a message has no data left to report.
    return {
      message,
      data: Object.keys(rest).length > 0 ? rest : null,
    };
  }
}
