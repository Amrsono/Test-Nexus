const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/**
 * AI Generator Service
 * Generates test scenarios based on requirements.
 */
const generateScenarios = async (requirements, onProgress, options = {}) => {
  const candidateModels = ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-flash-latest', 'models/gemini-1.5-flash'];
  let lastError;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  // Construct Scope Context from options
  const scopeContext = `
        SCOPE & CONSTRAINTS:
        ${options.release ? `- Release: ${options.release}` : ''}
        ${options.channels?.length > 0 ? `- Target Channels: ${options.channels.join(', ')}` : ''}
        ${options.accountTypes?.length > 0 ? `- Account Types: ${options.accountTypes.join(', ')}` : ''}
        ${options.journeyTypes?.length > 0 ? `- Journey Types: ${options.journeyTypes.join(', ')}` : ''}
        ${options.priority ? `- Default Priority: ${options.priority}` : ''}
        ${options.tcSteps ? `- Required Base Steps: ${options.tcSteps}` : ''}
        ${options.tcExpectedResults ? `- Required Expected Outcomes: ${options.tcExpectedResults}` : ''}
  `.trim();

  for (const modelName of candidateModels) {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const attemptLabel = attempts > 0 ? ` [Attempt ${attempts + 1}/3]` : '';
        if (onProgress) onProgress(`AI Agent: Initializing Scenario Lab (${modelName})${attemptLabel}...`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
        You are a Senior QA Engineer and Test Architect.
        Your goal is to generate a comprehensive set of test scenarios covering all combinations of the provided scope dimensions (Cartesian Product).

        ${scopeContext}
        
        REQUIREMENTS:
        ${requirements}

        Strategic Instructions:
        1. Identify EVERY possible combination (Cartesian Product) of the provided "Target Channels", "Account Types", and "Journey Types".
        2. You MUST generate at least one distinct scenario for EACH possible combination. 
           Example: If 2 Channels, 2 Account Types, and 1 Journey Type are provided, you MUST return at least 4 scenarios.
        3. For every scenario, the "summary" MUST follow this naming convention: [Channel] [Account Type] [Journey Name]
           Example: "[Retail] Mobile Upgrade - User with existing active line"
        4. Focus the "steps" and "expectedResult" on the specific context of that combination (e.g., Retail steps should differ from Call Center steps).
        5. Include Positive, Negative, and Edge Cases across the entire matrix.
        
        For each scenario, provide:
           - summary: [Channel] [Account Type] [Description]
           - steps: Numbered actions specific to the combination.
           - expectedResult: Specific expected outcome for that context.
           - priority: ${options.priority || 'MEDIUM'}.
           - module: A functional area name.
           - orderBuild: Key data to validate during capture (e.g. "Validate Price: £59.99, MCPR: Included").
           - orderCompletion: Success criteria for provisioning (e.g. "Sim active, Order status: CLOSED").
           - tcAssurance: Specific T&Cs or Comms to verify (e.g. "Verify Welcome SMS sent, T&Cs accepted").
           - billing: First bill expectations (e.g. "Validate Part-month rental + Advance payment").

        Format the entire response as a clean JSON array of objects.
        Example output format:
        [
          {
            "summary": "User can login with valid credentials",
            "steps": "1. Go to login page\n2. Enter valid email\n3. Enter valid password\n4. Click Login",
            "expectedResult": "User is redirected to dashboard",
            "priority": "HIGH",
            "module": "Authentication",
            "orderBuild": "N/A",
            "orderCompletion": "Order status: Complete",
            "tcAssurance": "N/A",
            "billing": "N/A"
          }
        ]

        Only return the JSON array, no preamble, no markdown formatting.
      `;

      if (onProgress) onProgress(`AI Agent: Applying scope filters with ${modelName}...`);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Clean up markdown if present
      text = text.replace(/```json|```/gi, '').trim();

        try {
          const parsed = JSON.parse(text);
          if (onProgress) onProgress('AI Agent: Scenarios Generated Successfully.');
          return parsed;
        } catch (parseError) {
          console.error(`AI JSON Parse Error (${modelName}). Raw Text:`, text);
          throw new Error('AI returned invalid JSON structure.');
        }
      } catch (error) {
        lastError = error;
        const errStr = String(error).toLowerCase();
        const statusCode = error.status || error.response?.status || 0;
        
        // Handle both Quota (429) and Server Overload (503/500)
        const isRetryable = 
          statusCode === 429 || statusCode === 503 || statusCode === 500 ||
          errStr.includes('429') || errStr.includes('quota') || errStr.includes('limit') || 
          errStr.includes('exhausted') || errStr.includes('high demand') || errStr.includes('503');

        const isNotFound = statusCode === 404 || errStr.includes('404') || errStr.includes('not found');

        if (isNotFound) {
          if (onProgress) onProgress(`AI Agent: ⚠️ ${modelName} unavailable. Falling back...`);
          break; // Next model immediately
        }

        if (isRetryable) {
          attempts++;
          if (attempts < 3) {
            const waitTime = attempts * 20000; // 20s base wait
            const reason = statusCode === 503 ? 'AI Servers Busy' : 'Quota Limit';
            if (onProgress) onProgress(`AI Agent: ⚠️ ${reason}. Retrying in ${waitTime/1000}s [${attempts}/3]...`);
            await sleep(waitTime);
            continue;
          }
        }
        
        console.warn(`[AI SKIP] Model ${modelName} encountered terminal error:`, errStr.substring(0, 50));
        break; // Max attempts or non-retryable error
      }
    }
  }

  const isFinalQuotaError = lastError?.message?.includes('429') || lastError?.status === 429;
  if (isFinalQuotaError) {
    if (onProgress) onProgress('AI Agent: ❌ All models are currently rate-limited (429). Please wait 30-60 seconds.');
    throw new Error('AI_QUOTA_EXCEEDED');
  }

  throw lastError || new Error('All AI models failed to generate scenarios.');
};

module.exports = { generateScenarios };
