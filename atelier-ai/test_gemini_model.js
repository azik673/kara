
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI || process.env.gemini;

if (!apiKey) {
    console.error("No API key found!");
    process.exit(1);
}

const cleanKey = apiKey.trim();
console.log(`Testing with API Key (length: ${cleanKey.length}, prefix: ${cleanKey.substring(0, 4)}, suffix: ${cleanKey.substring(cleanKey.length - 4)})`);

const ai = new GoogleGenAI({ apiKey: cleanKey });

async function testModel(modelName) {
    console.log(`\n--- Testing Model: ${modelName} ---`);
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: 'Say "Hello"' }] }
        });
        console.log("Success!");
        console.log("Response:", response?.candidates?.[0]?.content?.parts?.[0]?.text || "No text response");
        return true;
    } catch (error) {
        console.error("Failed:");
        console.error(error.message || error);
        return false;
    }
}

async function runTests() {
    console.log("--- STARTING TESTS ---");
    
    // Test a known working text model to verify API key
    await testModel('gemini-1.5-flash');

    // Test the experimental image model
    await testModel('gemini-2.0-flash-exp-image-generation');
    
    console.log("--- FINISHED TESTS ---");
}

runTests();
