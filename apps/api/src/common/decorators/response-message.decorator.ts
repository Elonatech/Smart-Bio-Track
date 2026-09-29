import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';

/**
 * Sets the `message` field of the PRTS §A8 success envelope for one route.
 *
 *   @ResponseMessage('Organization created successfully.')
 *
 * Optional — see TransformInterceptor for how the message is resolved when
 * this decorator is absent.
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
