import JSZip from "jszip";
import pLimit from "p-limit";

export { getCategoryFromPath, isEditableFile };


export type APKCategory = 
  | 'manifest' 
  | 'code' 
  | 'resources' 
  | 'native' 
  | 'config' 
  | 'security' 
  | 'assets' 
  | 'firebase'
  | 'ui_mod'
  | 'other';

export interface APKFile {
  name: string;
  path: string;
  content: string | Uint8Array;
  rawContent?: Uint8Array;
  type: "text" | "binary";
  category: APKCategory;
  size: number;
  mimeType?: string;
  isBinaryXml?: boolean;
  editable: boolean;
}

export interface APKPermission {
  name: string;
  protectionLevel?: string | null;
  description?: string | null;
  isDangerous: boolean;
  isGranted?: boolean | null;
}

export interface APKComponent {
  name: string;
  exported?: boolean | null;
  enabled?: boolean | null;
  permission?: string | null;
}

export interface APKInfo {
  packageName: string;
  versionName: string;
  versionCode: string;
  appName?: string | null;
  minSdk?: string | null;
  targetSdk?: string | null;
  compileSdk?: string | null;
  debuggable?: boolean | null;
  allowBackup?: boolean | null;
  permissions: APKPermission[];
  activities: APKComponent[];
  services: APKComponent[];
  receivers: APKComponent[];
  providers: APKComponent[];
  features: string[];
  usesSdk: string[];
  icon?: string | null;
  fileSize: number;
  fileCount: number;
  dexCount: number;
  hasNativeLibs: boolean;
  architectures: string[];
  isSigned: boolean;
}

export interface CertificateInfo {
  fileName: string;
  path: string;
  type: 'RSA' | 'DSA' | 'EC' | 'UNKNOWN';
  signatureVersion?: string | null;
  issuer?: string | null;
  subject?: string | null;
  serialNumber?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  fingerprintMD5?: string | null;
  fingerprintSHA1?: string | null;
  fingerprintSHA256?: string | null;
  size: number;
  isDebug?: boolean | null;
}

export interface CategoryStats {
  category: APKCategory;
  count: number;
  totalSize: number;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORY_META: Record<APKCategory, { label: string; labelAr: string; icon: string; color: string; description: string }> = {
  manifest: { 
    label: 'Manifest', 
    labelAr: 'البيان', 
    icon: '📱', 
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    description: 'AndroidManifest.xml & app config'
  },
  code: { 
    label: 'Code', 
    labelAr: 'الشيفرة', 
    icon: '💻', 
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    description: 'DEX, Smali, Kotlin bytecode'
  },
  resources: { 
    label: 'Resources', 
    labelAr: 'الموارد', 
    icon: '🎨', 
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    description: 'Layouts, drawables, values'
  },
  assets: { 
    label: 'Assets', 
    labelAr: 'الملفات', 
    icon: '📦', 
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    description: 'Raw assets & bundled files'
  },
  native: { 
    label: 'Native Libs', 
    labelAr: 'المكتبات الأصلية', 
    icon: '⚙️', 
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    description: 'SO libraries per architecture'
  },
  security: { 
    label: 'Certificates', 
    labelAr: 'الشهادات', 
    icon: '🔐', 
    color: 'bg-red-500/10 text-red-400 border-red-500/20',
    description: 'META-INF signatures & certs'
  },
  config: { 
    label: 'Config', 
    labelAr: 'الإعدادات', 
    icon: '📋', 
    color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    description: 'JSON, properties, XML configs'
  },
  firebase: { 
    label: 'Firebase', 
    labelAr: 'فايربيز', 
    icon: '🔥', 
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    description: 'Firebase & Google services'
  },
  ui_mod: {
    label: 'UI & Visuals',
    labelAr: 'الواجهة والصور',
    icon: '🖼️',
    color: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    description: 'App icons, images, and visual themes'
  },
  other: { 
    label: 'Other', 
    labelAr: 'أخرى', 
    icon: '📄', 
    color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    description: 'Misc files'
  },
};

const DANGEROUS_PERMISSIONS = new Set([
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_PHONE_STATE',
  'android.permission.CALL_PHONE',
  'android.permission.ANSWER_PHONE_CALLS',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.BODY_SENSORS',
  'android.permission.ACTIVITY_RECOGNITION',
]);

function extractBinaryStrings(buffer: Uint8Array): string[] {
  const strings: string[] = [];
  let current = '';
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte === undefined) continue;
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
    } else if (byte === 0 && current.length > 3) {
      // UTF-16LE heuristic: null separated ASCII
      if (current.length >= 4) strings.push(current);
      current = '';
    } else {
      if (current.length >= 4) strings.push(current);
      current = '';
    }
  }
  if (current.length >= 4) strings.push(current);
  return [...new Set(strings)];
}

