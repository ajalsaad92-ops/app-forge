import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileCode, FileJson, Folder, Upload, Download, Hammer, Package } from "lucide-react";

export const Route = createFileRoute("/editor")({
  component: APKEditor,
});

function APKEditor() {
  const [isUploading, setIsUploading] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");

  const simulatedFiles = [
    { name: "AndroidManifest.xml", icon: <FileCode className="h-4 w-4" /> },
    { name: "res/values/strings.xml", icon: <FileCode className="h-4 w-4" /> },
    { name: "assets/config.json", icon: <FileJson className="h-4 w-4" /> },
    { name: "smali/com/app/MainActivity.smali", icon: <FileCode className="h-4 w-4" /> },
  ];

  const handleUpload = () => {
    setIsUploading(true);
    setTimeout(() => setIsUploading(false), 2000);
  };

  const handleBuild = () => {
    setIsBuilding(true);
    setTimeout(() => setIsBuilding(false), 3000);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">APKLab Web Editor</h1>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={handleUpload} disabled={isUploading}>
            <Upload className="mr-2 h-4 w-4" />
            {isUploading ? "Uploading..." : "Upload APK"}
          </Button>
          <Button size="sm" onClick={handleBuild} disabled={isBuilding}>
            <Hammer className="mr-2 h-4 w-4" />
            {isBuilding ? "Rebuilding..." : "Build & Sign"}
          </Button>
          <Button size="sm" variant="secondary">
            <Download className="mr-2 h-4 w-4" />
            Download APK
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar - File Explorer */}
        <aside className="w-64 border-r bg-muted/30">
          <div className="p-4 border-b">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Files
            </h2>
          </div>
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {simulatedFiles.map((file) => (
                <button
                  key={file.name}
                  onClick={() => {
                    setCurrentFile(file.name);
                    setFileContent(`<!-- Content for ${file.name} -->\n<resources>\n  <string name="app_name">Modified App</string>\n</resources>`);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
                    currentFile === file.name ? "bg-accent" : ""
                  }`}
                >
                  {file.icon}
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Editor Area */}
        <section className="flex-1 flex flex-col min-w-0">
          {currentFile ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/10 text-xs font-medium text-muted-foreground">
                <FileCode className="h-3 w-3" />
                {currentFile}
              </div>
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="flex-1 p-6 font-mono text-sm resize-none bg-background focus:outline-none"
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center space-y-4">
                <Package className="h-12 w-12 mx-auto opacity-20" />
                <p>Select a file to start editing or upload an APK</p>
              </div>
            </div>
          )}
        </section>

        {/* Info/Analysis Panel */}
        <aside className="w-80 border-l bg-muted/30">
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-12">
              <TabsTrigger value="info" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Info</TabsTrigger>
              <TabsTrigger value="logs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Build Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="p-4 space-y-4">
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm">Package Details</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Package Name</span>
                    <span className="font-mono">com.example.app</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono">1.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target SDK</span>
                    <span className="font-mono">33</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="logs" className="p-4">
              <div className="font-mono text-[10px] space-y-1 bg-black text-green-500 p-4 rounded-md h-[500px] overflow-auto">
                <p>[INFO] Initializing workspace...</p>
                {isBuilding && (
                  <>
                    <p className="text-blue-400">[BUILD] Running apktool b...</p>
                    <p>[BUILD] Compiling smali files...</p>
                    <p>[BUILD] Packaging resources...</p>
                    <p className="text-yellow-400">[SIGN] Signing APK with uber-apk-signer...</p>
                    <p className="text-green-400 font-bold">[SUCCESS] APK built successfully.</p>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
