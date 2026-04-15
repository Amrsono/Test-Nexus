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

// Update project settings (color/dates/name) - JSON ONLY
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, themeColor, startDate, goLiveDate } = req.body;
  
  let updateData = {};
  if (name !== undefined) updateData.name = name;
  if (themeColor !== undefined) updateData.themeColor = themeColor;
  
  if (startDate !== undefined) {
    updateData.startDate = startDate ? new Date(startDate) : null;
  }
  if (goLiveDate !== undefined) {
    updateData.goLiveDate = goLiveDate ? new Date(goLiveDate) : null;
  }

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: updateData
    });
    res.json(updated);
  } catch (error) {
    console.error('Project Update Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update project logo - MULTIPART ONLY
router.patch('/:id/logo', upload.single('logo'), async (req, res) => {
  const { id } = req.params;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No logo file provided' });
  }

  const base64Logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

  try {
    const updated = await prisma.project.update({
      where: { id },
      data: { logoUrl: base64Logo }
    });
    res.json(updated);
  } catch (error) {
    console.error('Logo Update Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
