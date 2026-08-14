import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import Groq from "groq-sdk";

export type AIProvider =
  | "gemini"
  | "groq"
  | "siliconflow"
  | "openrouter"
  | "together"
  | "mistral"
  | "deepseek"
  | "huggingface"
  | "demo";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
}

export interface ProviderInfo {
  id: AIProvider;
  label: string;
  labelAr: string;
  description: string;
  model: string;
  baseUrl: string | null;
  link: string;
  free: boolean;
  freeQuota: string;
  icon: string;
}

export interface APKContextInput {
  info?: {
    appName?: string;
    packageName?: string;
    versionName?: string;
    versionCode?: string;
    minSdk?: string;
    targetSdk?: string;
    debuggable?: boolean;
    allowBackup?: boolean;
    isSigned?: boolean;
    dexCount?: number;
    architectures?: string[];
    permissions?: Array<{ name: string; isDangerous?: boolean }>;
    activities?: Array<{ name: string; exported?: boolean }>;
    services?: Array<{ name: string; exported?: boolean }>;
    receivers?: Array<{ name: string; exported?: boolean }>;
    providers?: Array<{ name: string; exported?: boolean }>;
  } | null;
  certificates?: Array<{
    fileName: string;
    path: string;
    type: string;
    issuer?: string;
    subject?: string;
    fingerprintSHA256?: string;
    isDebug?: boolean;
  }>;
  categories?: Array<{ category: string; count: number; totalSize: number }>;
  files?: Array<{ path: string; category: string; size: number; editable?: boolean }>;
}

export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    labelAr: "جوجل جيميني",
    icon: "✨",
    description: "سريع وممتاز للغة العربية",
    model: "gemini-1.5-flash-latest",
    baseUrl: null,
    link: "https://aistudio.google.com/app/apikey",
    free: true,
    freeQuota: "خطة مجانية بحسب حدود Google",
  },
  groq: {
    id: "groq",
    label: "Groq (Llama)",
    labelAr: "جروك - سريع جداً",
    icon: "⚡",
    description: "استجابة سريعة ونموذج Llama",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    link: "https://console.groq.com/keys",
    free: true,
    freeQuota: "خطة مجانية محدودة",
  },
  siliconflow: {
    id: "siliconflow",
    label: "SiliconFlow Qwen",
    labelAr: "سيليكون فلو",
    icon: "🧠",
    description: "نماذج Qwen وDeepSeek",
    model: "Qwen/Qwen2.5-72B-Instruct",
    baseUrl: "https://api.siliconflow.cn/v1",
    link: "https://cloud.siliconflow.cn/account/ak",
    free: true,
    freeQuota: "رصيد/نماذج مجانية بحسب الحساب",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    labelAr: "أوبن روتر",
    icon: "🌐",
    description: "بوابة لنماذج مفتوحة متعددة",
    model: "meta-llama/llama-3.2-3b-instruct:free",
    baseUrl: "https://openrouter.ai/api/v1",
    link: "https://openrouter.ai/keys",
    free: true,
    freeQuota: "نماذج :free ضمن حدود الخدمة",
  },
  together: {
    id: "together",
    label: "Together AI",
    labelAr: "توجذر",
    icon: "🤝",
    description: "نماذج Llama وQwen",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    baseUrl: "https://api.together.xyz/v1",
    link: "https://api.together.xyz/settings/api-keys",
    free: true,
    freeQuota: "رصيد تجريبي بحسب الحساب",
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    labelAr: "ميسترال",
    icon: "🌀",
    description: "نموذج قوي للتحليل والكود",
    model: "mistral-small-latest",
    baseUrl: "https://api.mistral.ai/v1",
    link: "https://console.mistral.ai/api-keys/",
    free: true,
    freeQuota: "خطة تجريبية بحسب الحساب",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    labelAr: "ديب سيك",
    icon: "🔍",
    description: "متخصص في البرمجة والتحليل",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    link: "https://platform.deepseek.com/api_keys",
    free: false,
    freeQuota: "تسعير منخفض/رصيد ترويجي بحسب الحساب",
  },
  huggingface: {
    id: "huggingface",
    label: "Hugging Face",
    labelAr: "هجنج فيس",
    icon: "🤗",
    description: "نماذج مفتوحة عبر Inference Providers",
    model: "Qwen/Qwen2.5-72B-Instruct",
    baseUrl: "https://router.huggingface.co/v1",
    link: "https://huggingface.co/settings/tokens",
    free: true,
    freeQuota: "رصيد مجاني محدود",
  },
  demo: {
    id: "demo",
    label: "Demo AI (No Key)",
    labelAr: "تجريبي - بدون مفتاح",
    icon: "🎮",
    description: "تحليل محلي سريع دون إرسال البيانات",
    model: "demo-local",
    baseUrl: null,
    link: "#",
    free: true,
    freeQuota: "مجاني ويعمل دون مفتاح",
  },
};

