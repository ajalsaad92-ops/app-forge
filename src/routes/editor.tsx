import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileCode, FileJson, Folder, Upload, Hammer, Package, 
  File as FileIcon, Loader2, ChevronRight, ChevronDown, 
  Search, Save, X, Trash2, Edit2, Download,
  Shield, Code, Settings, Image as ImageIcon, Cpu, Layers
} from "lucide-react";
import { apkProcessor, type APKCategory } from "@/lib/apk-processor";
import { toast } from "sonner";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/editor")({
  component: APKEditor,
});

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  category?: APKCategory | undefined;
  children?: FileNode[] | undefined;
}

function APKEditor() {
  const [isUploading, setIsUploading] = React.useState(false);
  const [isBuilding, setIsBuilding] = React.useState(false);
  const [currentFilePath, setCurrentFilePath] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState("");
  const [fileTree, setFileTree] = React.useState<FileNode[]>([]);
  const [logs, setLogs] = React.useState<string[]>(["[INFO] Ready to upload APK"]);
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState("");
  const [openFiles, setOpenFiles] = React.useState<string[]>([]);
  const [activeCategory, setActiveCategory] = React.useState<APKCategory | 'all'>('all');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const buildFileTree = (filePaths: string[]): FileNode[] => {
    const root: FileNode[] = [];
    filePaths.forEach(path => {
      const parts = path.split('/');
      let currentLevel: FileNode[] = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLastPart = index === parts.length - 1;
        let node: FileNode | undefined = currentLevel.find(n => n.name === part);

        if (!node) {
          const category = apkProcessor.getFileContent(currentPath)?.category;
          node = {
            name: part,
            path: currentPath,
            type: isLastPart ? 'file' : 'directory',
            category: isLastPart ? category : undefined,
            children: isLastPart ? undefined : []
          };
          currentLevel.push(node);
        }
        
        if (node && node.type === 'directory' && node.children) {
          currentLevel = node.children;
        }
      });
    });

    // Sort: directories first, then alphabetically
    const sortTree = (nodes: FileNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach(node => {
        if (node.children) sortTree(node.children);
      });
    };
    sortTree(root);
    return root;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    addLog(`[INFO] Reading ${file.name}...`);
    try {
      const names = await apkProcessor.loadAPK(file);
      setFileTree(buildFileTree(names));
      addLog(`[SUCCESS] Loaded ${names.length} files from APK`);
      toast.success("APK loaded successfully");
    } catch (err) {
      console.error(err);
      addLog(`[ERROR] Failed to load APK: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("Failed to load APK");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (path: string) => {
    const file = apkProcessor.getFileContent(path);
    if (!file) return;

    setCurrentFilePath(path);
    if (!openFiles.includes(path)) {
      setOpenFiles(prev => [...prev, path]);
    }

    if (file.type === "text") {
      setFileContent(file.content as string);
    } else {
      setFileContent(`[Binary Content: ${(file.content as Uint8Array).length} bytes]`);
    }
  };

  const closeFile = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const newOpenFiles = openFiles.filter(f => f !== path);
    setOpenFiles(newOpenFiles);
    if (currentFilePath === path) {
      const nextFile: string | null = newOpenFiles.length > 0 ? (newOpenFiles[newOpenFiles.length - 1] ?? null) : null;
      setCurrentFilePath(nextFile);
    }
  };

  const handleContentChange = (content: string) => {
    setFileContent(content);
    if (currentFilePath) {
      apkProcessor.updateFileContent(currentFilePath, content);
    }
  };

  const handleBuild = async () => {
    setIsBuilding(true);
    addLog("[BUILD] Starting build process...");
    try {
      const blob = await apkProcessor.rebuildAPK();
      addLog("[BUILD] APK generated successfully");
      addLog("[SUCCESS] Build finished");
      toast.success("Build complete!");
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modified_app.apk";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      addLog(`[ERROR] Build failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("Build failed");
    } finally {
      setIsBuilding(false);
    }
  };

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  const renderFileTree = (nodes: FileNode[]) => {
    return nodes
      .filter(node => {
        const matchesSearch = node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = activeCategory === 'all' || 
          (node.type === 'file' && node.category === activeCategory) ||
          (node.type === 'directory' && node.children?.some(c => c.category === activeCategory || c.type === 'directory'));
        
        return (matchesSearch && matchesCategory) || (node.children && node.children.length > 0 && matchesCategory);
      })
      .map(node => {
        const isExpanded = expandedFolders.has(node.path);
        const isSelected = currentFilePath === node.path;

        if (node.type === 'directory') {
          return (
            <div key={node.path}>
              <button
                onClick={() => toggleFolder(node.path)}
                className="flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-accent/50 rounded-sm"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Folder className="h-4 w-4 text-blue-400" />
                <span className="truncate">{node.name}</span>
              </button>
              {isExpanded && node.children && (
                <div className="ml-4 border-l pl-2">
                  {renderFileTree(node.children)}
                </div>
              )}
            </div>
          );
        }

        return (
          <DropdownMenu key={node.path}>
            <DropdownMenuTrigger asChild>
              <button
                onClick={() => handleFileSelect(node.path)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-sm hover:bg-accent/50 rounded-sm ${isSelected ? 'bg-accent text-accent-foreground' : ''}`}
              >
                <div className="w-4" />
                {node.name.endsWith('.xml') ? <FileCode className="h-4 w-4 text-orange-400" /> : <FileIcon className="h-4 w-4" />}
                <span className="truncate">{node.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleFileSelect(node.path)}>
                <Edit2 className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      });
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <header className="flex h-14 items-center justify-between border-b px-6 shrink-0 bg-muted/40">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-1.5 rounded-lg">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">APKLab IDE</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Web Edition</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".apk,.zip"
            className="hidden"
          />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading}
            className="h-8"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Upload APK</span>
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button 
            size="sm" 
            onClick={handleBuild} 
            disabled={isBuilding || fileTree.length === 0}
            className="h-8 px-4"
          >
            {isBuilding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hammer className="mr-2 h-4 w-4" />}
            {isBuilding ? "Building..." : "Build & Sign"}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        <aside className="w-72 border-r bg-muted/20 flex flex-col shrink-0">
          <div className="p-3 space-y-3">
            <div className="flex flex-wrap gap-1 mb-2">
              <Button 
                variant={activeCategory === 'all' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('all')}
                title="All Files"
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={activeCategory === 'manifest' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('manifest')}
                title="Manifest"
              >
                <FileCode className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={activeCategory === 'code' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('code')}
                title="Code"
              >
                <Code className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={activeCategory === 'resources' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('resources')}
                title="Resources"
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={activeCategory === 'security' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('security')}
                title="Security/Certs"
              >
                <Shield className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={activeCategory === 'native' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('native')}
                title="Native Libs"
              >
                <Cpu className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={activeCategory === 'config' ? 'default' : 'ghost'} 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => setActiveCategory('config')}
                title="Settings/Config"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-background/50"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-2 py-1">
              {fileTree.length > 0 ? renderFileTree(fileTree) : (
                <div className="py-10 text-center space-y-2 opacity-40">
                  <Folder className="h-8 w-8 mx-auto" />
                  <p className="text-[10px] uppercase font-bold tracking-tighter">No workspace loaded</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Editor Area */}
        <section className="flex-1 flex flex-col min-w-0 bg-background">
          {openFiles.length > 0 ? (
            <>
              {/* Tab Bar */}
              <div className="flex h-10 border-b bg-muted/30 overflow-x-auto no-scrollbar shrink-0">
                {openFiles.map((path) => (
                  <button
                    key={path}
                    onClick={() => handleFileSelect(path)}
                    className={`flex items-center gap-2 px-4 border-r text-xs transition-colors shrink-0 group ${
                      currentFilePath === path 
                        ? "bg-background border-t-2 border-t-primary" 
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <FileCode className={`h-3.5 w-3.5 ${path.endsWith('.xml') ? 'text-orange-400' : ''}`} />
                    <span className="max-w-[150px] truncate">{path.split('/').pop()}</span>
                    <X 
                      className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded-sm p-0.5" 
                      onClick={(e) => closeFile(e, path)}
                    />
                  </button>
                ))}
              </div>

              {/* Breadcrumbs */}
              <div className="px-4 py-1.5 border-b text-[10px] font-mono text-muted-foreground bg-muted/10 shrink-0">
                {currentFilePath?.split('/').join(' / ')}
              </div>

              <div className="flex-1 relative">
                <textarea
                  value={fileContent}
                  onChange={(e) => handleContentChange(e.target.value)}
                  disabled={currentFilePath ? apkProcessor.getFileContent(currentFilePath)?.type === "binary" : true}
                  className="absolute inset-0 w-full h-full p-6 font-mono text-sm resize-none bg-background focus:outline-none disabled:opacity-50 selection:bg-primary/20"
                  spellCheck={false}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center space-y-6 max-w-sm px-6">
                <div className="relative mx-auto w-24 h-24">
                   <Package className="h-24 w-24 opacity-5" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-primary/5 animate-pulse" />
                   </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Empty Workspace</h3>
                  <p className="text-sm text-muted-foreground">Upload an APK to start modifying application resources, manifests, and Smali code.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Select File
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Activity Bar / Panels */}
        <aside className="w-80 border-l bg-muted/20 flex flex-col shrink-0">
          <Tabs defaultValue="logs" className="flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-2 shrink-0">
              <TabsTrigger value="logs" className="text-[10px] uppercase font-bold tracking-wider px-4">Build Logs</TabsTrigger>
              <TabsTrigger value="info" className="text-[10px] uppercase font-bold tracking-wider px-4">Properties</TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs" className="flex-1 min-h-0 m-0 p-4">
              <div className="font-mono text-[11px] space-y-1.5 bg-black/95 text-green-500/90 p-4 rounded-lg h-full overflow-auto shadow-inner border border-white/5">
                {logs.map((log, i) => (
                  <p key={i} className={
                    log.includes("[ERROR]") ? "text-red-400" : 
                    log.includes("[SUCCESS]") ? "text-green-400 font-bold" :
                    log.includes("[BUILD]") ? "text-sky-400" :
                    log.includes("[SIGN]") ? "text-amber-400" : ""
                  }>
                    {log}
                  </p>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="info" className="flex-1 m-0 p-4 space-y-4">
              <Card className="bg-background/40 border-dashed">
                <CardHeader className="p-4">
                  <CardTitle className="text-xs font-bold uppercase tracking-tight opacity-70">Extraction Metadata</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-[11px] space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-muted-foreground">Total Files</span>
                    <span className="font-mono bg-primary/10 px-2 py-0.5 rounded text-primary">{fileTree.length > 0 ? 'Extracted' : '0'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Modified</span>
                    <span className="font-mono text-amber-500">0 files</span>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-primary/5 rounded-lg p-4 border border-primary/10 space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Quick Actions</h4>
                <div className="grid grid-cols-1 gap-2">
                   <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-full justify-start h-8 text-xs" 
                    disabled={!fileTree.length || isBuilding}
                    onClick={async () => {
                      try {
                        addLog("[INFO] Exporting source as ZIP...");
                        const blob = await apkProcessor.rebuildAPK();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "apk_source_export.zip";
                        a.click();
                        URL.revokeObjectURL(url);
                        addLog("[SUCCESS] Source exported successfully");
                        toast.success("Source exported as ZIP");
                      } catch (err) {
                        addLog(`[ERROR] Export failed: ${err instanceof Error ? err.message : String(err)}`);
                        toast.error("Export failed");
                      }
                    }}
                   >
                     <Download className="h-3.5 w-3.5 mr-2" /> Export Source
                   </Button>
                   <Button variant="secondary" size="sm" className="w-full justify-start h-8 text-xs" disabled={!fileTree.length}>
                     <Search className="h-3.5 w-3.5 mr-2" /> Global Find
                   </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </main>
      
      {/* Footer / Status Bar */}
      <footer className="h-6 border-t bg-muted/50 px-3 flex items-center justify-between text-[10px] font-medium shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-green-500">
             <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
             <span>Local Engine Active</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <span className="text-muted-foreground">UTF-8</span>
        </div>
        <div className="text-muted-foreground opacity-50">
          Powered by JSZip & Lovable
        </div>
      </footer>
    </div>
  );
}