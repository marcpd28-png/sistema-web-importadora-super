const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.product.count().then(console.log).catch(console.error);  
