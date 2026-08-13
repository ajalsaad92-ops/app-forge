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
}

/**
 * Basic Binary XML to Text detector/parser
 * In a real scenario, this would use an AXML parser.
 * Here we provide a readable representation or hex fallback.
 */
function parseBinaryContent(path: string, buffer: Uint8Array): string {
  if (path === "AndroidManifest.xml" || path.endsWith(".xml")) {
    // Check if it's actually binary (AXML starts with 0x03 0x00 0x08 0x00)
    if (buffer[0] === 0x03 && buffer[1] === 0x00) {
      return `[Binary Android XML File]\nPath: ${path}\nSize: ${buffer.length} bytes\n\nThis is a compiled Android Binary XML. A full AXML decompiler would be needed to view the original source.`;
    }
  }
  
  if (path.endsWith(".dex")) {
    return `[Dalvik Executable File]\nPath: ${path}\nSize: ${buffer.length} bytes\n\nThis is a compiled Android DEX file containing bytecode.`;
  }

  if (path.endsWith(".so")) {
    return `[Native Shared Library]\nPath: ${path}\nSize: ${buffer.length} bytes\n\nThis is a compiled ELF binary for native code.`;
  }

  if (path.endsWith(".arsc")) {
    return `[Resources Table]\nPath: ${path}\nSize: ${buffer.length} bytes\n\nThis is the compiled resources table.`;
  }

  // Hex viewer fallback for generic binary
  const hex = Array.from(buffer.slice(0, 512))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  
  return `[Binary File: Cannot render in text mode]\nPath: ${path}\nSize: ${buffer.length} bytes\n\nHex dump (first 512 bytes):\n${hex}${buffer.length > 512 ? '...' : ''}`;
}

export class APKProcessor {
  private zip: JSZip | null = null;
  private files: Map<string, APKFile> = new Map();

  async loadAPK(file: File): Promise<string[]> {
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
    
    const loadPromises = entries.map((name) => 
      limit(async () => {
        const entry = this.zip!.files[name];
        if (!entry || entry.dir) return;

        fileNames.push(name);
        
        const isKnownText = name.endsWith(".smali") || 
                            name.endsWith(".json") || 
                            name.endsWith(".txt") ||
                            name.endsWith(".yml") ||
                            name.endsWith(".properties");
        
        // XML is tricky because in APKs it's usually binary
        const isXml = name.endsWith(".xml");

        const category = getCategory(name);

        try {
          if (isKnownText) {
            const content = await entry.async("string");
            this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "text", category });
          } else {
            const content = await entry.async("uint8array");
            
            // Check if we should try to "textify" it for the editor
            if (isXml || name.endsWith(".dex") || name.endsWith(".so") || name.endsWith(".arsc")) {
              const textified = parseBinaryContent(name, content);
              this.files.set(name, { 
                name: name.split('/').pop() || name, 
                path: name, 
                content: textified, 
                type: "text", // We set it as text so Monaco can show the hex/meta
                category 
              });
            } else {
              this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "binary", category });
            }
          }
        } catch (err) {
          console.error(`Failed to load entry ${name}:`, err);
        }
      })
    );

    await Promise.all(loadPromises);
    return fileNames;
  }

  getFileContent(path: string): APKFile | undefined {
    return this.files.get(path);
  }

  updateFileContent(path: string, content: string | Uint8Array) {
    const file = this.files.get(path);
    if (file) {
      file.content = content;
      this.files.set(path, file);
      if (this.zip) {
        this.zip.file(path, content);
      }
    }
  }

  deleteFile(path: string) {
    this.files.delete(path);
    if (this.zip) {
      this.zip.remove(path);
    }
  }

  renameFile(oldPath: string, newPath: string) {
    const file = this.files.get(oldPath);
    if (file && this.zip) {
      this.zip.file(newPath, file.content);
      this.zip.remove(oldPath);
      this.files.delete(oldPath);
      this.files.set(newPath, { 
        ...file, 
        name: newPath.split('/').pop() || newPath, 
        path: newPath 
      });
    }
  }

  async rebuildAPK(): Promise<Blob> {
    if (!this.zip) throw new Error("No APK loaded");
    return await this.zip.generateAsync({ 
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
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
