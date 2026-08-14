import JSZip from "jszip";
import pLimit from "p-limit";

export type APKCategory = 'manifest' | 'code' | 'resources' | 'native' | 'config' | 'security' | 'other';

export interface APKFile {
  name: string;
  path: string;
  content: string | Uint8Array;
  type: "text" | "binary";
  category: APKCategory;
  mimeType?: string;
  size: number;
  editable?: boolean;
}

export interface APKInfo {
  packageName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  appName: string;
  debuggable: boolean;
  dexCount: number;
  hasNativeLibs: boolean;
  architectures: string[];
  activities: { name: string }[];
  services: { name: string }[];
  receivers: { name: string }[];
  providers: { name: string }[];
  permissions: APKPermission[];
}

export interface APKPermission {
  name: string;
  isDangerous: boolean;
}

export interface CertificateInfo {
  path: string;
  fileName: string;
  type: string;
  isDebug: boolean;
  size: number;
  issuer?: string;
  subject?: string;
  fingerprintSHA256?: string;
}

export interface CategoryStats {
  category: APKCategory;
  count: number;
  totalSize: number;
}

export const CATEGORY_META: Record<APKCategory | "all", { label: string; labelAr: string; icon: string; description: string }> = {
  all: { label: "All Files", labelAr: "كل الملفات", icon: "📦", description: "جميع ملفات التطبيق" },
  manifest: { label: "Manifest", labelAr: "البيان", icon: "📜", description: "ملفات التعريف والصلاحيات" },
  code: { label: "Code", labelAr: "الكود", icon: "💻", description: "ملفات DEX و Smali" },
  resources: { label: "Resources", labelAr: "الموارد", icon: "🎨", description: "الصور والواجهات والقيم" },
  native: { label: "Native Libs", labelAr: "المكتبات", icon: "⚙️", description: "مكتبات .so للنظام" },
  config: { label: "Config", labelAr: "الإعدادات", icon: "🛠️", description: "ملفات JSON و properties" },
  security: { label: "Security", labelAr: "الأمان", icon: "🛡️", description: "الشهادات والتواقيع" },
  other: { label: "Other", labelAr: "أخرى", icon: "📁", description: "ملفات متنوعة" },
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function getFileLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "xml": return "xml";
    case "json": return "json";
    case "java": return "java";
    case "kt": return "kotlin";
    case "smali": return "smali";
    case "js": return "javascript";
    case "ts": return "typescript";
    case "tsx": return "typescript";
    case "txt": return "plaintext";
    case "yml":
    case "yaml": return "yaml";
    case "properties": return "ini";
    default: return "plaintext";
  }
}

function parseBinaryContent(path: string, buffer: Uint8Array): string {
  if (path === "AndroidManifest.xml" || path.endsWith(".xml")) {
    if (buffer[0] === 0x03 && buffer[1] === 0x00) {
      return `[Binary Android XML File]\nPath: ${path}\nSize: ${buffer.length} bytes\n\nThis is a compiled Android Binary XML.`;
    }
  }
  if (path.endsWith(".dex")) return `[Dalvik Executable File]\nSize: ${buffer.length} bytes`;
  if (path.endsWith(".so")) return `[Native Shared Library]\nSize: ${buffer.length} bytes`;
  if (path.endsWith(".arsc")) return `[Resources Table]\nSize: ${buffer.length} bytes`;

  const hex = Array.from(buffer.slice(0, 512))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  return `[Binary File]\nSize: ${buffer.length} bytes\n\nHex dump:\n${hex}`;
}

export interface LoadAPKResult {
  info: APKInfo;
  files: string[];
  certificates: CertificateInfo[];
  stats: CategoryStats[];
}

export class APKProcessor {
  private zip: JSZip | null = null;
  private files: Map<string, APKFile> = new Map();

