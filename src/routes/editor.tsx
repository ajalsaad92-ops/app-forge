import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { get, set } from "idb-keyval";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  FileCode,
  MessageSquare,
  Send,
  Check,
  X,
  Upload,
  Wrench,
  Package,
  ShieldCheck,
  ShieldAlert,
  Info,
  Settings,
  Wand2,
  Search,
  Loader2,
  HelpCircle,
  Zap,
  ExternalLink,
  Sparkles,
  Laptop,
  Cloud,
  PlugZap,
  Plus,
  RefreshCw,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getCodeAction,
  askAboutAPK,
  buildAPKContext,
  isAppWideQuestion,
  analyzeProject,
  testAIConnection,
  providersByTier,
  type AIProvider,
  type AISettings,
  type AITestResult,
  PROVIDERS,
} from "@/lib/ai-service";
import {
  apkProcessor,
  type APKFile,
  type APKInfo,
  type CertificateInfo,
  type CategoryStats,
  type APKCategory,
  CATEGORY_META,
  getFileLanguage,
} from "@/lib/apk-processor";
import {
  bridgeHealth,
  bridgeUpload,
  bridgeReadFile,
  bridgeWriteFile,
  bridgeBuild,
  bridgeDownloadUrl,
  bridgeListMods,
  bridgeDetectMod,
  bridgeApplyMod,
  bridgeDump,
  getStoredMode,
  setStoredMode,
  getBridgeBase,
  isOnboarded,
  type EditMode,
  type BridgeFileEntry,
  type BridgeMod,
  type ModMatch,
} from "@/lib/bridge-client";
import { Onboarding } from "@/components/Onboarding";
import { ConnectionSettings } from "@/components/ConnectionSettings";
import {
  Dialog,
  DialogContent,
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
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/editor")({
  component: () => (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppForgeEditor />
    </ErrorBoundary>
  ),
});

const APK_META_KEY = "APPFORGE_APK_META";

// Map a decompiled path to the same categories the UI already understands.
function bridgeCategory(p: string): APKCategory {
  if (p === "AndroidManifest.xml") return "manifest";
  if (p.startsWith("smali") || p.endsWith(".dex") || p.startsWith("kotlin/")) return "code";
  if (p.startsWith("res/") || p.startsWith("assets/")) return "resources";
  if (p.startsWith("lib/")) return "native";
  if (p.endsWith(".json") || p.endsWith(".properties") || p.endsWith(".yml") || p.endsWith(".xml"))
    return "config";
  if (p.startsWith("META-INF/") || p.endsWith(".RSA") || p.endsWith(".DSA") || p.endsWith(".SF"))
    return "security";
  return "other";
}

function bridgeToAPKFile(entry: BridgeFileEntry): APKFile {
  return {
    name: entry.path.split("/").pop() || entry.path,
    path: entry.path,
    content: "",
    type: entry.editable ? "text" : "binary",
    category: bridgeCategory(entry.path),
    size: entry.size || 0,
    editable: !!entry.editable,
  };
}

