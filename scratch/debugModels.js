const fs = require('fs');
const path = require('path');

// Read directly from .env to avoid dependency issues
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim().replace(/['"]/g, '') : null;

if (!apiKey) {
    console.error('GEMINI_API_KEY not found in .env');
    process.exit(1);
}

async function listModels() {
    try {
        console.log('Using API Key: ' + apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 5));
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            console.error('API Error (v1beta):', data.error.message);
        } else if (data.models) {
            console.log('\n--- Available Models (v1beta) ---');
            data.models.forEach(m => {
                console.log(`- ${m.name}`);
            });
        }
        
    } catch (error) {
        console.error('Network Error:', error);
    }
}

listModels();
