import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto, organizationId: string) {
    const existingDepartment = await this.prisma.department.findUnique({
      where: { name: createDepartmentDto.name },
    });
    if (existingDepartment) {
      throw new ConflictException(
        `Department with name ${createDepartmentDto.name} already exists`,
      );
    }
    return this.prisma.department.create({
      data: { name: dto.name, organizationId },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.department.findMany({ where: { organizationId } });
  }

  async findOne(id: string, organizationId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, organizationId },
    });

    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }

    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto, organizationId: string) {
    await this.findOne(id, organizationId); // ensures it exists AND belongs to the caller's org
    return this.prisma.department.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.department.delete({
      where: { id },
    });
  }
}
