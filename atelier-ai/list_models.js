import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local manually since dotenv might not pick it up automatically in all setups
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

  console.log(`Using API Key: ${apiKey.substring(0, 4)}...`);

  try {
    console.log("Fetching available models via REST API...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.models) {
        console.log("\nAvailable Models:");
        data.models.forEach(m => {
            console.log(`- ${m.name}`);
            console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
        });
    } else {
        console.log("No models found in response:", data);
    }
    
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
