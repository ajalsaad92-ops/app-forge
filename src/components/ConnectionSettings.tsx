import * as React from "react";
import { Laptop, Cloud, Save, TestTube2, Loader2, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getStoredMode,
  setStoredMode,
  getLocalUrl,
  setLocalUrl,
  getCloudUrl,
  setCloudUrl,
  bridgeHealthInfo,
  bridgeVerifyTools,
  type EditMode,
} from "@/lib/bridge-client";

type Status = "checking" | "ok" | "offline";

export function ConnectionSettings({
  open,
  onOpenChange,
  onModeChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onModeChange?: (mode: EditMode) => void;
}) {
  const [mode, setMode] = React.useState<EditMode>(getStoredMode());
  const [localUrl, setLocalUrlState] = React.useState<string>(getLocalUrl());
  const [cloudUrl, setCloudUrlState] = React.useState<string>(getCloudUrl());
  const [status, setStatus] = React.useState<Record<EditMode, Status>>({
    local: "offline",
    cloud: "offline",
  });
  const [tools, setTools] = React.useState<Record<string, { label: string; exists: boolean }>>({});

  const refresh = async (m: EditMode) => {
    setStatus((s) => ({ ...s, [m]: "checking" }));
    const base = m === "local" ? localUrl : cloudUrl;
    try {
      const info = await bridgeHealthInfo(m, base);
      if (info.status !== "ok") {
        setStatus((s) => ({ ...s, [m]: "offline" }));
        return;
      }
      setStatus((s) => ({ ...s, [m]: "ok" }));
      const t = await bridgeVerifyTools(m, base);
      setTools((prev) => ({ ...prev, ...t }));
    } catch {
      setStatus((s) => ({ ...s, [m]: "offline" }));
    }
  };

  React.useEffect(() => {
    if (open) {
      setMode(getStoredMode());
      setLocalUrlState(getLocalUrl());
      setCloudUrlState(getCloudUrl());
      refresh("local");
      refresh("cloud");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectMode = (m: EditMode) => {
    setMode(m);
    setStoredMode(m);
    onModeChange?.(m);
  };

  const save = () => {
    setStoredMode(mode);
    setLocalUrl(localUrl);
    setCloudUrl(cloudUrl);
    onModeChange?.(mode);
    toast.success("تم حفظ إعدادات الاتصال");
    onOpenChange(false);
  };

  const base = mode === "local" ? localUrl : cloudUrl;
  const readyCount = Object.values(tools).filter((t) => t.exists).length;
  const totalTools = Object.keys(tools).length;

  const ModeCard = ({
    m,
    icon,
    title,
    desc,
  }: {
    m: EditMode;
    icon: React.ReactNode;
    title: string;
    desc: string;
  }) => {
    const st = status[m];
    const isActive = mode === m;
    return (
      <button
        onClick={() => selectMode(m)}
        className={`text-right p-4 rounded-xl border transition-all ${isActive ? "border-primary bg-primary/15 brand-ring-glow" : "border-slate-700 bg-slate-800/30 hover:bg-slate-800"}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary">{icon}</span>
          <span className="font-bold">{title}</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
        <div className="mt-2 flex items-center gap-2">
          {st === "checking" ? (
            <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />
          ) : st === "ok" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <X className="h-3.5 w-3.5 text-rose-400" />
          )}
          <span
            className={`text-[10px] ${st === "ok" ? "text-emerald-400" : st === "offline" ? "text-rose-400" : "text-slate-400"}`}
          >
            {st === "ok" ? "متصل" : st === "offline" ? "غير متصل" : "جارٍ الفحص"}
          </span>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <TestTube2 className="h-5 w-5 text-primary" />
            إعدادات الاتصال (محلي / سحابي)
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <ModeCard
            m="local"
            icon={<Laptop className="h-5 w-5" />}
            title="محلي"
            desc="جسر يعمل على جهازك (localhost). أسرع وأكثر خصوصية."
          />
          <ModeCard
            m="cloud"
            icon={<Cloud className="h-5 w-5" />}
            title="سحابي"
            desc="الاتصال بخادم جسر مستضاف على السحابة."
          />
        </div>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Laptop className="h-4 w-4" /> رابط الجسر المحلي
              </Label>
              <Badge variant="outline" className="text-[10px] text-slate-400">
                افتراضي: http://localhost:3000
              </Badge>
            </div>
            <Input
              dir="ltr"
              value={localUrl}
              onChange={(e) => setLocalUrlState(e.target.value)}
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Cloud className="h-4 w-4" /> رابط الجسر السحابي
              </Label>
              <Badge variant="outline" className="text-[10px] text-slate-400">
                المكان المحدّد للسحابة
              </Badge>
            </div>
            <Input
              dir="ltr"
              value={cloudUrl}
              onChange={(e) => setCloudUrlState(e.target.value)}
              placeholder="https://your-cloud-bridge.com"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700 text-[11px] text-slate-400 leading-relaxed">
            <b className="text-slate-200">الوضع الحالي:</b> {mode === "local" ? "محلي" : "سحابي"} ·
            قاعدة الاتصال: <code className="text-primary font-mono">{base || "(فارغ)"}</code>
            {mode === "local" && totalTools > 0 && (
              <span className="block mt-1">
                الأدوات الجاهزة: {readyCount}/{totalTools}
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-800 pt-4 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 hover:bg-slate-800"
          >
            إلغاء
          </Button>
          <Button onClick={save} className="gap-2">
            <Save className="h-4 w-4" /> حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
