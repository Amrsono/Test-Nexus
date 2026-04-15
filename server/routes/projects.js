const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// Get all projects
router.get('/', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      include: { _count: { select: { testSuites: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new project
router.post('/', async (req, res) => {
  const { name, themeColor } = req.body;
  try {
    const project = await prisma.project.create({
      data: { name, themeColor }
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update project settings (logo/color/dates)
router.patch('/:id', upload.single('logo'), async (req, res) => {
  const { id } = req.params;
  const { name, themeColor, startDate, goLiveDate } = req.body;
  
  let updateData = { name, themeColor };
  if (startDate) updateData.startDate = new Date(startDate);
  if (goLiveDate) updateData.goLiveDate = new Date(goLiveDate);
  
  if (req.file) {
    // In a real app, we'd upload to S3. For now, we'll store as base64 or just a mock path
    const base64Logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    updateData.logoUrl = base64Logo;
  }

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: updateData
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
