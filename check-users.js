const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true } });
  console.dir(users, { depth: null });
  await prisma.$disconnect();
}
main();
