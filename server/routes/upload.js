const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { parseTestCases } = require('../services/aiParser');

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

const { emitStatus } = require('../socket');

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { suiteName, projectId: providedProjectId } = req.body;

    emitStatus('System: Aggregating workbook tabs...');

    // Read all sheets
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    let allRawData = [];
    
    workbook.SheetNames.forEach(name => {
      const sheet = workbook.Sheets[name];
      const data = xlsx.utils.sheet_to_json(sheet);
      // Add sheet name reference to each row
      const sheetData = data.map(row => ({ ...row, _sheetName: name }));
      allRawData = [...allRawData, ...sheetData];
    });

    // Extract unique headers across all sheets for cleaner AI mapping/manual backup
    const headers = [...new Set(allRawData.flatMap(row => Object.keys(row)))];
    emitStatus(`System: Analyzing ${headers.length} workbook columns...`);

    let fieldMapping = req.body.manualMapping ? JSON.parse(req.body.manualMapping) : null;
    let aiProject = null;

    if (!fieldMapping) {
      try {
        const aiResult = await parseTestCases(allRawData, headers, emitStatus, req.file.originalname);
        fieldMapping = aiResult.fieldMapping;
        aiProject = aiResult.project;
      } catch (aiError) {
        console.warn('AI Parsing failed, falling back to manual mapping:', aiError.message);
        return res.status(202).json({
          status: 'MAPPING_REQUIRED',
          headers: headers,
          filename: req.file.originalname,
          message: 'AI agent quota exhausted or analysis failed. Manual mapping required.'
        });
      }
    }

    // SCALABLE EXTRACTION: Map raw rows to structured TestCases using AI's mapping
    const structuredCases = allRawData.map(row => {
      const extId = row[fieldMapping.externalId]?.toString() || '';
      const rawSummaryValue = row[fieldMapping.summary]?.toString() || 'No Summary';
      
      // Filter out invalid rows (mostly empty rows or padding)
      if (!extId && rawSummaryValue === 'No Summary') return null;

      // Combine ID and Summary for better dashboard visibility
      const combinedSummary = extId ? `${extId} - ${rawSummaryValue}` : rawSummaryValue;

      let stepsValue = row[fieldMapping.steps] || 'No Steps provided';
      if (typeof stepsValue === 'object' && stepsValue !== null) {
        stepsValue = JSON.stringify(stepsValue, null, 2);
      } else {
        stepsValue = stepsValue.toString();
      }

      return {
        externalId: extId,
        summary: combinedSummary,
        steps: stepsValue,
        expectedResult: row[fieldMapping.expectedResult]?.toString() || 'No Expected Result',
        priority: (row[fieldMapping.priority]?.toString().toUpperCase() || 'MEDIUM'),
        module: row[fieldMapping.module]?.toString() || row._sheetName || 'Default'
      };
    }).filter(c => c !== null);

    let targetProjectId = providedProjectId;

    // Project Discovery Logic
    if (aiProject && aiProject.name) {
      emitStatus(`AI Agent: Discovered Project Scope - "${aiProject.name}"`);
      
      // Theme mapping
      const themeMap = {
        "LIGHT": "#f8fafc",
        "BURGUNDY": "#1a1a2e",
        "BLACK": "#020617"
      };
      const themeColor = themeMap[aiProject.suggestedTheme?.toUpperCase()] || "#f8fafc";

      // Search by name first to avoid duplicates
      const existingByName = await prisma.project.findFirst({
        where: { name: aiProject.name }
      });

      if (existingByName) {
        emitStatus('System: Syncing with existing project...');
        targetProjectId = existingByName.id;
      } else {
        emitStatus('System: Creating discovered project tab...');
        const newProject = await prisma.project.create({
          data: {
            name: aiProject.name,
            themeColor: themeColor
          }
        });
        targetProjectId = newProject.id;
      }
    }

    if (!targetProjectId) {
      return res.status(400).json({ error: 'Could not determine project context' });
    }

    emitStatus(`System: Saving ${structuredCases.length} test cases to suite...`);

    // Create Suite
    const suite = await prisma.testSuite.create({
      data: {
        name: suiteName || `Import ${new Date().toLocaleDateString()}`,
        projectId: targetProjectId,
        testCases: {
          create: structuredCases
        }
      },
      include: { testCases: true }
    });

    emitStatus('Agent: Import Successful.');

    res.json({
      message: 'Import successful',
      suiteId: suite.id,
      projectId: targetProjectId,
      count: suite.testCases.length,
      discoveredProject: aiProject?.name
    });
  } catch (error) {
    console.error('Upload Error:', error);
    emitStatus(`Critical Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