function parseManifestFromStrings(strings: string[]): Partial<APKInfo> {
  const info: Partial<APKInfo> = {
    permissions: [],
    activities: [],
    services: [],
    receivers: [],
    providers: [],
    features: [],
    usesSdk: [],
  };

  // Heuristic extraction from binary XML strings
  const packageMatch = strings.find(s => s.includes('.') && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(s) && s.length < 100);
  if (packageMatch) {
    // Might be package name - but need to be careful
    const possiblePackages = strings.filter(s => 
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(s) && 
      s.split('.').length >= 2 && 
      s.length < 80 &&
      !s.includes('android') &&
      !s.includes('java') &&
      !s.includes('javax')
    );
    if (possiblePackages.length > 0) {
      // Sort by likelihood: shortest that looks like app package
      info.packageName = possiblePackages.sort((a,b) => a.length - b.length)[0] || "";
    }
  }

  // Extract permissions
  const permStrings = strings.filter(s => s.startsWith('android.permission.'));
  info.permissions = permStrings.map(name => ({
    name,
    isDangerous: DANGEROUS_PERMISSIONS.has(name),
  }));

  // Extract SDK
  const sdkStrings = strings.filter(s => /^\d+$/.test(s) && parseInt(s) >= 14 && parseInt(s) <= 35);
  if (sdkStrings.length >= 1) {
    info.minSdk = sdkStrings[0] || null;
    if (sdkStrings.length >= 2) info.targetSdk = sdkStrings[1] || null;
  }

  // Extract version
  const versionStrings = strings.filter(s => /^\d+\.\d+/.test(s) || /^v?\d+\.\d+\.\d+/.test(s));
  if (versionStrings.length > 0) {
    info.versionName = versionStrings[0] || "";
  }

  return info;
}

function parseXmlManifest(content: string): Partial<APKInfo> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    const manifest = doc.documentElement;
    
    if (!manifest || manifest.tagName === 'parsererror') return {};

    const info: Partial<APKInfo> = {
      packageName: manifest.getAttribute('package') || "",
      versionName: manifest.getAttribute('android:versionName') || manifest.getAttribute('versionName') || "",
      versionCode: manifest.getAttribute('android:versionCode') || manifest.getAttribute('versionCode') || "",
      permissions: [],
      activities: [],
      services: [],
      receivers: [],
      providers: [],
      features: [],
      usesSdk: [],
    };

    // Clean ns: attributes might be with prefix
    const getAttr = (el: Element, name: string) => 
      el.getAttribute(`android:${name}`) || el.getAttribute(name) || undefined;

    // Application attributes
    const app = doc.querySelector('application');
    if (app) {
      info.debuggable = getAttr(app, 'debuggable') === 'true';
      info.allowBackup = getAttr(app, 'allowBackup') !== 'false';
      info.appName = getAttr(app, 'label') || info.packageName || null;
      info.icon = getAttr(app, 'icon') || null;
    }

    // SDK
    const usesSdk = doc.querySelector('uses-sdk');
    if (usesSdk) {
      info.minSdk = getAttr(usesSdk, 'minSdkVersion') || null;
      info.targetSdk = getAttr(usesSdk, 'targetSdkVersion') || null;
      info.compileSdk = getAttr(usesSdk, 'compileSdkVersion') || null;
    }

    // Permissions
    doc.querySelectorAll('uses-permission').forEach(p => {
      const name = getAttr(p, 'name');
      if (name) {
        info.permissions!.push({
          name,
          isDangerous: DANGEROUS_PERMISSIONS.has(name),
        });
      }
    });

    // Features
    doc.querySelectorAll('uses-feature').forEach(f => {
      const name = getAttr(f, 'name');
      if (name) info.features!.push(name);
    });

    // Components
    const parseComp = (tag: string, list: APKComponent[]) => {
      doc.querySelectorAll(tag).forEach(el => {
        const name = getAttr(el, 'name');
        if (name) {
          list.push({
            name: name.startsWith('.') ? (info.packageName || '') + name : name,
            exported: getAttr(el, 'exported') === 'true' ? true : getAttr(el, 'exported') === 'false' ? false : null,
            enabled: getAttr(el, 'enabled') !== 'false',
            permission: getAttr(el, 'permission') || null,
          });
        }
      });
    };

    parseComp('activity', info.activities!);
    parseComp('service', info.services!);
    parseComp('receiver', info.receivers!);
    parseComp('provider', info.providers!);

    return info;
  } catch (e) {
    console.error('Failed to parse manifest XML', e);
    return {};
  }
}

