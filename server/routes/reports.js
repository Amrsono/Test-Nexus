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
        testSuites: { include: { testCases: true } },
        defects: true
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

    // Calculate Defect Stats
    const openDefects = project.defects.filter(d => ['OPEN', 'FIXED', 'VERIFIED'].includes(d.status));
    const defectStats = {
      total: project.defects.length,
      open: project.defects.filter(d => d.status === 'OPEN').length,
      p1: project.defects.filter(d => d.severity === 'P1').length,
      p2: project.defects.filter(d => d.severity === 'P2').length,
      p3: project.defects.filter(d => d.severity === 'P3').length,
      p4: project.defects.filter(d => d.severity === 'P4').length,
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
      x: 0.5, y: 1.0, w: "90%", fontSize: 14, color: "6366F1", bold: true, charSpacing: 4, fontFace: "Arial"
    });
    s1.addText(project.name.toUpperCase(), { 
      x: 0.5, y: 1.5, w: "90%", fontSize: 48, color: "FFFFFF", bold: true, fontFace: "Arial"
    });
    s1.addText("AUTOMATED PROJECT READINESS REPORT", { 
      x: 0.5, y: 2.2, w: "90%", fontSize: 18, color: "94A3B8", fontFace: "Arial"
    });
    
    s1.addText(`GENERATED ON: ${new Date().toLocaleDateString()}`, { 
      x: 0.5, y: 4.5, fontSize: 12, color: "475569", fontFace: "Arial"
    });

    // 2. Status Distribution (Pie Chart)
    let s2 = pres.addSlide();
    s2.background = { color: "020617" };
    s2.addText("EXECUTION COMPOSITION", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Arial" });
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
      valign: 'middle',
      fontFace: "Arial"
    });

    // 3. Execution Burndown (Line Chart)
    const startDate = project.startDate || project.createdAt;
    const goLiveDate = project.goLiveDate || new Date(new Date(startDate).getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const days = [];
    let curr = new Date(startDate);
    curr.setHours(0,0,0,0);
    const end = new Date(goLiveDate);
    end.setHours(23,59,59,999);
    
    let counter = 0;
    while (curr <= end && counter < 60) { // Limit to 60 days for slide clarity
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
      counter++;
    }

    const burndownLabels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const idealValues = days.map((_, index) => {
      return Math.round(Math.max(0, stats.total - (stats.total * (index / (days.length - 1)))));
    });
    const actualValues = days.map(day => {
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const completed = allCases.filter(c => c.status !== 'PENDING' && new Date(c.updatedAt) <= dayEnd).length;
      return Math.max(0, stats.total - completed);
    });

    let s3 = pres.addSlide();
    s3.background = { color: "020617" };
    s3.addText("EXECUTION BURNDOWN", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s3.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "3B82F6" } });

    s3.addChart(pres.ChartType.line, [
      { name: "Ideal Path", labels: burndownLabels, values: idealValues },
      { name: "Actual Progress", labels: burndownLabels, values: actualValues }
    ], { 
      x: 0.5, y: 1.0, w: 9, h: 4.5,
      showLegend: true, 
      legendPos: 'b',
      legendFontSize: 12,
      legendColor: 'FFFFFF',
      chartColors: ['64748B', '3B82F6'], // Slate for ideal, Blue for actual
      lineDataSymbol: 'none',
      valAxisTitleColor: '94A3B8',
      catAxisTitleColor: '94A3B8',
      valAxisLabelColor: '94A3B8',
      catAxisLabelColor: '94A3B8',
      gridLine: { color: '1E293B' }
    });

    // 4. Defect Landscape
    let s4 = pres.addSlide();
    s4.background = { color: "020617" };
    s4.addText("DEFECT LANDSCAPE", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s4.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "F59E0B" } });

    const defectSeverityData = [
      {
        name: "Severity Breakdown",
        labels: ["P1 (Critical)", "P2 (Major)", "P3 (Normal)", "P4 (Minor)"],
        values: [defectStats.p1, defectStats.p2, defectStats.p3, defectStats.p4]
      }
    ];

    s4.addChart(pres.ChartType.bar, defectSeverityData, {
      x: 0.5, y: 1.2, w: 5, h: 4,
      showLegend: false,
      chartColors: ['EF4444', 'F59E0B', '3B82F6', '64748B'],
      valAxisLabelColor: 'FFFFFF',
      catAxisLabelColor: 'FFFFFF'
    });

    const defectTable = [
      [{ text: "DEFECT METRIC", options: { bold: true, color: "F59E0B" } }, { text: "COUNT", options: { bold: true, color: "F59E0B" } }],
      [{ text: "Total Reported", options: { color: "FFFFFF" } }, { text: defectStats.total.toString(), options: { color: "FFFFFF" } }],
      [{ text: "Current Open", options: { color: "FFFFFF" } }, { text: defectStats.open.toString(), options: { color: "FFFFFF" } }],
      [{ text: "P1 / P2 Ratio", options: { color: "EF4444", bold: true } }, { text: `${Math.round(((defectStats.p1 + defectStats.p2) / (defectStats.total || 1)) * 100)}%`, options: { color: "EF4444", bold: true } }]
    ];
    s4.addTable(defectTable, { x: 5.8, y: 1.5, w: 3.5, fill: { color: "0F172A" }, fontSize: 14, fontFace: "Arial" });

    // 5. Critical Blocker Analysis
    const criticalDefects = project.defects
      .filter(d => ['P1', 'P2'].includes(d.severity) && d.status === 'OPEN')
      .slice(0, 5);

    let s5 = pres.addSlide();
    s5.background = { color: "020617" };
    s5.addText("CRITICAL BLOCKER ANALYSIS", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s5.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "EF4444" } });

    if (criticalDefects.length > 0) {
      const blockerData = [
        [
          { text: "ID", options: { bold: true, color: "EF4444" } },
          { text: "TITLE", options: { bold: true, color: "EF4444" } },
          { text: "SEV", options: { bold: true, color: "EF4444" } },
          { text: "OWNER", options: { bold: true, color: "EF4444" } },
          { text: "ACTION PLAN", options: { bold: true, color: "EF4444" } }
        ]
      ];

      criticalDefects.forEach(d => {
        blockerData.push([
          { text: d.externalId || "N/A", options: { color: "FFFFFF" } },
          { text: d.title, options: { color: "FFFFFF" } },
          { text: d.severity, options: { color: d.severity === 'P1' ? "EF4444" : "F59E0B", bold: true } },
          { text: d.owner || "Unassigned", options: { color: "FFFFFF" } },
          { text: d.actionPlan || "Pending investigation...", options: { color: "94A3B8", fontSize: 10 } }
        ]);
      });

      s5.addTable(blockerData, { 
        x: 0.5, y: 1.2, w: 9, 
        fill: { color: "0F172A" }, 
        fontSize: 11,
        border: { type: "solid", color: "1E293B", pt: 1 },
        fontFace: "Arial"
      });
    } else {
      s5.addText("NO OPEN P1 OR P2 BLOCKERS DETECTED", { x: 0.5, y: 2.0, w: 9, fontSize: 20, color: "10B981", align: "center" });
    }

    // 6. Project Management Advisory (NEW)
    const remainingCases = stats.total - (stats.passed + stats.failed + stats.blocked);
    const today = new Date();
    const targetDate = new Date(goLiveDate);
    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const requiredVelocity = diffDays > 0 ? (remainingCases / diffDays).toFixed(1) : remainingCases;

    let s6 = pres.addSlide();
    s6.background = { color: "020617" };
    s6.addText("PROJECT MANAGEMENT ADVISORY", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s6.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "10B981" } });

    // Velocity Target Card
    s6.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.2, w: 3, h: 1.5, fill: { color: "1E293B" }, line: { color: "10B981", pt: 2 } });
    s6.addText("TARGET VELOCITY", { x: 0.6, y: 1.4, w: 2.8, fontSize: 12, bold: true, color: "10B981", fontFace: "Arial", align: 'center' });
    s6.addText(requiredVelocity.toString(), { x: 0.6, y: 1.8, w: 2.8, fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Arial", align: 'center' });
    s6.addText("JOURNEYS / DAY", { x: 0.6, y: 2.3, w: 2.8, fontSize: 10, color: "94A3B8", fontFace: "Arial", align: 'center' });

    // Timeline Status
    s6.addText("TIMELINE HEALTH", { x: 4.0, y: 1.2, fontSize: 14, bold: true, color: "FFFFFF", fontFace: "Arial" });
    const isBehind = diffDays < 7 && remainingCases > 50; // Simple logic for demo
    s6.addText(isBehind ? "CRITICAL SLIPPAGE RISK" : "ON TRACK FOR GO-LIVE", { 
      x: 4.0, y: 1.5, fontSize: 18, bold: true, color: isBehind ? "EF4444" : "10B981", fontFace: "Arial" 
    });
    s6.addText(`Days until Go-Live: ${diffDays > 0 ? diffDays : 'OVERDUE'}`, { x: 4.0, y: 1.8, fontSize: 12, color: "94A3B8", fontFace: "Arial" });

    // PM Directives (AI Suggestions)
    s6.addText("MANAGERIAL DIRECTIVES", { x: 0.5, y: 3.0, fontSize: 16, bold: true, color: "6366F1", fontFace: "Arial" });
    const pmInsights = project.insights.filter(i => i.type === 'ADVICE' || i.type === 'VELOCITY').slice(0, 3);
    
    if (pmInsights.length > 0) {
      pmInsights.forEach((insight, idx) => {
        const yOffset = 3.4 + (idx * 0.6);
        s6.addShape(pres.ShapeType.ellipse, { x: 0.5, y: yOffset + 0.1, w: 0.1, h: 0.1, fill: { color: "6366F1" } });
        s6.addText(insight.message, { x: 0.7, y: yOffset, w: 8.5, fontSize: 12, color: "FFFFFF", fontFace: "Arial" });
      });
    } else {
      s6.addText("Maintain current velocity to ensure stable release transition.", { x: 0.7, y: 3.4, w: 8.5, fontSize: 12, color: "94A3B8", fontFace: "Arial", italic: true });
    }

    // 7. AI Risk Analysis
    let s7 = pres.addSlide();
    s7.background = { color: "020617" };
    s7.addText("AI RISK ASSESSMENT", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s7.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 2, h: 0.05, fill: { color: "6366F1" } });
    
    if (project.insights.length > 0) {
      project.insights.forEach((insight, idx) => {
        const yPos = 1.2 + (idx * 1.0); // Increased gap from 0.8 to 1.0
        const color = insight.type === 'RISK' ? 'EF4444' : insight.type === 'VELOCITY' ? 'F59E0B' : '6366F1';
        
        // Visual indicator bar
        s7.addShape(pres.ShapeType.rect, { x: 0.5, y: yPos, w: 0.06, h: 0.7, fill: { color: color } });
        
        // Category Label (smaller, capitalized)
        s7.addText(insight.type.toUpperCase(), { 
          x: 0.7, y: yPos, fontSize: 9, bold: true, color: color, fontFace: "Arial", charSpacing: 1 
        });
        
        // The actual insight message (positioned lower to avoid overlap)
        s7.addText(insight.message, { 
          x: 0.7, y: yPos + 0.25, w: 8.5, h: 0.6, fontSize: 13, color: "FFFFFF", fontFace: "Arial", valign: 'top' 
        });
      });
    } else {
      s7.addText("NO CRITICAL RISKS DETECTED IN CURRENT CYCLE", { x: 0.5, y: 2.0, w: 9, fontSize: 20, color: "10B981", align: "center", fontFace: "Arial" });
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
