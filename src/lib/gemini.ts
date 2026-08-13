
/**
 * Utility for Gemini API interaction
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export async function callGemini(apiKey: string, prompt: string) {
  if (!apiKey) {
    throw new Error("API Key is missing. Please set it in settings.");
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Failed to communicate with Gemini API");
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error("Empty response from AI");
  }

  return text;
}

export async function analyzeAndRefactorCode(apiKey: string, code: string, instruction: string) {
  const prompt = `
    You are an expert software engineer. Refactor the following code according to these instructions: "${instruction}".
    
    IMPORTANT: 
    1. Return ONLY the refactored code. 
    2. Do NOT include markdown code blocks (like \`\`\`typescript) or explanations.
    3. Ensure the code is complete and functional.
    
    CODE TO REFACTOR:
    ${code}
  `;

  const result = await callGemini(apiKey, prompt);
  
  // Clean up potential markdown wrapper if LLM ignores instructions
  return result.replace(/^```[a-z]*\n/i, "").replace(/\n```$/g, "").trim();
}

export async function getCodeAction(apiKey: string, code: string, instruction: string) {
  const prompt = `
    You are a code transformation assistant. Perform the following action: "${instruction}".
    
    Return a JSON object with the following structure:
    {
      "explanation": "Brief explanation of what was changed",
      "modifiedCode": "The entire modified file content"
    }

    Return ONLY the raw JSON. No markdown formatting.

    CODE:
    ${code}
  `;

  const result = await callGemini(apiKey, prompt);
  
  try {
    // Clean potential markdown and parse
    const cleanJson = result.replace(/^```json\n/i, "").replace(/^```\n/i, "").replace(/\n```$/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    // Fallback if LLM doesn't return valid JSON
    return {
      explanation: "Performed the requested changes.",
      modifiedCode: result.replace(/^```[a-z]*\n/i, "").replace(/\n```$/g, "").trim()
    };
  }
}

