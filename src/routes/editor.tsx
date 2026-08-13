import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileCode, FileJson, Folder, Upload, Download, Hammer, Package, File as FileIcon, Loader2 } from "lucide-react";
import { apkProcessor } from "@/lib/apk-processor";
import { toast } from "sonner";

export const Route = createFileRoute("/editor")({
  component: APKEditor,
});



function APKEditor() {
  const [isUploading, setIsUploading] = React.useState(false);
  const [isBuilding, setIsBuilding] = React.useState(false);
  const [currentFile, setCurrentFile] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState("");


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
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".apk,.zip"
            className="hidden"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isUploading ? "Reading APK..." : "Upload APK"}
          </Button>
          <Button size="sm" onClick={handleBuild} disabled={isBuilding || fileList.length === 0}>
            {isBuilding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hammer className="mr-2 h-4 w-4" />}
            {isBuilding ? "Building..." : "Build & Sign"}
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
              {fileList.map((fileName) => (
                <button
                  key={fileName}
                  onClick={() => handleFileSelect(fileName)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
                    currentFile === fileName ? "bg-accent" : ""
                  }`}
                >
                  {getFileIcon(fileName)}
                  <span className="truncate">{fileName}</span>
                </button>
              ))}
              {fileList.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No files loaded
                </div>
              )}

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
                onChange={(e) => handleContentChange(e.target.value)}
                disabled={currentFile ? apkProcessor.getFileContent(currentFile)?.type === "binary" : true}
                className="flex-1 p-6 font-mono text-sm resize-none bg-background focus:outline-none disabled:opacity-50"

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
                {logs.map((log, i) => (
                  <p key={i} className={
                    log.includes("[ERROR]") ? "text-red-500" : 
                    log.includes("[SUCCESS]") ? "text-green-400 font-bold" :
                    log.includes("[BUILD]") ? "text-blue-400" :
                    log.includes("[SIGN]") ? "text-yellow-400" : ""
                  }>
                    {log}
                  </p>
                ))}
              </div>

            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
