import JSZip from "jszip";

export interface APKFile {
  name: string;
  path: string;
  content: string | Uint8Array;
  type: "text" | "binary";
}

export class APKProcessor {
  private zip: JSZip | null = null;
  private files: Map<string, APKFile> = new Map();

  async loadAPK(file: File): Promise<string[]> {
    this.zip = await JSZip.loadAsync(file);
    this.files.clear();
    const fileNames: string[] = [];

    const entries = Object.keys(this.zip.files);
    for (const name of entries) {
      const entry = this.zip.files[name];
      if (!entry || entry.dir) continue;

      fileNames.push(name);
      
      // Determine if text or binary (simplified)
      const isText = name.endsWith(".xml") || 
                     name.endsWith(".smali") || 
                     name.endsWith(".json") || 
                     name.endsWith(".txt") ||
                     name.endsWith(".yml");

      if (isText) {
        const content = await entry.async("string");
        this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "text" });
      } else {
        const content = await entry.async("uint8array");
        this.files.set(name, { name: name.split('/').pop() || name, path: name, content, type: "binary" });
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
