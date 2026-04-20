const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const pptxgen = require('pptxgenjs');

const prisma = new PrismaClient();

// GET /api/reports/project/:id/ppt
router.get('/project/:id/ppt', async (req, res) => {
  const { id } = req.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        insights: { take: 5 },
        testSuites: { include: { testCases: true } }
      }
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Calculate basic stats for the report
    const allCases = project.testSuites.flatMap(s => s.testCases);
    const stats = {
      total: allCases.length,
      passed: allCases.filter(c => c.status === 'PASS').length,
      failed: allCases.filter(c => c.status === 'FAIL').length,
      blocked: allCases.filter(c => c.status === 'BLOCKED').length,
      pending: allCases.filter(c => c.status === 'PENDING').length,
    };

    console.log(`Starting Nexus 2030 PPT generation for ${project.name}...`);
    const pres = new (pptxgen.default || pptxgen)();
    
    // Set global layout/sizing
    pres.layout = 'LAYOUT_16x9';

    // 1. Futuristic Title Slide
    let s1 = pres.addSlide();
    s1.background = { color: "020617" }; // Stealth Black
    s1.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.1, fill: { color: "6366F1" } }); // Indigo Top Accent
    
    s1.addText("EXECUTIVE QUALITY INSIGHTS", { 
      x: 0.5, y: 1.0, w: "90%", fontSize: 14, color: "6366F1", bold: true, charSpacing: 4 
    });
    s1.addText(project.name.toUpperCase(), { 
      x: 0.5, y: 1.5, w: "90%", fontSize: 48, color: "FFFFFF", bold: true 
    });
    s1.addText("AUTOMATED PROJECT READINESS REPORT", { 
      x: 0.5, y: 2.2, w: "90%", fontSize: 18, color: "94A3B8" 
    });
    
    s1.addText(`GENERATED ON: ${new Date().toLocaleDateString()}`, { 
      x: 0.5, y: 4.5, fontSize: 12, color: "475569" 
    });

    // 2. Status Distribution (Pie Chart)
    let s2 = pres.addSlide();
    s2.background = { color: "020617" };
    s2.addText("EXECUTION COMPOSITION", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF" });
    s2.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "6366F1" } });

    const chartData = [
      {
        name: "Status Breakdown",
        labels: ["PASS", "FAIL", "BLOCKED", "PENDING"],
        values: [stats.passed, stats.failed, stats.blocked, stats.pending]
      }
    ];
    
    s2.addChart(pres.ChartType.pie, chartData, { 
      x: 0.5, y: 1.0, w: 5, h: 4, 
      showPercent: true, 
      showLegend: true, 
      legendPos: 'r',
      legendFontSize: 14,
      legendColor: 'FFFFFF',
      chartColors: ['10B981', 'EF4444', 'F59E0B', '64748B'] // Emerald, Red, Amber, Slate
    });

    // Overview Table next to chart
    const tableData = [
      [{ text: "METRIC", options: { bold: true, color: "6366F1", fontSize: 10 } }, { text: "QUANTITY", options: { bold: true, color: "6366F1", fontSize: 10 } }],
      [{ text: "Total Scenarios", options: { color: "FFFFFF" } }, { text: stats.total.toString(), options: { color: "FFFFFF" } }],
      [{ text: "Completed", options: { color: "FFFFFF" } }, { text: (stats.passed + stats.failed + stats.blocked).toString(), options: { color: "FFFFFF" } }],
      [{ text: "Success Rate", options: { color: "10B981", bold: true } }, { text: `${Math.round((stats.passed / (stats.total || 1)) * 100)}%`, options: { color: "10B981", bold: true } }]
    ];
    s2.addTable(tableData, { 
      x: 5.8, y: 1.5, w: 3.5, 
      border: { type: "none" }, 
      fill: { color: "0F172A" },
      fontSize: 14,
      valign: 'middle'
    });

    // 3. AI Risk Analysis
    let s3 = pres.addSlide();
    s3.background = { color: "020617" };
    s3.addText("AI RISK ASSESSMENT", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF" });
    s3.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "EF4444" } });
    
    if (project.insights.length > 0) {
      project.insights.forEach((insight, idx) => {
        const yPos = 1.2 + (idx * 0.8);
        const color = insight.type === 'RISK' ? 'EF4444' : insight.type === 'VELOCITY' ? 'F59E0B' : '6366F1';
        
        s3.addShape(pres.ShapeType.rect, { x: 0.5, y: yPos, w: 0.1, h: 0.6, fill: { color: color } });
        s3.addText(insight.type, { x: 0.7, y: yPos, fontSize: 10, bold: true, color: color });
        s3.addText(insight.message, { x: 0.7, y: yPos + 0.2, w: 8.5, fontSize: 14, color: "FFFFFF" });
      });
    } else {
      s3.addText("NO CRITICAL RISKS DETECTED IN CURRENT CYCLE", { x: 0.5, y: 2.0, w: 9, fontSize: 20, color: "10B981", align: "center" });
    }

    console.log("Generating buffer...");
    const data = await pres.write("nodebuffer");
    console.log("Buffer generated successfully.");
    
    // Create a safe filename (replace all non-alphanumeric with underscore)
    const safeFileName = `${project.name.replace(/[^a-z0-9]/gi, '_')}_Status_Report.pptx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(data);

  } catch (error) {
    console.error('Backend PPT Export Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