function apiError(body: string, status: number): Error {
  try {
    const parsed = JSON.parse(body);
    return new Error(parsed.error?.message || parsed.message || `API request failed (${status})`);
  } catch {
    return new Error(body.slice(0, 500) || `API request failed (${status})`);
  }
}

async function callOpenAICompatible(
  settings: AISettings,
  prompt: string,
  system?: string,
): Promise<string> {
  const provider = PROVIDERS[settings.provider];
  if (!provider.baseUrl) throw new Error(`No API endpoint configured for ${provider.label}`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.apiKey}`,
  };
  if (settings.provider === "openrouter" && typeof window !== "undefined") {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "APP-FORGE APK Editor";
  }
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: provider.model, messages, temperature: 0.65, max_tokens: 4096 }),
  });
  const body = await response.text();
  if (!response.ok) throw apiError(body, response.status);
  const data = JSON.parse(body);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI provider returned an empty response");
  return content;
}

async function callGroq(apiKey: string, prompt: string, system?: string): Promise<string> {
  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  const completion = await groq.chat.completions.create({
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user" as const, content: prompt },
    ],
    model: PROVIDERS.groq.model,
    temperature: 0.65,
    max_tokens: 4096,
  });
  return completion.choices[0]?.message?.content || "";
}

async function callGemini(apiKey: string, prompt: string, system?: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: PROVIDERS.gemini.model,
    ...(system ? { systemInstruction: system } : {}),
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
  return (await (await model.generateContent(prompt)).response).text();
}

function demoAnswer(prompt: string, context = ""): string {
  const lower = prompt.toLowerCase();
  const contextSummary = context ? `\n\n**بيانات APK المتاحة:**\n${context.slice(0, 3500)}` : "";
  if (/certificate|شهاد|توقيع|meta-inf/.test(lower)) {
    return `### 🔐 تحليل الشهادات\n- ملفات \`.RSA/.DSA/.EC\` تحمل شهادة التوقيع، و\`.SF/.MF\` تحفظ بيانات سلامة الملفات.\n- نزّل ملف الشهادة ثم نفّذ: \`keytool -printcert -file CERT.RSA\`.\n- ظهور Debug يعني أن التطبيق غير مناسب للنشر بتلك الشهادة.${contextSummary}`;
  }
  if (/permission|صلاح/.test(lower)) {
    return `### 🛡️ تحليل الصلاحيات\nراجع الصلاحيات الخطرة مثل CAMERA وRECORD_AUDIO وLOCATION، واحذف ما لا يحتاجه التطبيق. الصلاحيات وحدها لا تثبت سلوكاً ضاراً؛ راجع مواضع استخدامها في DEX/Smali أيضاً.${contextSummary}`;
  }
  if (/إعلان|ads|admob/.test(lower)) {
    return `### 📢 تحليل الإعلانات\nابحث في Manifest والموارد وDEX عن AdMob وGoogle Mobile Ads ومعرّفات الوحدات الإعلانية. لا تحذف مكوّنات عشوائياً؛ أنشئ نسخة احتياطية واختبر التطبيق بعد كل تعديل.${contextSummary}`;
  }
  return `### 🤖 تحليل محلي للتطبيق\nحللت المعلومات المفهرسة داخل APP-FORGE. راجع Manifest والصلاحيات والمكونات المصدّرة والشهادات والمكتبات الأصلية. للحصول على تحليل دلالي أعمق للكود اختر مزود API من الإعدادات.${contextSummary}`;
}

export async function callAI(
  settings: AISettings,
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  if (settings.provider === "demo") return demoAnswer(prompt, systemPrompt);
  if (!settings.apiKey.trim())
    throw new Error(
      `API Key for ${settings.provider} is missing. Use Demo AI or add a key in settings.`,
    );
  try {
    if (settings.provider === "gemini")
      return await callGemini(settings.apiKey, prompt, systemPrompt);
    if (settings.provider === "groq") return await callGroq(settings.apiKey, prompt, systemPrompt);
    return await callOpenAICompatible(settings, prompt, systemPrompt);
  } catch (error) {
    console.error(`${settings.provider} API error`, error);
    throw error instanceof Error
      ? error
      : new Error(`Failed to communicate with ${settings.provider}`);
  }
}

