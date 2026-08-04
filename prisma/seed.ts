import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const department = await prisma.department.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: { name: 'Engineering' },
  });

  const office = await prisma.office.upsert({
    where: { id: 'seed-hq-office' },
    update: {},
    create: {
      id: 'seed-hq-office',
      name: 'Headquarters',
      latitude: 6.5244,
      longitude: 3.3792,
      geofenceRadiusMeters: 150,
    },
  });

  console.log('Seeded:', { department: department.name, office: office.name });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
