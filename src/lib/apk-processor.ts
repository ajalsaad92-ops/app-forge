import JSZip from "jszip";

export interface APKFile {
  name: string;
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
        this.files.set(name, { name, content, type: "text" });
      } else {
        const content = await entry.async("uint8array");
        this.files.set(name, { name, content, type: "binary" });
      }
    }

    return fileNames;
  }

  getFileContent(name: string): APKFile | undefined {
    return this.files.get(name);
  }

  updateFileContent(name: string, content: string | Uint8Array) {
    const file = this.files.get(name);
    if (file) {
      file.content = content;
      this.files.set(name, file);
      if (this.zip) {
        this.zip.file(name, content);
      }
    }
  }

  async rebuildAPK(): Promise<Blob> {
    if (!this.zip) throw new Error("No APK loaded");
    return await this.zip.generateAsync({ type: "blob" });
  }
}

export const apkProcessor = new APKProcessor();
