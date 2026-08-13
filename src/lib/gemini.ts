import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

/**
 * Utility for Gemini API interaction using the official SDK
 */

const getGenAI = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please set it in settings.");
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function callGemini(apiKey: string, prompt: string) {
  try {
    const genAI = getGenAI(apiKey);
    // Use gemini-1.5-flash as requested
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text) {
      throw new Error("Empty response from AI");
    }

    return text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const message = error.message || "Failed to communicate with Gemini API";
    throw new Error(message);
  }
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
    
    // Check if it's empty or doesn't look like JSON
    if (!cleanJson || (!cleanJson.startsWith('{') && !cleanJson.startsWith('['))) {
      throw new Error("AI returned non-JSON content");
    }

    return JSON.parse(cleanJson);
  } catch (e) {
    console.warn("Gemini didn't return valid JSON, attempting to extract code manually", e);
    // Fallback if LLM doesn't return valid JSON
    // We try to find something that looks like code if JSON parsing fails
    const modifiedCode = result.replace(/^```[a-z]*\n/i, "").replace(/\n```$/g, "").trim();
    
    return {
      explanation: "Performed the requested changes (recovered from parsing error).",
      modifiedCode: modifiedCode || code // return original code if everything fails
    };
  }
}
