import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { 
  Smartphone, Upload, Shield, Code2, Package, 
  FileCode, Lock, Layers, Box, Zap, Search,
  CheckCircle, ArrowRight, GitBranch, Wrench, Eye,
  FileText, Cpu, Image as ImageIcon, Database,
  ShieldCheck, Edit3, Download, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apkProcessor, CATEGORY_META, formatBytes } from "@/lib/apk-processor";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(apk|zip|xapk)$/i)) {
      toast.error("الرجاء اختيار ملف APK صحيح");
      return;
    }
    setIsProcessing(true);
    toast.loading(`جاري تحميل ${file.name}...`);
    // Store file in session for editor to pick? We'll rely on editor's upload,
    // but also pass via localStorage flag to auto-process.
    // For simplicity, we navigate to editor and it will handle fresh upload there,
    // but we can also process here quickly to show stats.
    // Let's just navigate and store file in IndexedDB via a temp key? 
    // Simpler: use a global window file holder (not persistent but works same session)
    (window as any).__APP_FORGE_PENDING_FILE__ = file;
    toast.dismiss();
    toast.success("تم استلام الملف - جاري الفتح في المحرر");
    setTimeout(() => navigate({ to: "/editor" }), 300);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="min-h-screen bg-[#06070a] text-slate-100 flex flex-col overflow-hidden dark relative selection:bg-primary/30"
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full bg-emerald-600/5 blur-[100px]" />
      </div>

      {isDragging && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center m-4 rounded-[24px] border-2 border-dashed border-primary">
          <div className="text-center space-y-4">
            <div className="h-24 w-24 mx-auto rounded-3xl bg-primary/20 grid place-items-center border border-primary/30">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl font-black">أسقط APK هنا</h2>
            <p className="text-slate-400">Drop your APK file to start editing</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 h-14 border-b border-white/[0.06] bg-black/20 backdrop-blur-xl flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-purple-600 grid place-items-center font-black text-white">A</div>
          <span className="font-black tracking-tight text-lg">APP<span className="text-primary">-</span>FORGE</span>
          <Badge variant="secondary" className="ml-2 text-[10px]">v2 PRO</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => window.open('https://github.com', '_blank')}>
            <GitBranch className="h-4 w-4 mr-1" /> GitHub
          </Button>
          <Link to="/editor">
            <Button size="sm" className="h-8 bg-white text-black hover:bg-white/90 font-bold text-xs">
              فتح المحرر <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-20 space-y-16">
          {/* Title */}
          <div className="text-center space-y-6 max-w-4xl mx-auto">
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 text-[11px] rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block mr-1.5" />
              يعمل محلياً 100% - لا يتم رفع ملفاتك للخادم
            </Badge>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">
              محرر تطبيقات<br />
              <span className="bg-gradient-to-r from-primary via-purple-500 to-emerald-400 bg-clip-text text-transparent">الأندرويد</span><br />
              <span className="text-3xl md:text-4xl text-slate-300 font-bold">الاحترافي</span>
            </h1>
            
            <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
              قم برفع أي ملف APK لتعديله بسهولة. سيتم فرز الملفات تلقائياً حسب 
              <span className="text-slate-200 font-semibold"> الشهادات، الإعدادات، الموارد، الشيفرة، والمكتبات</span>.
              كل شيء في مكان واحد.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <label className="group relative bg-white text-black hover:bg-white/90 px-8 py-4 rounded-2xl font-black text-base transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-white/10">
                <Upload className="h-5 w-5 group-hover:animate-bounce" />
                رفع APK وتعديله الآن
                <input ref={fileInputRef} type="file" accept=".apk,.zip,.xapk" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              <Link to="/editor" className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-8 py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2">
                <Code2 className="h-5 w-5" />
                فتح المحرر الفارغ
              </Link>
            </div>

            <div className="flex items-center justify-center gap-6 pt-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-emerald-400" /> معالجة محلية</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-emerald-400" /> بدون رفع للسحابة</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-emerald-400" /> دعم AI</span>
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group max-w-3xl mx-auto border-2 border-dashed border-white/[0.08] hover:border-primary/50 rounded-[24px] bg-gradient-to-b from-white/[0.03] to-transparent p-12 text-center cursor-pointer transition-all hover:bg-primary/[0.03] backdrop-blur"
          >
            <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-purple-600/20 border border-primary/20 grid place-items-center mb-4 group-hover:scale-110 transition-transform">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-bold text-lg">اسحب وأسقط ملف APK هنا</h3>
            <p className="text-sm text-slate-400 mt-1">Drag & Drop your APK - يدعم حتى 500MB - تحليل فوري</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {[".apk",".xapk",".zip",".apks"].map(ext => (
                <Badge key={ext} variant="outline" className="text-[10px] border-white/10 text-slate-400">{ext}</Badge>
              ))}
            </div>
          </div>

          {/* Feature Grid - sorted by categories requirement */}
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">فرز ذكي حسب التصنيف</h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto">كما طلبت - كل ملفات التطبيق يتم فرزها وتصنيفها تلقائياً لتسهيل التعديل</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <Card key={key} className="bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all group hover:scale-[1.02] backdrop-blur">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="h-11 w-11 rounded-xl bg-white/[0.04] border border-white/[0.06] grid place-items-center text-xl group-hover:scale-110 transition-transform">
                        {meta.icon}
                      </div>
                      <Badge variant="outline" className="text-[10px] border-white/10">{meta.label}</Badge>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        {meta.labelAr}
                        <span className="text-[11px] text-slate-500 font-normal">/ {meta.label}</span>
                      </h3>
                      <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{meta.description}</p>
                    </div>
                    <div className="pt-2 text-[11px] text-slate-500 flex items-center gap-1">
                      <div className="h-1 w-1 rounded-full bg-emerald-400" />
                      يتم الفرز تلقائياً عند الرفع
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { step: "01", icon: <Upload className="h-5 w-5" />, title: "ارفع التطبيق", titleEn: "Upload", desc: "اسحب ملف APK أو XAPK. يتم فك الضغط والتحليل محلياً في المتصفح بدون إرسال لأي خادم.", ar: "رفع آمن ومحلي 100%" },
              { step: "02", icon: <Wrench className="h-5 w-5" />, title: "عدّل بسهولة", titleEn: "Edit", desc: "محرر مرئي للـ Manifest، إدارة الصلاحيات، عرض الشهادات، تعديل الموارد والملفات، ومساعد AI.", ar: "واجهة احترافية بالعربية" },
              { step: "03", icon: <Download className="h-5 w-5" />, title: "ابني وحمّل", titleEn: "Build", desc: "إعادة بناء APK مع إزالة التوقيع القديم، جاهز للتوقيع بـ apksigner وتثبيت على الجهاز.", ar: "تصدير فوري" },
            ].map((s, i) => (
              <Card key={i} className="bg-gradient-to-br from-white/[0.03] to-white/[0.01] border-white/[0.06] backdrop-blur">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-black text-xs">{s.step}</div>
                    <div className="h-8 w-8 rounded-xl bg-white/[0.06] grid place-items-center">{s.icon}</div>
                  </div>
                  <div>
                    <h3 className="font-bold">{s.title} <span className="text-slate-500 text-xs font-normal">/ {s.titleEn}</span></h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{s.desc}</p>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">{s.ar}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Code preview mock */}
          <Card className="bg-[#0f0f14] border-white/[0.06] overflow-hidden backdrop-blur">
            <div className="h-10 border-b border-white/[0.06] flex items-center px-4 gap-2 bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80" /><div className="h-3 w-3 rounded-full bg-yellow-500/80" /><div className="h-3 w-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-[11px] text-slate-500 font-mono ml-4">AndroidManifest.xml • Visual Editor</span>
              <div className="ml-auto flex gap-2">
                <Badge className="text-[10px] h-5">مرئي</Badge>
                <Badge variant="outline" className="text-[10px] h-5 border-white/10">كود</Badge>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-5 space-y-3 border-r border-white/[0.06] bg-white/[0.01]">
                <div className="text-[11px] font-bold text-slate-300">معلومات التطبيق</div>
                {[
                  { k: "Package", v: "com.example.myapp" },
                  { k: "Version", v: "2.4.1 (42)" },
                  { k: "Min SDK", v: "24 • Android 7" },
                  { k: "Target SDK", v: "34 • Android 14" },
                ].map(row => (
                  <div key={row.k} className="flex justify-between text-[11px] py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-slate-500">{row.k}</span><span className="font-mono text-slate-200">{row.v}</span>
                  </div>
                ))}
                <div className="pt-2 flex gap-2">
                  <div className="h-7 px-3 rounded-lg bg-primary text-white text-[11px] font-bold grid place-items-center">حفظ</div>
                  <div className="h-7 px-3 rounded-lg bg-white/[0.06] text-[11px] grid place-items-center">إلغاء</div>
                </div>
              </div>
              <div className="p-4 bg-[#0a0a0f] font-mono text-[11px] leading-5 overflow-auto">
                <div className="text-slate-600">&lt;manifest package=<span className="text-emerald-400">"com.example.myapp"</span>&gt;</div>
                <div className="pl-4 text-slate-500">&lt;uses-permission android:name=<span className="text-amber-300">"android.permission.INTERNET"</span> /&gt; <span className="text-emerald-400/60">added</span></div>
                <div className="pl-4 text-slate-500">&lt;uses-permission android:name=<span className="text-amber-300">"android.permission.CAMERA"</span> /&gt; <span className="text-red-400/80">⚠️ dangerous</span></div>
                <div className="pl-4 text-slate-600">&lt;application android:debuggable=<span className="text-purple-400">"false"</span>&gt;</div>
                <div className="pl-8 text-slate-500">&lt;activity android:name=<span className="text-amber-300">".MainActivity"</span> android:exported=<span className="text-purple-400">"true"</span> /&gt;</div>
                <div className="text-slate-600">&lt;/manifest&gt;</div>
              </div>
            </div>
          </Card>

          <div className="text-center space-y-3 py-8">
            <h3 className="font-black text-xl">جاهز للبدء؟</h3>
            <p className="text-sm text-slate-400">حمّل أول APK الآن وسترى الفرز التلقائي حسب الشهادات والإعدادات</p>
            <div className="flex justify-center gap-3 pt-2">
              <Link to="/editor">
                <Button size="lg" className="rounded-2xl font-black px-8 bg-white text-black hover:bg-white/90">
                  افتح المحرر <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] h-10 flex items-center justify-between px-6 text-[11px] text-slate-500">
        <span>© 2026 APP-FORGE • معالجة محلية 100% • لا يتم حفظ ملفاتك على الخادم</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" /> Local First</span>
          <span>•</span>
          <span>Built with JSZip • Monaco • AI</span>
        </span>
      </footer>
    </div>
  );
}
