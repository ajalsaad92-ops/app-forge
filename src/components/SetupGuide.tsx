import * as React from "react";
import {
  Terminal,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  Play,
  Circle,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ToolStatus = "checking" | "online" | "offline";

interface ToolInfo {
  id: string;
  label: string;
  exists: boolean;
}

interface InstallResult {
  cmd: string;
  ok: boolean;
  error?: string;
}

const TOOL_META: Record<string, { title: string; command: string; link?: string; linkLabel?: string; manual: string }> = {
  java: {
    title: "Java (JDK 17+)",
    command: "java -version",
    link: "https://adoptium.net/temurin/releases/?version=17",
    linkLabel: "تحميل Temurin JDK 17",
    manual: "winget install --id EclipseAdoptium.Temurin.17.JDK -e",
  },
  apktool: {
    title: "Apktool",
    command: "apktool --version",
    link: "https://ibotpeaches.github.io/Apktool/install/",
    linkLabel: "تحميل Apktool",
    manual: "winget install --id apktool.apktool -e  (أو ضع apktool.jar في PATH)",
  },
  apksigner: {
    title: "apksigner (Android Build Tools)",
    command: "apksigner --version",
    link: "https://developer.android.com/tools/releases/build-tools",
    linkLabel: "تحميل Build Tools",
    manual: "ثبّت Android Studio ثم: sdkmanager \"build-tools;34.0.0\" \"platform-tools\"",
  },
  zipalign: {
    title: "zipalign (Android Build Tools)",
    command: "zipalign -h",
    link: "https://developer.android.com/tools/releases/build-tools",
    linkLabel: "تحميل Build Tools",
    manual: "يأتي ضمن build-tools: sdkmanager \"build-tools;34.0.0\"",
  },
};

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "online") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "offline") return <XCircle className="h-4 w-4 text-rose-500" />;
  return <Circle className="h-4 w-4 text-slate-500" />;
}

export function SetupGuide({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [serverStatus, setServerStatus] = React.useState<ToolStatus>("checking");
  const [tools, setTools] = React.useState<Record<string, ToolInfo>>({});
  const [installing, setInstalling] = React.useState(false);
  const [installResults, setInstallResults] = React.useState<InstallResult[]>([]);
  const [copied, setCopied] = React.useState<string | null>(null);

  const copyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      toast.success("تم نسخ الأمر");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  const checkHealth = React.useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch("http://localhost:3000/api/health", { signal: controller.signal });
      clearTimeout(timeoutId);
      setServerStatus(response.ok ? "online" : "offline");

      if (response.ok) {
        const toolsRes = await fetch("http://localhost:3000/api/tools");
        if (toolsRes.ok) {
          const data = await toolsRes.json();
          setTools(data);
        }
      }
    } catch {
      setServerStatus("offline");
    }
  }, []);

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (open) {
      checkHealth();
      interval = setInterval(checkHealth, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [open, checkHealth]);

  const runAutoInstall = async () => {
    setInstalling(true);
    setInstallResults([]);
    try {
      const res = await fetch("http://localhost:3000/api/install-tools", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "فشل التثبيت التلقائي");
        return;
      }
      setInstallResults(data.results || []);
      if (data.unsupported) {
        toast.info(data.message);
      } else {
        const okCount = (data.results || []).filter((r: InstallResult) => r.ok).length;
        toast.success(`تم تشغيل ${okCount} من ${(data.results || []).length} أمر تثبيت`);
      }
      setTimeout(checkHealth, 1500);
    } catch {
      toast.error("خادم الجسر المحلي غير متصل. شغّل: npm run bridge");
    } finally {
      setInstalling(false);
    }
  };

  const allToolsReady =
    tools["java"]?.exists &&
    tools["apktool"]?.exists &&
    tools["apksigner"]?.exists &&
    tools["zipalign"]?.exists;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Terminal className="h-5 w-5 text-primary" />
              إعداد بيئة التعديل
            </DialogTitle>
            <Badge
              variant={serverStatus === "online" ? "default" : "destructive"}
              className={`flex items-center gap-1.5 px-3 py-1 ${serverStatus === "online" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}`}
            >
              <div className={`h-2 w-2 rounded-full ${serverStatus === "online" ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
              {serverStatus === "online" ? "الجسر المحلي متصل" : "الجسر غير متصل — شغّل npm run bridge"}
            </Badge>
          </div>
          <DialogDescription className="text-slate-400">
            يحتاج التعديل الفعلي (فكّ + بناء + توقيع) إلى أدوات أندرويد مثبّتة على جهازك. تحقق منها هنا وثبّتها بنقرة واحدة.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4 mt-4">
          <div className="space-y-4 pb-4">
            {/* Real tool status */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                حالة الأدوات (تُفحص تلقائيًا)
              </h3>
              {Object.keys(TOOL_META).length > 0 && (
                <div className="space-y-1.5">
                  {Object.entries(TOOL_META).map(([id, meta]) => {
                    const info = tools[id];
                    const status: ToolStatus = info ? (info.exists ? "online" : "offline") : "checking";
                    return (
                      <div key={id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${status === "online" ? "bg-emerald-500/5 border-emerald-500/20" : status === "offline" ? "bg-rose-500/5 border-rose-500/20" : "bg-slate-800/50 border-slate-700"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIcon status={status} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{meta.title}</div>
                            <div className="text-[11px] text-slate-400 truncate">{meta.manual}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <code className="text-[10px] text-slate-500 hidden sm:block">{meta.command}</code>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyCommand(meta.manual)} title="نسخ أمر التثبيت">
                            {copied === meta.manual ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          </Button>
                          {meta.link && (
                            <a href={meta.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 text-[11px]">
                              تحميل <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {allToolsReady && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> جميع الأدوات جاهزة — يمكنك رفع APK والتعديل والبناء والتوقيع.
                </div>
              )}
            </div>

            {/* Auto install */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <h3 className="text-sm font-medium text-primary flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4" />
                تثبيت تلقائي
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                سيحاول الجسر تثبيت JDK 17 و apktool تلقائيًا عبر winget (ويندوز) أو brew (ماك).
                أداة build-tools (apksigner/zipalign) قد تتطلب تثبيتًا يدويًا عبر Android Studio.
              </p>
              <Button onClick={runAutoInstall} disabled={installing || serverStatus === "offline"} className="gap-2">
                {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                تثبيت تلقائي الآن
              </Button>

              {installResults.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {installResults.map((r, i) => (
                    <div key={i} className={`text-[11px] p-2 rounded border ${r.ok ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-rose-400 border-rose-500/20 bg-rose-500/5"}`}>
                      {r.ok ? "✅" : "❌"} {r.cmd}
                      {r.error && <div className="text-slate-500 mt-0.5">{r.error}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification */}
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4 text-primary" />
                تحقق سريع يدويًا
              </h3>
              <p className="text-xs text-slate-400 mb-3">شغّل هذا الأمر في PowerShell للتحقق أن كل شيء جاهز:</p>
              <div className="relative group">
                <code className="block p-3 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-emerald-400 break-all">
                  java -version; apktool --version; apksigner --version
                </code>
                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => copyCommand("java -version; apktool --version; apksigner --version")}>
                  {copied === "java -version; apktool --version; apksigner --version" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-slate-800 pt-4 gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 hover:bg-slate-800">
            إغلاق
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90"
            onClick={() => window.open("https://ibotpeaches.github.io/Apktool/", "_blank")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            دليل Apktool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
