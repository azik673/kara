import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI;
  if (!apiKey) {
    console.error("No API key found!");
    return;
  }

  console.log(`Checking models for API Key: ${apiKey.substring(0, 4)}...`);

  try {
    // Use the REST API directly to list models
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
        console.error(`Error fetching models: ${response.status} ${response.statusText}`);
        console.error(await response.text());
        return;
    }

    const data = await response.json();
    
    let output = "--- AVAILABLE MODELS ---\n";
    if (data.models) {
        data.models.forEach(m => {
            if (m.supportedGenerationMethods.includes('generateContent')) {
                output += `Model: ${m.name}\n`;
                output += `Display: ${m.displayName}\n`;
                output += `------------------------\n`;
            }
        });
    } else {
        output += "No models found.\n";
    }
    fs.writeFileSync('models_output.txt', output);
    console.log("Wrote models to models_output.txt");
    
  } catch (error) {
    fs.writeFileSync('models_output.txt', `Error: ${error.message}\n${JSON.stringify(error, null, 2)}`);
    console.error("Exception:", error);
  }
}

listModels();
