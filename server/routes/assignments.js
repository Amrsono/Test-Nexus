const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get all testers
router.get('/testers', async (req, res) => {
  try {
    const testers = await prisma.user.findMany({
      where: { role: 'TESTER' },
      include: { assignments: true }
    });
    res.json(testers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk assign cases to a tester (with re-assignment safety)
router.post('/assign', async (req, res) => {
  const { testerId, testCaseIds } = req.body;
  try {
    // 1. Clear existing assignments for these cases to allow "moving" them
    await prisma.assignment.deleteMany({
      where: {
        testCaseId: { in: testCaseIds }
      }
    });

    // 2. Create new assignments if a tester is provided (allowing un-assignment if testerId is null)
    if (testerId) {
      const assignments = await Promise.all(
        testCaseIds.map(caseId => 
          prisma.assignment.create({
            data: {
              testerId,
              testCaseId: caseId
            }
          })
        )
      );
      return res.json(assignments);
    }
    
    res.json({ message: 'Assignments cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