function getCategoryFromPath(path: string): APKCategory {
  const lower = path.toLowerCase();
  
  if (path === "AndroidManifest.xml" || path === "AndroidManifest.xml:" ) return 'manifest';
  
  if (lower.match(/\.(png|jpg|jpeg|webp|gif|ico|svg)$/) || lower.includes('icon') || lower.includes('logo') || lower.includes('splash')) {
    return 'ui_mod';
  }
  
  if (lower.includes('firebase') || lower.includes('google-services') || lower.includes('gms') || lower.includes('measurement')) return 'firebase';
  if (lower.startsWith("meta-inf/")) return 'security';
  if (lower.startsWith("lib/") || lower.endsWith(".so")) return 'native';
  if (lower.startsWith("assets/")) return 'assets';
  if (lower.startsWith("res/") || lower.includes("/res/") || lower.endsWith(".arsc") || (lower.endsWith(".xml") && !lower.includes("manifest"))) return 'resources';
  if (lower.endsWith(".dex") || lower.startsWith("smali") || lower.startsWith("kotlin/") || lower.includes("/smali") || lower.endsWith(".class")) return 'code';
  if (lower.endsWith(".json") || lower.endsWith(".properties") || lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".txt") || lower.endsWith(".pro") || lower.endsWith(".cfg")) return 'config';
  
  return 'other';
}

function isEditableFile(path: string, category: APKCategory): boolean {
  const lower = path.toLowerCase();
  if (category === 'security') return false; // Don't allow editing certs directly
  if (lower.endsWith('.so') || lower.endsWith('.dex') || lower.endsWith('.arsc')) return false;
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.gif')) return false;
  return true;
}

