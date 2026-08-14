import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { get, set } from "idb-keyval";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { 
  FileCode, 
  FolderPlus, 
  FilePlus, 
  Trash2, 
  Play, 
  MessageSquare, 
  ChevronRight, 
  ChevronDown,
  Code2,
  Send,
  Loader2,
  Terminal,
  Settings,
  Split,
  Eye,
  Key,
  Check,
  X,
  Edit2,
  Upload,
  Download,
  Search,
  Folder,
  Cpu,
  Layers,
  Lock,
  Image as ImageIcon,
  FileJson,
  FileText,
  Save,
  Database,
  Info,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Shield,
  AlertTriangle,
  Wrench,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { analyzeCode } from "@/lib/analysis.functions";
import {
  getCodeAction,
  callAI,
  auditCodebase,
  askAboutAPK,
  buildAPKContext,
  isAppWideQuestion,
  type AIProvider,
  type AISettings,
  PROVIDERS,
  PROVIDER_LINKS,
} from "@/lib/ai-service";
import {
  apkProcessor,
  exportToZip,
  type APKFile,
  type APKInfo,
  type CertificateInfo,
  type CategoryStats,
  type APKCategory,
  type APKPermission,
  CATEGORY_META,
  formatBytes,
  getFileLanguage,
} from "@/lib/apk-processor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupGuide } from "@/components/SetupGuide";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/editor")({
  component: () => (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppForgeEditor />
    </ErrorBoundary>
  ),
});

interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string | Uint8Array | undefined;
  parentId: string | null;
}

const STORAGE_KEY = "APPFORGE_FILES_V2";
const APK_META_KEY = "APPFORGE_APK_META";

