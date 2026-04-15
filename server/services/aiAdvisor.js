const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
dotenv.config({ path: '../../.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const prisma = new PrismaClient();

const { emitStatus } = require('../socket');

const generateInsights = async (projectId) => {
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
    You are the AI Advisor for TestNexus. Analyze the following data for the project "${project.name}".
    
    Project Stats:
    - Total Cases: ${totalCases}
    - Completed: ${completedCases}
    - Breakdowns: ${JSON.stringify(stats)}

    Tester Workloads:
    ${testers.map(t => `${t.name}: ${t.assignments.length} cases assigned in this project`).join('\n')}

    Rules:
    1. Detect "Slippage" if completion is low.
    2. Identify "High Risk Areas" where failure rates are high (>20%).
    3. Suggest "Workload Balancing" if one tester is overloaded.
    4. Provide "Smart Advice" (e.g., prioritize blockers).

    Respond with a JSON array:
    { "type": "RISK|VELOCITY|WORKLOAD|ADVICE", "message": "string", "category": "string", "isActionable": boolean }
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