function formatBinaryContent(path: string, buffer: Uint8Array): string {
  if (path === "AndroidManifest.xml" || path.endsWith(".xml")) {
    if (buffer[0] === 0x03 && buffer[1] === 0x00) {
      const strings = extractBinaryStrings(buffer);
      const heuristic = parseManifestFromStrings(strings);
      
      return `[Binary Android XML - Compiled AXML]\n`+
             `Path: ${path}\n`+
             `Size: ${buffer.length} bytes (${(buffer.length/1024).toFixed(2)} KB)\n`+
             `Detected strings: ${strings.length}\n\n`+
             `--- Heuristic Extraction ---\n`+
             `Package: ${heuristic.packageName || 'Unknown (needs decompilation)'}\n`+
             `Permissions: ${heuristic.permissions?.length || 0} found\n`+
             `${heuristic.permissions?.map(p => `  • ${p.name} ${p.isDangerous ? '⚠️ DANGEROUS' : ''}`).join('\n') || ''}\n`+
             `SDK: min=${heuristic.minSdk || '?'} target=${heuristic.targetSdk || '?'}\n`+
             `Version: ${heuristic.versionName || 'Unknown'}\n\n`+
             `--- Raw Strings (first 100) ---\n`+
             `${strings.slice(0,100).join('\n')}\n\n`+
             `[Note: Full decompilation requires apktool/java backend]\n`;
    }
    // Try decode as text
    try {
      const text = new TextDecoder().decode(buffer);
      if (text.includes('<manifest') || text.includes('<?xml')) {
        return text;
      }
    } catch {}
  }
  
  if (path.endsWith(".dex")) {
    const header = buffer.slice(0, 8);
    const dexVersion = new TextDecoder().decode(header.slice(4,8));
    return `[Dalvik Executable (DEX)]\nPath: ${path}\nSize: ${buffer.length} bytes (${(buffer.length/1024/1024).toFixed(2)} MB)\nVersion: ${dexVersion}\nMagic: ${new TextDecoder().decode(header.slice(0,4))}\n\nContains compiled Java/Kotlin bytecode.\nTo edit: decompile to Smali/Java first using jadx/apktool.\n\n--- Hex Dump (first 512b) ---\n${Array.from(buffer.slice(0,512)).map(b => b.toString(16).padStart(2,'0')).join(' ').match(/.{1,48}/g)?.join('\n') || ''}`;
  }

  if (path.endsWith(".so")) {
    const isElf = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
    const arch = path.split('/')[1] || 'unknown';
    return `[Native Shared Library - ELF: ${isElf}]\nPath: ${path}\nSize: ${buffer.length} bytes (${(buffer.length/1024).toFixed(2)} KB)\nArchitecture: ${arch}\n\nCompiled C/C++/Rust native code.\nEditing requires NDK & recompilation.\n\nHex (first 256b): ${Array.from(buffer.slice(0,256)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`;
  }

  if (path.endsWith(".arsc")) {
    return `[Compiled Resources Table]\nPath: ${path}\nSize: ${buffer.length} bytes (${(buffer.length/1024).toFixed(2)} KB)\n\nContains compiled res/values: strings, colors, layouts, etc.\nEdit requires apktool to decompile.\n\nStrings detected: ${extractBinaryStrings(buffer).slice(0,50).join(', ').slice(0,500)}...`;
  }

  if (path.startsWith("META-INF/")) {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'mf' || ext === 'sf') {
      try {
        return new TextDecoder().decode(buffer);
      } catch {
        return `[META-INF ${ext?.toUpperCase()} File]\n${extractBinaryStrings(buffer).join('\n')}`;
      }
    }
    if (ext === 'rsa' || ext === 'dsa' || ext === 'ec') {
      return `[Certificate File - ${ext?.toUpperCase()}]\nPath: ${path}\nSize: ${buffer.length} bytes\nType: PKCS#7 / X.509 Certificate\nSHA256: ${Array.from(buffer.slice(0,32)).map(b=>b.toString(16).padStart(2,'0')).join('')}\n\nThis is a binary certificate. Use Certificate Viewer panel for details.`;
    }
  }

  // Generic binary
  const hex = Array.from(buffer.slice(0, 1024)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  const strings = extractBinaryStrings(buffer).slice(0,20);
  return `[Binary File]\nPath: ${path}\nSize: ${buffer.length} bytes (${(buffer.length/1024).toFixed(2)} KB)\n\nStrings preview:\n${strings.join('\n')}\n\nHex (first 1KB):\n${hex.slice(0,600)}...`;
}

export class APKProcessor {
  private zip: JSZip | null = null;
  private files: Map<string, APKFile> = new Map();
  private apkInfo: APKInfo | null = null;
  private certificates: CertificateInfo[] = [];
  private categoryStats: CategoryStats[] = [];

  setAllFiles(files: APKFile[]) {
    this.files.clear();
    files.forEach(f => this.files.set(f.path, f));
    this.categoryStats = this.computeStats();
  }

  async parseManifest(content: string): Promise<APKInfo> {
    const partial = parseXmlManifest(content);
    const info: APKInfo = {
      packageName: partial.packageName || "unknown",
      versionName: partial.versionName || "1.0",
      versionCode: partial.versionCode || "1",
      permissions: partial.permissions || [],
      activities: partial.activities || [],
      services: partial.services || [],
      receivers: partial.receivers || [],
      providers: partial.providers || [],
      features: partial.features || [],
      usesSdk: partial.usesSdk || [],
      fileSize: 0,
      fileCount: this.files.size,
      dexCount: Array.from(this.files.keys()).filter(f => f.endsWith('.dex')).length,
      hasNativeLibs: Array.from(this.files.keys()).some(f => f.startsWith('lib/')),
      architectures: [],
      isSigned: Array.from(this.files.keys()).some(f => f.startsWith('META-INF/')),
    };
    this.apkInfo = info;
    return info;
  }


