import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export type AIProvider = 'gemini' | 'groq' | 'siliconflow';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
}

export const PROVIDER_LINKS: Record<AIProvider, string> = {
  gemini: "https://aistudio.google.com/app/apikey",
  groq: "https://console.groq.com/keys",
  siliconflow: "https://cloud.siliconflow.cn/account/ak",
};

export const PROVIDER_MODELS: Record<AIProvider, string> = {
  gemini: "gemini-1.5-flash",
  groq: "llama-3.3-70b-versatile",
  siliconflow: "Qwen/Qwen2.5-72B-Instruct",
};

export const PROVIDER_BASE_URLS: Record<AIProvider, string | null> = {
  gemini: null,
  groq: "https://api.groq.com/openai/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
};

async function callOpenAICompatible(settings: AISettings, prompt: string) {
  const baseUrl = PROVIDER_BASE_URLS[settings.provider];
  const model = PROVIDER_MODELS[settings.provider];
  
  if (!baseUrl) throw new Error(`Base URL not found for ${settings.provider}`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callGemini(apiKey: string, prompt: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: PROVIDER_MODELS.gemini,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function callAI(settings: AISettings, prompt: string) {
  if (!settings.apiKey) {
    throw new Error(`API Key for ${settings.provider} is missing. Please set it in settings.`);
  }

  try {
    if (settings.provider === 'gemini') {
      return await callGemini(settings.apiKey, prompt);
    } else {
      return await callOpenAICompatible(settings.provider === 'groq' ? { ...settings, provider: 'groq' } : { ...settings, provider: 'siliconflow' }, prompt);
    }
  } catch (error: any) {
    console.error(`${settings.provider} API Error:`, error);
    throw new Error(error.message || `Failed to communicate with ${settings.provider} API`);
  }
}

export async function getCodeAction(settings: AISettings, code: string, instruction: string) {
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

  const result = await callAI(settings, prompt);
  
  try {
    const cleanJson = result.replace(/^```json\n/i, "").replace(/^```\n/i, "").replace(/\n```$/g, "").trim();
    if (!cleanJson || (!cleanJson.startsWith('{') && !cleanJson.startsWith('['))) {
      throw new Error("AI returned non-JSON content");
    }
    return JSON.parse(cleanJson);
  } catch (e) {
    const modifiedCode = result.replace(/^```[a-z]*\n/i, "").replace(/\n```$/g, "").trim();
    return {
      explanation: "Performed changes (manual recovery).",
      modifiedCode: modifiedCode || code
    };
  }
}

export async function auditCodebase(settings: AISettings, files: { name: string, content: string }[]) {
  const fileSummary = files.map(f => `FILE: ${f.name}\nCONTENT:\n${f.content.substring(0, 2000)}`).join('\n\n---\n\n');
  const prompt = `
    Analyze this React/Vite project architecture based on these core files. 
    Identify missing features, security flaws, and suggest improvements.
    
    PROJECT FILES:
    ${fileSummary}
  `;

  return await callAI(settings, prompt);
}
