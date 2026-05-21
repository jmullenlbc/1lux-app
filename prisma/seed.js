const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const ADMINS = [
  { email: 'admin@ilcstudios.com', name: 'ILC Admin',    password: 'ILCadmin2024!'    },
  { email: 'mike@ilcstudios.com',  name: 'Mike Kershner', password: 'ILCstudios2024!' },
];

async function main() {
  for (const admin of ADMINS) {
    const passwordHash = await bcrypt.hash(admin.password, 10);
    const user = await prisma.user.upsert({
      where:  { email: admin.email },
      update: {},   // never overwrite an existing account's data
      create: {
        email: admin.email,
        name:  admin.name,
        passwordHash,
        role: 'ILC_ADMIN',
        mustChangePassword: false,
      },
    });
    console.log('✓ Admin user ready:', user.email);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
