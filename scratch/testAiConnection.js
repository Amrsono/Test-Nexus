const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim().replace(/['"]/g, '') : null;

if (!apiKey) {
    console.error('GEMINI_API_KEY not found in .env');
    process.exit(1);
}

const models = ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-flash-latest', 'models/gemini-1.5-flash'];

async function testConnection() {
    for (const modelName of models) {
        console.log(`\n--- Testing Model: ${modelName} ---`);
        const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
        
        try {
            const body = {
                contents: [{
                    parts: [{ text: "Return a JSON array with one test case for 'Login'. Only JSON." }]
                }]
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            
            if (data.error) {
                console.log(`FAILURE [${modelName}]:`, data.error.message);
                console.log('  Status Code:', data.error.code);
            } else if (data.candidates && data.candidates[0].content) {
                console.log(`SUCCESS [${modelName}]:`, data.candidates[0].content.parts[0].text.substring(0, 50) + '...');
            } else {
                console.log(`UNKNOWN RESULT [${modelName}]:`, JSON.stringify(data, null, 2).substring(0, 200));
            }
        } catch (error) {
            console.error(`Network Error [${modelName}]:`, error.message);
        }
    }
}

testConnection();
