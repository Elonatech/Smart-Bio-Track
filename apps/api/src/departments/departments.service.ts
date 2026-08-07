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

  async create(createDepartmentDto: CreateDepartmentDto) {
    const existingDepartment = await this.prisma.department.findUnique({
      where: { name: createDepartmentDto.name },
    });
    if (existingDepartment) {
      throw new ConflictException(
        `Department with name ${createDepartmentDto.name} already exists`,
      );
    }
    return this.prisma.department.create({
      data: createDepartmentDto,
    });
  }

  findAll() {
    return this.prisma.department.findMany();
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }

    return department;
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    await this.findOne(id); // Ensure the department exists before updating
    return this.prisma.department.update({
      where: { id },
      data: updateDepartmentDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Ensure the department exists before deleting
    return this.prisma.department.delete({
      where: { id },
    });
  }
}
