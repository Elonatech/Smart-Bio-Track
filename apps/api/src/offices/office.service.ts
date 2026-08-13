import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createOfficeDto: CreateOfficeDto & { organizationId: string }) {
    const existingOffice = await this.prisma.office.findFirst({
      where: {
        organizationId: createOfficeDto.organizationId,
        name: createOfficeDto.name,
      },
    });

    if (existingOffice) {
      throw new ConflictException('Office with this name already exists');
    }

    return this.prisma.office.create({
      data: {
        ...createOfficeDto,
      },
    });
  }

  async findAll() {
    return this.prisma.office.findMany();
  }

  async findOne(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return office;
  }

  async update(id: string, updateOfficeDto: UpdateOfficeDto) {
    const existingOffice = await this.prisma.office.findUnique({
      where: { id },
    });

    if (!existingOffice) {
      throw new NotFoundException('Office not found');
    }

    return this.prisma.office.update({
      where: { id },
      data: {
        ...updateOfficeDto,
      },
    });
  }

  async delete(id: string) {
    const existingOffice = await this.prisma.office.findUnique({
      where: { id },
    });

    if (!existingOffice) {
      throw new NotFoundException('Office not found');
    }

    return this.prisma.office.delete({
      where: { id },
    });
  }
}
