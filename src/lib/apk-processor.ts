import JSZip from "jszip";
import pLimit from "p-limit";

export type APKCategory = 'manifest' | 'code' | 'resources' | 'native' | 'config' | 'security' | 'other';

export interface APKFile {
  name: string;
  path: string;
  content: string | Uint8Array;
  type: "text" | "binary";
  category: APKCategory;
}

export class APKProcessor {
  private zip: JSZip | null = null;
  private files: Map<string, APKFile> = new Map();

  async loadAPK(file: File): Promise<string[]> {
    this.zip = await JSZip.loadAsync(file);
    this.files.clear();
    const fileNames: string[] = [];

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
    for (const name of entries) {
      const entry = this.zip.files[name];
      if (!entry || entry.dir) continue;

      fileNames.push(name);
      
      const isText = name.endsWith(".xml") || 
                     name.endsWith(".smali") || 
                     name.endsWith(".json") || 
                     name.endsWith(".txt") ||
                     name.endsWith(".yml") ||
                     name.endsWith(".properties");

      const category = getCategory(name);

      if (isText) {
        const content = await entry.async("string");
        this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "text", category });
      } else {
        const content = await entry.async("uint8array");
        this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "binary", category });
      }
    }

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

  getManifest(): string | null {
    const manifest = this.files.get("AndroidManifest.xml");
    return manifest && manifest.type === "text" ? (manifest.content as string) : null;
  }
}

export const apkProcessor = new APKProcessor();

export async function exportToZip(files: any[]): Promise<Blob> {
  const zip = new JSZip();
  
  const addFilesToZip = (items: any[], currentPath = "") => {
    items.forEach(item => {
      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      if (item.type === 'file') {
        // Handle binary vs text
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