  async loadAPK(file: File): Promise<{ files: string[]; info: APKInfo; certificates: CertificateInfo[]; stats: CategoryStats[] }> {
    this.zip = await JSZip.loadAsync(file);
    this.files.clear();
    this.certificates = [];
    const fileNames: string[] = [];
    const limit = pLimit(8);

    const entries = Object.entries(this.zip.files);
    
    await Promise.all(entries.map(([name, entry]) => 
      limit(async () => {
        if (entry.dir) return;
        fileNames.push(name);
        
        const category = getCategoryFromPath(name);
        try {
          const buffer = await entry.async("uint8array");
          const size = buffer.length;
          
          // Determine if text
          const isKnownText = name.endsWith(".smali") || 
                              name.endsWith(".json") || 
                              name.endsWith(".txt") ||
                              name.endsWith(".yml") ||
                              name.endsWith(".yaml") ||
                              name.endsWith(".properties") ||
                              name.endsWith(".pro") ||
                              name.endsWith(".xml") ||
                              name.endsWith(".MF") ||
                              name.endsWith(".SF") ||
                              name.endsWith(".html") ||
                              name.endsWith(".css") ||
                              name.endsWith(".js");

          let content: string | Uint8Array;
          let type: "text" | "binary" = "binary";
          let isBinaryXml = false;

          if (isKnownText) {
            // Check if binary xml despite .xml extension
            if (name.endsWith(".xml") && buffer[0] === 0x03 && buffer[1] === 0x00) {
              isBinaryXml = true;
              content = formatBinaryContent(name, buffer);
              type = "text";
            } else {
              try {
                // Try UTF-8 decode
                const text = new TextDecoder().decode(buffer);
                // Check if mostly printable
                if (text.length > 0 && /^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(text.slice(0,1000))) {
                  content = text;
                  type = "text";
                } else {
                  content = formatBinaryContent(name, buffer);
                  type = "text";
                }
              } catch {
                content = buffer;
                type = "binary";
              }
            }
          } else {
            // binary files we still create readable representation
            if (name.endsWith(".dex") || name.endsWith(".so") || name.endsWith(".arsc") || name.startsWith("META-INF/")) {
              content = formatBinaryContent(name, buffer);
              type = "text";
            } else {
              // image or other binary - keep as binary
              const imageExts = ['.png','.jpg','.jpeg','.webp','.gif','.ico'];
              if (imageExts.some(ext => name.toLowerCase().endsWith(ext))) {
                content = buffer;
                type = "binary";
              } else {
                content = formatBinaryContent(name, buffer);
                type = "text";
              }
            }
          }

          this.files.set(name, {
            name: name.split('/').pop() || name,
            path: name,
            content,
            rawContent: buffer,
            type,
            category,
            size,
            isBinaryXml,
            editable: isEditableFile(name, category),
          });
        } catch (err) {
          console.error(`Failed to load ${name}`, err);
        }
      })
    ));

    // After loading, analyze
    this.apkInfo = await this.analyzeAPK(file);
    this.certificates = await this.extractCertificates();
    this.categoryStats = this.computeStats();

    return {
      files: fileNames,
      info: this.apkInfo,
      certificates: this.certificates,
      stats: this.categoryStats,
    };
  }

  private async analyzeAPK(originalFile: File): Promise<APKInfo> {
    const dexFiles = Array.from(this.files.values()).filter(f => f.path.endsWith('.dex'));
    const hasNative = Array.from(this.files.values()).some(f => f.category === 'native');
    const archs = [...new Set(
      Array.from(this.files.values())
        .filter(f => f.category === 'native')
        .map(f => f.path.split('/')[1] || '')
        .filter(Boolean)
    )];
    
    const isSigned = Array.from(this.files.keys()).some(k => k.startsWith('META-INF/') && (k.endsWith('.RSA') || k.endsWith('.SF')));

    let manifestInfo: Partial<APKInfo> = {};
    
    const manifestFile = this.files.get('AndroidManifest.xml');
    if (manifestFile) {
      if (typeof manifestFile.content === 'string' && manifestFile.content.includes('<manifest')) {
        manifestInfo = parseXmlManifest(manifestFile.content);
      } else if (manifestFile.rawContent) {
        const strings = extractBinaryStrings(manifestFile.rawContent);
        manifestInfo = parseManifestFromStrings(strings);
      }
    }

    return {
      packageName: manifestInfo.packageName || 'com.unknown.app',
      versionName: manifestInfo.versionName || '1.0.0',
      versionCode: manifestInfo.versionCode || '1',
      appName: manifestInfo.appName || null,
      minSdk: manifestInfo.minSdk || '21',
      targetSdk: manifestInfo.targetSdk || '34',
      compileSdk: manifestInfo.compileSdk || null,
      debuggable: manifestInfo.debuggable || false,
      allowBackup: manifestInfo.allowBackup ?? true,
      permissions: manifestInfo.permissions || [],
      activities: manifestInfo.activities || [],
      services: manifestInfo.services || [],
      receivers: manifestInfo.receivers || [],
      providers: manifestInfo.providers || [],
      features: manifestInfo.features || [],
      usesSdk: manifestInfo.usesSdk || [],
      icon: manifestInfo.icon || null,
      fileSize: originalFile.size,
      fileCount: this.files.size,
      dexCount: dexFiles.length,
      hasNativeLibs: hasNative,
      architectures: archs,
      isSigned,
    };
  }

