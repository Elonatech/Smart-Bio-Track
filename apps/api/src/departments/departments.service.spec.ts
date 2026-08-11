import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  const orgId = 'org-1';
  const otherOrgId = 'org-2';

  const mockPrismaService = {
    department: {
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
        DepartmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws ConflictException when the department name already exists in this organization', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        organizationId: orgId,
      });

      await expect(
        service.create({ name: 'Engineering' }, orgId),
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaService.department.create).not.toHaveBeenCalled();
    });

    it('creates a new department scoped to the caller organization when no conflict exists', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue(null);
      const mockCreated = {
        id: 'dept-2',
        name: 'Infrastructure',
        organizationId: orgId,
      };
      mockPrismaService.department.create.mockResolvedValue(mockCreated);

      const result = await service.create({ name: 'Infrastructure' }, orgId);

      expect(result).toEqual(mockCreated);
      expect(mockPrismaService.department.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_name: {
            organizationId: orgId,
            name: 'Infrastructure',
          },
        },
      });
      expect(mockPrismaService.department.create).toHaveBeenCalledWith({
        data: { name: 'Infrastructure', organizationId: orgId },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the department does not exist', async () => {
      mockPrismaService.department.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the department belongs to a different organization', async () => {
      // findFirst is scoped by { id, organizationId }, so a cross-tenant lookup resolves to null
      mockPrismaService.department.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('dept-owned-by-other-org', otherOrgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the department when found within the caller organization', async () => {
      const mockDepartment = {
        id: 'dept-1',
        name: 'Engineering',
        organizationId: orgId,
      };
      mockPrismaService.department.findFirst.mockResolvedValue(mockDepartment);

      const result = await service.findOne('dept-1', orgId);

      expect(result).toEqual(mockDepartment);
      expect(mockPrismaService.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'dept-1', organizationId: orgId },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when trying to update a department outside the caller organization', async () => {
      mockPrismaService.department.findFirst.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'New Name' }, orgId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.department.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when trying to remove a department outside the caller organization', async () => {
      mockPrismaService.department.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent-id', orgId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.department.delete).not.toHaveBeenCalled();
    });
  });
});
