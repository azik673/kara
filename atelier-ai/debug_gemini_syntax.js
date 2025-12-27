
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
console.log("API Key found:", !!apiKey);

const ai = new GoogleGenAI({ apiKey: apiKey });

async function testGenerate() {
    try {
        console.log("Listing models...");
        const response = await ai.models.list();
        if (response.models) {
            const modelNames = response.models.map(m => m.name).join("\n");
            console.log("Writing models to available_models.txt");
            fs.writeFileSync('available_models.txt', modelNames);
            console.log("Models written successfully.");
        } else {
            console.log("List response structure:", JSON.stringify(response, null, 2));
        }
    } catch (error) {
        console.error("Global error:", error);
    }
}

testGenerate();
