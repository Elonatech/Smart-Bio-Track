import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const mockPrismaService = {
    department: {
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
        DepartmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);

    jest.clearAllMocks(); // Clear mocks before each test
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws ConflictException when department name already exists', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue({
        id: 'dept-1',
        name: 'Engineering',
        organizationId: 'org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.create({ name: 'Engineering', organizationId: 'org-1' }),
      ).rejects.toThrow('ConflictException');

      expect(mockPrismaService.department.create).not.toHaveBeenCalled();
    });

    it('creates new department when no name conflict exists', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue(null);
      const mockCreated = {
        id: 'dept-2',
        name: 'Infrastructure',
        organizationId: 'org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.department.create.mockResolvedValue(mockCreated);

      const result = await service.create({
        name: 'infracstructure',
        organizationId: 'org-1',
      });

      expect(result).toEqual(mockCreated);
      expect(mockPrismaService.department.create).toHaveBeenCalledWith({
        data: { name: 'infracstructure', organizationId: 'org-1' },
      });
    });
  });
  describe('findOne', () => {
    it('throws NotFoundException when department ID is not found', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the department when found', async () => {
      const mockDepartment = {
        id: 'dept-1',
        name: 'Engineering',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.department.findUnique.mockResolvedValue(mockDepartment);

      const result = await service.findOne('dept-1');

      expect(result).toEqual(mockDepartment);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when trying to update a non-existent department', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.department.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when trying to remove a non-existent department', async () => {
      mockPrismaService.department.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.department.delete).not.toHaveBeenCalled();
    });
  });
});
