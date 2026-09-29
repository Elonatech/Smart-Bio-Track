import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { validateEnv } from './env.validation';

async function bootstrap() {
  const env = validateEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Express advertises itself with `X-Powered-By: Express` on every response.
  // It changes nothing about how the API behaves and tells anyone scanning us
  // which stack to look up known vulnerabilities for. Free to remove.
  app.disable('x-powered-by');

  // Rate limiting keys off the client IP. Behind a reverse proxy (Render,
  // Nginx) Express sees the proxy's address unless told to read
  // X-Forwarded-For — which would put every user in one shared bucket and
  // let five failed logins lock out the world.
  //
  // Deliberately opt-in per environment: trusting that header while the API
  // is directly reachable would let an attacker forge it and mint unlimited
  // buckets, defeating the throttle. See TRUST_PROXY_HOPS in env.validation.
  if (env.TRUST_PROXY_HOPS) {
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  // Browsers block cross-origin calls unless the API says otherwise, so the
  // Next.js app cannot reach this API without it. CORS_ORIGINS is a
  // comma-separated list; the localhost default covers local development only
  // and the real frontend origin MUST be set via the env var before deploy.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });

  // Prefix, validation, response envelope, exception filter. Shared with the
  // integration tests so both exercise the same pipeline.
  configureApp(app);

  // Swagger publishes the entire API surface: every route, every DTO field,
  // every validation rule. That is exactly what you want while building and
  // exactly what you do not want facing the internet — it is free
  // reconnaissance, handing an attacker the shape of every endpoint including
  // the auth ones, with no login required.
  //
  // Default: on everywhere except production. ENABLE_API_DOCS overrides in
  // either direction, so a staging box can publish them deliberately.
  const docsEnabled =
    env.ENABLE_API_DOCS ?? process.env.NODE_ENV !== 'production';

  if (docsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SmartBioTrack API')
      .setDescription(
        'Biometric and geo-fenced attendance management. All responses use the ' +
          'PRTS §A8 envelope: { success, message, data } on success and ' +
          '{ success, message, error: { code, details } } on failure.',
      )
      .setVersion('2.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  const port = env.PORT || 4000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
  console.log(
    docsEnabled
      ? `API docs available at http://localhost:${port}/api/docs`
      : 'API docs disabled (set ENABLE_API_DOCS=true to publish them)',
  );
}
void bootstrap();
