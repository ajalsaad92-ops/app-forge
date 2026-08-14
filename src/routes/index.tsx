import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  Laptop,
  Cloud,
  FolderTree,
  Wand2,
  Bot,
  Hammer,
  Rocket,
  ShieldCheck,
  ArrowLeft,
  Menu,
  X,
  Check,
} from "lucide-react";
import { bridgeHealth, getStoredMode, setStoredMode, type EditMode } from "@/lib/bridge-client";

export const Route = createFileRoute("/")({
  component: Index,
});

const CAPABILITIES = [
  {
    icon: <FolderTree className="h-5 w-5" />,
    title: "فكّ التطبيق",
    desc: "يحوّل الـ APK إلى Smali + مانيفست + موارد حقيقية قابلة للتعديل.",
  },
  {
    icon: <Wand2 className="h-5 w-5" />,
    title: "قوالب تعديل جاهزة",
    desc: "قطع التحديثات، تفعيل الشراء، إزالة الإعلانات، إزالة الجذر/التحقق من التوقيع.",
  },
  {
    icon: <Bot className="h-5 w-5" />,
    title: "ذكاء اصطناعي (9 مزوّدات)",
    desc: "مجانية ومدفوعة + تحليل شامل لكل الملفات وتعديل كود بعرض الفرق.",
  },
  {
    icon: <Hammer className="h-5 w-5" />,
    title: "بناء + توقيع",
    desc: "apktool + zipalign + apksigner في مسار واحد يخرج APK قابلًا للتثبيت.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "خصوصية محلية",
    desc: "في الوضع المحلي، ملفاتك لا تغادر جهازك إطلاقًا.",
  },
  {
    icon: <Rocket className="h-5 w-5" />,
    title: "تشغيل سريع",
    desc: "رفع → فكّ → عدّل → ابنِ → وقّع → ثبّت، بواجهة واضحة.",
  },
];

const STEPS = [
  { icon: "📦", title: "ارفع الـ APK", desc: "اسحب الملف أو اضغط لرفعه." },
  {
    icon: "📂",
    title: "صفّف وعدّل",
    desc: "الملفات مصنّفة (كود/موارد/إعدادات/أمان) في محرر Monaco.",
  },
  {
    icon: "🪄",
    title: "طبّق قالبًا أو عدّل يدويًا",
    desc: "قوالب جاهزة أو محرر أكواد مع ذكاء اصطناعي.",
  },
  { icon: "🔨", title: "ابنِ ووقّع", desc: "يعيد البناء والمحاذاة والتوقيع." },
  { icon: "🚀", title: "ثبّت", desc: "حمّل APK جاهزًا للتثبيت على جهاز أندرويد." },
];

function ModeCard({
  mode,
  active,
  online,
  onPick,
  title,
  icon,
  points,
}: {
  mode: EditMode;
  active: boolean;
  online: boolean;
  onPick: (m: EditMode) => void;
  title: string;
  icon: React.ReactNode;
  points: string[];
}) {
  return (
    <button
      onClick={() => onPick(mode)}
      className={`text-right p-6 rounded-2xl border transition-all ${active ? "border-primary bg-primary/15 brand-ring-glow" : "border-slate-700 bg-slate-800/20 hover:bg-slate-800/50"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`p-3 rounded-xl ${active ? "brand-gradient-bg text-white" : "bg-slate-800 text-primary"}`}
        >
          {icon}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full ${online ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`}
          />
          {online ? "متصل" : "غير متصل"}
        </span>
      </div>
      <h3 className="font-black text-lg mb-1 flex items-center gap-2">
        {title}
        {active && <Check className="h-4 w-4 text-primary" />}
      </h3>
      <ul className="space-y-1 text-xs text-slate-400">
        {points.map((p, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-primary">•</span> {p}
          </li>
        ))}
      </ul>
    </button>
  );
}

