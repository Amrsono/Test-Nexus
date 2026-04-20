const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
dotenv.config({ path: '../../.env' });

// Defend against missing Vercel environment variables
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const prisma = new PrismaClient();

const { emitStatus } = require('../socket');

const generateInsights = async (projectId) => {
  if (!genAI) {
    console.warn('GEMINI_API_KEY is not configured. AI Advisor disabled.');
    emitStatus('AI Advisor: Disabled (Missing API Key).');
    return [];
  }

  const modelName = 'gemini-2.5-flash';
  let model;
  
  try {
    emitStatus('AI Advisor: Analyzing project landscape...');
    model = genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    emitStatus('AI Advisor: Switching to fallback analysis model...');
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  // Gather Data for specific project
  emitStatus('AI Advisor: Gathering case statistics...');
  const stats = await prisma.testCase.groupBy({
    by: ['status', 'module'],
    where: { suite: { projectId } },
    _count: { _all: true }
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { testSuites: { include: { testCases: true } } }
  });

  emitStatus('AI Advisor: Evaluating tester workloads...');
  const testers = await prisma.user.findMany({
    where: { role: 'TESTER' },
    include: { assignments: { 
      include: { testCase: true },
      where: { testCase: { suite: { projectId } } }
    } }
  });

  const totalCases = await prisma.testCase.count({ where: { suite: { projectId } } });
  const completedCases = await prisma.testCase.count({
    where: { 
      suite: { projectId },
      status: { in: ['PASS', 'FAIL'] } 
    }
  });

  const prompt = `
    You are the Senior Project Manager and AI Quality Lead for TestNexus. 
    Analyze the project health for "${project.name}" and provide high-impact managerial advice.
    
    Project Context:
    - Current Date: ${new Date().toLocaleDateString()}
    - Start Date: ${project.startDate || project.createdAt}
    - Go-Live Date: ${project.goLiveDate || 'CRITICAL: GO-LIVE DATE NOT SET'}
    - Total Scope: ${totalCases} test journeys
    - Current Progress: ${completedCases} journeys (${Math.round((completedCases / (totalCases || 1)) * 100)}%)
    - Breakdowns by Module: ${JSON.stringify(stats)}

    Tester Capacity & Load:
    ${testers.map(t => `${t.name}: ${t.assignments.length} assigned journeys`).join('\n')}

    Strategic Objectives:
    1. TIMELINE COMPLIANCE: If the project is behind schedule, calculate the necessary "Recovery Velocity" (journeys/day).
    2. RESOURCE OPTIMIZATION: Identify if testers are under-utilized or overloaded.
    3. RISK MITIGATION: Pivot focus to modules with high failure rates or low coverage.
    4. MANAGERIAL ADVICE: Provide 3-4 professional, actionable directives to ensure successful Go-Live.

    Tone: Professional, direct, and results-oriented.

    Respond with a JSON array:
    [ { "type": "RISK|VELOCITY|WORKLOAD|ADVICE", "message": "string", "category": "string", "isActionable": boolean } ]
  `;

  try {
    emitStatus('AI Advisor: Reasoning about risk factors...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json|```/gi, '').trim();
    
    const insights = JSON.parse(text);

    emitStatus('AI Advisor: Committing strategic insights...');
    // Save to DB
    await prisma.insight.createMany({
      data: insights.map(i => ({
        type: i.type,
        message: i.message,
        category: i.category,
        projectId: projectId,
        isActionable: i.isActionable
      }))
    });

    emitStatus('AI Advisor: Analysis Synced.');
    return insights;
  } catch (error) {
    console.error('Advisor Error:', error);
    emitStatus('AI Advisor: Analysis interrupted.');
    return [];
  }
};

module.exports = { generateInsights };
