const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get all testers
router.get('/', async (req, res) => {
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

// Add new tester
router.post('/', async (req, res) => {
  const { name, email } = req.body;
  try {
    const user = await prisma.user.create({
      data: { name, email, role: 'TESTER' }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update tester
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id },
      data: { name, email }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete tester
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Delete assignments first to avoid foreign key issues
    await prisma.assignment.deleteMany({
      where: { testerId: id }
    });
    
    // 2. Delete user
    await prisma.user.delete({
      where: { id }
    });
    
    res.json({ message: 'Tester removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
