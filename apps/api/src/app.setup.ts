import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import helmet from 'helmet';
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
  // Security response headers. Registered first so it covers every route,
  // including the ones that error before reaching a controller.
  //
  // The header that earns helmet its place here is Strict-Transport-Security:
  // it tells a browser never to contact this API over plain HTTP again, which
  // closes the window where a first request over http:// could be intercepted
  // and downgraded. Nothing we had set that. `preload` stays off deliberately —
  // submitting a domain to the browser preload list is close to irreversible,
  // and that is a decision to make once the production domain is settled, not a
  // default to inherit.
  app.use(
    helmet({
      // Off on purpose, and the reasoning matters more than the setting.
      //
      // CSP governs what a *rendered HTML document* is allowed to load. This
      // API returns JSON, so the header is inert on every response it sends —
      // with one exception: the Swagger UI at /api/docs, which is real HTML and
      // relies on inline scripts and styles. Helmet's default CSP breaks it.
      //
      // So leaving CSP on costs a working docs page in development and buys
      // nothing anywhere else. The protection people expect from CSP here —
      // stopping a JSON response being interpreted as HTML — actually comes
      // from X-Content-Type-Options: nosniff, which helmet still sets below.
      //
      // If this app ever serves HTML of its own, turn this back on and
      // configure it properly rather than leaving it disabled by inheritance.
      contentSecurityPolicy: false,

      // Helmet defaults this to 'same-origin', which describes an API only ever
      // called from its own origin. Ours is called cross-origin by design — the
      // web app is on a different port in development and will be a different
      // subdomain in production. Stating 'cross-origin' declares that intent
      // instead of leaving a mismatch for someone to debug later.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

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
