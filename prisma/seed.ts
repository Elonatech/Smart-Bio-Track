import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Dev-only credentials. Everything here is throwaway data for local work —
// never point this script at a production database.
const SEED_ORG_NAME = 'SmartBioTrack Demo Co';
const SEED_ADMIN_EMAIL = 'admin@demo.local';
const SEED_ADMIN_PASSWORD = 'SeedPass1!';
const SEED_ADMIN_EMPLOYEE_ID = 'SEED-ADMIN-001';

async function main() {
  // 1. The organization is the tenant root — nothing else can exist without it.
  const organization = await prisma.organization.upsert({
    where: { name: SEED_ORG_NAME },
    update: {},
    create: {
      name: SEED_ORG_NAME,
      email: SEED_ADMIN_EMAIL,
    },
  });

  // 2. A SUPER_ADMIN, so the seeded data is actually reachable through the API.
  const passwordHash = await argon2.hash(SEED_ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      employeeId: SEED_ADMIN_EMPLOYEE_ID,
      name: 'Seed Admin',
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      organizationId: organization.id,
    },
  });

  // 3. Department and Office are both scoped to the organization, and each is
  //    unique per organization — hence the compound `organizationId_name` key.
  const department = await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Engineering',
      },
    },
    update: {},
    create: {
      name: 'Engineering',
      organizationId: organization.id,
    },
  });

  const office = await prisma.office.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Headquarters',
      },
    },
    update: {},
    create: {
      name: 'Headquarters',
      latitude: 6.5244,
      longitude: 3.3792,
      geofenceRadiusMeters: 150,
      organizationId: organization.id,
    },
  });

  console.log('Seeded:');
  console.log(`  Organization : ${organization.name} (${organization.id})`);
  console.log(`  Department   : ${department.name}`);
  console.log(`  Office       : ${office.name}`);
  console.log('');
  console.log('Log in with:');
  console.log(`  email    : ${admin.email}`);
  console.log(`  password : ${SEED_ADMIN_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
