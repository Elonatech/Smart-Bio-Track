import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getDbHealthCheck() {
    const userCount = await this.prisma.user.count();
    const departmentCount = await this.prisma.department.count();
    const officeCount = await this.prisma.office.count();

    return {
      status: 'connected',
      counts: {
        users: userCount,
        departments: departmentCount,
        offices: officeCount,
      },
    };
  }
}
