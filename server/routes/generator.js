const express = require('express');
const router = express.Router();
const { generateScenarios } = require('../services/aiGenerator');
const { emitStatus } = require('../socket');
const XLSX = require('xlsx');

// POST /api/generator/generate
router.post('/generate', async (req, res) => {
  const { requirements, options } = req.body;
  if (!requirements) return res.status(400).json({ error: 'Requirements are required' });

  try {
    const scenarios = await generateScenarios(requirements, (msg) => {
      emitStatus(msg);
    }, options);
    res.json(scenarios);
  } catch (error) {
    console.error('Generation Route Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/generator/export
router.post('/export', async (req, res) => {
  const { scenarios, projectName } = req.body;
  if (!scenarios || !Array.isArray(scenarios)) {
    return res.status(400).json({ error: 'Scenarios array is required' });
  }

  try {
    // Create worksheet with "Import-Ready" headers
    const worksheetData = scenarios.map((s, idx) => ({
      '#': `${idx + 1}`, // External ID baseline
      'Summary': s.summary,
      'Steps': s.steps,
      'Expected Result': s.expectedResult,
      'Order Build': s.orderBuild || 'N/A',
      'Order Completion': s.orderCompletion || 'N/A',
      'T&C Assurance': s.tcAssurance || 'N/A',
      'Billing': s.billing || 'N/A',
      'Priority': s.priority || 'MEDIUM',
      'Module': s.module || 'AI Draft'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Plan');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const safeName = (projectName || 'Test_Plan').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Draft.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export Route Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
