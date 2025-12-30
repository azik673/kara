import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // On the server, we use the private variable (no NEXT_PUBLIC needed)
  const apiKey = process.env.REVE_API_KEY || process.env.NEXT_PUBLIC_REVE_API_KEY;

  console.log("DEBUG: API Key present?", !!apiKey); // Log if key exists (don't log the key itself)

  if (!apiKey) {
      console.error("Server Error: Missing REVE_API_KEY");
      return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  try {
    console.log("DEBUG: Sending request to Reve API...");
    const response = await fetch("https://api.reve.com/v1/image/edit", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error("Reve API Error Response:", response.status, data);
        return res.status(response.status).json(data);
    }

    console.log("DEBUG: Reve API Success");
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to reach Reve API:", error);
    return res.status(500).json({ error: 'Failed to reach Reve API', details: error instanceof Error ? error.message : String(error) });
  }
}