  async loadAPK(file: File): Promise<LoadAPKResult> {
    this.zip = await JSZip.loadAsync(file);
    this.files.clear();
    const fileNames: string[] = [];
    const limit = pLimit(5); 

    const getCategory = (path: string): APKCategory => {
      if (path === "AndroidManifest.xml") return 'manifest';
      if (path.startsWith("smali") || path.endsWith(".dex") || path.startsWith("kotlin/")) return 'code';
      if (path.startsWith("res/") || path.startsWith("assets/")) return 'resources';
      if (path.startsWith("lib/")) return 'native';
      if (path.endsWith(".json") || path.endsWith(".properties") || path.endsWith(".yml") || path.endsWith(".xml")) return 'config';
      if (path.startsWith("META-INF/")) return 'security';
      return 'other';
    };

    const entries = Object.keys(this.zip.files);
    
    await Promise.all(entries.map((name) => 
      limit(async () => {
        const entry = this.zip!.files[name];
        if (!entry || entry.dir) return;

        fileNames.push(name);
        const isKnownText = name.endsWith(".smali") || name.endsWith(".json") || name.endsWith(".txt") || name.endsWith(".yml") || name.endsWith(".properties");
        const category = getCategory(name);
        const uint8 = await entry.async("uint8array");
        const size = uint8.length;

        if (isKnownText) {
          const content = await entry.async("string");
          this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "text", category, size, editable: true });
        } else if (name.endsWith(".xml") || name.endsWith(".dex") || name.endsWith(".so") || name.endsWith(".arsc")) {
          const textified = parseBinaryContent(name, uint8);
          this.files.set(name, { name: name.split('/').pop() || name, path: name, content: textified, type: "text", category, size, editable: false });
        } else {
          this.files.set(name, { name: name.split('/').pop() || name, path: name, content: uint8, type: "binary", category, size, editable: false });
        }
      })
    ));

    const stats: CategoryStats[] = (['manifest', 'code', 'resources', 'native', 'config', 'security', 'other'] as APKCategory[]).map(cat => {
      const catFiles = Array.from(this.files.values()).filter(f => f.category === cat);
      return {
        category: cat,
        count: catFiles.length,
        totalSize: catFiles.reduce((acc, f) => acc + f.size, 0)
      };
    }).filter(s => s.count > 0);

    const info: APKInfo = {
      packageName: "com.example.app",
      versionName: "1.0.0",
      versionCode: "1",
      minSdk: "21",
      targetSdk: "33",
      appName: file.name.replace(".apk", ""),
      debuggable: false,
      dexCount: Array.from(this.files.values()).filter(f => f.path.endsWith(".dex")).length,
      hasNativeLibs: Array.from(this.files.values()).some(f => f.category === 'native'),
      architectures: [],
      activities: [],
      services: [],
      receivers: [],
      providers: [],
      permissions: []
    };

    const certs: CertificateInfo[] = Array.from(this.files.values())
      .filter(f => f.category === 'security' && (f.path.endsWith(".RSA") || f.path.endsWith(".DSA") || f.path.endsWith(".SF")))
      .map(f => ({
        path: f.path,
        fileName: f.name,
        type: f.path.split('.').pop() || "CERT",
        isDebug: f.path.includes("debug"),
        size: f.size,
        issuer: "Mock Issuer"
      }));

    return { info, files: fileNames, certificates: certs, stats };
  }

  getAllFiles(): APKFile[] {
    return Array.from(this.files.values());
  }

  getFileContent(path: string): APKFile | undefined {
    return this.files.get(path);
  }

  updateFileContent(path: string, content: string | Uint8Array) {
    const file = this.files.get(path);
    if (file) {
      file.content = content;
      file.size = content.length;
      this.files.set(path, file);
      if (this.zip) this.zip.file(path, content);
    }
  }

  async rebuildAPK(options?: { removeSignature?: boolean }): Promise<Blob> {
    if (!this.zip) throw new Error("No APK loaded");
    if (options?.removeSignature) {
      const certFiles = Array.from(this.files.values()).filter(f => f.category === 'security');
      certFiles.forEach(f => this.zip?.remove(f.path));
    }
    return await this.zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }
}

export const apkProcessor = new APKProcessor();

export async function exportToZip(files: any[]): Promise<Blob> {
  const zip = new JSZip();
  files.forEach(f => {
    if (f.type === 'file') zip.file(f.name, f.content || "");
  });
  return await zip.generateAsync({ type: "blob" });
}
