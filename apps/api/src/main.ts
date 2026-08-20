import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv } from './env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const env = validateEnv();
  const app = await NestFactory.create(AppModule);

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

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Success envelope (PRTS §A8). The filter below emits the matching error
  // shape — the two must stay in step.
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

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

  const port = env.PORT || 4000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/api/docs`);
}
void bootstrap();
