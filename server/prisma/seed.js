require('dotenv').config({ path: '../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create Projects
  const projects = [
    { 
      name: 'Web Admin Panel', 
      themeColor: '#f0fdf4', // Light green
      logoUrl: 'https://cdn-icons-png.flaticon.com/512/1006/1006771.png' 
    },
    { 
      name: 'Payment Gateway API', 
      themeColor: '#fff7ed', // Light orange
      logoUrl: 'https://cdn-icons-png.flaticon.com/512/1019/1019137.png' 
    },
  ];

  const createdProjects = [];
  for (const p of projects) {
    const project = await prisma.project.create({
      data: p
    });
    createdProjects.push(project);
  }

  // Create Testers
  const testers = [
    { name: 'Alex Rivera', email: 'alex@testnexus.com' },
    { name: 'Sarah Chen', email: 'sarah@testnexus.com' },
    { name: 'Mike Miller', email: 'mike@testnexus.com' },
  ];

  for (const t of testers) {
    await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        name: t.name,
        email: t.email,
        role: 'TESTER'
      }
    });
  }

  // Create Sample Data for the first project (Web Admin)
  const webProject = createdProjects[0];
  
  const suite = await prisma.testSuite.create({
    data: {
      name: 'User Management',
      projectId: webProject.id,
      testCases: {
        create: [
          {
            summary: 'Admin can create new user',
            steps: '1. Login as Admin\n2. Navigate to Users\n3. Click New',
            expectedResult: 'User created successfully',
            status: 'PASS',
            priority: 'HIGH',
            module: 'Users'
          }
        ]
      }
    }
  });

  // Create an initial Insight for the first project
  await prisma.insight.create({
    data: {
      type: 'ADVICE',
      message: 'Web Admin Panel is stable. Suggest adding automated regression for User Management.',
      category: 'Users',
      projectId: webProject.id,
      isActionable: true
    }
  });

  console.log('Seed data with multiple projects created successfully');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
