// Typed client for the APP-FORGE Local Bridge (server/apk-bridge.mjs).
// The bridge performs decompile/rebuild/sign on the user's machine; the browser
// UI talks to it over HTTP. Default base is http://localhost:3000 (the same port
// the SetupGuide already expects). Override via localStorage "APPFORGE_BRIDGE_URL".

export interface BridgeManifest {
  packageName: string | null;
  versionName: string | null;
  versionCode: string | null;
  minSdk: string | null;
  targetSdk: string | null;
  appName: string | null;
  debuggable: boolean;
  permissions: Array<{ name: string; isDangerous: boolean }>;
  activities: Array<{ name: string; exported?: boolean }>;
  services: Array<{ name: string; exported?: boolean }>;
  receivers: Array<{ name: string; exported?: boolean }>;
  providers: Array<{ name: string; exported?: boolean }>;
}

export interface BridgeFileEntry {
  type: "file" | "folder";
  path: string;
  size?: number;
  editable?: boolean;
}

export interface BridgeUploadResult {
  id: string;
  originalName: string;
  manifest: BridgeManifest | null;
  files: BridgeFileEntry[];
}

export function getBridgeBase(): string {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("APPFORGE_BRIDGE_URL") : null;
  return (saved && saved.trim()) || "http://localhost:3000";
}

export async function bridgeHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${getBridgeBase()}/api/health`, { signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function postJSON(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${getBridgeBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Bridge request failed (${res.status})`);
  return data;
}

export async function bridgeUpload(file: File): Promise<BridgeUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${getBridgeBase()}/api/upload`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data as BridgeUploadResult;
}

export async function bridgeReadFile(path: string): Promise<string> {
  const res = await fetch(`${getBridgeBase()}/api/file?path=${encodeURIComponent(path)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Read failed (${res.status})`);
  return data.content as string;
}

export async function bridgeWriteFile(path: string, content: string): Promise<void> {
  await postJSON("/api/file", { path, content });
}

export async function bridgeBuild(): Promise<{ fileName: string }> {
  return postJSON("/api/build", {});
}

export function bridgeDownloadUrl(): string {
  return `${getBridgeBase()}/api/download`;
}
