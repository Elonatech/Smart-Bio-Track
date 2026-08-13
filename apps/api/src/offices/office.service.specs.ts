import { Test, TestingModule } from '@nestjs/testing';
import { OfficesService } from './office.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('OfficeService', () => {
  let service: OfficesService;

  const mockPrismaService = {
    office: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OfficesService>(OfficesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it(' should create a new office with the given data', async () => {
      const mockCreateOffice = {
        id: '1',
        name: 'Test Office',
        latitude: 12.345,
        longitude: 67.89,
        geofenceRadiusMeters: 100,
        organizationId: 'org1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.office.create.mockResolvedValue(mockCreateOffice);

      const result = await service.create({
        name: 'Test Office',
        latitude: 12.345,
        longitude: 67.89,
        organizationId: 'org1',
      });

      expect(result).toEqual(mockCreateOffice);
      expect(mockPrismaService.office.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Office',
          latitude: 12.345,
          longitude: 67.89,
          organizationId: 'org1',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException for non-existent office', async () => {
      mockPrismaService.office.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return the office for an existing id', async () => {
      const mockOffice = {
        id: '1',
        name: 'Test Office',
        latitude: 12.345,
        longitude: 67.89,
        geofenceRadiusMeters: 100,
        organizationId: 'org1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.office.findUnique.mockResolvedValue(mockOffice);

      const result = await service.findOne('1');

      expect(result).toEqual(mockOffice);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when updating non-existent office', async () => {
      mockPrismaService.office.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'Updated Office' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.office.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException when deleting non-existent office', async () => {
      mockPrismaService.office.findUnique.mockResolvedValue(null);

      await expect(service.delete('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.office.delete).not.toHaveBeenCalled();
    });
  });
});
