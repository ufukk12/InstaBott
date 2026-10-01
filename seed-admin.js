const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = "kadri3749@gmail.com";
  const password = "1_4-9_Private";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Admin account already exists.");
    return;
  }

  // Next.js projesinde bcrypt yerine bcryptjs de kullanılmış olabilir ama genelde projede @lib/auth'da var
  const passwordHash = await bcrypt.hash(password, 10);
  
  const generateDisplayId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 7; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  
  let displayId = generateDisplayId();
  let unique = false;
  while (!unique) {
    const check = await prisma.user.findUnique({ where: { displayId } });
    if (!check) {
      unique = true;
    } else {
      displayId = generateDisplayId();
    }
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      isVerified: true,
      displayId,
      role: "admin",
      followerTokens: 999,
    }
  });

  console.log("Admin account created successfully.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
