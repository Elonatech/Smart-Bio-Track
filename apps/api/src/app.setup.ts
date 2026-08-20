import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * Every request-pipeline setting that is not environment-specific.
 *
 * Shared by `main.ts` and the integration tests on purpose: if the tests
 * configured their own app, they would exercise a different application than
 * the one we actually run, and a change to the prefix, the validation rules,
 * or the response envelope could pass CI and still break production.
 *
 * Environment-specific concerns — trust proxy, CORS, Swagger, the port — stay
 * in `main.ts`.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Success envelope (PRTS §A8). The filter emits the matching error shape —
  // the two must stay in step.
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  return app;
}