function Index() {
  const [mode, setMode] = React.useState<EditMode>(getStoredMode());
  const [localOnline, setLocalOnline] = React.useState(false);
  const [cloudOnline, setCloudOnline] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const [l, c] = await Promise.all([bridgeHealth("local"), bridgeHealth("cloud")]);
      if (!cancelled) {
        setLocalOnline(l);
        setCloudOnline(c);
      }
    };
    check();
    const t = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const pickMode = (m: EditMode) => {
    setMode(m);
    setStoredMode(m);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#070810] text-slate-100 dark overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-slate-800 bg-[#070810]/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight">
            <span className="p-1.5 rounded-lg brand-gradient-bg">
              <Rocket className="h-4 w-4 text-white" />
            </span>
            APP<span className="brand-gradient-text">-</span>FORGE
          </div>
          <div className="hidden md:flex items-center gap-4 text-sm">
            <a href="#modes" className="text-slate-400 hover:text-slate-200">
              أوضاع التعديل
            </a>
            <a href="#how" className="text-slate-400 hover:text-slate-200">
              كيف يعمل
            </a>
            <a href="#features" className="text-slate-400 hover:text-slate-200">
              المميزات
            </a>
            <Link
              to="/editor"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              فتح المحرر
            </Link>
          </div>
          <button className="md:hidden text-slate-300" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-slate-800 px-6 py-3 space-y-2 text-sm">
            <a href="#modes" className="block text-slate-300" onClick={() => setMenuOpen(false)}>
              أوضاع التعديل
            </a>
            <a href="#how" className="block text-slate-300" onClick={() => setMenuOpen(false)}>
              كيف يعمل
            </a>
            <a href="#features" className="block text-slate-300" onClick={() => setMenuOpen(false)}>
              المميزات
            </a>
            <Link
              to="/editor"
              className="block bg-primary text-primary-foreground text-center rounded-lg px-4 py-2 font-bold"
            >
              فتح المحرر
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[30rem] rounded-full opacity-20 blur-3xl brand-gradient-bg" />
        </div>
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs mb-6">
            أداة مفتوحة المصدر لتعديل تطبيقات أندرويد وتحليلها بالذكاء الاصطناعي
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight">
            عدّل أي تطبيق أندرويد
            <br />
            <span className="brand-gradient-text">محليًا أو سحابيًا</span>
          </h1>
          <p className="text-lg text-slate-400 mt-6 max-w-2xl mx-auto leading-relaxed">
            APP-FORGE يفكّ تطبيق الـ APK إلى ملفاته الحقيقية، يطبّق قوالب تعديل جاهزة، يستعين
            بالذكاء الاصطناعي للتحليل الشامل، ثم يعيد البناء والتوقيع ليخرج تطبيقًا قابلًا للتثبيت —
            كل ذلك عبر مسارين: <b>محلي</b> أو <b>سحابي</b>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link
              to="/editor"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-xl text-lg font-bold transition-all hover:scale-105 shadow-xl shadow-primary/20"
            >
              ابدأ الآن ←
            </Link>
            <a
              href="#modes"
              className="bg-secondary text-secondary-foreground border border-border px-8 py-4 rounded-xl text-lg font-bold transition-all hover:bg-accent"
            >
              اختر أسلوب التعديل
            </a>
          </div>
        </div>
      </section>

      {/* Modes */}
      <section id="modes" className="border-t border-slate-800 bg-[#0b0c12]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-black text-center mb-2">مساران للتعديل، اختار ما يناسبك</h2>
          <p className="text-slate-400 text-center max-w-2xl mx-auto mb-10 leading-relaxed">
            كلاهما يقدّم الميزات نفسها، الفرق في المكان الذي تُنفَّذ فيه عمليات الفكّ والتوقيع.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ModeCard
              mode="local"
              active={mode === "local"}
              online={localOnline}
              onPick={pickMode}
              title="التعديل المحلي"
              icon={<Laptop className="h-6 w-6" />}
              points={[
                "يعمل الجسر على جهازك (localhost)",
                "أسرع وأكثر خصوصية — لا تخرج ملفاتك من جهازك",
                "تثبيت الأدوات بنقرة واحدة أو سكربت PowerShell",
                "موصى به للتعديل الجاد",
              ]}
            />
            <ModeCard
              mode="cloud"
              active={mode === "cloud"}
              online={cloudOnline}
              onPick={pickMode}
              title="التعديل السحابي"
              icon={<Cloud className="h-6 w-6" />}
              points={[
                "الاتصال بخادم جسر مستضاف على السحابة",
                "لا حاجة لتثبيت أدوات على جهازك",
                "أدخل رابط خادمك السحابي في إعدادات الاتصال",
                "مفيد عند غياب الأدوات المحلية",
              ]}
            />
          </div>
          <div className="text-center mt-8">
            <Link
              to="/editor"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl font-bold"
            >
              فتح المحرر بوضع «{mode === "local" ? "محلي" : "سحابي"}»{" "}
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-black text-center mb-10">كيف يعمل التطبيق؟</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 glass-panel"
            >
              <div className="text-3xl mb-3">{s.icon}</div>
              <div className="text-xs text-slate-500 mb-2">الخطوة {i + 1}</div>
              <h3 className="font-bold mb-2">{s.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-slate-800 bg-[#0b0c12]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-black text-center mb-10">الإمكانات الكاملة</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((f, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition-colors glass-panel"
              >
                <div className="text-primary mb-3">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Legal */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 text-amber-300 leading-relaxed">
          <h3 className="font-bold mb-2">⚠️ تنبيه قانوني</h3>
          <p className="text-sm">
            تعديل تطبيقات الآخرين — كإزالة عمليات الشراء أو الإعلانات — قد يخالف شروط الاستخدام
            وحقوق الملكية الفكرية وقوانين بلدك. صُمّم APP-FORGE للأغراض التعليمية وللتطبيقات التي
            تملك الحق في تعديلها. أنت مسؤول عن الاستخدام الذي تقوم به.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div className="font-bold text-slate-300 flex items-center gap-1.5">
            <Rocket className="h-4 w-4 text-primary" /> APP-FORGE
          </div>
          <div>فكّ · عدّل · وقّع · ثبّت — محليًا أو سحابيًا.</div>
        </div>
      </footer>
    </div>
  );
}
