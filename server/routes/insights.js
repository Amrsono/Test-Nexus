const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { generateInsights } = require('../services/aiAdvisor');

const prisma = new PrismaClient();

// Get recent insights for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  try {
    const insights = await prisma.insight.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    res.json(insights);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger new AI analysis for a project
router.post('/analyze', async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: 'Project ID is required' });
  
  try {
    const insights = await generateInsights(projectId);
    res.json(insights);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
