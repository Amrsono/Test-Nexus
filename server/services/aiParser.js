const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * AI Parser Service
 * Now supports real-time progress updates via callbacks.
 */
const parseTestCases = async (rawData, headers, onProgress, filename) => {
  const candidateModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro', 'gemini-2.0-flash'];
  let lastError;

  for (const modelName of candidateModels) {
    try {
      if (onProgress) onProgress(`AI Agent: Initializing analytical engine (${modelName})...`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
        You are an expert Test Engineer. I have imported a large Excel workbook with multiple tabs.
        I have already extracted the unique column headers from ALL sheets:
        
        HEADERS FOUND:
        ${headers.join(', ')}

        Your task: Identify which of the HEADERS above correspond to our system fields.
        
        Field Mapping Definitions:
        - externalId: MUST be the unique test number/identifier (usually Column A or B, labeled "#").
        - summary: The title or scenario name (look for columns named "test", "Scenario", or "Subject").
        - steps: The test steps/actions.
        - expectedResult: The expected outcome.
        - priority: Importance level (High/Med/Low).
        - module: The functional area or release drop (sheet name).

        Data Samples for Context:
        ${JSON.stringify(rawData.slice(0, 10), null, 2)}

        Project Context:
        - filename: "${filename}"

        Please respond with a JSON object containing:
        {
          "project": { 
            "name": "Extract core name from filename", 
            "description": "1-sentence summary of testing scope", 
            "suggestedTheme": "LIGHT, BURGUNDY, or BLACK" 
          },
          "fieldMapping": {
            "externalId": "Exact_Header_Name_From_List",
            "summary": "Exact_Header_Name_From_List",
            "steps": "Exact_Header_Name_From_List",
            "expectedResult": "Exact_Header_Name_From_List",
            "priority": "Exact_Header_Name_From_List",
            "module": "Exact_Header_Name_From_List"
          }
        }

        Only return the JSON, no markdown.
      `;

      if (onProgress) onProgress(`AI Agent: Processing context with ${modelName}...`);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      if (onProgress) onProgress('AI Agent: Mapping Test Cases...');

      // Clean up markdown if present
      text = text.replace(/```json|```/gi, '').trim();

      try {
        const parsed = JSON.parse(text);
        if (onProgress) onProgress('AI Agent: Analysis Complete.');
        return parsed;
      } catch (parseError) {
        console.error(`AI JSON Parse Error (${modelName}). Raw Text:`, text);
        throw new Error('AI returned invalid JSON structure.');
      }
    } catch (error) {
      lastError = error;
      const isQuotaError = error.message?.includes('429') || error.message?.includes('quota');
      
      if (isQuotaError) {
        console.warn(`Model ${modelName} quota exceeded. Trying backup...`);
        if (onProgress) onProgress(`AI Agent: Engine busy (${modelName}), switching to backup...`);
        continue;
      }
      
      console.error(`Error with model ${modelName}:`, error);
      // If it's not a quota error, we might still want to try another model, 
      // but let's be selective. For now, we'll continue to the next candidate.
      continue;
    }
  }

  // If we get here, all models failed
  if (onProgress) onProgress(`AI Agent: Critical failure across all analytical engines.`);
  throw lastError || new Error('All candidate AI models failed to process the request.');
};

module.exports = { parseTestCases };
