const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('ILCadmin2024!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ilcstudios.com' },
    update: {},
    create: {
      email: 'admin@ilcstudios.com',
      name: 'ILC Admin',
      passwordHash,
      role: 'ILC_ADMIN',
    },
  });

  console.log('Seeded ILC Admin:', admin.email);
  console.log('Password: ILCadmin2024!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
