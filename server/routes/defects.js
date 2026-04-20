const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get all defects for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  try {
    const defects = await prisma.defect.findMany({
      where: { projectId },
      include: { relatedCase: true },
      orderBy: { raisedAt: 'desc' }
    });
    res.json(defects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new defect
router.post('/', async (req, res) => {
  const { 
    projectId, title, severity, description, status,
    externalId, owner, actionPlan, futImpact, blockedCases,
    relatedCaseId, raisedAt 
  } = req.body;

  try {
    const defect = await prisma.defect.create({
      data: {
        title,
        severity,
        description,
        status: status || 'OPEN',
        externalId,
        owner,
        actionPlan,
        futImpact,
        blockedCases,
        raisedAt: raisedAt ? new Date(raisedAt) : new Date(),
        project: { connect: { id: projectId } },
        relatedCase: relatedCaseId ? { connect: { id: relatedCaseId } } : undefined
      }
    });
    res.json(defect);
  } catch (error) {
    console.error('Defect Creation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a defect
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    title, severity, description, status,
    externalId, owner, actionPlan, futImpact, blockedCases,
    relatedCaseId, raisedAt 
  } = req.body;

  try {
    const defect = await prisma.defect.update({
      where: { id },
      data: {
        title,
        severity,
        description,
        status,
        externalId,
        owner,
        actionPlan,
        futImpact,
        blockedCases,
        raisedAt: raisedAt ? new Date(raisedAt) : undefined,
        relatedCase: relatedCaseId ? { connect: { id: relatedCaseId } } : { disconnect: true }
      }
    });
    res.json(defect);
  } catch (error) {
    console.error('Defect Update Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a defect
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.defect.delete({ where: { id } });
    res.json({ message: 'Defect deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
