import { Test, TestingModule } from '@nestjs/testing';
import { OfficesService } from './office.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('OfficeService', () => {
  let service: OfficesService;
  const orgId = 'org1';
  const otherOrgId = 'org2';

  const mockPrismaService = {
    office: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OfficesService>(OfficesService);
  });

  const mockOffice = {
    id: '1',
    name: 'Test Office',
    latitude: 12.345,
    longitude: 67.89,
    geofenceRadiusMeters: 100,
    organizationId: orgId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a new office scoped to the caller organization', async () => {
      mockPrismaService.office.create.mockResolvedValue(mockOffice);

      const result = await service.create({
        name: 'Test Office',
        latitude: 12.345,
        longitude: 67.89,
        organizationId: orgId,
      });

      expect(result).toEqual(mockOffice);
      expect(mockPrismaService.office.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Office',
          latitude: 12.345,
          longitude: 67.89,
          organizationId: orgId,
        },
      });
    });
  });

  describe('findAll', () => {
    it('only returns offices belonging to the caller organization', async () => {
      mockPrismaService.office.findMany.mockResolvedValue([mockOffice]);

      const result = await service.findAll(orgId);

      expect(result).toEqual([mockOffice]);
      expect(mockPrismaService.office.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent office', async () => {
      mockPrismaService.office.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the office belongs to a different organization', async () => {
      // findFirst is scoped by { id, organizationId }, so a cross-tenant lookup resolves to null
      mockPrismaService.office.findFirst.mockResolvedValue(null);

      await expect(service.findOne('1', otherOrgId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.office.findFirst).toHaveBeenCalledWith({
        where: { id: '1', organizationId: otherOrgId },
      });
    });

    it('returns the office when found within the caller organization', async () => {
      mockPrismaService.office.findFirst.mockResolvedValue(mockOffice);

      const result = await service.findOne('1', orgId);

      expect(result).toEqual(mockOffice);
      expect(mockPrismaService.office.findFirst).toHaveBeenCalledWith({
        where: { id: '1', organizationId: orgId },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when updating an office outside the caller organization', async () => {
      mockPrismaService.office.findFirst.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'Updated Office' }, orgId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.office.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when deleting an office outside the caller organization', async () => {
      mockPrismaService.office.findFirst.mockResolvedValue(null);

      await expect(service.delete('non-existent-id', orgId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.office.delete).not.toHaveBeenCalled();
    });
  });
});