function AppForgeEditor() {
  // Core Workspace State
  const [files, setFiles] = React.useState<FileSystemItem[]>([]);
  const [activeFileId, setActiveFileId] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  
  // APK Processor State
  const [apkFiles, setApkFiles] = React.useState<APKFile[]>([]);
  const [activeFilePath, setActiveFilePath] = React.useState<string>("");
  const [apkInfo, setApkInfo] = React.useState<APKInfo | null>(null);
  const [certificates, setCertificates] = React.useState<CertificateInfo[]>([]);
  const [categoryStats, setCategoryStats] = React.useState<CategoryStats[]>([]);
  const [activeCategory, setActiveCategory] = React.useState<APKCategory | "all">("all");
  const [openTabs, setOpenTabs] = React.useState<string[]>([]);

  // UI State
  const [isLoading, setIsLoading] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [leftTab, setLeftTab] = React.useState<"categories" | "files" | "certs">("categories");
  const [centerTab, setCenterTab] = React.useState<"code" | "visual" | "preview">("code");
  const [rightTab, setRightTab] = React.useState<"info" | "perms" | "ai">("info");
  const [viewMode, setViewMode] = React.useState<'editor' | 'diff'>('editor');
  const [showSettings, setShowSettings] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isFileSystemLoaded, setIsFileSystemLoaded] = React.useState(false);
  const [isBackendLoading, setIsBackendLoading] = React.useState<{[key: string]: boolean}>({});

  // AI & Chat State
  const [aiSettings, setAiSettings] = React.useState<AISettings>({
    provider: "gemini",
    apiKey: "",
  });
  const [chatMessages, setChatMessages] = React.useState<{role: "user" | "ai"; content: string}[]>([
    {
      role: "ai",
      content: "مرحباً! 👋 أنا مساعد APP-FORGE الذكي. يمكنك سؤالي عن أي ملف في الـ APK أو طلب تعديل الكود.\n\nHello! I can help you analyze and modify APK files. Upload an APK to start.",
    },
  ]);
  const [chatInput, setChatInput] = React.useState("");
  const [originalCode, setOriginalCode] = React.useState<string>("");
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);

  const [manifestEdit, setManifestEdit] = React.useState({
    packageName: "",
    versionName: "",
    versionCode: "",
  });

  // Initialization
  React.useEffect(() => {
    const init = async () => {
      const savedSettings = localStorage.getItem("APPFORGE_AI_SETTINGS");
      if (savedSettings) {
        try {
          setAiSettings(JSON.parse(savedSettings));
        } catch (e) {
          console.error("Failed to parse AI settings", e);
        }
      }

      try {
        const storedMeta = await get<{
          info: APKInfo;
          certs: CertificateInfo[];
          stats: CategoryStats[];
          files: APKFile[];
        }>(APK_META_KEY);
        
        if (storedMeta) {
          setApkInfo(storedMeta.info);
          setCertificates(storedMeta.certs);
          setCategoryStats(storedMeta.stats);
          if (storedMeta.files && storedMeta.files.length > 0) {
            setApkFiles(storedMeta.files.map(f => ({ ...f, content: f.content || `[Persisted] ${f.path}` })));
          }
        }

        const storedFiles = await get<FileSystemItem[]>(STORAGE_KEY);
        if (storedFiles && storedFiles.length > 0) {
          setFiles(storedFiles);
        }
      } catch (err) {
        console.error("Failed to load from IndexedDB", err);
      } finally {
        setIsFileSystemLoaded(true);
      }
    };
    init();
  }, []);

  // Persistence
  React.useEffect(() => {
    if (isFileSystemLoaded) {
      set(STORAGE_KEY, files).catch(err => console.error("Save failed", err));
    }
  }, [files, isFileSystemLoaded]);

  // Derived State
  const activeFile = React.useMemo(() => {
    if (activeFilePath) return apkFiles.find(f => f.path === activeFilePath);
    return null;
  }, [apkFiles, activeFilePath]);

  const filteredFiles = React.useMemo(() => {
    let list = apkFiles;
    if (activeCategory !== "all") {
      list = list.filter((f) => f.category === activeCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [apkFiles, activeCategory, searchQuery]);

  // Handlers
  const handleAPKUpload = async (file: File) => {
    if (!file.name.endsWith(".apk") && !file.name.endsWith(".zip") && !file.name.endsWith(".xapk")) {
      toast.error("الرجاء رفع ملف APK صالح");
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading(`جاري تحليل ${file.name}...`);
    try {
      const result = await apkProcessor.loadAPK(file);
      setApkFiles(apkProcessor.getAllFiles());
      setApkInfo(result.info);
      setCertificates(result.certificates);
      setCategoryStats(result.stats);
      setManifestEdit({
        packageName: result.info.packageName,
        versionName: result.info.versionName,
        versionCode: result.info.versionCode,
      });

      const manifest = result.files.find(p => p === "AndroidManifest.xml") || result.files[0] || "";
      if (manifest) {
        setActiveFilePath(manifest);
        setOpenTabs([manifest]);
      }

      await set(APK_META_KEY, {
        info: result.info,
        certs: result.certificates,
        stats: result.stats,
        files: apkProcessor.getAllFiles().map(f => ({
          ...f,
          rawContent: undefined,
          content: typeof f.content === "string" ? f.content.slice(0, 5000) : undefined,
        })),
      });

      toast.success("تم التحليل بنجاح", { id: toastId });
      setLeftTab("categories");
    } catch (err: any) {
      toast.error(`فشل التحليل: ${err.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleAPKUpload(file);
  };

  const openFile = (path: string) => {
    setActiveFilePath(path);
    if (!openTabs.includes(path)) {
      setOpenTabs(prev => [...prev, path].slice(-10));
    }
    if (path === "AndroidManifest.xml") setCenterTab("visual");
    else if (path.match(/\.(png|jpg|jpeg|webp|gif)$/i)) setCenterTab("preview");
    else setCenterTab("code");
  };

  const closeTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newTabs = openTabs.filter(p => p !== path);
    setOpenTabs(newTabs);
    if (activeFilePath === path) {
      setActiveFilePath(newTabs[newTabs.length - 1] || "");
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFilePath) return;
    const content = value || "";
    apkProcessor.updateFileContent(activeFilePath, content);
    setApkFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content } : f));
  };

  const handleSaveManifest = () => {
    toast.success("Manifest changes prepared for rebuild");
    setCenterTab("code");
  };

  const handleRebuild = async () => {
    if (apkFiles.length === 0) return;
    const toastId = toast.loading("جاري إعادة بناء APK...");
    try {
      const blob = await apkProcessor.rebuildAPK({ removeSignature: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${apkInfo?.packageName || "app"}-modded.apk`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم إعادة البناء وتنزيل APK", { id: toastId });
    } catch (err: any) {
      toast.error(`فشل البناء: ${err.message}`, { id: toastId });
    }
  };

  const runAnalysis = async () => {
    if (!activeFile || typeof activeFile.content !== 'string') return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeCode({ data: { code: activeFile.content, fileName: activeFile.name } });
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `**تحليل ${activeFile.name}:**\n${result.summary}\n\n**اقتراحات:**\n${result.suggestions.map(s => `• ${s}`).join('\n')}` 
      }]);
    } catch {
      toast.error("فشل التحليل");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMsg = chatInput.trim();
    if (!userMsg) return;

    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");
    setIsAnalyzing(true);

    try {
      const appWide = isAppWideQuestion(userMsg);
      const apkContext = buildAPKContext({
        info: apkInfo,
        certificates,
        categories: categoryStats,
        files: apkFiles,
      });

      if (appWide) {
        const answer = await askAboutAPK(aiSettings, userMsg, apkContext);
        setChatMessages(prev => [...prev, { role: "ai", content: answer }]);
      } else if (activeFile && typeof activeFile.content === "string") {
        const actionResult = await getCodeAction(aiSettings, activeFile.content, userMsg, apkContext);
        const changed = actionResult.modifiedCode !== activeFile.content;
        setPendingCode(changed ? actionResult.modifiedCode : null);
        setOriginalCode(activeFile.content);
        setChatMessages(prev => [...prev, { 
          role: "ai", 
          content: changed ? `${actionResult.explanation}\n\nراجع عرض Diff.` : actionResult.explanation 
        }]);
        if (changed) setViewMode("diff");
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "ai", content: `خطأ: ${err.message}` }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyChanges = () => {
    if (pendingCode && activeFilePath) {
      handleEditorChange(pendingCode);
      setPendingCode(null);
      setViewMode("editor");
      toast.success("تم تطبيق التغييرات");
    }
  };

  const discardChanges = () => {
    setPendingCode(null);
    setViewMode("editor");
  };

  const callBackend = async (endpoint: string, label: string) => {
    setIsBackendLoading(prev => ({ ...prev, [label]: true }));
    try {
      const response = await fetch(`http://localhost:3000/api/${endpoint}`, { method: 'POST' });
      if (response.ok) toast.success(`${label} successful`);
      else toast.error(`${label} failed`);
    } catch {
      toast.error(`Local backend connection failed`);
    } finally {
      setIsBackendLoading(prev => ({ ...prev, [label]: false }));
    }
  };

  return (
    <div 
      className="flex h-screen w-full bg-[#0a0a0f] text-slate-100 overflow-hidden dark"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <SetupGuide open={showSetup} onOpenChange={setShowSetup} />
      
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-2xl pointer-events-none">
          <Upload className="h-16 w-16 text-primary animate-bounce" />
        </div>
      )}

      {/* Sidebar LEFT */}
      <aside className="w-80 border-r border-slate-800 flex flex-col bg-[#0f0f14]">
        <Tabs value={leftTab} onValueChange={(v) => setLeftTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 m-2 h-9 bg-slate-800/50">
            <TabsTrigger value="categories"><Package className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="files"><FileCode className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="certs"><ShieldCheck className="h-4 w-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full p-2">
              <div className="space-y-2">
                {categoryStats.map(stat => (
                  <Card 
                    key={stat.category} 
                    className={`cursor-pointer transition-colors ${activeCategory === stat.category ? 'bg-primary/20 border-primary' : 'bg-slate-800/30 border-slate-800'}`}
                    onClick={() => setActiveCategory(stat.category)}
                  >
                    <CardContent className="p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{CATEGORY_META[stat.category].icon}</span>
                        <div className="text-xs">{CATEGORY_META[stat.category].labelAr}</div>
                      </div>
                      <div className="text-xs font-bold">{stat.count}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="files" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full p-2">
              <div className="space-y-1">
                {filteredFiles.slice(0, 100).map(f => (
                  <div 
                    key={f.path} 
                    onClick={() => openFile(f.path)}
                    className={`px-2 py-1 text-xs rounded cursor-pointer truncate ${activeFilePath === f.path ? 'bg-primary text-white' : 'hover:bg-slate-800 text-slate-400'}`}
                  >
                    {f.name}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="certs" className="flex-1 overflow-hidden">
             <ScrollArea className="h-full p-2">
              <div className="space-y-2">
                {certificates.map(c => (
                  <Card key={c.path} className="bg-slate-800/30 border-slate-800 p-2 text-[10px]">
                    <div className="font-bold truncate">{c.fileName}</div>
                    <div className="text-slate-400">{c.issuer}</div>
                  </Card>
                ))}
              </div>
             </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#0f1117] min-w-0">
        <header className="h-11 border-b border-slate-800 flex items-center justify-between px-3 shrink-0">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {openTabs.map(path => (
              <Badge 
                key={path} 
                variant={activeFilePath === path ? "default" : "secondary"}
                className="cursor-pointer gap-1 px-2 py-1"
                onClick={() => openFile(path)}
              >
                {path.split('/').pop()}
                <X className="h-3 w-3" onClick={(e) => closeTab(path, e)} />
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowSetup(true)}>
              <Wrench className="h-3 w-3 mr-1" /> Setup
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleRebuild}>Build</Button>
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden">
          {centerTab === "code" && activeFile ? (
            viewMode === "editor" ? (
              <Editor
                height="100%"
                theme="vs-dark"
                language={getFileLanguage(activeFile.name)}
                value={typeof activeFile.content === "string" ? activeFile.content : ""}
                onChange={handleEditorChange}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            ) : (
              <DiffEditor
                height="100%"
                theme="vs-dark"
                original={originalCode}
                modified={pendingCode || (typeof activeFile.content === "string" ? activeFile.content : "")}
                language={getFileLanguage(activeFile.name)}
              />
            )
          ) : centerTab === "preview" && activeFile ? (
            <div className="p-4 overflow-auto h-full">
               {typeof activeFile.content === "string" ? <pre className="text-xs">{activeFile.content}</pre> : "Preview not available"}
            </div>
          ) : (
             <div className="h-full flex items-center justify-center text-slate-500">Select a file</div>
          )}

          {pendingCode && viewMode === "diff" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <Button size="sm" onClick={applyChanges}><Check className="h-4 w-4 mr-1" /> Apply</Button>
              <Button size="sm" variant="secondary" onClick={discardChanges}><X className="h-4 w-4 mr-1" /> Discard</Button>
            </div>
          )}
        </div>
      </main>

      {/* Sidebar RIGHT */}
      <aside className="w-80 border-l border-slate-800 flex flex-col bg-[#0f0f14]">
        <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 m-2 h-9 bg-slate-800/50">
            <TabsTrigger value="info"><Info className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="perms"><ShieldAlert className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="ai"><MessageSquare className="h-4 w-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-hidden p-3">
             {apkInfo && (
               <div className="space-y-4 text-xs">
                 <div className="font-bold text-primary">{apkInfo.packageName}</div>
                 <div className="grid grid-cols-2 gap-2">
                   <div className="text-slate-400">Version</div><div>{apkInfo.versionName}</div>
                   <div className="text-slate-400">Min SDK</div><div>{apkInfo.minSdk}</div>
                   <div className="text-slate-400">Target SDK</div><div>{apkInfo.targetSdk}</div>
                 </div>
               </div>
             )}
          </TabsContent>

          <TabsContent value="ai" className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-3">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`p-2 rounded text-xs ${m.role === 'user' ? 'bg-primary/20 ml-4' : 'bg-slate-800 mr-4'}`}>
                    <div className="font-bold opacity-50 mb-1">{m.role === 'user' ? 'You' : 'AI'}</div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
                {isAnalyzing && <div className="text-xs animate-pulse">Thinking...</div>}
              </div>
            </ScrollArea>
            <form onSubmit={sendChatMessage} className="p-3 border-t border-slate-800 flex gap-2">
              <Input 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                placeholder="Ask AI..." 
                className="h-9 text-xs" 
              />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0"><Send className="h-4 w-4" /></Button>
            </form>
          </TabsContent>
        </Tabs>
      </aside>

      {/* Settings */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader><DialogTitle>AI Settings</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label>Provider</Label>
               <Select value={aiSettings.provider} onValueChange={(v: AIProvider) => setAiSettings({...aiSettings, provider: v})}>
                 <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                 <SelectContent className="bg-slate-800 border-slate-700">
                    {Object.values(PROVIDERS).map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                 </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <Label>API Key</Label>
               <Input 
                 type="password" 
                 value={aiSettings.apiKey} 
                 onChange={(e) => setAiSettings({...aiSettings, apiKey: e.target.value})}
                 className="bg-slate-800 border-slate-700"
               />
             </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              localStorage.setItem("APPFORGE_AI_SETTINGS", JSON.stringify(aiSettings));
              setShowSettings(false);
              toast.success("Saved");
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AppForgeEditor;
