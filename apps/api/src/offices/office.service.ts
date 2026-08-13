import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { Prisma, Office } from '@prisma/client';

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateOfficeDto & { organizationId: string },
  ): Promise<Office> {
    const name = dto.name.trim();
    try {
      return await this.prisma.office.create({
        data: {
          ...dto,
          name,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`Office with name ${name} already exists`);
      }
      throw e;
    }
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
