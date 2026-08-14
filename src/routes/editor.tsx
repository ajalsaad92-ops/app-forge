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
  Search
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
import { ShieldCheck } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ShieldCheck, Wrench } from "lucide-react";
import { SetupGuide } from "@/components/SetupGuide";


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

const DEFAULT_FILES: FileSystemItem[] = [
  { id: '1', name: 'src', type: 'folder', parentId: null },
  { id: '2', name: 'App.tsx', type: 'file', content: 'export default function App() {\n  return <h1>Hello App-Forge!</h1>;\n}', parentId: '1' },
  { id: '3', name: 'utils.ts', type: 'file', content: 'export const add = (a: number, b: number) => a + b;', parentId: '1' },
  { id: '4', name: 'package.json', type: 'file', content: '{\n  "name": "app-forge-project",\n  "version": "1.0.0"\n}', parentId: null },
];

const STORAGE_KEY = "APPFORGE_FILES_V2";

function AppForgeEditor() {
  const [files, setFiles] = React.useState<FileSystemItem[]>(DEFAULT_FILES);
  const [activeFileId, setActiveFileId] = React.useState<string>('2');
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set(['1']));
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [leftTab, setLeftTab] = React.useState<"categories" | "files" | "certs">("categories");
  const [centerTab, setCenterTab] = React.useState<"code" | "visual" | "preview">("code");
  const [rightTab, setRightTab] = React.useState<"info" | "perms" | "ai">("info");

  // Legacy file system for generic project support
  const [files, setFiles] = React.useState<FileSystemItem[]>([
    { id: "1", name: "src", type: "folder", parentId: null },
    {
      id: "2",
      name: "App.tsx",
      type: "file",
      content: "export default function App() {\n  return <h1>Hello App-Forge!</h1>;\n}",
      parentId: "1",
    },
    {
      id: "3",
      name: "utils.ts",
      type: "file",
      content: "export const add = (a: number, b: number) => a + b;",
      parentId: "1",
    },
  ]);

  const [chatMessages, setChatMessages] = React.useState<
    { role: "user" | "ai"; content: string }[]
  >([
    {
      role: "ai",
      content:
        "مرحباً! 👋 أنا مساعد APP-FORGE الذكي. يمكنك سؤالي عن أي ملف في الـ APK أو طلب تعديل الكود.\n\nHello! I can help you analyze and modify APK files. Upload an APK to start.",
    },
  ]);
  const [isBackendLoading, setIsBackendLoading] = React.useState<{[key: string]: boolean}>({});

  const [chatMessages, setChatMessages] = React.useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [viewMode, setViewMode] = React.useState<'editor' | 'diff'>('editor');
  const [originalCode, setOriginalCode] = React.useState<string>("");
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const [aiSettings, setAiSettings] = React.useState<AISettings>({
    provider: "gemini",
    apiKey: "",
    provider: 'gemini',
    apiKey: ''
  });
  const [showSettings, setShowSettings] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [isFileSystemLoaded, setIsFileSystemLoaded] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [manifestEdit, setManifestEdit] = React.useState({
    packageName: "",
    versionName: "",
    versionCode: "",
  });



  // Load API Key and Files from storage
  React.useEffect(() => {
    const init = async () => {
      const savedSettings = localStorage.getItem("APPFORGE_AI_SETTINGS");
      if (savedSettings) {
        try {
          setAiSettings(JSON.parse(savedSettings));
        } catch (e) {
          console.error("Failed to parse AI settings", e);
        }
      } else {
        // Fallback to old key if exists
        const oldKey = localStorage.getItem("APPFORGE_GEMINI_KEY");
        if (oldKey) setAiSettings({ provider: 'gemini', apiKey: oldKey });
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
            setApkFiles(
              storedMeta.files.map(
                (f) => ({ ...f, content: f.content || `[Persisted] ${f.path}` }) as APKFile,
              ),
            );
          }
        }
        const storedFiles = await get<FileSystemItem[]>(STORAGE_KEY);
        if (storedFiles && storedFiles.length > 0) {
          setFiles(storedFiles);
          const firstFile = storedFiles.find(f => f.type === 'file');
          if (firstFile) setActiveFileId(firstFile.id);
        }
      } catch (err) {
        console.error("Failed to load files from IndexedDB", err);
      } finally {
        setIsFileSystemLoaded(true);
      }
    };
    init();
  }, []);

  const activeFile = React.useMemo(
    () => apkFiles.find((f) => f.path === activeFilePath),
    [apkFiles, activeFilePath],
  );

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

  const handleAPKUpload = async (file: File) => {
    if (
      !file.name.endsWith(".apk") &&
      !file.name.endsWith(".zip") &&
      !file.name.endsWith(".xapk")
    ) {
      toast.error("الرجاء رفع ملف APK صالح");
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading(`جاري تحليل ${file.name}... Analyzing ${file.name}`);
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

      // Open manifest by default
      const manifest =
        result.files.find((p) => p === "AndroidManifest.xml") || result.files[0] || "";
      if (manifest) {
        setActiveFilePath(manifest);
        setOpenTabs((prev) => (prev.includes(manifest) ? prev : [manifest, ...prev].slice(0, 10)));
      }

      // Persist meta (without raw binary for storage limit)
      try {
        await set(APK_META_KEY, {
          info: result.info,
          certs: result.certificates,
          stats: result.stats,
          files: apkProcessor
            .getAllFiles()
            .map((f) => ({
              ...f,
              rawContent: undefined,
              content: typeof f.content === "string" ? f.content.slice(0, 5000) : undefined,
            })),
        });
      } catch {}

      toast.success(`تم تحليل APK بنجاح! ${result.files.length} ملف`, { id: toastId });
      setLeftTab("categories");
      setRightTab("info");
    } catch (err: any) {
      console.error(err);
      toast.error(`فشل التحليل: ${err.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
  // Save files to IndexedDB on change
  React.useEffect(() => {
    if (isFileSystemLoaded) {
      set(STORAGE_KEY, files).catch(err => {
        console.error("Failed to save files to IndexedDB", err);
      });
    }
  }, [files, isFileSystemLoaded]);

  const saveAiSettings = (settings: AISettings) => {
    localStorage.setItem("APPFORGE_AI_SETTINGS", JSON.stringify(settings));
    setAiSettings(settings);
    setShowSettings(false);
    toast.success("AI Settings saved");
  };

  const activeFile = files.find(f => f.id === activeFileId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

  const openFile = (path: string) => {
    setActiveFilePath(path);
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path].slice(-10));
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
    setOpenTabs((prev) => prev.filter((p) => p !== path));
    if (activeFilePath === path) {
      const remaining = openTabs.filter((p) => p !== path);
      setActiveFilePath(remaining[remaining.length - 1] || "");
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFilePath || !activeFile) return;
    const updatedContent = value || "";
    // Update processor
    apkProcessor.updateFileContent(activeFilePath, updatedContent);
    // Update state
    setApkFiles((prev) =>
      prev.map((f) => (f.path === activeFilePath ? { ...f, content: updatedContent } : f)),
    );
    const toastId = toast.loading(`Extracting ${file.name}...`);
    try {
      const paths = await apkProcessor.loadAPK(file);
      
      // Cleanup: memory management for large APKs
      // We are about to map the entire APK to our files state
      // This is a memory-heavy operation. 
      // Using a temporary Set to avoid duplicates if any
      const pathSet = new Set(paths);
      
      const newFiles: FileSystemItem[] = [];
      const folderMap = new Map<string, string>();

      const getOrCreateFolder = (path: string): string | null => {
        const parts = path.split('/');
        if (parts.length <= 1) return null;
        
        const parentPath = parts.slice(0, -1).join('/');
        if (folderMap.has(parentPath)) return folderMap.get(parentPath)!;

        const grandParentId = getOrCreateFolder(parentPath);
        const folderId = Math.random().toString(36).substring(2, 9);
        const folderName = parts[parts.length - 2] || "folder";
        
        newFiles.push({
          id: folderId,
          name: folderName,
          type: 'folder',
          parentId: grandParentId
        });
        folderMap.set(parentPath, folderId);
        return folderId;
      };

      for (const path of Array.from(pathSet)) {
        const apkFile = apkProcessor.getFileContent(path);
        if (!apkFile) continue;

        const parentId = getOrCreateFolder(path);
        newFiles.push({
          id: Math.random().toString(36).substring(2, 9),
          name: apkFile.name,
          type: 'file',
          content: apkFile.content,
          parentId: parentId
        });
      }

      if (newFiles.length > 0) {
        setFiles(newFiles);
        const firstFile = newFiles.find(f => f.type === 'file');
        if (firstFile) setActiveFileId(firstFile.id);
        toast.success("File extracted successfully", { id: toastId });
      }
    } catch (err) {
      console.error("Extraction failed", err);
      toast.error("Failed to extract file", { id: toastId });
    }
  };

  const handleExport = async () => {
    const toastId = toast.loading("Building export package...");
    try {
      const blob = await exportToZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "app-forge-export.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", { id: toastId });
    } catch (err) {
      console.error("Export failed", err);
      toast.error("Export failed", { id: toastId });
    }
  };

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const addFile = (parentId: string | null) => {
    const name = window.prompt("Enter file name:");
    if (!name) return;
    const newFile: FileSystemItem = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      type: 'file',
      content: '// New file',
      parentId
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleAddPermission = (permName: string) => {
    if (!apkInfo || !permName.trim()) return;
    if (apkInfo.permissions.some((p) => p.name === permName)) {
      toast.error("الصلاحية موجودة مسبقاً");
      return;
    }
    const newPerm: APKPermission = {
      name: permName,
      isDangerous:
        permName.includes("LOCATION") ||
        permName.includes("CAMERA") ||
        permName.includes("CONTACTS"),
    };
    const updated = { ...apkInfo, permissions: [...apkInfo.permissions, newPerm] };
    setApkInfo(updated);
    // Try to update manifest XML if editable
    const manifest = apkFiles.find((f) => f.path === "AndroidManifest.xml");
    if (
      manifest &&
      typeof manifest.content === "string" &&
      manifest.content.includes("<manifest")
    ) {
      let content = manifest.content as string;
      const permTag = `    <uses-permission android:name="${permName}" />\n`;
      if (content.includes("</manifest>")) {
        content = content.replace("</manifest>", `${permTag}</manifest>`);
        apkProcessor.updateFileContent("AndroidManifest.xml", content);
        setApkFiles(apkProcessor.getAllFiles());
      }
  const deleteItem = (id: string) => {
    if (confirm("Are you sure?")) {
      setFiles(files.filter(f => f.id !== id && f.parentId !== id));
      if (activeFileId === id) setActiveFileId('');
    }
  };

  const handleRemovePermission = (permName: string) => {
    if (!apkInfo) return;
    const updated = {
      ...apkInfo,
      permissions: apkInfo.permissions.filter((p) => p.name !== permName),
    };
    setApkInfo(updated);
    const manifest = apkFiles.find((f) => f.path === "AndroidManifest.xml");
    if (manifest && typeof manifest.content === "string") {
      const content = (manifest.content as string).replace(
        new RegExp(`.*${permName}.*\\n?`, "g"),
        "",
      );
      apkProcessor.updateFileContent("AndroidManifest.xml", content);
      setApkFiles(apkProcessor.getAllFiles());
    }
    toast.success("تمت إزالة الصلاحية");
  };

  const getAPKContext = React.useCallback(
    () =>
      buildAPKContext({
        info: apkInfo,
        certificates,
        categories: categoryStats,
        files: apkFiles,
      }),
    [apkInfo, certificates, categoryStats, apkFiles],
  );

  const downloadFile = React.useCallback(
    (path: string) => {
      const file = apkFiles.find((item) => item.path === path) || apkProcessor.getFileContent(path);
      if (!file) {
        toast.error("تعذر العثور على الملف");
        return;
      }
      const content = file.rawContent || file.content;
      if (typeof content === "string" && content.startsWith("[Persisted]")) {
        toast.error("أعد رفع APK لتنزيل المحتوى الأصلي لهذا الملف");
        return;
      }
      const blob = new Blob([content as BlobPart], {
        type: file.mimeType || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name || path.split("/").pop() || "apk-file";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`تم تنزيل ${anchor.download}`);
    },
    [apkFiles],
  );

  const downloadCertificate = React.useCallback(
    (certPath: string) => {
      downloadFile(certPath);
    },
    [downloadFile],
  );

  const copyText = React.useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error("تعذر النسخ إلى الحافظة");
    }
  }, []);

  const handleRebuild = async () => {
    if (apkFiles.length === 0) {
      toast.error("لا يوجد APK للبناء");
      return;
    }
    const toastId = toast.loading("جاري إعادة بناء APK...");
    try {
      const blob = await apkProcessor.rebuildAPK({ removeSignature: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${apkInfo?.packageName || "app"}-modded-${Date.now()}.apk`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم إعادة البناء وتنزيل APK المُعدّل (غير مُوقّع - يحتاج توقيع)", {
        id: toastId,
      });
    } catch (err: any) {
      toast.error(`فشل البناء: ${err.message}`, { id: toastId });
    }
  const renameItem = (id: string, oldName: string) => {
    const newName = window.prompt("Enter new name:", oldName);
    if (!newName || newName === oldName) return;
    setFiles(files.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFileId) return;
    setFiles(files.map(f => f.id === activeFileId ? { ...f, content: value } : f));
  };

  const runAnalysis = async () => {
    if (!activeFile || activeFile.type !== 'file' || typeof activeFile.content !== 'string') return;
    setIsAnalyzing(true);
    toast.info("Analyzing code...");
    try {
      const result = await analyzeCode({ 
        data: {
          code: activeFile.content, 
          fileName: activeFile.name 
        }
      });
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `${result.summary}\n\nSuggestions:\n${result.suggestions.map(s => `• ${s}`).join('\n')}` 
      }]);
      toast.success("Analysis complete");
    } catch (err) {
      toast.error("Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runMetaAudit = async () => {
    if (!aiSettings.apiKey) {
      toast.error("Please configure AI settings first");
      setShowSettings(true);
      return;
    }

    setIsAnalyzing(true);
    const toastId = toast.loading("Analyzing App-Forge architecture...");
    try {
      const result = await analyzeCode({
        data: { code: activeFile.content, fileName: activeFile.name },
      });
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `**تحليل ${activeFile.name}:**\n${result.summary}\n\n**اقتراحات:**\n${result.suggestions.map((s) => `• ${s}`).join("\n")}`,
        },
      ]);
      toast.success("اكتمل التحليل");
    } catch {
      toast.error("فشل التحليل");
      const auditResult = await auditCodebase(aiSettings);

      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `### 🛠️ App-Forge Meta-Audit\n\n${auditResult}` 
      }]);
      toast.success("Audit complete", { id: toastId });
    } catch (err: any) {

      toast.error(`Audit failed: ${err.message}`, { id: toastId });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMsg = chatInput.trim();
    if (!userMsg) return;
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");

    const appWide = isAppWideQuestion(userMsg);
    if (!apkInfo && appWide) {
      setChatMessages((prev) => [
        ...prev,
        { role: "ai", content: "حمّل APK أولاً حتى أتمكن من تحليل التطبيق كاملاً." },
      ]);
      return;
    }
    if (!appWide && (!activeFile || typeof activeFile.content !== "string")) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "اختر ملفاً نصياً، أو اطرح سؤالاً شاملاً عن التطبيق أو الشهادات أو الصلاحيات.",
        },
      ]);
      return;
    }
    if (aiSettings.provider !== "demo" && !aiSettings.apiKey.trim()) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `أضف مفتاح ${PROVIDERS[aiSettings.provider].label} أو اختر Demo AI الذي يعمل دون مفتاح.`,
        },
      ]);
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");

    if (!activeFile || activeFile.type !== 'file' || typeof activeFile.content !== 'string') {
      setChatMessages(prev => [...prev, { role: 'ai', content: "Please select a text file for the AI to analyze." }]);
      toast.error("Please select a text file for the AI to analyze.");
      return;
    }
    const context = `The user is currently viewing this file: ${activeFile.name}. File Content: \n ${activeFile.content}. Answer their question based strictly on this file.`;
    const prompt = `${context}\n\nUser Question: ${userMessage}`;

    if (!aiSettings.apiKey) {
      setChatMessages(prev => [...prev, { role: 'ai', content: `Please configure your ${aiSettings.provider} API Key in settings first.` }]);
      setShowSettings(true);
      return;
    }

    setIsAnalyzing(true);
    setChatMessages((prev) => [...prev, { role: "ai", content: "جاري التفكير... Thinking..." }]);
    try {
      const apkContext = getAPKContext();
      if (appWide) {
        const answer = await askAboutAPK(aiSettings, userMsg, apkContext);
        setPendingCode(null);
        setChatMessages((prev) => [...prev.slice(0, -1), { role: "ai", content: answer }]);
      } else if (activeFile && typeof activeFile.content === "string") {
        const actionResult = await getCodeAction(
          aiSettings,
          activeFile.content,
          userMsg,
          apkContext,
        );
        const changed = actionResult.modifiedCode !== activeFile.content;
        setPendingCode(changed ? actionResult.modifiedCode : null);
        setOriginalCode(activeFile.content);
        setChatMessages((prev) => [
          ...prev.slice(0, -1),
          {
            role: "ai",
            content: changed
              ? `${actionResult.explanation}\n\nراجع التغييرات في عرض Diff.`
              : actionResult.explanation,
          },
        ]);
        if (changed) {
          setViewMode("diff");
          toast.info("اقترح الذكاء الاصطناعي تغييرات");
        }
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "ai", content: `خطأ: ${err.message}` },
      ]);
    setChatMessages(prev => [...prev, { role: 'ai', content: "Thinking..." }]);
    
    try {
      const currentCode = activeFile.content;
      const actionResult = await getCodeAction(aiSettings, currentCode, prompt);
      
      setPendingCode(actionResult.modifiedCode);
      setOriginalCode(currentCode);
      
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `${actionResult.explanation}\n\nReview changes in Diff View.` 
      }]);
      
      setViewMode('diff');
      toast.info("AI suggested changes. Review them now.");
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', content: `Error: ${err.message}` }]);
      toast.error("AI action failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyChanges = async () => {
    if (pendingCode === null || !activeFileId) return;
    
    const updatedFiles = files.map(f => f.id === activeFileId ? { ...f, content: pendingCode } : f);
    setFiles(updatedFiles);
    
    // Explicit sync to IndexedDB immediately
    try {
      await set(STORAGE_KEY, updatedFiles);
      setPendingCode(null);
      setViewMode('editor');
      toast.success("Changes applied and persisted.");
    } catch (err) {
      console.error("Persistence failed", err);
      toast.error("Changes applied but failed to persist to disk.");
      // Still update UI
      setPendingCode(null);
      setViewMode('editor');
    }
  };

  const discardChanges = () => {
    setPendingCode(null);
    setViewMode('editor');
    toast.info("Changes discarded");
  };

  const renderTree = (parentId: string | null, level = 0) => {
    const filteredFiles = files.filter(f => {
      if (f.parentId !== parentId) return false;
      if (!searchQuery) return true;
      
      // If searching, show if name matches OR if it has children that match
      const nameMatches = f.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (nameMatches) return true;
      
      if (f.type === 'folder') {
        const hasMatchingChild = (fid: string): boolean => {
          return files.some(child => 
            child.parentId === fid && 
            (child.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             (child.type === 'folder' && hasMatchingChild(child.id)))
          );
        };
        return hasMatchingChild(f.id);
      }
      return false;
    });

    return filteredFiles.map(item => (
        <div key={item.id} className="select-none">
          <div 
            className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-slate-800 group ${activeFileId === item.id ? 'bg-slate-800 text-slate-100' : 'text-slate-400'}`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => item.type === 'folder' ? toggleFolder(item.id) : setActiveFileId(item.id)}
          >
            {expandedFolders.has(folder) ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Folder className="h-3.5 w-3.5 text-amber-400" />
            <span className="truncate font-medium">{folder === "root" ? "/" : folder}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{files.length}</span>
          </div>
          {expandedFolders.has(folder) && (
            <div className="ml-2 border-l border-slate-800">
              {files
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((file) => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 pl-6 pr-2 py-1 text-xs cursor-pointer hover:bg-slate-800 group ${
                      activeFilePath === file.path
                        ? "bg-primary/20 text-primary border-r-2 border-primary"
                        : "text-slate-400"
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
            {item.type === 'folder' ? (
              expandedFolders.has(item.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <FileCode className="h-4 w-4 text-primary/70" />
            )}
            <span className="flex-1 truncate">{item.name}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button 
                onClick={(e) => { e.stopPropagation(); renameItem(item.id, item.name); }}
                className="p-1 hover:text-primary"
              >
                <Edit2 className="h-3 w-3" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                className="p-1 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          {item.type === 'folder' && expandedFolders.has(item.id) && renderTree(item.id, level + 1)}
        </div>
      ));
  };

  // Derive language
  const editorLanguage = activeFile ? getFileLanguage(activeFile.name) : "plaintext";
  const isImage = activeFile?.path.match(/\.(png|jpg|jpeg|webp|gif|ico)$/i);
  const isBinaryView =
    activeFile?.type === "binary" ||
    activeFile?.path.endsWith(".dex") ||
    activeFile?.path.endsWith(".so") ||
    activeFile?.path.endsWith(".arsc");

  return (
    <div
      className="flex h-screen w-full bg-[#0a0a0f] text-slate-100 overflow-hidden font-sans dark selection:bg-primary/30"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
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
  const editorContent = activeFile?.content;
  const BINARY_EXTENSIONS = ['.dex', '.so', '.arsc', '.apk', '.zip', '.pdf', '.png', '.jpg', '.pb'];
  const isBinary = activeFile?.type === 'file' && (
    typeof editorContent !== 'string' || 
    BINARY_EXTENSIONS.some(ext => activeFile.name.toLowerCase().endsWith(ext))
  );

  const callBackend = async (endpoint: string, label: string) => {
    setIsBackendLoading(prev => ({ ...prev, [label]: true }));
    try {
      const response = await fetch(`http://localhost:3000/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        toast.success(`${label} successful`);
      } else {
        toast.error(`${label} failed: ${response.statusText}`);
      }
    } catch (err) {
      toast.error(`Local backend not found at http://localhost:3000`);
      console.error(err);
    } finally {
      setIsBackendLoading(prev => ({ ...prev, [label]: false }));
    }
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans dark selection:bg-primary/30">
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
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
              v2
            </Badge>
      
      <aside className="w-64 border-r flex flex-col bg-sidebar/50 backdrop-blur-sm">
        <div className="p-4 border-b flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 font-bold text-lg text-slate-100">
            <Code2 className="h-5 w-5 text-primary" />
            <span>App-Forge</span>
          </div>

          <div className="flex gap-1">
            <label
              className="h-7 w-7 grid place-items-center hover:bg-slate-800 rounded cursor-pointer"
              title="رفع APK"
            >
              <Upload className="h-4 w-4" />
              <input
                type="file"
                accept=".apk,.zip,.xapk"
                className="hidden"
                onChange={handleFileInput}
              />
            </label>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleExport}
              disabled={apkFiles.length === 0}
            >
            <label className="p-1 hover:bg-slate-800 rounded cursor-pointer text-slate-400 hover:text-slate-100" title="Upload APK/ZIP">
              <Upload className="h-4 w-4" />
              <input type="file" accept=".apk,.zip" className="hidden" onChange={handleFileUpload} />
            </label>
            <button onClick={handleExport} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100" title="Export Project">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => addFile(null)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100" title="New File">
              <FilePlus className="h-4 w-4" />
            </button>
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
                  <p className="font-bold text-sm truncate max-w-[180px]">
                    {apkInfo.appName || apkInfo.packageName}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[180px]">
                    {apkInfo.packageName}
                  </p>
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
        <Tabs
          value={leftTab}
          onValueChange={(v) => setLeftTab(v as any)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid grid-cols-3 m-2 bg-slate-800/50 h-8">
            <TabsTrigger
              value="categories"
              className="text-[11px] h-6 data-[state=active]:bg-primary"
            >
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
              {categoryStats.map((stat) => (
                <Badge
                  key={stat.category}
                  variant={activeCategory === stat.category ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] px-2 py-0.5 border ${activeCategory === stat.category ? "" : CATEGORY_META[stat.category].color}`}
                  onClick={() => setActiveCategory(stat.category)}
                >
                  {CATEGORY_META[stat.category].icon} {CATEGORY_META[stat.category].labelAr}{" "}
                  {stat.count}
                </Badge>
              ))}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {categoryStats.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-xs space-y-3">
                    <Package className="h-8 w-8 mx-auto opacity-30" />
                    <p>
                      لا يوجد APK محمل
                      <br />
                      Upload APK to see categories
                    </p>
                    <label className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs cursor-pointer">
                      <Upload className="h-3 w-3" /> رفع APK
                      <input
                        type="file"
                        accept=".apk,.zip"
                        className="hidden"
                        onChange={handleFileInput}
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    {/* Category Cards */}
                    <div className="grid gap-2">
                      {categoryStats.map((stat) => {
                        const meta = CATEGORY_META[stat.category];
                        return (
                          <div
                            key={stat.category}
                            onClick={() => setActiveCategory(stat.category)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                              activeCategory === stat.category
                                ? "bg-primary/10 border-primary/50"
                                : "bg-slate-800/30 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{meta.icon}</span>
                                <div>
                                  <div className="text-xs font-bold flex items-center gap-1">
                                    {meta.labelAr}{" "}
                                    <span className="text-[10px] opacity-60">/ {meta.label}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {meta.description}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold">{stat.count}</div>
                                <div className="text-[10px] text-slate-500">
                                  {formatBytes(stat.totalSize)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 border-t border-slate-800 mt-3">
                      <div className="text-[11px] font-bold text-slate-300 mb-2 px-1">
                        الملفات المفلترة - {filteredFiles.length}
                      </div>
                      <div className="space-y-0.5 max-h-[30vh] overflow-auto">
                        {filteredFiles.slice(0, 50).map((f) => (
                          <div
                            key={f.path}
                            onClick={() => openFile(f.path)}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer hover:bg-slate-800 ${
                              activeFilePath === f.path
                                ? "bg-primary/20 text-primary"
                                : "text-slate-400"
                            }`}
                          >
                            <span>{CATEGORY_META[f.category].icon}</span>
                            <span className="truncate flex-1">{f.path}</span>
                          </div>
                        ))}
                        {filteredFiles.length > 50 && (
                          <div className="text-[10px] text-slate-500 px-2 py-1">
                            و {filteredFiles.length - 50} ملف آخر...
                          </div>
                        )}
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
                  <p>
                    لا توجد شهادات
                    <br />
                    No certificates found
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {certificates.map((cert) => (
                    <Card key={cert.path} className="bg-slate-800/30 border-slate-800">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold flex items-center gap-1 min-w-0">
                            <Lock className="h-3 w-3 shrink-0" />{" "}
                            <span className="truncate">{cert.fileName}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge
                              variant={cert.isDebug ? "destructive" : "secondary"}
                              className="text-[9px]"
                            >
                              {cert.type} {cert.isDebug ? "DEBUG" : "RELEASE / UNKNOWN"}
                            </Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="تنزيل الشهادة"
                              onClick={() => downloadCertificate(cert.path)}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-[10px] space-y-1 text-slate-400">
                          <div className="break-all">المسار: {cert.path}</div>
                          <div>الحجم: {formatBytes(cert.size)}</div>
                          {cert.issuer && <div className="break-all">المُصدر: {cert.issuer}</div>}
                          {cert.subject && <div className="break-all">المالك: {cert.subject}</div>}
                          {cert.fingerprintSHA256 && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-300">SHA-256</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1.5 text-[9px]"
                                  onClick={() => copyText(cert.fingerprintSHA256 || "", "SHA-256")}
                                >
                                  نسخ
                                </Button>
                              </div>
                              <div className="break-all p-1.5 bg-slate-900 rounded font-mono text-[9px] select-all">
                                {cert.fingerprintSHA256}
                              </div>
                            </div>
                          )}
                          <div className="rounded bg-slate-950 p-1.5 font-mono text-[9px] break-all select-all">
                            keytool -printcert -file {cert.fileName}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="p-3 text-[11px] text-amber-300/80">
                      <div className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          سيتم إزالة التوقيع القديم عند إعادة البناء. ستحتاج لتوقيع جديد بـ
                          apksigner.
                        </span>
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
          {apkFiles.length > 0
            ? `${apkFiles.length} ملف | ${categoryStats.length} تصنيف`
            : "في انتظار APK"}
        </div>
      </aside>

      {/* CENTER */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0f1117]">
        {/* Top bar */}
        <header className="h-11 border-b border-slate-800 flex items-center justify-between px-3 bg-[#0f0f14] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Open tabs */}
            <div className="flex items-center gap-1 overflow-auto max-w-[60vw] scrollbar-none">
              {openTabs.map((path) => {
                const file = apkFiles.find((f) => f.path === path);
                return (
                  <div
                    key={path}
                    onClick={() => setActiveFilePath(path)}
                    className={`group flex items-center gap-1.5 px-3 py-1 rounded-md text-xs cursor-pointer border whitespace-nowrap shrink-0 ${
                      activeFilePath === path
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="truncate max-w-[120px]">
                      {file?.name || path.split("/").pop()}
                    </span>
                    <X
                      className="h-3 w-3 opacity-60 hover:opacity-100"
                      onClick={(e) => closeTab(path, e)}
                    />
                  </div>
                );
              })}
              {openTabs.length === 0 && (
                <span className="text-xs text-slate-500">لا يوجد ملف مفتوح</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {activeFile && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={() => setViewMode(viewMode === "editor" ? "diff" : "editor")}
                >
                  <Split className="h-3 w-3 mr-1" />
                  {viewMode === "editor" ? "Diff" : "Editor"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={runAnalysis}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Play className="h-3 w-3 mr-1" />
                  )}
                  تحليل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={() => downloadFile(activeFile.path)}
                  title="تنزيل الملف الحالي"
                >
                  <Download className="h-3 w-3 mr-1" /> تنزيل
                </Button>
              </>
            )}
            <Button
              size="sm"
              className="h-7 text-[11px] bg-primary"
              onClick={handleRebuild}
              disabled={apkFiles.length === 0}
            >
              <Wrench className="h-3 w-3 mr-1" />
              بناء APK
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setShowSetup(true)}
              title="Setup"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setShowSettings(true)}
            >
              <Key className="h-3.5 w-3.5" />
        <div className="px-4 py-2 border-b bg-slate-900/50">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              className="pl-8 h-9 bg-slate-800 border-slate-700 focus-visible:ring-primary/50 text-slate-100"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1 bg-slate-900/30">
          <div className="py-2">{renderTree(null)}</div>
        </ScrollArea>
        <div className="p-4 border-t bg-slate-800/50 text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Terminal className="h-3 w-3" />
          <span>Workspace Active</span>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b flex items-center justify-between px-4 bg-muted/20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-sm font-mono text-muted-foreground">
              {activeFile ? activeFile.name : 'No file selected'}
            </div>
            <div className="h-4 w-[1px] bg-border mx-2" />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => callBackend('decompile', 'Decompile')}
                disabled={isBackendLoading['Decompile']}
                className="h-8 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              >
                {isBackendLoading['Decompile'] ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
                Decompile APK
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => callBackend('build', 'Build')}
                disabled={isBackendLoading['Build']}
                className="h-8 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              >
                {isBackendLoading['Build'] ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
                Rebuild & Sign APK
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setViewMode(viewMode === 'editor' ? 'diff' : 'editor')}
              className="h-8 px-3 border-muted bg-muted/20 text-foreground hover:bg-muted/40"
            >
              {viewMode === 'editor' ? <Split className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {viewMode === 'editor' ? 'Diff' : 'Editor'}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowSetup(true)}
              className="h-8 px-3 text-xs border-muted bg-muted/20 text-foreground hover:bg-muted/40"
            >
              <Wrench className="mr-2 h-4 w-4" />
              Setup
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={runMetaAudit}
              disabled={isAnalyzing || isBinary}
              className="h-8 px-3 text-xs border-muted bg-muted/20 text-foreground hover:bg-muted/40"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Audit Source
            </Button>
            <Button 
              size="sm" 
              onClick={runAnalysis}
              disabled={isAnalyzing || !activeFile || isBinary}
              className="h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Analyze
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>

        {/* Center sub tabs for file types */}
        {activeFile && (
          <div className="h-9 border-b border-slate-800 bg-slate-900/30 flex items-center px-2 gap-2 shrink-0">
            <Tabs
              value={centerTab}
              onValueChange={(v) => setCenterTab(v as any)}
              className="h-full"
            >
              <TabsList className="h-7 bg-transparent gap-1">
                <TabsTrigger
                  value="code"
                  className="h-6 text-[11px] data-[state=active]:bg-slate-800"
                >
                  <Code2 className="h-3 w-3 mr-1" /> الكود
                </TabsTrigger>
                {activeFilePath === "AndroidManifest.xml" && (
                  <TabsTrigger
                    value="visual"
                    className="h-6 text-[11px] data-[state=active]:bg-slate-800"
                  >
                    <Eye className="h-3 w-3 mr-1" /> مرئي Visual
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="preview"
                  className="h-6 text-[11px] data-[state=active]:bg-slate-800"
                >
                  <ImageIcon className="h-3 w-3 mr-1" /> معاينة
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="ml-auto text-[10px] text-slate-500 flex items-center gap-2">
              <span>{formatBytes(activeFile.size)}</span>
              <Badge variant="outline" className="text-[9px]">
                {activeFile.category}
              </Badge>
              {activeFile.editable ? (
                <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/20">
                  قابل للتعديل
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[9px]">
                  للقراءة فقط
                </Badge>
              )}
            </div>
          </div>
        </header>

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
                    <p className="text-slate-400 text-sm">
                      قم بتحميل أي تطبيق أندرويد لتعديله. سيتم فرز الملفات حسب الشهادات، الإعدادات،
                      الموارد، والشيفرة تلقائياً.
                    </p>
                  </div>
                  <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-700 rounded-2xl p-8 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all">
                    <Upload className="h-8 w-8 text-slate-400" />
                    <span className="text-sm font-semibold">اسحب APK هنا أو اضغط للرفع</span>
                    <span className="text-[11px] text-slate-500">
                      يدعم .apk .zip .xapk - معالجة محلية 100%
                    </span>
                    <input
                      type="file"
                      accept=".apk,.zip,.xapk"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    {[
                      { icon: "🔐", t: "إدارة الشهادات", d: "عرض وفهم توقيعات META-INF" },
                      { icon: "📱", t: "محرر البيان", d: "تعديل package, version, صلاحيات" },
                      { icon: "🎨", t: "الموارد", d: "صور، layouts, strings" },
                      { icon: "💻", t: "الشيفرة", d: "DEX, Smali تحليل" },
                    ].map((f, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-left"
                      >
                        <div className="text-lg">{f.icon}</div>
                        <div className="text-xs font-bold mt-1">{f.t}</div>
                        <div className="text-[11px] text-slate-500">{f.d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 text-sm">
                  اختر ملفاً من الجانب الأيسر لبدء التعديل
                </div>
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
                        <Input
                          value={manifestEdit.packageName}
                          onChange={(e) =>
                            setManifestEdit((s) => ({ ...s, packageName: e.target.value }))
                          }
                          className="bg-slate-900 border-slate-700 text-sm"
                        />
                        <p className="text-[10px] text-slate-500">مثال: com.example.app</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">اسم التطبيق (اختياري)</Label>
                        <Input
                          value={apkInfo?.appName || ""}
                          onChange={(e) =>
                            setApkInfo((prev) =>
                              prev ? { ...prev, appName: e.target.value } : prev,
                            )
                          }
                          className="bg-slate-900 border-slate-700 text-sm"
                          placeholder="My App"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">رقم الإصدار Version Name</Label>
                        <Input
                          value={manifestEdit.versionName}
                          onChange={(e) =>
                            setManifestEdit((s) => ({ ...s, versionName: e.target.value }))
                          }
                          className="bg-slate-900 border-slate-700 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">كود الإصدار Version Code</Label>
                        <Input
                          value={manifestEdit.versionCode}
                          onChange={(e) =>
                            setManifestEdit((s) => ({ ...s, versionCode: e.target.value }))
                          }
                          className="bg-slate-900 border-slate-700 text-sm"
                          type="number"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Min SDK</Label>
                        <Input
                          value={apkInfo?.minSdk || ""}
                          onChange={(e) =>
                            setApkInfo((prev) =>
                              prev ? { ...prev, minSdk: e.target.value } : prev,
                            )
                          }
                          className="bg-slate-900 border-slate-700 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Target SDK</Label>
                        <Input
                          value={apkInfo?.targetSdk || ""}
                          onChange={(e) =>
                            setApkInfo((prev) =>
                              prev ? { ...prev, targetSdk: e.target.value } : prev,
                            )
                          }
                          className="bg-slate-900 border-slate-700 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveManifest} className="h-8">
                        <Save className="h-3.5 w-3.5 mr-1" /> حفظ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCenterTab("code")}
                        className="h-8"
                      >
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
                    <span>
                      إذا كان AndroidManifest.xml في صيغة ثنائية binary، تحتاج إلى فك تشفير عبر
                      apktool في الواجهة الخلفية. النسخة النصية الحالية قابلة للتعديل مباشرة إذا
                      كانت decompiled مسبقاً.
                    </span>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          ) : centerTab === "preview" ? (
            <div className="h-full flex items-center justify-center p-6 bg-[#0a0a0f] overflow-auto">
              {isImage && activeFile.rawContent ? (
                <div className="space-y-4 text-center">
                  <img
                    src={URL.createObjectURL(new Blob([Uint8Array.from(activeFile.rawContent)]))}
                    alt={activeFile.name}
                    className="max-w-full max-h-[60vh] mx-auto rounded-xl border border-slate-800 shadow-2xl"
                  />
                  <div className="text-xs text-slate-400">
                    {activeFile.name} • {formatBytes(activeFile.size)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 whitespace-pre-wrap font-mono max-w-3xl mx-auto p-6 bg-slate-900/50 rounded-xl border border-slate-800 overflow-auto max-h-[80vh]">
                  {typeof activeFile.content === "string"
                    ? activeFile.content
                    : "[Binary preview not available]"}
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
              modified={
                pendingCode || (typeof activeFile.content === "string" ? activeFile.content : "")
              }
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
              <Button
                size="sm"
                variant="ghost"
                onClick={discardChanges}
                className="rounded-full h-7 px-4"
              >
                <X className="h-3.5 w-3.5 mr-1" /> إلغاء
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR */}
      <aside className="w-[340px] border-l border-slate-800 flex flex-col bg-[#0f0f14]">
        <Tabs
          value={rightTab}
          onValueChange={(v) => setRightTab(v as any)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid grid-cols-3 m-2 bg-slate-800/50 h-8">
            <TabsTrigger value="info" className="text-[11px] h-6">
              <Info className="h-3 w-3 mr-1" /> معلومات
            </TabsTrigger>
            <TabsTrigger value="perms" className="text-[11px] h-6">
              <ShieldAlert className="h-3 w-3 mr-1" /> صلاحيات
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-[11px] h-6">
              <MessageSquare className="h-3 w-3 mr-1" /> مساعد
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
                      <div className="flex justify-between">
                        <span className="text-slate-400">الحزمة</span>
                        <span className="font-mono truncate max-w-[140px]">
                          {apkInfo.packageName}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">الإصدار</span>
                        <span>
                          {apkInfo.versionName} ({apkInfo.versionCode})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Min SDK</span>
                        <span>{apkInfo.minSdk}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target</span>
                        <span>{apkInfo.targetSdk}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">DEX</span>
                        <span>{apkInfo.dexCount} ملف</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Native</span>
                        <span>
                          {apkInfo.hasNativeLibs ? "نعم" : "لا"} {apkInfo.architectures.join(", ")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">قابل للتعديل</span>
                        <span>{apkInfo.debuggable ? "Debuggable" : "مُنتج"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800/30 border-slate-800">
                    <CardHeader className="p-3 pb-2">
                      <CardTitle className="text-xs">التصنيفات - Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-1.5">
                      {categoryStats.map((s) => (
                        <div
                          key={s.category}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="flex items-center gap-1.5">
                            {CATEGORY_META[s.category].icon} {CATEGORY_META[s.category].labelAr}
                          </span>
                          <span className="text-slate-400">
                            {s.count} • {formatBytes(s.totalSize)}
                          </span>
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
                        <div className="font-bold mb-1">
                          Activities ({apkInfo.activities.length})
                        </div>
                        <div className="space-y-0.5 text-slate-400">
                          {apkInfo.activities.slice(0, 5).map((a) => (
                            <div key={a.name} className="truncate">
                              • {a.name}
                            </div>
                          ))}
                          {apkInfo.activities.length > 5 && (
                            <div className="text-[10px]">
                              + {apkInfo.activities.length - 5} المزيد
                            </div>
                          )}
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
                          <Badge variant="outline" className="text-[10px]">
                            {formatBytes(activeFile.size)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {activeFile.category}
                          </Badge>
                        </div>
                        <div className="text-slate-400">
                          {activeFile.editable ? "قابل للتعديل" : "قراءة فقط - Binary"}
                        </div>
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
                <Input
                  id="new-perm"
                  placeholder="android.permission.CAMERA"
                  className="h-8 text-xs bg-slate-900 border-slate-700"
                />
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
        <div className="flex-1 relative bg-[#1e1e1e]">
          {activeFile ? (
            isBinary ? (
              <div className="flex-1 flex items-center justify-center bg-background/50 backdrop-blur-sm p-8 text-center h-full">
                <div className="max-w-md space-y-4">
                  <ShieldCheck className="h-12 w-12 text-warning mx-auto" />
                  <h3 className="text-xl font-bold text-foreground">Decompilation Required</h3>
                  <p className="text-muted-foreground">
                    Cannot AI-edit raw binary or Dalvik executable files directly in the browser. 
                    Please use a backend decompilation tool (like Apktool/JADX) to extract Smali/Java source first.
                  </p>
                </div>
              </div>
            ) : viewMode === 'editor' ? (
              <Editor
                height="100%"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={(editorContent as string) || ""}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
                  automaticLayout: true,
                }}
              />
            ) : (
              <DiffEditor
                height="100%"
                original={originalCode}
                modified={pendingCode || (editorContent as string) || ""}
                language="typescript"
                theme="vs-dark"
                options={{
                  renderSideBySide: true,
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
                  automaticLayout: true,
                  minimap: { enabled: false },
                }}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground italic">
              Select a file to begin
            </div>
          )}
        </div>

        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle>Forge AI Settings</DialogTitle>
              <DialogDescription className="text-slate-400">
                Configure your preferred AI provider and API keys.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>AI Provider</Label>
                <Select 
                  value={aiSettings.provider} 
                  onValueChange={(v: AIProvider) => setAiSettings({...aiSettings, provider: v})}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="groq">Groq (Llama 3)</SelectItem>
                    <SelectItem value="siliconflow">SiliconFlow (Qwen/DeepSeek)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  "android.permission.INTERNET",
                  "android.permission.CAMERA",
                  "android.permission.ACCESS_FINE_LOCATION",
                  "android.permission.READ_CONTACTS",
                ].map((p) => (
                  <Badge
                    key={p}
                    variant="outline"
                    className="text-[9px] cursor-pointer hover:bg-slate-800"
                    onClick={() => handleAddPermission(p)}
                  >
                    + {p.split(".").pop()}
                  </Badge>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1 p-2">
              {!apkInfo ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  حمّل APK لعرض الصلاحيات
                </div>
              ) : (
                <div className="space-y-1.5">
                  {apkInfo.permissions.length === 0 && (
                    <div className="text-xs text-slate-500 text-center py-4">لا توجد صلاحيات</div>
                  )}
                  {apkInfo.permissions.map((perm) => (
                    <div
                      key={perm.name}
                      className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 ${perm.isDangerous ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/30 border-slate-800"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-mono truncate flex items-center gap-1">
                          {perm.isDangerous && (
                            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                          )}
                          {perm.name}
                        </div>
                        {perm.isDangerous && (
                          <div className="text-[10px] text-amber-400/80 mt-0.5">
                            صلاحية خطرة - Dangerous
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleRemovePermission(perm.name)}
                      >
                        <Trash2 className="h-3 w-3" />
              <div className="grid gap-2">
                <Label htmlFor="api-key" className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Key className="h-4 w-4" /> API Key</div>
                  <a 
                    href={PROVIDER_LINKS[aiSettings.provider]} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    Get Key
                  </a>
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={`Enter ${aiSettings.provider} API key...`}
                  value={aiSettings.apiKey}
                  onChange={(e) => setAiSettings({...aiSettings, apiKey: e.target.value})}
                  className="bg-slate-800 border-slate-700 text-slate-100 focus-visible:ring-primary/50"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => saveAiSettings(aiSettings)}>Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      <aside className="w-80 border-l flex flex-col bg-sidebar/50 backdrop-blur-sm">
        <header className="h-12 border-b flex items-center px-4 bg-muted/20 shrink-0">
          <MessageSquare className="h-4 w-4 mr-2 text-primary" />
          <span className="text-sm font-semibold text-slate-100">AI Assistant</span>
        </header>
        
        <ScrollArea className="flex-1 p-4 bg-slate-900/50">
          <div className="space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-100 shadow-md'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  {msg.role === 'ai' && pendingCode && i === chatMessages.length - 1 && (
                    <div className="flex gap-2 mt-3 pt-2 border-t">
                      <Button size="sm" onClick={applyChanges} className="h-7 text-[10px]">
                        <Check className="h-3 w-3 mr-1" /> Apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={discardChanges} className="h-7 text-[10px]">
                        <X className="h-3 w-3 mr-1" /> Discard
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            <div className="p-2 border-t border-slate-800 bg-slate-900/30">
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />{" "}
                {apkInfo?.permissions.filter((p) => p.isDangerous).length || 0} خطرة من أصل{" "}
                {apkInfo?.permissions.length || 0}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="flex-1 mt-0 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 p-3 bg-[#0a0a0f]">
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-white rounded-br-sm" : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-sm"}`}
                    >
                      {msg.content}
                      {msg.role === "ai" && pendingCode && i === chatMessages.length - 1 && (
                        <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-700">
                          <Button
                            size="sm"
                            onClick={applyChanges}
                            className="h-6 text-[10px] rounded-full"
                          >
                            <Check className="h-3 w-3 mr-1" /> تطبيق
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={discardChanges}
                            className="h-6 text-[10px] rounded-full"
                          >
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

            <form
              onSubmit={sendChatMessage}
              className="p-2 border-t border-slate-800 bg-[#0f0f14] flex gap-2"
            >
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="اسأل عن الملف أو اطلب تعديل... / Ask AI"
                className="h-9 bg-slate-900 border-slate-700 text-xs flex-1"
              />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>

            <div className="p-2 border-t border-slate-800 grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => setChatInput("حلل التطبيق كاملاً وحدد أهم المخاطر والتحسينات")}
              >
                تحليل شامل
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => setChatInput("حلل الشهادات والتوقيع وهل هي Debug أم Release")}
              >
                الشهادات
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() =>
                  setChatInput("أين توجد مكتبات الإعلانات مثل AdMob وكيف أراجعها بأمان؟")
                }
              >
                الإعلانات
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => setChatInput("اشرح لي هذا الملف واقترح تحسينات آمنة")}
              >
                الملف الحالي
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </aside>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[440px] bg-[#0f0f14] border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" /> إعدادات الذكاء الاصطناعي
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              اختر المزود وأدخل المفتاح لاستخدام المساعد الذكي
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs">المزود Provider</Label>
              <Select
                value={aiSettings.provider}
                onValueChange={(v: AIProvider) => setAiSettings({ ...aiSettings, provider: v })}
              >
                <SelectTrigger className="bg-slate-900 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                  {(Object.values(PROVIDERS) as Array<(typeof PROVIDERS)[AIProvider]>).map(
                    (provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.icon} {provider.labelAr}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3 text-[11px] space-y-1">
                <div className="font-bold text-slate-200">
                  {PROVIDERS[aiSettings.provider].icon} {PROVIDERS[aiSettings.provider].label}
                </div>
                <div className="text-slate-400">{PROVIDERS[aiSettings.provider].description}</div>
                <div className="text-emerald-400">{PROVIDERS[aiSettings.provider].freeQuota}</div>
              </CardContent>
            </Card>
            {aiSettings.provider !== "demo" ? (
              <div className="grid gap-2">
                <Label className="text-xs flex justify-between">
                  <span>API Key</span>
                  <a
                    href={PROVIDER_LINKS[aiSettings.provider]}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-[10px] hover:underline"
                  >
                    احصل على المفتاح
                  </a>
                </Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={`${aiSettings.provider} api key`}
                  value={aiSettings.apiKey}
                  onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                  className="bg-slate-900 border-slate-700"
                />
                <p className="text-[10px] text-slate-500">
                  المفتاح يُخزن محلياً في هذا المتصفح، ويُرسل مباشرة إلى مزود AI المختار عند
                  الاستخدام.
                </p>
              </div>
            ) : (
              <Card className="bg-emerald-500/5 border-emerald-500/20">
                <CardContent className="p-3 text-[11px] text-emerald-300">
                  Demo AI لا يحتاج مفتاحاً ولا يرسل ملفات APK إلى خدمة خارجية.
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                localStorage.setItem("APPFORGE_AI_SETTINGS", JSON.stringify(aiSettings));
                setShowSettings(false);
                toast.success("تم الحفظ");
              }}
            >
              حفظ
            </Button>
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
            ))}
          </div>
        </ScrollArea>

        <form onSubmit={sendChatMessage} className="p-4 border-t bg-slate-800/80 backdrop-blur-sm">
          <div className="relative">
            <Input 
              placeholder="Ask AI about this file..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="pr-10 bg-slate-900 border-slate-700 focus-visible:ring-primary/50 text-slate-100"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:text-primary">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