  private async extractCertificates(): Promise<CertificateInfo[]> {
    const certs: CertificateInfo[] = [];
    for (const [path, file] of this.files) {
      if (!path.startsWith("META-INF/")) continue;
      
      const name = path.split('/').pop() || path;
      const ext = name.split('.').pop()?.toUpperCase() || 'UNKNOWN';
      
      if (['RSA','DSA','EC'].includes(ext) || name.endsWith('.RSA') || name.endsWith('.DSA')) {
        const buffer = file.rawContent || (file.content instanceof Uint8Array ? file.content : new Uint8Array());
        const type = ext as any === 'RSA' ? 'RSA' : ext as any === 'DSA' ? 'DSA' : ext === 'EC' ? 'EC' : 'UNKNOWN';
        
        // Simple fingerprint (SHA256 of file for display)
        let sha256 = '';
        try {
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as BufferSource);
          sha256 = Array.from(new Uint8Array(hashBuffer)).map(b=>b.toString(16).padStart(2,'0')).join(':').toUpperCase();
        } catch {
          sha256 = 'Unavailable (needs secure context)';
        }

        // Heuristic for debug cert
        const isDebug = file.type === 'text' && typeof file.content === 'string' ? 
          file.content.toLowerCase().includes('android debug') || path.toLowerCase().includes('debug') :
          path.toLowerCase().includes('debug');

        certs.push({
          fileName: name,
          path,
          type: type as any,
          fingerprintSHA256: sha256,
          size: file.size,
          isDebug,
          issuer: isDebug ? 'CN=Android Debug, O=Android, C=US' : 'Unknown (parse DER)',
          subject: isDebug ? 'CN=Android Debug, O=Android, C=US' : 'Unknown',
          validFrom: isDebug ? 'Debug cert' : null,
          validTo: isDebug ? 'Debug cert - 30 years' : null,
        });
      } else if (path.endsWith('.MF') || path.endsWith('.SF')) {
        certs.push({
          fileName: name,
          path,
          type: 'UNKNOWN',
          size: file.size,
          fingerprintSHA256: typeof file.content === 'string' ? file.content.slice(0,200) : null,
        });
      }
    }
    return certs;
  }

  private computeStats(): CategoryStats[] {
    const counts = new Map<APKCategory, { count: number; size: number }>();
    for (const file of this.files.values()) {
      const cur = counts.get(file.category) || { count: 0, size: 0 };
      counts.set(file.category, { count: cur.count + 1, size: cur.size + file.size });
    }
    const stats: CategoryStats[] = [];
    for (const cat of Object.keys(CATEGORY_META) as APKCategory[]) {
      const data = counts.get(cat);
      if (data) {
        stats.push({
          category: cat,
          count: data.count,
          totalSize: data.size,
          label: CATEGORY_META[cat].label,
          icon: CATEGORY_META[cat].icon,
          color: CATEGORY_META[cat].color,
        });
      }
    }
    // sort by count desc
    return stats.sort((a,b) => b.count - a.count);
  }

  getFileContent(path: string): APKFile | undefined {
    return this.files.get(path);
  }

  getAllFiles(): APKFile[] {
    return Array.from(this.files.values());
  }

  getInfo(): APKInfo | null { return this.apkInfo; }
  getCertificates(): CertificateInfo[] { return this.certificates; }
  getStats(): CategoryStats[] { return this.categoryStats; }

  updateFileContent(path: string, content: string | Uint8Array) {
    const file = this.files.get(path);
    if (!file) return;
    
    // Update our map
    const newSize = content instanceof Uint8Array ? content.length : new TextEncoder().encode(content as string).length;
    const updated: APKFile = {
      ...file,
      content,
      size: newSize,
      rawContent: content instanceof Uint8Array ? content : new TextEncoder().encode(content as string),
    };
    this.files.set(path, updated);

    // Update zip
    if (this.zip) {
      this.zip.file(path, content);
    }
    
    // Recompute stats
    this.categoryStats = this.computeStats();
  }

  deleteFile(path: string) {
    this.files.delete(path);
    if (this.zip) {
      this.zip.remove(path);
    }
    this.categoryStats = this.computeStats();
  }

  renameFile(oldPath: string, newPath: string) {
    const file = this.files.get(oldPath);
    if (!file || !this.zip) return;
    
    const content = file.rawContent || file.content;
    this.zip.file(newPath, content);
    this.zip.remove(oldPath);
    
    this.files.delete(oldPath);
    this.files.set(newPath, {
      ...file,
      name: newPath.split('/').pop() || newPath,
      path: newPath,
      category: getCategoryFromPath(newPath),
    });
    this.categoryStats = this.computeStats();
  }

  async rebuildAPK(options: { removeSignature?: boolean } = {}): Promise<Blob> {
    if (!this.zip) throw new Error("No APK loaded");
    
    if (options.removeSignature) {
      // Remove old signatures for re-signing
      for (const path of Array.from(Object.keys(this.zip.files))) {
        if (path.startsWith('META-INF/') && (path.endsWith('.RSA') || path.endsWith('.DSA') || path.endsWith('.EC') || path.endsWith('.SF') || path.endsWith('.MF'))) {
          this.zip.remove(path);
        }
      }
    }

    return await this.zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  updateManifestInfo(updates: Partial<APKInfo>) {
    const manifest = this.files.get('AndroidManifest.xml');
    if (!manifest || typeof manifest.content !== 'string') return;
    
    // Only works if manifest is text XML (decompiled)
    // If binary, we can't update directly but we store the pending changes
    let content = manifest.content;
    
    if (content.includes('<manifest')) {
      // Simple string replacements for version and package
      if (updates.packageName) {
        content = content.replace(/package="[^"]*"/, `package="${updates.packageName}"`);
      }
      if (updates.versionName) {
        content = content.replace(/android:versionName="[^"]*"/, `android:versionName="${updates.versionName}"`);
        content = content.replace(/versionName="[^"]*"/, `versionName="${updates.versionName}"`);
      }
      if (updates.versionCode) {
        content = content.replace(/android:versionCode="[^"]*"/, `android:versionCode="${updates.versionCode}"`);
        content = content.replace(/versionCode="[^"]*"/, `versionCode="${updates.versionCode}"`);
      }
      this.updateFileContent('AndroidManifest.xml', content);
    }
    
    // Update internal info
    if (this.apkInfo) {
      this.apkInfo = { ...this.apkInfo, ...updates };
    }
  }
}

export const apkProcessor = new APKProcessor();

export async function exportToZip(files: any[]): Promise<Blob> {
  const zip = new JSZip();
  
  const addFilesToZip = (items: any[], currentPath = "") => {
    items.forEach(item => {
      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      if (item.type === 'file') {
        zip.file(itemPath, item.content || "");
      } else {
        const children = files.filter(f => f.parentId === item.id);
        addFilesToZip(children, itemPath);
      }
    });
  };

  const rootItems = files.filter(f => f.parentId === null);
  addFilesToZip(rootItems);

  return await zip.generateAsync({ 
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

// Helpers
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getFileLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    xml: 'xml',
    json: 'json',
    smali: 'smali',
    java: 'java',
    kt: 'kotlin',
    js: 'javascript',
    ts: 'typescript',
    html: 'html',
    css: 'css',
    yml: 'yaml',
    yaml: 'yaml',
    properties: 'properties',
    pro: 'properties',
    mf: 'properties',
    sf: 'properties',
    dex: 'java',
    arsc: 'xml',
    rsa: 'text',
  };
  return map[ext] || 'plaintext';
}