function AppForgeEditor() {
  const [searchQuery, setSearchQuery] = React.useState("");

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
  const [bridgeOnline, setBridgeOnline] = React.useState(false);
  const [editMode, setEditMode] = React.useState<EditMode>("local");
  const [showConn, setShowConn] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [built, setBuilt] = React.useState(false);
  const [leftTab, setLeftTab] = React.useState<"categories" | "files" | "certs">("categories");
  const [centerTab, setCenterTab] = React.useState<"code" | "visual" | "preview">("code");
  const [rightTab, setRightTab] = React.useState<"info" | "perms" | "ai">("info");
  const [viewMode, setViewMode] = React.useState<"editor" | "diff">("editor");
  const [showSettings, setShowSettings] = React.useState(false);
  const [showSetup, setShowSetup] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  // AI & Chat State
  const [aiProvider, setAiProvider] = React.useState<AIProvider>("gemini");
  const [aiKeys, setAiKeys] = React.useState<Partial<Record<AIProvider, string>>>({});
  const [chatMessages, setChatMessages] = React.useState<
    { role: "user" | "ai"; content: string }[]
  >([
    {
      role: "ai",
      content:
        "مرحباً! 👋 أنا مساعد APP-FORGE الذكي.\n\nيمكنك:\n• سؤالي عن أي ملف في الـ APK\n• طلب تعديل كود (سأعرض الفرق قبل التطبيق)\n• أو الضغط على «تحليل شامل» لفحص المشروع كاملًا\n\nارفع ملف APK للبدء.",
    },
  ]);
  const [chatInput, setChatInput] = React.useState("");
  const [originalCode, setOriginalCode] = React.useState<string>("");
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const [showHelp, setShowHelp] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<AITestResult | null>(null);

  // Resolve the currently active AI settings from the per-provider key map.
  const resolveAISettings = (): AISettings => ({
    provider: aiProvider,
    apiKey: aiKeys[aiProvider] || "",
  });

  // True when the current session is decompiled on the bridge (real smali/manifest),
  // so edits and builds are routed through the bridge rather than in-browser JSZip.
  const bridgeSession = React.useRef(false);

  // Mods (Toolbox) state
  interface ModEntry {
    detected?: ModMatch[] | null;
    changed?: string[] | null;
    busy?: boolean;
    error?: string | null;
  }
  const [showMods, setShowMods] = React.useState(false);
  const [mods, setMods] = React.useState<BridgeMod[]>([]);
  const [modState, setModState] = React.useState<Record<string, ModEntry>>({});

  // Load client-only state after mount (avoids SSR hydration mismatches).
  React.useEffect(() => {
    const m = getStoredMode();
    setEditMode(m);
    if (!isOnboarded()) setShowOnboarding(true);
  }, []);

  // Initialization
  React.useEffect(() => {
    const init = async () => {
      const savedSettings = localStorage.getItem("APPFORGE_AI_SETTINGS");
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed && typeof parsed === "object") {
            setAiProvider((parsed.provider as AIProvider) || "gemini");
            if (parsed.keys && typeof parsed.keys === "object") {
              setAiKeys(parsed.keys);
            } else if (typeof parsed.apiKey === "string" && parsed.apiKey) {
              // migrate old single-key format
              setAiKeys({ [parsed.provider as AIProvider]: parsed.apiKey });
            }
          }
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
            setApkFiles(
              storedMeta.files.map((f) => ({
                ...f,
                content: f.content || `[Persisted] ${f.path}`,
              })),
            );
          }
        }
      } catch (err) {
        console.error("Failed to load from IndexedDB", err);
      }
    };
    init();
  }, []);

  // Detect the active bridge (local or cloud) decompile/rebuild/sign engine.
  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const online = await bridgeHealth(editMode);
      if (!cancelled) setBridgeOnline(online);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [editMode]);

  const switchMode = (m: EditMode) => {
    setEditMode(m);
    setStoredMode(m);
    // A mode change means a different bridge — drop the in-memory project.
    setApkFiles([]);
    setApkInfo(null);
    setActiveFilePath("");
    setOpenTabs([]);
    setCertificates([]);
    bridgeSession.current = false;
  };

  // Derived State
  const activeFile = React.useMemo(() => {
    if (activeFilePath) return apkFiles.find((f) => f.path === activeFilePath);
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
    if (
      !file.name.endsWith(".apk") &&
      !file.name.endsWith(".zip") &&
      !file.name.endsWith(".xapk")
    ) {
      toast.error("الرجاء رفع ملف APK صالح");
      return;
    }
    setIsLoading(true);
    const toastId = toast.loading(`جاري تحليل ${file.name}...`);
    try {
      // Prefer the local bridge: it gives real smali, a parsed AndroidManifest,
      // and a signed, installable rebuild.
      if (bridgeOnline) {
        const result = await bridgeUpload(file);
        const fileEntries = result.files.filter((f) => f.type === "file");
        setApkFiles(fileEntries.map(bridgeToAPKFile));
        setCertificates([]);
        const categories: APKCategory[] = [
          "manifest",
          "code",
          "resources",
          "native",
          "config",
          "security",
          "other",
        ];
        setCategoryStats(
          categories
            .map((cat) => {
              const catFiles = fileEntries.filter((f) => bridgeCategory(f.path) === cat);
              return {
                category: cat,
                count: catFiles.length,
                totalSize: catFiles.reduce((a, f) => a + (f.size || 0), 0),
              };
            })
            .filter((s) => s.count > 0),
        );

        const m = result.manifest;
        setApkInfo({
          packageName: m?.packageName || file.name.replace(".apk", ""),
          versionName: m?.versionName || "?",
          versionCode: m?.versionCode || "?",
          minSdk: m?.minSdk || "?",
          targetSdk: m?.targetSdk || "?",
          appName: m?.appName || file.name.replace(".apk", ""),
          debuggable: m?.debuggable || false,
          dexCount: fileEntries.filter((f) => f.path.endsWith(".dex")).length,
          hasNativeLibs: fileEntries.some((f) => f.path.startsWith("lib/")),
          architectures: [],
          activities: m?.activities || [],
          services: m?.services || [],
          receivers: m?.receivers || [],
          providers: m?.providers || [],
          permissions: m?.permissions || [],
        });

        bridgeSession.current = true;
        const manifestPath = "AndroidManifest.xml";
        setActiveFilePath(manifestPath);
        setOpenTabs([manifestPath]);
        toast.success("تم فك التطبيق عبر الجسر المحلي (Smali حقيقي)", { id: toastId });
        setLeftTab("categories");
        setIsLoading(false);
        return;
      }

      // Fallback: in-browser JSZip (fast, but no real decompile/sign).
      const result = await apkProcessor.loadAPK(file);
      bridgeSession.current = false;
      setApkFiles(apkProcessor.getAllFiles());
      setApkInfo(result.info);
      setCertificates(result.certificates);
      setCategoryStats(result.stats);

      const manifest =
        result.files.find((p) => p === "AndroidManifest.xml") || result.files[0] || "";
      if (manifest) {
        setActiveFilePath(manifest);
        setOpenTabs([manifest]);
      }

      await set(APK_META_KEY, {
        info: result.info,
        certs: result.certificates,
        stats: result.stats,
        files: apkProcessor.getAllFiles().map((f) => ({
          ...f,
          rawContent: undefined,
          content: typeof f.content === "string" ? f.content.slice(0, 5000) : undefined,
        })),
      });

      toast.success("تم التحليل بنجاح (داخل المتصفح)", { id: toastId });
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

  const openFile = async (path: string) => {
    setActiveFilePath(path);
    if (!openTabs.includes(path)) {
      setOpenTabs((prev) => [...prev, path].slice(-10));
    }
    if (path === "AndroidManifest.xml") setCenterTab("visual");
    else if (path.match(/\.(png|jpg|jpeg|webp|gif)$/i)) setCenterTab("preview");
    else setCenterTab("code");

    // Lazy-load text content from the bridge on first open.
    if (bridgeSession.current) {
      const file = apkFiles.find((f) => f.path === path);
      if (file && file.editable && typeof file.content === "string" && file.content === "") {
        try {
          const content = await bridgeReadFile(path);
          setApkFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
        } catch {
          toast.error(`تعذّر قراءة الملف: ${path}`);
        }
      }
    }
  };

  const closeTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newTabs = openTabs.filter((p) => p !== path);
    setOpenTabs(newTabs);
    if (activeFilePath === path) {
      setActiveFilePath(newTabs[newTabs.length - 1] || "");
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFilePath) return;
    const content = value || "";
    if (bridgeSession.current) {
      setApkFiles((prev) => prev.map((f) => (f.path === activeFilePath ? { ...f, content } : f)));
      // Persist to the bridge (debounced) so the rebuild picks up the edit.
      clearTimeout((handleEditorChange as any)._t);
      (handleEditorChange as any)._t = setTimeout(() => {
        bridgeWriteFile(activeFilePath, content).catch(() =>
          toast.error("فشل حفظ الملف على الجسر المحلي"),
        );
      }, 600);
      return;
    }
    apkProcessor.updateFileContent(activeFilePath, content);
    setApkFiles((prev) => prev.map((f) => (f.path === activeFilePath ? { ...f, content } : f)));
  };

  const handleRebuild = async () => {
    if (apkFiles.length === 0) return;
    const toastId = toast.loading("جاري إعادة بناء APK...");
    try {
      if (bridgeSession.current) {
        // Rebuild + zipalign + sign on the bridge => installable APK.
        const { fileName } = await bridgeBuild();
        const a = document.createElement("a");
        a.href = bridgeDownloadUrl();
        a.download = fileName;
        a.click();
        setBuilt(true);
        toast.success("تم البناء والتوقيع والتنزيل APK قابل للتثبيت", { id: toastId });
        return;
      }
      // In-browser fallback (unsigned — will NOT install).
      const blob = await apkProcessor.rebuildAPK({ removeSignature: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${apkInfo?.packageName || "app"}-modded.apk`;
      a.click();
      URL.revokeObjectURL(url);
      setBuilt(true);
      toast.success("تم التنزيل (غير موقّع — فعّل الجسر المحلي لتوقيعه)", { id: toastId });
    } catch (err: any) {
      toast.error(`فشل البناء: ${err.message}`, { id: toastId });
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const userMsg = chatInput.trim();
    if (!userMsg) return;

    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");
    setIsAnalyzing(true);

    try {
      const settings = resolveAISettings();
      const appWide = isAppWideQuestion(userMsg);
      const apkContext = buildAPKContext({
        info: apkInfo,
        certificates,
        categories: categoryStats,
        files: apkFiles,
      });

      if (appWide) {
        const answer = await askAboutAPK(settings, userMsg, apkContext);
        setChatMessages((prev) => [...prev, { role: "ai", content: answer }]);
      } else if (activeFile && typeof activeFile.content === "string") {
        const actionResult = await getCodeAction(settings, activeFile.content, userMsg, apkContext);
        const changed = actionResult.modifiedCode !== activeFile.content;
        setPendingCode(changed ? actionResult.modifiedCode : null);
        setOriginalCode(activeFile.content);
        setChatMessages((prev) => [
          ...prev,
          {
            role: "ai",
            content: changed
              ? `${actionResult.explanation}\n\nراجع عرض Diff.`
              : actionResult.explanation,
          },
        ]);
        if (changed) setViewMode("diff");
      }
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "ai", content: `خطأ: ${err.message}` }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Full-project analysis: feed every decompiled text file to the AI.
  const runFullAnalysis = async () => {
    if (!bridgeSession.current) {
      toast.error("التحليل الشامل يتطلب الجسر المحلي (فكّ التطبيق أولًا).");
      return;
    }
    setIsAnalyzing(true);
    try {
      const files = await bridgeDump();
      if (files.length === 0) {
        setChatMessages((prev) => [
          ...prev,
          { role: "ai", content: "لم أجد ملفات نصية مفكوكة لتحليلها." },
        ]);
        return;
      }
      setChatMessages((prev) => [
        ...prev,
        {
          role: "user",
          content:
            "🔎 تحليل شامل: افحص المشروع كاملًا واذكر الملفات القابلة للتعديل (إعلانات، شراء، تحديثات، جذر، توقيع) مع مساراتها.",
        },
      ]);
      const answer = await analyzeProject(
        resolveAISettings(),
        files,
        "حلّل هذا التطبيق المفكوك بالكامل. اذكر: 1) الملفات القابلة للتعديل مباشرة (إعلانات/شراء/تحديثات/جذر/توقيع) مع مساراتها، 2) أي مخاطر أو سلوكيات مشبوهة، 3) توصيات بالتعديلات الجاهزة.",
      );
      setChatMessages((prev) => [...prev, { role: "ai", content: answer }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "ai", content: `خطأ: ${err.message}` }]);
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

  // --- Mods (Toolbox) handlers ---
  const openMods = async () => {
    setShowMods(true);
    if (mods.length === 0) {
      try {
        setMods(await bridgeListMods());
      } catch (err: any) {
        toast.error(`تعذّر تحميل القوالب: ${err.message}`);
      }
    }
  };

  const patchModState = (modId: string, patch: Partial<ModEntry>) => {
    setModState((s) => {
      const next: Record<string, ModEntry> = { ...s };
      next[modId] = { ...(s[modId] ?? {}), ...patch };
      return next;
    });
  };

  const runDetectMod = async (modId: string) => {
    patchModState(modId, { busy: true, error: null });
    try {
      const { count, matches } = await bridgeDetectMod(modId);
      patchModState(modId, { busy: false, detected: matches, changed: null, error: null });
      toast.success(`وجد ${count} موضعًا قابلًا للتعديل`);
    } catch (err: any) {
      patchModState(modId, { busy: false, error: err.message });
      toast.error(`فشل الاكتشاف: ${err.message}`);
    }
  };

  const runApplyMod = async (modId: string) => {
    patchModState(modId, { busy: true, error: null });
    try {
      const { changed } = await bridgeApplyMod(modId);
      patchModState(modId, { busy: false, changed, detected: null, error: null });
      // Refresh the modified files in the editor view.
      for (const p of changed) {
        try {
          const content = await bridgeReadFile(p);
          setApkFiles((prev) => prev.map((f) => (f.path === p ? { ...f, content } : f)));
        } catch {
          /* file may be binary or unreadable — ignore */
        }
      }
      toast.success(`تم التعديل في ${changed.length} ملفًا — اضغط Build لإعادة التوقيع`);
    } catch (err: any) {
      patchModState(modId, { busy: false, error: err.message });
      toast.error(`فشل التطبيق: ${err.message}`);
    }
  };

  // Workflow pipeline status (all visible buttons + their state).
  const workflowSteps = [
    {
      key: "upload",
      label: "ارفع APK",
      done: apkFiles.length > 0,
      active: apkFiles.length === 0 && isLoading,
    },
    {
      key: "decompile",
      label: "فكّ",
      done: bridgeSession.current && !!apkInfo,
      active: bridgeSession.current && !apkInfo && isLoading,
    },
    {
      key: "edit",
      label: "عدّل",
      done: activeFilePath !== "",
      active: apkFiles.length > 0 && activeFilePath === "",
    },
    { key: "build", label: "ابنِ", done: built, active: built && bridgeOnline },
    {
      key: "sign",
      label: "وقّع",
      done: built && bridgeSession.current,
      active: built && !bridgeSession.current,
    },
    {
      key: "install",
      label: "ثبّت",
      done: built && bridgeSession.current,
      active: built && !bridgeSession.current,
    },
  ] as const;

  return (
    <div
      className="flex h-screen w-full bg-[#070810] text-slate-100 overflow-hidden dark"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {showOnboarding && (
        <Onboarding
          onDone={(m) => {
            setEditMode(m);
            setShowOnboarding(false);
          }}
        />
      )}

      <SetupGuide
        open={showSetup}
        onOpenChange={setShowSetup}
        baseUrl={getBridgeBase()}
        mode={editMode}
      />

      <ConnectionSettings
        open={showConn}
        onOpenChange={setShowConn}
        onModeChange={(m) => {
          switchMode(m);
          setShowConn(false);
        }}
      />

      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-2xl pointer-events-none">
          <Upload className="h-16 w-16 text-primary animate-bounce" />
        </div>
      )}

      {/* Sidebar LEFT */}
      <aside className="w-80 border-r border-slate-800 flex flex-col bg-[#0f0f14]">
        <Tabs
          value={leftTab}
          onValueChange={(v) => setLeftTab(v as any)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid grid-cols-3 m-2 h-9 bg-slate-800/50">
            <TabsTrigger value="categories">
              <Package className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="files">
              <FileCode className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="certs">
              <ShieldCheck className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full p-2">
              <div className="space-y-2">
                {categoryStats.map((stat) => (
                  <Card
                    key={stat.category}
                    className={`cursor-pointer transition-colors ${activeCategory === stat.category ? "bg-primary/20 border-primary" : "bg-slate-800/30 border-slate-800"}`}
                    onClick={() => setActiveCategory(stat.category)}
                  >
                    <CardContent className="p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {CATEGORY_META[stat.category]?.icon || "📁"}
                        </span>
                        <div className="text-xs">
                          {CATEGORY_META[stat.category]?.labelAr || stat.category}
                        </div>
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
                {filteredFiles.slice(0, 100).map((f) => (
                  <div
                    key={f.path}
                    onClick={() => openFile(f.path)}
                    className={`px-2 py-1 text-xs rounded cursor-pointer truncate ${activeFilePath === f.path ? "bg-primary text-white" : "hover:bg-slate-800 text-slate-400"}`}
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
                {certificates.map((c) => (
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
        <header className="shrink-0 border-b border-slate-800 bg-[#0b0c12]/95">
          {/* Top bar: mode + status + action buttons */}
          <div className="h-12 flex items-center justify-between px-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="font-black tracking-tight text-sm shrink-0">
                APP<span className="brand-gradient-text">-</span>FORGE
              </div>
              {/* Mode toggle */}
              <div className="flex items-center rounded-lg bg-slate-800/70 border border-slate-700 p-0.5 shrink-0">
                <button
                  onClick={() => switchMode("local")}
                  className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-bold transition-colors ${
                    editMode === "local"
                      ? "brand-gradient-bg text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="التعديل المحلي — يعمل الجسر على جهازك"
                >
                  <Laptop className="h-3.5 w-3.5" /> محلي
                </button>
                <button
                  onClick={() => switchMode("cloud")}
                  className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-bold transition-colors ${
                    editMode === "cloud"
                      ? "brand-gradient-bg text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="التعديل السحابي — الاتصال بخادم جسر مستضاف"
                >
                  <Cloud className="h-3.5 w-3.5" /> سحابي
                </button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-slate-400"
                onClick={() => setShowConn(true)}
                title="إعدادات الاتصال"
              >
                <PlugZap className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-none">
              <Button
                size="sm"
                className="h-7 text-xs gap-1 shrink-0"
                onClick={() => document.getElementById("apk-upload-input")?.click()}
                disabled={!bridgeOnline}
                title={bridgeOnline ? "ارفع ملف APK جديد" : "فعّل الجسر أولًا"}
              >
                <Upload className="h-3 w-3" /> رفع APK
              </Button>
              <input
                id="apk-upload-input"
                type="file"
                accept=".apk,.xapk,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAPKUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setShowHelp(true)}
                title="الدليل"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              <span
                className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded shrink-0 ${
                  bridgeOnline
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-rose-500/10 text-rose-400"
                }`}
                title={
                  bridgeOnline
                    ? editMode === "cloud"
                      ? "خادم السحابة متصل (فك + توقيع)"
                      : "الجسر المحلي متصل (فك + توقيع)"
                    : editMode === "cloud"
                      ? "خادم السحابة غير متصل"
                      : "الجسر المحلي غير متصل — التشغيل داخل المتصفح فقط"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${bridgeOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`}
                />
                {editMode === "cloud"
                  ? bridgeOnline
                    ? "Cloud"
                    : "Browser"
                  : bridgeOnline
                    ? "Bridge"
                    : "Browser"}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={() => setShowSetup(true)}
              >
                <Wrench className="h-3 w-3 mr-1" /> Setup
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-3 w-3 mr-1" /> AI
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={openMods}
                disabled={!bridgeSession.current}
              >
                <Wand2 className="h-3 w-3 mr-1" /> Mods
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 shrink-0 brand-gradient-bg"
                onClick={handleRebuild}
              >
                <Rocket className="h-3 w-3" /> Build
              </Button>
            </div>
          </div>

          {/* Workflow status bar */}
          <div className="px-3 pb-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {workflowSteps.map((s, i) => (
              <React.Fragment key={s.key}>
                <div
                  className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                    s.done
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : s.active
                        ? "border-primary/40 bg-primary/10 text-primary animate-pulse"
                        : "border-slate-700 text-slate-500"
                  }`}
                >
                  {s.done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                  {s.label}
                </div>
                {i < workflowSteps.length - 1 && (
                  <span className="text-slate-700 text-[10px]">‹</span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Tabs */}
          <div className="px-3 pb-1.5 flex gap-1 overflow-x-auto scrollbar-none">
            {openTabs.map((path) => (
              <Badge
                key={path}
                variant={activeFilePath === path ? "default" : "secondary"}
                className="cursor-pointer gap-1 px-2 py-0.5 text-[11px] shrink-0"
                onClick={() => openFile(path)}
              >
                {path.split("/").pop()}
                <X className="h-3 w-3" onClick={(e: React.MouseEvent) => closeTab(path, e)} />
              </Badge>
            ))}
            {openTabs.length === 0 && (
              <span className="text-[10px] text-slate-600">
                ارفع APK أو افتح ملفًا لبدء التعديل
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden">
          {activeFile ? (
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
                modified={
                  pendingCode || (typeof activeFile.content === "string" ? activeFile.content : "")
                }
                language={getFileLanguage(activeFile.name)}
              />
            )
          ) : (
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="mx-auto mb-4 p-4 rounded-2xl brand-gradient-bg brand-ring-glow w-fit">
                  <Upload className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-black mb-1">
                  {editMode === "cloud"
                    ? "افتح مشروعًا من السحابة أو ارفع APK"
                    : "ابدأ برفع ملف APK"}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-4">
                  اسحب الملف وأفلته هنا أو اضغط الزر.{" "}
                  {editMode === "local"
                    ? "مع الجسر المحلي يُفكّ التطبيق إلى Smali ومانيفست وموارد حقيقية."
                    : "يُفكّ التطبيق على خادمك السحابي — لا حاجة لتثبيت أدوات محليًا."}
                </p>
                <div className="flex flex-col gap-2 items-center">
                  <Button
                    onClick={() => document.getElementById("apk-upload-input")?.click()}
                    disabled={!bridgeOnline}
                    className="gap-2 brand-gradient-bg"
                  >
                    <Upload className="h-4 w-4" /> رفع APK
                  </Button>
                  {!bridgeOnline && (
                    <div className="flex items-center gap-2 text-xs text-rose-400">
                      <X className="h-3.5 w-3.5" />
                      {editMode === "cloud"
                        ? "خادم السحابة غير متصل — افتح «إعدادات الاتصال» وأدخل الرابط"
                        : "الجسر غير متصل — اضغط «Setup» أو افتح «إعدادات الاتصال»"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {pendingCode && viewMode === "diff" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <Button size="sm" onClick={applyChanges}>
                <Check className="h-4 w-4 mr-1" /> Apply
              </Button>
              <Button size="sm" variant="secondary" onClick={discardChanges}>
                <X className="h-4 w-4 mr-1" /> Discard
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Sidebar RIGHT */}
      <aside className="w-80 border-l border-slate-800 flex flex-col bg-[#0f0f14]">
        <Tabs
          value={rightTab}
          onValueChange={(v) => setRightTab(v as any)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid grid-cols-3 m-2 h-9 bg-slate-800/50">
            <TabsTrigger value="info">
              <Info className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="perms">
              <ShieldAlert className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="ai">
              <MessageSquare className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-hidden p-3">
            {apkInfo && (
              <div className="space-y-4 text-xs">
                <div className="font-bold text-primary">{apkInfo.packageName}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-slate-400">Version</div>
                  <div>{apkInfo.versionName}</div>
                  <div className="text-slate-400">Min SDK</div>
                  <div>{apkInfo.minSdk}</div>
                  <div className="text-slate-400">Target SDK</div>
                  <div>{apkInfo.targetSdk}</div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 pt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                {PROVIDERS[aiProvider].icon} {PROVIDERS[aiProvider].label}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                onClick={runFullAnalysis}
                disabled={isAnalyzing || !bridgeSession.current}
              >
                <Sparkles className="h-3 w-3" /> تحليل شامل
              </Button>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-3">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded text-xs ${m.role === "user" ? "bg-primary/20 ml-4" : "bg-slate-800 mr-4"}`}
                  >
                    <div className="font-bold opacity-50 mb-1">
                      {m.role === "user" ? "أنت" : "AI"}
                    </div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))}
                {isAnalyzing && <div className="text-xs animate-pulse">جارٍ التفكير...</div>}
              </div>
            </ScrollArea>
            <form onSubmit={sendChatMessage} className="p-3 border-t border-slate-800 flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="اسأل الذكاء الاصطناعي..."
                className="h-9 text-xs"
              />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </aside>

      {/* AI Settings */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-xl bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" /> إعدادات الذكاء الاصطناعي
            </DialogTitle>
            <p className="text-xs text-slate-400">
              اختر مزوّدًا وأدخل مفتاحه. المفاتيح تُحفظ محليًا في متصفحك فقط ولا تُرسل لأي خادم آخر.
            </p>
          </DialogHeader>

          <ScrollArea className="max-h-[55vh] pr-2 mt-2">
            <div className="space-y-4">
              {/* Current provider */}
              <div className="space-y-2">
                <Label>المزوّد الحالي</Label>
                <Select
                  value={aiProvider}
                  onValueChange={(v: AIProvider) => {
                    setAiProvider(v);
                    setTestResult(null);
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {Object.values(PROVIDERS).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.icon} {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* API key for current provider (demo needs none) */}
              {aiProvider !== "demo" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>API Key — {PROVIDERS[aiProvider].label}</Label>
                    <a
                      href={PROVIDERS[aiProvider].link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                    >
                      احصل على مفتاح <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <Input
                    type="password"
                    value={aiKeys[aiProvider] || ""}
                    onChange={(e) =>
                      setAiKeys((prev) => ({ ...prev, [aiProvider]: e.target.value }))
                    }
                    placeholder="sk-..."
                    className="bg-slate-800 border-slate-700"
                  />
                  <div className="text-[11px] text-slate-500">
                    {PROVIDERS[aiProvider].freeQuota}
                  </div>
                </div>
              )}

              {/* Test connection */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    setTesting(true);
                    setTestResult(null);
                    const result = await testAIConnection(resolveAISettings());
                    setTestResult(result);
                    setTesting(false);
                  }}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3" />
                  )}
                  اختبار الاتصال
                </Button>
                {testResult && (
                  <span
                    className={`text-[11px] ${testResult.ok ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {testResult.ok
                      ? `✅ متصل (${testResult.latencyMs}ms)`
                      : `❌ ${testResult.message.slice(0, 80)}`}
                  </span>
                )}
              </div>

              {/* Free providers */}
              <div>
                <div className="text-[11px] font-bold text-emerald-400 mb-2">🟢 مزوّدات مجانية</div>
                <div className="space-y-1.5">
                  {providersByTier().free.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setAiProvider(p.id);
                        setTestResult(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${aiProvider === p.id ? "bg-primary/20 border-primary" : "bg-slate-800/40 border-slate-700 hover:bg-slate-800"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{p.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{p.label}</div>
                          <div className="text-[10px] text-slate-500 truncate">{p.freeQuota}</div>
                        </div>
                      </div>
                      {aiKeys[p.id] && (
                        <span className="text-emerald-400 text-[10px] shrink-0">مفتاح ✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paid providers */}
              <div>
                <div className="text-[11px] font-bold text-amber-400 mb-2">
                  🟡 مزوّدات مدفوعة / منخفضة التكلفة
                </div>
                <div className="space-y-1.5">
                  {providersByTier().paid.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setAiProvider(p.id);
                        setTestResult(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${aiProvider === p.id ? "bg-primary/20 border-primary" : "bg-slate-800/40 border-slate-700 hover:bg-slate-800"}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{p.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{p.label}</div>
                          <div className="text-[10px] text-slate-500 truncate">{p.freeQuota}</div>
                        </div>
                      </div>
                      {aiKeys[p.id] && (
                        <span className="text-emerald-400 text-[10px] shrink-0">مفتاح ✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Demo */}
              <button
                onClick={() => {
                  setAiProvider("demo");
                  setTestResult(null);
                }}
                className={`w-full text-left p-2.5 rounded-lg border flex items-center gap-2 ${aiProvider === "demo" ? "bg-primary/20 border-primary" : "bg-slate-800/40 border-slate-700 hover:bg-slate-800"}`}
              >
                <span className="text-base">🎮</span>
                <div>
                  <div className="text-xs font-semibold">وضع Demo (بدون مفتاح)</div>
                  <div className="text-[10px] text-slate-500">
                    تحليل محلي سريع دون إرسال بياناتك لأي جهة
                  </div>
                </div>
              </button>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              onClick={() => {
                localStorage.setItem(
                  "APPFORGE_AI_SETTINGS",
                  JSON.stringify({ provider: aiProvider, keys: aiKeys }),
                );
                setShowSettings(false);
                toast.success("تم حفظ الإعدادات");
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mods Toolbox */}
      <Dialog open={showMods} onOpenChange={setShowMods}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              قوالب التعديل الجاهزة
            </DialogTitle>
            <p className="text-xs text-slate-400">
              يكتشف المواضع القابلة للتعديل في Smali/المانيفست ويطبّق التعديل تلقائيًا. احتفظ بنسخة
              احتياطية واختبر التطبيق بعد كل تعديل.
            </p>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2 mt-2">
            <div className="space-y-3">
              {mods.length === 0 && (
                <div className="text-xs text-slate-400">
                  لا توجد قوالب محمّلة. تأكد أن الجسر المحلي متصل.
                </div>
              )}
              {mods.map((mod) => {
                const st: ModEntry = modState[mod.id] ?? {};
                return (
                  <div
                    key={mod.id}
                    className="p-3 rounded-lg border border-slate-700 bg-slate-800/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{mod.icon}</span>
                          <span className="font-bold text-sm">{mod.nameAr}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {mod.descriptionAr}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] gap-1"
                          onClick={() => runDetectMod(mod.id)}
                          disabled={st.busy}
                        >
                          {st.busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Search className="h-3 w-3" />
                          )}
                          اكتشاف
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-[11px] gap-1"
                          onClick={() => runApplyMod(mod.id)}
                          disabled={st.busy}
                        >
                          <Check className="h-3 w-3" /> تطبيق
                        </Button>
                      </div>
                    </div>

                    {st.error && <div className="text-[11px] text-rose-400 mt-2">{st.error}</div>}

                    {st.detected && st.detected.length > 0 && (
                      <div className="mt-2 text-[11px]">
                        <div className="text-emerald-400 mb-1">
                          تم العثور على {st.detected.length} موضع:
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {st.detected.slice(0, 50).map((mt, i) => (
                            <div key={i} className="truncate text-slate-400">
                              <span className="text-slate-600">{mt.path}</span>
                              {mt.method ? ` — ${mt.method}` : ` — ${mt.snippet}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {st.changed && st.changed.length > 0 && (
                      <div className="mt-2 text-[11px] text-emerald-400">
                        تم تعديل {st.changed.length} ملف:
                        <div className="space-y-1 max-h-32 overflow-y-auto mt-1">
                          {st.changed.map((p, i) => (
                            <div key={i} className="truncate text-slate-300">
                              {p}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMods(false)}
              className="border-slate-700 hover:bg-slate-800"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help / Onboarding */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-xl bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" /> كيف تستخدم APP-FORGE؟
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2 mt-2">
            <div className="space-y-3 text-xs leading-relaxed">
              {[
                {
                  icon: "🔌",
                  title: "1) جهّز الجسر المحلي",
                  body: "زر «Setup» يتحقق من الأدوات (Java/apktool/apksigner/zipalign) ويثبّتها بنقرة. عندما يتحول المؤشر العلوي إلى «Bridge» أخضر، فأنت جاهز للتعديل الحقيقي.",
                },
                {
                  icon: "📦",
                  title: "2) ارفع ملف APK",
                  body: "اسحب الملف أو اضغط لرفعه. مع الجسر المتصل يُفكّ التطبيق إلى Smali ومانيفست وموارد حقيقية (وليس مجرد ZIP).",
                },
                {
                  icon: "📂",
                  title: "3) تصفّح وعدّل",
                  body: "العمود الأيسر يعرض الملفات مصنّفة. اضغط أي ملف نصي لتحريره في المحرر الأوسط، وستُحفظ تعديلاتك تلقائيًا.",
                },
                {
                  icon: "🪄",
                  title: "4) استخدم قوالب التعديل",
                  body: "زر «Mods» يفتح قوالب جاهزة (قطع التحديثات، تفعيل الشراء، إزالة الإعلانات، إزالة تحقق الجذر/التوقيع). لكل قالب «اكتشاف» و«تطبيق».",
                },
                {
                  icon: "🤖",
                  title: "5) استعن بالذكاء الاصطناعي",
                  body: "العمود الأيمن فيه محادثة AI. اضغط «تحليل شامل» لفحص كل الملفات، أو اطلب تعديل كود مباشرة وسيعرض الفرق قبل التطبيق. من «AI Settings» اختر مزوّدًا مجانيًا أو مدفوعًا.",
                },
                {
                  icon: "🔨",
                  title: "6) ابنِ ووقّع",
                  body: "زر «Build» يعيد البناء والمحاذاة والتوقيع وينزّل APK جاهزًا للتثبيت. بدون الجسر، سيكون الناتج غير موقّع ولن يثبَّت.",
                },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-700 bg-slate-800/40">
                  <div className="font-bold mb-1 flex items-center gap-2">
                    <span>{s.icon}</span>
                    {s.title}
                  </div>
                  <div className="text-slate-400">{s.body}</div>
                </div>
              ))}

              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-300 text-[11px]">
                ⚠️ <b>تنبيه:</b> تعديل تطبيقات الآخرين (إزالة الشراء/الإعلانات) قد يخالف شروط
                الاستخدام وحقوق الملكية. استخدم الأداة للأغراض التعليمية وللتطبيقات التي تملك حق
                تعديلها، واحتفظ دائمًا بنسخة احتياطية واختبر بعد كل تعديل.
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setShowHelp(false)}>فهمت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AppForgeEditor;
