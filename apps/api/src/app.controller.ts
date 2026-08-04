import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/db')
  getDbHealthCheck() {
    return this.appService.getDbHealthCheck();
  }

  @Get('health/error-test')
  throwTestError() {
    throw new InternalServerErrorException('This is a test error');
  }
}
