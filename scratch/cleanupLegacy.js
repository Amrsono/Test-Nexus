const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  const names = ['Web Admin Panel', 'Payment Gateway API'];
  for (const name of names) {
    const p = await prisma.project.findFirst({ where: { name } });
    if (p) {
      console.log(`Cleaning up project: ${name} (${p.id})`);
      // Delete child associations manually (SQLite/Prisma default)
      await prisma.insight.deleteMany({ where: { projectId: p.id } });
      await prisma.defect.deleteMany({ where: { projectId: p.id } });
      
      const suites = await prisma.testSuite.findMany({ where: { projectId: p.id } });
      for (const s of suites) {
        await prisma.testCase.deleteMany({ where: { suiteId: s.id } });
      }
      await prisma.testSuite.deleteMany({ where: { projectId: p.id } });
      
      // Finally delete project
      await prisma.project.delete({ where: { id: p.id } });
      console.log(`Successfully deleted ${name}`);
    } else {
      console.log(`Project ${name} not found.`);
    }
  }
}

cleanup()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
