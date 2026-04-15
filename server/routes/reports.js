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

    console.log(`Starting PPT generation for ${project.name}...`);
    const pres = new (pptxgen.default || pptxgen)();
    console.log("Initialized pptxgen instance.");

    console.log("Adding Title slide...");
    let s1 = pres.addSlide();
    s1.background = { color: "020617" };
    s1.addText("Executive Test Status Report", { 
      x: 1, y: 1.5, w: "80%", fontSize: 44, color: "FFFFFF", bold: true 
    });
    s1.addText(`${project.name} | ${new Date().toLocaleDateString()}`, { 
      x: 1, y: 2.5, w: "80%", fontSize: 24, color: "6366F1" 
    });

    console.log("Adding Overview slide...");
    let s2 = pres.addSlide();
    s2.addText("Execution Overview", { x: 0.5, y: 0.5, fontSize: 32, bold: true });
    
    const tableData = [
      [{ text: "Metric", options: { bold: true, fill: "F1F5F9" } }, { text: "Value", options: { bold: true, fill: "F1F5F9" } }],
      ["Total Scenarios", stats.total.toString()],
      ["Passed", stats.passed.toString()],
      ["Failed", stats.failed.toString()],
      ["Blocked", stats.blocked.toString()],
      ["Pending", stats.pending.toString()],
    ];
    s2.addTable(tableData, { x: 0.5, y: 1.2, w: 9, border: { type: "solid", color: "E2E8F0" }, fontSize: 18 });

    // 3. AI Insights
    let s3 = pres.addSlide();
    s3.addText("AI Risk Insights", { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 28, bold: true, color: "1e293b" });
    
    if (project.insights.length > 0) {
      const topInsights = project.insights.map(i => `• ${i.message}`);
      // Increased y to 1.5 to prevent overlap with title
      s3.addText(topInsights.join("\n\n"), { x: 0.5, y: 1.5, w: 9, fontSize: 12, color: "475569", align: "left", valign: "top" });
    } else {
      s3.addText("No critical risks identified at this time. Project health is currently stable.", { x: 0.5, y: 1.5, w: 9, fontSize: 14, color: "94A3B8" });
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
