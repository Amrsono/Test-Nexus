const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config(); // Assuming run from root

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const result = await model.generateContent("Hello?");
    const response = await result.response;
    console.log(response.text());
  } catch (e) {
    console.error("AI TEST ERROR:", e);
  }
}

test();
