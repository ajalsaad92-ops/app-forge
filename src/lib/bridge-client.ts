// Typed client for the APP-FORGE Bridge (server/apk-bridge.mjs).
//
// The bridge performs decompile/rebuild/sign work. It can run in ONE of two
// modes, selectable from the UI:
//
//   * local  -> the bridge runs on the user's own machine at http://localhost:3000
//   * cloud  -> the SAME bridge is deployed on a remote server and reached via
//               a public URL (the "specific place" the user configures).
//
// Both modes speak the identical HTTP API, so the whole editor works unchanged
// once a mode is chosen. Overrides are persisted in localStorage.

export type EditMode = "local" | "cloud";

export interface BridgeHealthInfo {
  status: string;
  port?: number;
  projectLoaded: boolean;
}

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

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const MODE_KEY = "APPFORGE_MODE";
const LOCAL_URL_KEY = "APPFORGE_BRIDGE_URL";
const CLOUD_URL_KEY = "APPFORGE_CLOUD_URL";
const ONBOARDED_KEY = "APPFORGE_ONBOARDED";

const DEFAULT_LOCAL = "http://localhost:3000";

// Optional default cloud endpoint baked in at build time via .env
// (VITE_APPFORGE_CLOUD_URL). Users can still change it in Settings.
function defaultCloudUrl(): string {
  try {
    const env = import.meta.env as unknown as Record<string, string | undefined>;
    if (env && env["VITE_APPFORGE_CLOUD_URL"]) return env["VITE_APPFORGE_CLOUD_URL"];
  } catch {
    /* SSR / edge — no env */
  }
  return "";
}

// ---------------------------------------------------------------------------
// Mode + URL accessors
// ---------------------------------------------------------------------------
export function getStoredMode(): EditMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === "cloud" || m === "local") return m;
  } catch {
    /* ignore */
  }
  return "local";
}

export function setStoredMode(mode: EditMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function getLocalUrl(): string {
  try {
    const saved = localStorage.getItem(LOCAL_URL_KEY);
    return (saved && saved.trim()) || DEFAULT_LOCAL;
  } catch {
    return DEFAULT_LOCAL;
  }
}

export function setLocalUrl(url: string): void {
  try {
    localStorage.setItem(LOCAL_URL_KEY, url.trim() || DEFAULT_LOCAL);
  } catch {
    /* ignore */
  }
}

export function getCloudUrl(): string {
  try {
    const saved = localStorage.getItem(CLOUD_URL_KEY);
    return (saved && saved.trim()) || defaultCloudUrl();
  } catch {
    return defaultCloudUrl();
  }
}

export function setCloudUrl(url: string): void {
  try {
    localStorage.setItem(CLOUD_URL_KEY, url.trim());
  } catch {
    /* ignore */
  }
}

export function getBridgeBaseFor(mode: EditMode): string {
  return mode === "cloud" ? getCloudUrl() : getLocalUrl();
}

export function getBridgeBase(): string {
  return getBridgeBaseFor(getStoredMode());
}

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "true";
  } catch {
    return true;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Health / tools
// ---------------------------------------------------------------------------
export async function bridgeHealth(mode?: EditMode, base?: string): Promise<boolean> {
  return (await bridgeHealthInfo(mode, base)).status === "ok";
}

export async function bridgeHealthInfo(mode?: EditMode, base?: string): Promise<BridgeHealthInfo> {
  const resolved = base || (mode ? getBridgeBaseFor(mode) : getBridgeBase());
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${resolved}/api/health`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return { status: "error", projectLoaded: false };
    const data = await res.json().catch(() => ({ status: "ok" }));
    return {
      status: data.status || "ok",
      port: data.port,
      projectLoaded: !!data.projectLoaded,
    };
  } catch {
    return { status: "offline", projectLoaded: false };
  }
}

export async function bridgeVerifyTools(
  mode?: EditMode,
  base?: string,
): Promise<Record<string, { label: string; exists: boolean }>> {
  const resolved = base || (mode ? getBridgeBaseFor(mode) : getBridgeBase());
  try {
    const res = await fetch(`${resolved}/api/tools`);
    if (!res.ok) return {};
    return (await res.json()) as Record<string, { label: string; exists: boolean }>;
  } catch {
    return {};
  }
}

async function postJSON<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBridgeBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok)
    throw new Error((data as { error?: string }).error || `Bridge request failed (${res.status})`);
  return data as T;
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
  return postJSON<{ fileName: string }>("/api/build", {});
}

export function bridgeDownloadUrl(): string {
  return `${getBridgeBase()}/api/download`;
}

// ---------------------------------------------------------------------------
// Mods engine (ready-made patches)
// ---------------------------------------------------------------------------

export interface BridgeMod {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  category: string;
  descriptionAr: string;
}

export interface ModMatch {
  path: string;
  kind: string;
  method: string | null;
  snippet: string;
}

export async function bridgeListMods(): Promise<BridgeMod[]> {
  const res = await fetch(`${getBridgeBase()}/api/mods`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `List mods failed (${res.status})`);
  return data.mods as BridgeMod[];
}

export async function bridgeDetectMod(
  modId: string,
): Promise<{ count: number; matches: ModMatch[] }> {
  const data = await postJSON<{ count: number; matches: ModMatch[] }>("/api/mods/detect", {
    modId,
  });
  return { count: data.count, matches: data.matches };
}

export async function bridgeApplyMod(modId: string): Promise<{ changed: string[] }> {
  const data = await postJSON<{ changed: string[] }>("/api/mods/apply", { modId });
  return { changed: data.changed };
}

// ---------------------------------------------------------------------------
// Full-project dump (feeds the AI's comprehensive analysis)
// ---------------------------------------------------------------------------

export interface ProjectFileDump {
  path: string;
  content: string;
}

export async function bridgeDump(): Promise<ProjectFileDump[]> {
  const res = await fetch(`${getBridgeBase()}/api/dump`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Dump failed (${res.status})`);
  return (data.files || []) as ProjectFileDump[];
}
