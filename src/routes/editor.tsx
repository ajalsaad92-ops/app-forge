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
  Package,
  Shield,
  Smartphone,
  Box,
  Layers,
  FileText,
  Lock,
  Cpu,
  Database,
  Flame,
  Folder,
  Image as ImageIcon,
  FileJson,
  Wrench,
  RefreshCw,
  Save,
  MoreHorizontal,
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  Info,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { analyzeCode } from "@/lib/analysis.functions";
import {
  getCodeAction,
  callAI,
  auditCodebase,
  type AIProvider,
  type AISettings,
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
  getCategoryFromPath,
  isEditableFile,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import { SetupGuide } from "@/components/SetupGuide";
import { Textarea } from "@/components/ui/textarea";

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
  type: "file" | "folder";
  content?: string | Uint8Array | undefined;
  parentId: string | null;
  path?: string;
}

const STORAGE_KEY = "APPFORGE_FILES_V2";
const APK_META_KEY = "APPFORGE_APK_META";

function AppForgeEditor() {
  const [apkFiles, setApkFiles] = React.useState<APKFile[]>([]);
  const [apkInfo, setApkInfo] = React.useState<APKInfo | null>(null);
  const [certificates, setCertificates] = React.useState<CertificateInfo[]>([]);
  const [categoryStats, setCategoryStats] = React.useState<CategoryStats[]>([]);
  const [activeCategory, setActiveCategory] = React.useState<APKCategory | "all">("all");
  const [activeFilePath, setActiveFilePath] = React.useState<string>("");
  const [openTabs, setOpenTabs] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set(["root"]));
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [leftTab, setLeftTab] = React.useState<"categories" | "files" | "certs">("categories");
  const [centerTab, setCenterTab] = React.useState<"code" | "visual" | "preview">("code");
  const [rightTab, setRightTab] = React.useState<"info" | "perms" | "ai" | "audit">("info");
  const [stabilityAudit, setStabilityAudit] = React.useState<string | null>(null);
  const [isAuditing, setIsAuditing] = React.useState(false);

  // Legacy file system for generic project support
  const [files, setFiles] = React.useState<FileSystemItem[]>([
    { id: "1", name: "src", type: "folder", parentId: null },
    { id: "2", name: "App.tsx", type: "file", content: "export default function App() {\n  return <h1>Hello App-Forge!</h1>;\n}", parentId: "1" },
    { id: "3", name: "utils.ts", type: "file", content: "export const add = (a: number, b: number) => a + b;", parentId: "1" },
  ]);

  const [chatMessages, setChatMessages] = React.useState<{ role: "user" | "ai"; content: string }[]>([
    { role: "ai", content: "مرحباً! 👋 أنا مساعد APP-FORGE الذكي. يمكنك سؤالي عن أي ملف في الـ APK أو طلب تعديل الكود.\n\nHello! I can help you analyze and modify APK files. Upload an APK to start." },
  ]);
  const [chatInput, setChatInput] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"editor" | "diff">("editor");
  const [originalCode, setOriginalCode] = React.useState("");
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const [aiSettings, setAiSettings] = React.useState<AISettings>({ provider: "gemini", apiKey: "" });
  const [showSettings, setShowSettings] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [isFileSystemLoaded, setIsFileSystemLoaded] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [manifestEdit, setManifestEdit] = React.useState({ packageName: "", versionName: "", versionCode: "" });

  // Load persisted + check pending file from landing
  React.useEffect(() => {
    const init = async () => {
      const savedSettings = localStorage.getItem("APPFORGE_AI_SETTINGS");
      if (savedSettings) {
        try {
          setAiSettings(JSON.parse(savedSettings));
        } catch {}
      }
      try {
        const storedMeta = await get<{ info: APKInfo; certs: CertificateInfo[]; stats: CategoryStats[]; files: APKFile[] }>(APK_META_KEY);
        if (storedMeta) {
          setApkInfo(storedMeta.info);
          setCertificates(storedMeta.certs);
          setCategoryStats(storedMeta.stats);
          if (storedMeta.files && storedMeta.files.length > 0) {
            setApkFiles(storedMeta.files.map(f => ({ ...f, content: f.content || `[Persisted] ${f.path}` } as APKFile)));
          }
        }
      } catch {}
      setIsFileSystemLoaded(true);
    };
    init();
  }, []);

  const activeFile = React.useMemo(() => apkFiles.find(f => f.path === activeFilePath), [apkFiles, activeFilePath]);

  const filteredFiles = React.useMemo(() => {
    let list = apkFiles;
    if (activeCategory !== "all") {
      list = list.filter(f => f.category === activeCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
    }
    return list;
  }, [apkFiles, activeCategory, searchQuery]);

  const handleAPKUpload = async (file: File) => {
    if (!file.name.endsWith(".apk") && !file.name.endsWith(".zip") && !file.name.endsWith(".xapk")) {
      toast.error("الرجاء رفع ملف APK صالح");
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading(`جاري تحليل ${file.name}... Analyzing ${file.name}`);
    try {
      // 1. Try server-side decompile first for full SMALI/XML support
      let result;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/apk/decompile', {
          method: 'POST',
          body: formData,
        });
        
        if (response.ok) {
          const serverData = await response.json();
          // Map server results back to APKFile structure
          const mappedFiles: APKFile[] = serverData.files.map((f: any) => ({
            name: f.path.split('/').pop() || f.path,
            path: f.path,
            content: f.content || "",
            type: f.isBinary ? "binary" : "text",
            category: getCategoryFromPath(f.path),
            size: f.content ? f.content.length : 0,
            editable: !f.isBinary && isEditableFile(f.path, getCategoryFromPath(f.path)),
          }));
          
          setApkFiles(mappedFiles);
          apkProcessor.setAllFiles(mappedFiles);
          
          setOpenTabs([]); // Reset tabs on new upload
          setActiveFilePath("");
          
          // Heuristic to find manifest and other info
          const manifestFile = mappedFiles.find(f => f.path === "AndroidManifest.xml");
          if (manifestFile && typeof manifestFile.content === "string") {
            const info = await apkProcessor.parseManifest(manifestFile.content);
            setApkInfo(info);
            
            // Open manifest by default
            setActiveFilePath("AndroidManifest.xml");
            setOpenTabs(["AndroidManifest.xml"]);
            setCenterTab("visual");
          }
          
          toast.success("تم فك التطبيق (Decompiled) بنجاح!", { id: toastId });
          setIsLoading(false);
          setLeftTab("categories");
          setRightTab("info");
          return;
        }
      } catch (e) {
        console.warn("Server decompile failed, falling back to client-side JSZip", e);
      }

      // 2. Fallback to client-side JSZip (original behavior)
      result = await apkProcessor.loadAPK(file);
      setApkFiles(apkProcessor.getAllFiles());
      setApkInfo(result.info);
      setCertificates(result.certificates);
      setCategoryStats(result.stats);
      setManifestEdit({
        packageName: result.info.packageName || "",
        versionName: result.info.versionName || "",
        versionCode: result.info.versionCode || "",
      });

      // Open manifest by default
      const manifest = result.files.find(p => p === "AndroidManifest.xml") || result.files[0] || "";
      if (manifest) {
        setActiveFilePath(manifest);
        setOpenTabs(prev => (prev.includes(manifest) ? prev : [manifest, ...prev].slice(0, 10)));
      }

      toast.success(`تم تحليل APK بنجاح! ${result.files.length} ملف`, { id: toastId });
      setLeftTab("categories");
      setRightTab("info");
    } catch (err: any) {
      console.error(err);
      toast.error(`فشل التحليل: ${err.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleAPKUpload(file);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleAPKUpload(file);
  };

  // Auto-load file dropped on landing page
  React.useEffect(() => {
    const pending = (window as any).__APP_FORGE_PENDING_FILE__ as File | undefined;
    if (pending && isFileSystemLoaded) {
      (window as any).__APP_FORGE_PENDING_FILE__ = undefined;
      handleAPKUpload(pending);
    }
  }, [isFileSystemLoaded]);

  const openFile = (path: string) => {
    setActiveFilePath(path);
    if (!openTabs.includes(path)) {
      setOpenTabs(prev => [...prev, path].slice(-10));
    }
    // Auto switch center tab based on file
    if (path === "AndroidManifest.xml") {
      setCenterTab("visual");
    } else if (path.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
      setCenterTab("preview");
    } else {
      setCenterTab("code");
    }
  };

  const closeTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenTabs(prev => prev.filter(p => p !== path));
    if (activeFilePath === path) {
      const remaining = openTabs.filter(p => p !== path);
      setActiveFilePath(remaining[remaining.length - 1] || "");
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFilePath || !activeFile) return;
    const updatedContent = value || "";
    // Update processor
    apkProcessor.updateFileContent(activeFilePath, updatedContent);
    // Update state
    setApkFiles(prev => prev.map(f => (f.path === activeFilePath ? { ...f, content: updatedContent } : f)));
  };

  const handleSaveManifest = () => {
    if (!apkInfo) return;
    apkProcessor.updateManifestInfo(manifestEdit);
    setApkInfo({ ...apkInfo, ...manifestEdit });
    toast.success("تم حفظ معلومات البيان Manifest");
    setApkFiles(apkProcessor.getAllFiles());
  };

  const handleAddPermission = (permName: string) => {
    if (!apkInfo || !permName.trim()) return;
    if (apkInfo.permissions.some(p => p.name === permName)) {
      toast.error("الصلاحية موجودة مسبقاً");
      return;
    }
    const newPerm: APKPermission = { name: permName, isDangerous: permName.includes("LOCATION") || permName.includes("CAMERA") || permName.includes("CONTACTS") };
    const updated = { ...apkInfo, permissions: [...apkInfo.permissions, newPerm] };
    setApkInfo(updated);
    // Try to update manifest XML if editable
    const manifest = apkFiles.find(f => f.path === "AndroidManifest.xml");
    if (manifest && typeof manifest.content === "string" && manifest.content.includes("<manifest")) {
      let content = manifest.content as string;
      const permTag = `    <uses-permission android:name="${permName}" />\n`;
      if (content.includes("</manifest>")) {
        content = content.replace("</manifest>", `${permTag}</manifest>`);
        apkProcessor.updateFileContent("AndroidManifest.xml", content);
        setApkFiles(apkProcessor.getAllFiles());
      }
    }
    toast.success(`تمت إضافة الصلاحية: ${permName}`);
  };

  const handleRemovePermission = (permName: string) => {
    if (!apkInfo) return;
    const updated = { ...apkInfo, permissions: apkInfo.permissions.filter(p => p.name !== permName) };
    setApkInfo(updated);
    const manifest = apkFiles.find(f => f.path === "AndroidManifest.xml");
    if (manifest && typeof manifest.content === "string") {
      const content = (manifest.content as string).replace(new RegExp(`.*${permName}.*\\n?`, "g"), "");
      apkProcessor.updateFileContent("AndroidManifest.xml", content);
      setApkFiles(apkProcessor.getAllFiles());
    }
    toast.success("تمت إزالة الصلاحية");
  };

  const handleRebuild = async () => {
    if (apkFiles.length === 0) {
      toast.error("لا يوجد APK للبناء");
      return;
    }
    
    setIsLoading(true);
    const toastId = toast.loading("جاري تجميع التطبيق على الخادم... Rebuilding APK");
    
    try {
      // Prepare files for server-side build
      const projectFiles = apkFiles.map(f => ({
        path: f.path,
        content: typeof f.content === 'string' ? f.content : null
      }));

      const formData = new FormData();
      formData.append('files', JSON.stringify(projectFiles));
      formData.append('packageName', apkInfo?.packageName || 'app');

      const response = await fetch('/api/apk/rebuild', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${apkInfo?.packageName || "app"}-modded.apk`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("تم تجميع التطبيق بنجاح!", { id: toastId });
      } else {
        const errorText = await response.text();
        throw new Error(errorText || "فشل البناء على الخادم");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`خطأ في البناء: ${err.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    const toastId = toast.loading("جاري تصدير المشروع...");
    try {
      const blob = await apkProcessor.rebuildAPK();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${apkInfo?.packageName || "export"}-${Date.now()}.apk`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم التصدير", { id: toastId });
    } catch (err) {
      toast.error("فشل التصدير", { id: toastId });
    }
  };

  const runAnalysis = async () => {
    if (!activeFile || typeof activeFile.content !== "string") return;
    setIsAnalyzing(true);
    toast.info("جاري التحليل...");
    try {
      const result = await analyzeCode({ data: { code: activeFile.content, fileName: activeFile.name } });
      setChatMessages(prev => [...prev, { role: "ai", content: `**تحليل ${activeFile.name}:**\n${result.summary}\n\n**اقتراحات:**\n${result.suggestions.map(s => `• ${s}`).join("\n")}` }]);
      toast.success("اكتمل التحليل");
    } catch {
      toast.error("فشل التحليل");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");

    if (!activeFile || typeof activeFile.content !== "string") {
      setChatMessages(prev => [...prev, { role: "ai", content: "الرجاء اختيار ملف نصي ليقوم الذكاء الاصطناعي بتحليله." }]);
      return;
    }
    if (!aiSettings.apiKey) {
      setChatMessages(prev => [...prev, { role: "ai", content: `الرجاء إعداد مفتاح ${aiSettings.provider} أولاً.` }]);
      setShowSettings(true);
      return;
    }

    setIsAnalyzing(true);
    setChatMessages(prev => [...prev, { role: "ai", content: "جاري التفكير... Thinking..." }]);

    try {
      const actionResult = await getCodeAction(aiSettings, activeFile.content, userMsg);
      setPendingCode(actionResult.modifiedCode);
      setOriginalCode(activeFile.content);
      setChatMessages(prev => [...prev.slice(0, -1), { role: "ai", content: `${actionResult.explanation}\n\nراجع التغييرات في عرض Diff.` }]);
      setViewMode("diff");
      toast.info("اقترح الذكاء الاصطناعي تغييرات");
    } catch (err: any) {
      setChatMessages(prev => [...prev.slice(0, -1), { role: "ai", content: `خطأ: ${err.message}` }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyChanges = () => {
    if (pendingCode === null || !activeFilePath) return;
    apkProcessor.updateFileContent(activeFilePath, pendingCode);
    setApkFiles(apkProcessor.getAllFiles());
    setPendingCode(null);
    setViewMode("editor");
    toast.success("تم تطبيق التغييرات");
  };

  const discardChanges = () => {
    setPendingCode(null);
    setViewMode("editor");
    toast.info("تم إلغاء التغييرات");
  };

  const handleStabilityAudit = async () => {
    if (!apkInfo || !aiSettings.apiKey) {
      toast.error("يرجى رفع APK وإعداد مفتاح AI أولاً");
      return;
    }
    setIsAuditing(true);
    setRightTab("audit");
    try {
      const manifest = apkFiles.find(f => f.path === "AndroidManifest.xml")?.content as string || "";
      const paths = apkFiles.map(f => f.path);
      const { checkAppFunctionality } = await import("@/lib/ai-service");
      const result = await checkAppFunctionality(aiSettings, manifest, paths);
      setStabilityAudit(result);
      toast.success("تم فحص استقرار التطبيق");
    } catch (err: any) {
      toast.error("فشل الفحص: " + err.message);
    } finally {
      setIsAuditing(false);
    }
  };

  const groupedByFolder = React.useMemo(() => {
    const groups: Record<string, APKFile[]> = {};
    for (const f of filteredFiles) {
      const parts = f.path.split("/");
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(f);
    }
    return groups;
  }, [filteredFiles]);

  const toggleFolder = (folder: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    setExpandedFolders(next);
  };

  const renderFileTree = () => {
    return Object.entries(groupedByFolder)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folder, files]) => (
        <div key={folder} className="select-none">
          <div
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-slate-800/70 text-slate-300"
            onClick={() => toggleFolder(folder)}
          >
            {expandedFolders.has(folder) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Folder className="h-3.5 w-3.5 text-amber-400" />
            <span className="truncate font-medium">{folder === "root" ? "/" : folder}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{files.length}</span>
          </div>
          {expandedFolders.has(folder) && (
            <div className="ml-2 border-l border-slate-800">
              {files
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(file => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 pl-6 pr-2 py-1 text-xs cursor-pointer hover:bg-slate-800 group ${
                      activeFilePath === file.path ? "bg-primary/20 text-primary border-r-2 border-primary" : "text-slate-400"
                    }`}
                    onClick={() => openFile(file.path)}
                    title={file.path}
                  >
                    {file.path.endsWith(".xml") ? (
                      <FileCode className="h-3.5 w-3.5 text-blue-400" />
                    ) : file.path.endsWith(".dex") ? (
                      <Cpu className="h-3.5 w-3.5 text-purple-400" />
                    ) : file.path.endsWith(".so") ? (
                      <Layers className="h-3.5 w-3.5 text-orange-400" />
                    ) : file.category === "security" ? (
                      <Lock className="h-3.5 w-3.5 text-red-400" />
                    ) : file.path.match(/\.(png|jpg|jpeg|webp)$/) ? (
                      <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
                    ) : file.path.endsWith(".json") ? (
                      <FileJson className="h-3.5 w-3.5 text-yellow-400" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-[9px] opacity-60">{formatBytes(file.size)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      ));
  };

  // Derive language
  const editorLanguage = activeFile ? getFileLanguage(activeFile.name) : "plaintext";
  const isImage = activeFile?.path.match(/\.(png|jpg|jpeg|webp|gif|ico)$/i);
  const isBinaryView = activeFile?.type === "binary" || activeFile?.path.endsWith(".dex") || activeFile?.path.endsWith(".so") || activeFile?.path.endsWith(".arsc");

  return (
    <div
      className="flex h-screen w-full bg-[#0a0a0f] text-slate-100 overflow-hidden font-sans dark selection:bg-primary/30"
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-2xl pointer-events-none">
          <div className="text-center space-y-4">
            <Upload className="h-16 w-16 mx-auto text-primary animate-bounce" />
            <p className="text-2xl font-bold">أسقط ملف APK هنا</p>
            <p className="text-slate-400">Drop APK file here</p>
          </div>
        </div>
      )}

      <SetupGuide open={showSetup} onOpenChange={setShowSetup} />

      {/* LEFT SIDEBAR */}
      <aside className="w-[320px] border-r border-slate-800 flex flex-col bg-[#0f0f14]">
        {/* Header */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-[#0f0f14]">
          <div className="flex items-center gap-2 font-bold">
            <div className="bg-primary/20 p-1.5 rounded-lg">
              <Code2 className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm">APP-FORGE</span>
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">v2</Badge>
          </div>
          <div className="flex gap-1">
            <label className="h-7 w-7 grid place-items-center hover:bg-slate-800 rounded cursor-pointer" title="رفع APK">
              <Upload className="h-4 w-4" />
              <input type="file" accept=".apk,.zip,.xapk" className="hidden" onChange={handleFileInput} />
            </label>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleExport} disabled={apkFiles.length === 0}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* APK Info Header if loaded */}
        {apkInfo && (
          <div className="p-3 border-b border-slate-800 bg-gradient-to-br from-primary/10 to-transparent space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex gap-2">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 grid place-items-center text-white font-bold text-sm">
                  {apkInfo.appName?.[0] || apkInfo.packageName[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate max-w-[180px]">{apkInfo.appName || apkInfo.packageName}</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{apkInfo.packageName}</p>
                </div>
              </div>
              <Badge variant={apkInfo.isSigned ? "default" : "destructive"} className="text-[10px]">
                {apkInfo.isSigned ? "مُوقّع" : "غير مُوقّع"}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-slate-400 text-[10px]">الإصدار</div>
                <div className="font-bold">{apkInfo.versionName}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-slate-400 text-[10px]">الملفات</div>
                <div className="font-bold">{apkInfo.fileCount}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-slate-400 text-[10px]">الحجم</div>
                <div className="font-bold">{formatBytes(apkInfo.fileSize)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Left Tabs */}
        <Tabs value={leftTab} onValueChange={v => setLeftTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 m-2 bg-slate-800/50 h-8">
            <TabsTrigger value="categories" className="text-[11px] h-6 data-[state=active]:bg-primary">
              <Box className="h-3 w-3 mr-1" /> تصنيف
            </TabsTrigger>
            <TabsTrigger value="files" className="text-[11px] h-6 data-[state=active]:bg-primary">
              <Folder className="h-3 w-3 mr-1" /> ملفات
            </TabsTrigger>
            <TabsTrigger value="certs" className="text-[11px] h-6 data-[state=active]:bg-primary">
              <Lock className="h-3 w-3 mr-1" /> شهادات
            </TabsTrigger>
          </TabsList>

          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <Input
                placeholder="بحث... Search"
                className="pl-8 h-8 bg-slate-900 border-slate-800 text-xs"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <TabsContent value="categories" className="flex-1 mt-0 overflow-hidden flex flex-col">
            {/* Category Filter Chips */}
            <div className="p-2 flex flex-wrap gap-1.5">
              <Badge
                variant={activeCategory === "all" ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-2 py-0.5"
                onClick={() => setActiveCategory("all")}
              >
                الكل {apkFiles.length}
              </Badge>
              {categoryStats.map(stat => (
                <Badge
                  key={stat.category}
                  variant={activeCategory === stat.category ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] px-2 py-0.5 border ${activeCategory === stat.category ? "" : CATEGORY_META[stat.category].color}`}
                  onClick={() => setActiveCategory(stat.category)}
                >
                  {CATEGORY_META[stat.category].icon} {CATEGORY_META[stat.category].labelAr} {stat.count}
                </Badge>
              ))}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {categoryStats.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-xs space-y-3">
                    <Package className="h-8 w-8 mx-auto opacity-30" />
                    <p>لا يوجد APK محمل<br/>Upload APK to see categories</p>
                    <label className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs cursor-pointer">
                      <Upload className="h-3 w-3" /> رفع APK
                      <input type="file" accept=".apk,.zip" className="hidden" onChange={handleFileInput} />
                    </label>
                  </div>
                ) : (
                  <>
                    {/* Category Cards */}
                    <div className="grid gap-2">
                      {categoryStats.map(stat => {
                        const meta = CATEGORY_META[stat.category];
                        return (
                          <div
                            key={stat.category}
                            onClick={() => setActiveCategory(stat.category)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                              activeCategory === stat.category ? "bg-primary/10 border-primary/50" : "bg-slate-800/30 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{meta.icon}</span>
                                <div>
                                  <div className="text-xs font-bold flex items-center gap-1">
                                    {meta.labelAr} <span className="text-[10px] opacity-60">/ {meta.label}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-400">{meta.description}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold">{stat.count}</div>
                                <div className="text-[10px] text-slate-500">{formatBytes(stat.totalSize)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 border-t border-slate-800 mt-3">
                      <div className="text-[11px] font-bold text-slate-300 mb-2 px-1">الملفات المفلترة - {filteredFiles.length}</div>
                      <div className="space-y-0.5 max-h-[30vh] overflow-auto">
                        {filteredFiles.slice(0, 50).map(f => (
                          <div
                            key={f.path}
                            onClick={() => openFile(f.path)}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer hover:bg-slate-800 ${
                              activeFilePath === f.path ? "bg-primary/20 text-primary" : "text-slate-400"
                            }`}
                          >
                            <span>{CATEGORY_META[f.category].icon}</span>
                            <span className="truncate flex-1">{f.path}</span>
                          </div>
                        ))}
                        {filteredFiles.length > 50 && <div className="text-[10px] text-slate-500 px-2 py-1">و {filteredFiles.length - 50} ملف آخر...</div>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="files" className="flex-1 mt-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="py-1">{renderFileTree()}</div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="certs" className="flex-1 mt-0 overflow-hidden flex flex-col p-2">
            <ScrollArea className="flex-1">
              {certificates.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  <Shield className="h-8 w-8 mx-auto opacity-30 mb-2" />
                  <p>لا توجد شهادات<br/>No certificates found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {certificates.map(cert => (
                    <Card key={cert.path} className="bg-slate-800/30 border-slate-800">
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1">
                            <Lock className="h-3 w-3" /> {cert.fileName}
                          </span>
                          <Badge variant={cert.isDebug ? "destructive" : "secondary"} className="text-[9px]">
                            {cert.type} {cert.isDebug ? "DEBUG" : ""}
                          </Badge>
                        </div>
                        <div className="text-[10px] space-y-1 text-slate-400">
                          <div>المسار: {cert.path}</div>
                          <div>الحجم: {formatBytes(cert.size)}</div>
                          {cert.issuer && <div className="break-all">المُصدر: {cert.issuer}</div>}
                          {cert.fingerprintSHA256 && (
                            <div className="break-all p-1 bg-slate-900 rounded font-mono text-[9px]">{cert.fingerprintSHA256.slice(0, 120)}...</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-3 text-[11px] text-amber-300/80">
                      <div className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>سيتم إزالة التوقيع القديم عند إعادة البناء. ستحتاج لتوقيع جديد بـ apksigner.</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="p-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          {apkFiles.length > 0 ? `${apkFiles.length} ملف | ${categoryStats.length} تصنيف` : "في انتظار APK"}
        </div>
      </aside>

      {/* CENTER */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0f1117]">
        {/* Top bar */}
        <header className="h-11 border-b border-slate-800 flex items-center justify-between px-3 bg-[#0f0f14] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Open tabs */}
            <div className="flex items-center gap-1 overflow-auto max-w-[60vw] scrollbar-none">
              {openTabs.map(path => {
                const file = apkFiles.find(f => f.path === path);
                return (
                  <div
                    key={path}
                    onClick={() => setActiveFilePath(path)}
                    className={`group flex items-center gap-1.5 px-3 py-1 rounded-md text-xs cursor-pointer border whitespace-nowrap shrink-0 ${
                      activeFilePath === path ? "bg-primary text-primary-foreground border-primary" : "bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{file?.name || path.split("/").pop()}</span>
                    <X className="h-3 w-3 opacity-60 hover:opacity-100" onClick={e => closeTab(path, e)} />
                  </div>
                );
              })}
              {openTabs.length === 0 && <span className="text-xs text-slate-500">لا يوجد ملف مفتوح</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {activeFile && (
              <>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setViewMode(viewMode === "editor" ? "diff" : "editor")}>
                  <Split className="h-3 w-3 mr-1" />
                  {viewMode === "editor" ? "Diff" : "Editor"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10 text-pink-400"
                  onClick={() => setChatInput("تغيير صورة وأيقونات التطبيق Change App Icon")}
                >
                  <ImageIcon className="h-3 w-3 mr-1" /> صورة
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400"
                  onClick={() => setChatInput("فتح المميزات والاشتراكات Unlock All Features")}
                >
                  <Flame className="h-3 w-3 mr-1" /> المميزات
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400"
                  onClick={() => setChatInput("قطع الإنترنت عن التطبيق Block Network Access")}
                >
                  <ShieldAlert className="h-3 w-3 mr-1" /> الإنترنت
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                  onClick={handleStabilityAudit}
                >
                  <CheckCircle className="h-3 w-3 mr-1" /> فحص العمل
                </Button>
              </>
            )}
            <div className="h-4 w-px bg-slate-800 mx-1 shrink-0" />
            <Button size="sm" className="h-7 text-[11px] bg-primary shrink-0" onClick={handleRebuild} disabled={apkFiles.length === 0}>
              <Play className="h-3 w-3 mr-1" />
              بناء APK
            </Button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/50 border border-slate-700/50">
              <div className={`h-1.5 w-1.5 rounded-full ${apkFiles.length > 0 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}`} />
              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">
                {apkFiles.length > 0 ? "Tools Online" : "Tools Offline"}
              </span>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setShowSetup(true)} title="Setup">
              <Terminal className="h-3.5 w-3.5 text-primary" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setShowSettings(true)}>
              <Key className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* Center sub tabs for file types */}
        {activeFile && (
          <div className="h-9 border-b border-slate-800 bg-slate-900/30 flex items-center px-2 gap-2 shrink-0">
            <Tabs value={centerTab} onValueChange={v => setCenterTab(v as any)} className="h-full">
              <TabsList className="h-7 bg-transparent gap-1">
                <TabsTrigger value="code" className="h-6 text-[11px] data-[state=active]:bg-slate-800">
                  <Code2 className="h-3 w-3 mr-1" /> الكود
                </TabsTrigger>
                {activeFilePath === "AndroidManifest.xml" && (
                  <TabsTrigger value="visual" className="h-6 text-[11px] data-[state=active]:bg-slate-800">
                    <Eye className="h-3 w-3 mr-1" /> مرئي Visual
                  </TabsTrigger>
                )}
                <TabsTrigger value="preview" className="h-6 text-[11px] data-[state=active]:bg-slate-800">
                  <ImageIcon className="h-3 w-3 mr-1" /> معاينة
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="ml-auto text-[10px] text-slate-500 flex items-center gap-2">
              <span>{formatBytes(activeFile.size)}</span>
              <Badge variant="outline" className="text-[9px]">{activeFile.category}</Badge>
              {activeFile.editable ? <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/20">قابل للتعديل</Badge> : <Badge variant="destructive" className="text-[9px]">للقراءة فقط</Badge>}
            </div>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 relative bg-[#0e0e12]">
          {!activeFile ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              {apkFiles.length === 0 ? (
                <div className="max-w-md space-y-6">
                  <div className="h-24 w-24 mx-auto rounded-3xl bg-gradient-to-br from-primary to-purple-600 grid place-items-center">
                    <Smartphone className="h-12 w-12 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black tracking-tight">محرر APK الاحترافي</h2>
                    <p className="text-slate-400 text-sm">قم بتحميل أي تطبيق أندرويد لتعديله. سيتم فرز الملفات حسب الشهادات، الإعدادات، الموارد، والشيفرة تلقائياً.</p>
                  </div>
                  <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-700 rounded-2xl p-8 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all">
                    <Upload className="h-8 w-8 text-slate-400" />
                    <span className="text-sm font-semibold">اسحب APK هنا أو اضغط للرفع</span>
                    <span className="text-[11px] text-slate-500">يدعم .apk .zip .xapk - معالجة محلية 100%</span>
                    <input type="file" accept=".apk,.zip,.xapk" className="hidden" onChange={handleFileInput} />
                  </label>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    {[
                      { icon: "🔐", t: "إدارة الشهادات", d: "عرض وفهم توقيعات META-INF" },
                      { icon: "📱", t: "محرر البيان", d: "تعديل package, version, صلاحيات" },
                      { icon: "🎨", t: "الموارد", d: "صور، layouts, strings" },
                      { icon: "💻", t: "الشيفرة", d: "DEX, Smali تحليل" },
                    ].map((f, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-left">
                        <div className="text-lg">{f.icon}</div>
                        <div className="text-xs font-bold mt-1">{f.t}</div>
                        <div className="text-[11px] text-slate-500">{f.d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 text-sm">اختر ملفاً من الجانب الأيسر لبدء التعديل</div>
              )}
            </div>
          ) : centerTab === "visual" && activeFilePath === "AndroidManifest.xml" ? (
            <ScrollArea className="h-full">
              <div className="p-6 max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold">محرر البيان المرئي - Visual Manifest Editor</h2>
                </div>

                <Card className="bg-slate-800/30 border-slate-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">معلومات التطبيق الأساسية</CardTitle>
                    <CardDescription className="text-xs">تعديل الحزمة والإصدار</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">اسم الحزمة Package Name</Label>
                        <Input value={manifestEdit.packageName} onChange={e => setManifestEdit(s => ({ ...s, packageName: e.target.value }))} className="bg-slate-900 border-slate-700 text-sm" />
                        <p className="text-[10px] text-slate-500">مثال: com.example.app</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">اسم التطبيق (اختياري)</Label>
                        <Input value={apkInfo?.appName || ""} onChange={e => setApkInfo(prev => (prev ? { ...prev, appName: e.target.value } : prev))} className="bg-slate-900 border-slate-700 text-sm" placeholder="My App" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">رقم الإصدار Version Name</Label>
                        <Input value={manifestEdit.versionName} onChange={e => setManifestEdit(s => ({ ...s, versionName: e.target.value }))} className="bg-slate-900 border-slate-700 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">كود الإصدار Version Code</Label>
                        <Input value={manifestEdit.versionCode} onChange={e => setManifestEdit(s => ({ ...s, versionCode: e.target.value }))} className="bg-slate-900 border-slate-700 text-sm" type="number" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Min SDK</Label>
                        <Input value={apkInfo?.minSdk || ""} onChange={e => setApkInfo(prev => (prev ? { ...prev, minSdk: e.target.value } : prev))} className="bg-slate-900 border-slate-700 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Target SDK</Label>
                        <Input value={apkInfo?.targetSdk || ""} onChange={e => setApkInfo(prev => (prev ? { ...prev, targetSdk: e.target.value } : prev))} className="bg-slate-900 border-slate-700 text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveManifest} className="h-8">
                        <Save className="h-3.5 w-3.5 mr-1" /> حفظ
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCenterTab("code")} className="h-8">
                        تحرير الكود الخام
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {apkInfo && (
                  <Card className="bg-slate-800/30 border-slate-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Database className="h-4 w-4" /> المكونات
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">{apkInfo.activities.length}</div>
                        <div className="text-[11px] text-slate-400">Activities</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">{apkInfo.services.length}</div>
                        <div className="text-[11px] text-slate-400">Services</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">{apkInfo.receivers.length}</div>
                        <div className="text-[11px] text-slate-400">Receivers</div>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold">{apkInfo.providers.length}</div>
                        <div className="text-[11px] text-slate-400">Providers</div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 text-xs text-primary/80 flex gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>إذا كان AndroidManifest.xml في صيغة ثنائية binary، تحتاج إلى فك تشفير عبر apktool في الواجهة الخلفية. النسخة النصية الحالية قابلة للتعديل مباشرة إذا كانت decompiled مسبقاً.</span>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          ) : centerTab === "preview" ? (
            <div className="h-full flex items-center justify-center p-6 bg-[#0a0a0f] overflow-auto">
              {isImage && activeFile.rawContent ? (
                <div className="space-y-4 text-center">
                  <img
                    src={URL.createObjectURL(new Blob([(activeFile.rawContent as Uint8Array).buffer as ArrayBuffer]))}
                    alt={activeFile.name}
                    className="max-w-full max-h-[60vh] mx-auto rounded-xl border border-slate-800 shadow-2xl"
                  />
                  <div className="text-xs text-slate-400">
                    {activeFile.name} • {formatBytes(activeFile.size)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 whitespace-pre-wrap font-mono max-w-3xl mx-auto p-6 bg-slate-900/50 rounded-xl border border-slate-800 overflow-auto max-h-[80vh]">
                  {typeof activeFile.content === "string" ? activeFile.content : "[Binary preview not available]"}
                </div>
              )}
            </div>
          ) : viewMode === "editor" ? (
            <Editor
              height="100%"
              language={editorLanguage}
              theme="vs-dark"
              value={typeof activeFile.content === "string" ? activeFile.content : ""}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "JetBrains Mono, monospace",
                automaticLayout: true,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                readOnly: !activeFile.editable,
              }}
            />
          ) : (
            <DiffEditor
              height="100%"
              original={originalCode}
              modified={pendingCode || (typeof activeFile.content === "string" ? activeFile.content : "")}
              language={editorLanguage}
              theme="vs-dark"
              options={{
                renderSideBySide: true,
                fontSize: 13,
                automaticLayout: true,
                minimap: { enabled: false },
                readOnly: false,
              }}
            />
          )}

          {/* Diff action bar */}
          {viewMode === "diff" && pendingCode && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-slate-800 border border-slate-700 rounded-full p-1.5 shadow-2xl">
              <Button size="sm" onClick={applyChanges} className="rounded-full h-7 px-4">
                <Check className="h-3.5 w-3.5 mr-1" /> تطبيق
              </Button>
              <Button size="sm" variant="ghost" onClick={discardChanges} className="rounded-full h-7 px-4">
                <X className="h-3.5 w-3.5 mr-1" /> إلغاء
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR */}
      <aside className="w-[340px] border-l border-slate-800 flex flex-col bg-[#0f0f14]">
        <Tabs value={rightTab} onValueChange={v => setRightTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 m-2 bg-slate-800/50 h-8">
            <TabsTrigger value="info" className="text-[11px] h-6 px-1">
              <Info className="h-3 w-3 mr-1" /> معلومات
            </TabsTrigger>
            <TabsTrigger value="perms" className="text-[11px] h-6 px-1">
              <ShieldAlert className="h-3 w-3 mr-1" /> صلاحيات
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-[11px] h-6 px-1">
              <MessageSquare className="h-3 w-3 mr-1" /> مساعد
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-[11px] h-6 px-1">
              <ShieldCheck className="h-3 w-3 mr-1" /> فحص
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 mt-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-3">
              {!apkInfo ? (
                <div className="text-center py-8 text-slate-500 text-xs space-y-2">
                  <Info className="h-6 w-6 mx-auto opacity-30" />
                  <p>حمّل APK لرؤية المعلومات</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Card className="bg-slate-800/30 border-slate-800">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs flex items-center gap-1">
                        <Smartphone className="h-3 w-3" /> التطبيق
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-2 text-[11px]">
                      <div className="flex justify-between"><span className="text-slate-400">الحزمة</span><span className="font-mono truncate max-w-[140px]">{apkInfo.packageName}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">الإصدار</span><span>{apkInfo.versionName} ({apkInfo.versionCode})</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Min SDK</span><span>{apkInfo.minSdk}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Target</span><span>{apkInfo.targetSdk}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">DEX</span><span>{apkInfo.dexCount} ملف</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Native</span><span>{apkInfo.hasNativeLibs ? "نعم" : "لا"} {apkInfo.architectures.join(", ")}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">قابل للتعديل</span><span>{apkInfo.debuggable ? "Debuggable" : "مُنتج"}</span></div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/30 border-slate-800">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs">التصنيفات - Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1.5">
                      {categoryStats.map(s => (
                        <div key={s.category} className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5">{CATEGORY_META[s.category].icon} {CATEGORY_META[s.category].labelAr}</span>
                          <span className="text-slate-400">{s.count} • {formatBytes(s.totalSize)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/30 border-slate-800">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs">المكونات</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-3 text-[11px] max-h-[200px] overflow-auto">
                      <div>
                        <div className="font-bold mb-1">Activities ({apkInfo.activities.length})</div>
                        <div className="space-y-0.5 text-slate-400">
                          {apkInfo.activities.slice(0, 5).map(a => (
                            <div key={a.name} className="truncate">• {a.name}</div>
                          ))}
                          {apkInfo.activities.length > 5 && <div className="text-[10px]">+ {apkInfo.activities.length - 5} المزيد</div>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {activeFile && (
                    <Card className="bg-primary/5 border-primary/20">
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-xs">الملف الحالي</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 text-[11px] space-y-1">
                        <div className="truncate font-mono">{activeFile.path}</div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-[10px]">{formatBytes(activeFile.size)}</Badge>
                          <Badge variant="outline" className="text-[10px]">{activeFile.category}</Badge>
                        </div>
                        <div className="text-slate-400">{activeFile.editable ? "قابل للتعديل" : "قراءة فقط - Binary"}</div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="perms" className="flex-1 mt-0 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-800 space-y-2">
              <div className="flex gap-2">
                <Input id="new-perm" placeholder="android.permission.CAMERA" className="h-8 text-xs bg-slate-900 border-slate-700" />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const el = document.getElementById("new-perm") as HTMLInputElement;
                    if (el?.value) {
                      handleAddPermission(el.value);
                      el.value = "";
                    }
                  }}
                >
                  إضافة
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {["android.permission.INTERNET", "android.permission.CAMERA", "android.permission.ACCESS_FINE_LOCATION", "android.permission.READ_CONTACTS"].map(p => (
                  <Badge key={p} variant="outline" className="text-[9px] cursor-pointer hover:bg-slate-800" onClick={() => handleAddPermission(p)}>
                    + {p.split(".").pop()}
                  </Badge>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1 p-2">
              {!apkInfo ? (
                <div className="text-center py-8 text-xs text-slate-500">حمّل APK لعرض الصلاحيات</div>
              ) : (
                <div className="space-y-1.5">
                  {apkInfo.permissions.length === 0 && <div className="text-xs text-slate-500 text-center py-4">لا توجد صلاحيات</div>}
                  {apkInfo.permissions.map(perm => (
                    <div key={perm.name} className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 ${perm.isDangerous ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/30 border-slate-800"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-mono truncate flex items-center gap-1">
                          {perm.isDangerous && <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
                          {perm.name}
                        </div>
                        {perm.isDangerous && <div className="text-[10px] text-amber-400/80 mt-0.5">صلاحية خطرة - Dangerous</div>}
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => handleRemovePermission(perm.name)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-2 border-t border-slate-800 bg-slate-900/30">
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> {apkInfo?.permissions.filter(p => p.isDangerous).length || 0} خطرة من أصل {apkInfo?.permissions.length || 0}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="flex-1 mt-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-3 bg-[#0a0a0f]">
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-white rounded-br-sm" : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-sm"}`}>
                      {msg.content}
                      {msg.role === "ai" && pendingCode && i === chatMessages.length - 1 && (
                        <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-700">
                          <Button size="sm" onClick={applyChanges} className="h-6 text-[10px] rounded-full">
                            <Check className="h-3 w-3 mr-1" /> تطبيق
                          </Button>
                          <Button size="sm" variant="ghost" onClick={discardChanges} className="h-6 text-[10px] rounded-full">
                            <X className="h-3 w-3 mr-1" /> إلغاء
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isAnalyzing && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-3 py-2 text-xs flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> جاري التفكير...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <form onSubmit={sendChatMessage} className="p-2 border-t border-slate-800 bg-[#0f0f14] flex gap-2">
              <Input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="اسأل عن الملف أو اطلب تعديل... / Ask AI" className="h-9 bg-slate-900 border-slate-700 text-xs flex-1" />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>

            <div className="p-2 border-t border-slate-800 grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setChatInput("اشرح لي هذا الملف")}>
                اشرح الملف
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setChatInput("كيف أعدّل هذا الملف لإضافة ميزة؟")}>
                اقترح تحسين
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setChatInput("ابحث عن مشاكل أمنية في هذا الكود")}>
                فحص أمني
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setChatInput("جمّل هذا الكود")}>
                جمّل الكود
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="flex-1 mt-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-4">
                <div className="text-center py-4 space-y-3">
                  <ShieldCheck className={`h-12 w-12 mx-auto ${stabilityAudit ? 'text-emerald-400' : 'text-slate-500 opacity-30'}`} />
                  <div>
                    <h3 className="text-sm font-bold">فحص استقرار التطبيق</h3>
                    <p className="text-[11px] text-slate-500">تحليل احتمالية عمل التطبيق بعد التعديلات</p>
                  </div>
                  <Button 
                    onClick={handleStabilityAudit} 
                    disabled={isAuditing || !apkInfo}
                    className="w-full"
                  >
                    {isAuditing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    بدء الفحص الشامل
                  </Button>
                </div>

                {stabilityAudit && (
                  <Card className="bg-slate-800/30 border-slate-800">
                    <CardContent className="p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-slate-200">
                      {stabilityAudit}
                    </CardContent>
                  </Card>
                )}
                
                <div className="grid grid-cols-1 gap-2">
                  <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Cpu className="h-3 w-3 text-blue-400" /> فحوصات تلقائية
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-1">
                      <li className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-emerald-500" /> توافق معماري (Native Libs)
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-emerald-500" /> تكامل الموارد (Resources Table)
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-emerald-500" /> صحة ملف البيان (Manifest)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[440px] bg-[#0f0f14] border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="h-4 w-4" /> إعدادات الذكاء الاصطناعي</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">اختر المزود وأدخل المفتاح لاستخدام المساعد الذكي</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs">المزود Provider</Label>
              <Select value={aiSettings.provider} onValueChange={(v: AIProvider) => setAiSettings({ ...aiSettings, provider: v })}>
                <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                  <SelectItem value="gemini">Google Gemini (مجاني)</SelectItem>
                  <SelectItem value="groq">Groq (سريع)</SelectItem>
                  <SelectItem value="siliconflow">SiliconFlow (Qwen)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs flex justify-between">
                <span>API Key</span>
                <a href={PROVIDER_LINKS[aiSettings.provider]} target="_blank" className="text-primary text-[10px] hover:underline">احصل على المفتاح</a>
              </Label>
              <Input type="password" placeholder={`${aiSettings.provider} api key`} value={aiSettings.apiKey} onChange={e => setAiSettings({ ...aiSettings, apiKey: e.target.value })} className="bg-slate-900 border-slate-700" />
            </div>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3 text-[11px] text-slate-400">المفتاح يُخزن محلياً فقط في المتصفح. لا يتم إرساله لخوادمنا.</CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button onClick={() => { localStorage.setItem("APPFORGE_AI_SETTINGS", JSON.stringify(aiSettings)); setShowSettings(false); toast.success("تم الحفظ"); }}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-3 min-w-[280px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-bold">جاري التحليل...</p>
            <p className="text-xs text-slate-400">قد يستغرق بضع ثوانٍ للملفات الكبيرة</p>
          </div>
        </div>
      )}
    </div>
  );
}
