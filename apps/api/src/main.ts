import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const env = validateEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = env.PORT || 4000;
  await app.listen(port);
  console.log(`Server is running on http://localhost:${port}`);
}
void bootstrap();