export function buildAPKContext(input: APKContextInput): string {
  const { info, certificates = [], categories = [], files = [] } = input;
  if (!info) return "No APK is currently loaded.";
  const component = (items: Array<{ name: string; exported?: boolean }> = []) =>
    items
      .slice(0, 40)
      .map((item) => `${item.name}${item.exported ? " [EXPORTED]" : ""}`)
      .join(", ") || "none";
  const fileLines = files
    .slice(0, 180)
    .map((f) => `- ${f.path} (${f.category}, ${f.size} bytes${f.editable ? ", editable" : ""})`);
  return [
    `APP: ${info.appName || "unknown"}`,
    `PACKAGE: ${info.packageName || "unknown"}`,
    `VERSION: ${info.versionName || "?"} (${info.versionCode || "?"})`,
    `SDK: min=${info.minSdk || "?"}, target=${info.targetSdk || "?"}`,
    `FLAGS: signed=${Boolean(info.isSigned)}, debuggable=${Boolean(info.debuggable)}, allowBackup=${Boolean(info.allowBackup)}`,
    `DEX: ${info.dexCount || 0}; ARCHITECTURES: ${info.architectures?.join(", ") || "none"}`,
    `PERMISSIONS (${info.permissions?.length || 0}):\n${info.permissions?.map((p) => `- ${p.name}${p.isDangerous ? " [DANGEROUS]" : ""}`).join("\n") || "none"}`,
    `ACTIVITIES: ${component(info.activities)}`,
    `SERVICES: ${component(info.services)}`,
    `RECEIVERS: ${component(info.receivers)}`,
    `PROVIDERS: ${component(info.providers)}`,
    `CERTIFICATES (${certificates.length}):\n${certificates.map((c) => `- ${c.path}; type=${c.type}; ${c.isDebug ? "DEBUG" : "release/unknown"}; SHA256=${c.fingerprintSHA256 || "unknown"}; subject=${c.subject || "unknown"}`).join("\n") || "none"}`,
    `CATEGORIES:\n${categories.map((c) => `- ${c.category}: ${c.count} files, ${c.totalSize} bytes`).join("\n") || "none"}`,
    `FILE INDEX (${files.length}; showing ${Math.min(files.length, 180)}):\n${fileLines.join("\n") || "none"}`,
  ]
    .join("\n\n")
    .slice(0, 24000);
}

export function isAppWideQuestion(question: string): boolean {
  return /(التطبيق|كاملاً|كامل|apk|الشهادات|شهادة|التوقيع|الصلاحيات|إزالة\s*الإعلانات|الاعلانات|الأمان|تحليل\s*شامل|app-wide|whole\s*app|entire\s*app|certificate|signature|permissions|security|admob)/i.test(
    question,
  );
}

export async function askAboutAPK(
  settings: AISettings,
  question: string,
  apkContext: string,
): Promise<string> {
  const system = `You are APP-FORGE AI, an expert Android APK analyst. Answer in Arabic while retaining English technical terms. Distinguish observed facts from suggestions. Never claim that a permission alone proves malicious behavior.\n\nFULL APK CONTEXT:\n${apkContext}`;
  return callAI(settings, question, system);
}

function extractJsonObject(text: string): string | null {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = unfenced.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const char = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return unfenced.slice(start, i + 1);
  }
  return null;
}

export async function getCodeAction(
  settings: AISettings,
  code: string,
  instruction: string,
  apkContext?: string,
): Promise<{ explanation: string; modifiedCode: string }> {
  const system = `You are an expert Android APK code editor. Return one JSON object with string fields explanation and modifiedCode. Do not use markdown fences.${apkContext ? `\nAPK CONTEXT:\n${apkContext}` : ""}`;
  const prompt = `Instruction: ${instruction}\n\nFILE CONTENT:\n${code.slice(0, 16000)}\n\nReturn valid JSON only.`;
  const result = await callAI(settings, prompt, system);
  const candidate = extractJsonObject(result);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed.modifiedCode === "string") {
        return {
          explanation: String(parsed.explanation || "تم إعداد التعديل."),
          modifiedCode: parsed.modifiedCode,
        };
      }
    } catch (error) {
      console.warn("Could not parse AI JSON", error);
    }
  }
  return {
    explanation: `${result.slice(0, 2500)}\n\nملاحظة: لم يُرجع المزود تعديلاً بصيغة JSON صالحة، لذلك لم يتغير الملف.`,
    modifiedCode: code,
  };
}

// ---------------------------------------------------------------------------
// Phase 4: provider management + full-project analysis
// ---------------------------------------------------------------------------

export interface AITestResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  message: string;
}

/** Ping the selected provider with a tiny prompt to verify the key works. */
export async function testAIConnection(settings: AISettings): Promise<AITestResult> {
  const start = Date.now();
  const model = PROVIDERS[settings.provider].model;
  if (settings.provider === "demo") {
    return {
      ok: true,
      latencyMs: 0,
      model,
      message: "وضع Demo يعمل محليًا دون مفتاح ولا يرسل بياناتك لأي جهة.",
    };
  }
  try {
    const reply = await callAI(
      settings,
      "Reply with exactly: OK",
      "You are a connectivity test. Reply with exactly: OK",
    );
    return { ok: true, latencyMs: Date.now() - start, model, message: reply.slice(0, 120) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      model,
      message: err instanceof Error ? err.message : "فشل الاتصال بالمزوّد",
    };
  }
}

/** Providers grouped into free / paid for the settings UI. */
export function providersByTier(): { free: ProviderInfo[]; paid: ProviderInfo[] } {
  const free = Object.values(PROVIDERS).filter((p) => p.free && p.id !== "demo");
  const paid = Object.values(PROVIDERS).filter((p) => !p.free);
  return { free, paid };
}

export interface ProjectFileDump {
  path: string;
  content: string;
}

// Local (demo) analysis that scans decompiled files for known Android patterns.
// Gives real value without any API key, and keeps all data on-device.
function demoProjectAnswer(files: ProjectFileDump[], question: string): string {
  const patterns: Array<{ label: string; icon: string; re: RegExp }> = [
    { label: "الإعلانات (AdMob/Unity/AppLovin)", icon: "📢", re: /com\/google\/android\/gms\/ads|AdView|InterstitialAd|RewardedAd|AdMob|admob|com\.mopub|com\.unity3d\.ads|com\.applovin/i },
    { label: "الشراء/الترخيص (Billing/License)", icon: "👑", re: /BillingClient|isPremium|isPurchased|isPro|checkLicense|isLicensed|LICENSED|NOT_LICENSED|inappbilling|licensecheck/i },
    { label: "فحص التحديثات", icon: "🚫", re: /checkForUpdate|forceUpdate|checkUpdate|latestVersion|isUpdateAvailable|updateUrl|appUpdate|update\.json/i },
    { label: "تحقق الجذر (Root)", icon: "🛡️", re: /isRooted|checkRoot|isDeviceRooted|detectRoot|RootBeer|test-keys|magisk|frida|com\.topjohnwu/i },
    { label: "تحقق التوقيع", icon: "✍️", re: /checkSignature|verifySignature|isSignatureValid|checkSign|getPackageInfo|GET_SIGNATURES/i },
  ];

  const hits: Array<{ icon: string; label: string; paths: string[] }> = [];
  for (const p of patterns) {
    const matched = files.filter((f) => p.re.test(f.content)).map((f) => f.path);
    if (matched.length > 0) hits.push({ icon: p.icon, label: p.label, paths: matched.slice(0, 10) });
  }

  const lines: string[] = [];
  lines.push(`### 🤖 تحليل محلي شامل (بدون مفتاح API)`);
  lines.push(`فحصت **${files.length}** ملفًا نصيًا مفكوكًا داخل مشروعك.\n`);
  if (hits.length === 0) {
    lines.push("لم أجد أنماطًا شائعة (إعلانات/شراء/تحديثات/جذر/توقيع) في الملفات المفكوكة. جرّب سؤالًا محددًا أو استخدم مزوّد API لتحليل دلالي أعمق.");
  } else {
    lines.push("**ما وجدته تلقائيًا:**\n");
    for (const h of hits) {
      lines.push(`${h.icon} **${h.label}** — ${h.paths.length} موضع:`);
      for (const path of h.paths) lines.push(`   - \`${path}\``);
      lines.push("");
    }
  }
  lines.push(`\n💡 سؤالك: "${question.slice(0, 200)}"`);
  lines.push("للحصول على تفسير دلالي أعمق وتعديلات تلقائية، اختر مزوّد AI من الإعدادات (AI Settings).");
  return lines.join("\n");
}

/**
 * Feed the whole decompiled project (smali + manifest + resources) to the AI
 * for a comprehensive analysis. Content is budgeted so it works with any
 * provider's context window.
 */
export async function analyzeProject(
  settings: AISettings,
  files: ProjectFileDump[],
  question: string,
): Promise<string> {
  if (settings.provider === "demo") return demoProjectAnswer(files, question);

  const budget = 60000;
  let used = 0;
  const chunks: string[] = [];
  for (const f of files) {
    if (used >= budget) break;
    const header = `\n===== ${f.path} =====\n`;
    const remaining = budget - used - header.length;
    if (remaining <= 0) break;
    let body = f.content;
    if (body.length > remaining) body = body.slice(0, remaining);
    chunks.push(header + body);
    used += header.length + body.length;
  }

  const system = `You are APP-FORGE AI, an expert Android APK reverse-engineering assistant. The user decompiled an APK and gives you its smali, AndroidManifest.xml and resources. Answer in Arabic while keeping English technical terms (class names, method names, paths). Be precise: cite file paths and method names when you reference them. Clearly separate observed facts from suggestions. Never claim a permission alone proves malicious behavior.`;

  const prompt = `DECOMPILED PROJECT FILES:\n${chunks.join("\n")}\n\nQUESTION: ${question}`;
  return callAI(settings, prompt, system);
}
