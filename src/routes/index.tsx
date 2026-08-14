import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { bridgeHealth } from "@/lib/bridge-client";

export const Route = createFileRoute("/")({
  component: Index,
});

const STEPS = [
  { icon: "🔌", title: "جهّز الجسر المحلي", desc: "ثبّت Java وapktool وأدوات أندرويد بنقرة واحدة من داخل التطبيق." },
  { icon: "📦", title: "ارفع ملف APK", desc: "يُفكّ التطبيق إلى Smali ومانيفست وموارد حقيقية على جهازك." },
  { icon: "🪄", title: "عدّل بقالب جاهز", desc: "قطع التحديثات، تفعيل الشراء، إزالة الإعلانات، إزالة تحقق الجذر والتوقيع." },
  { icon: "🤖", title: "أو استعن بالذكاء الاصطناعي", desc: "تحليل شامل لكل الملفات، وتعديل كود بعرض الفرق قبل التطبيق." },
  { icon: "🔨", title: "ابنِ ووقّع", desc: "إعادة بناء + محاذاة + توقيع، فتحصل على APK قابل للتثبيت." },
];

const FEATURES = [
  { icon: "💻", title: "محرر أكواد احترافي", desc: "Monaco Editor مع تمييز صيغة Smali وXML وJSON وخصائص أندرويد." },
  { icon: "🧠", title: "9 مزوّدات ذكاء اصطناعي", desc: "مجانية ومدفوعة: Gemini، Groq، OpenRouter، DeepSeek، Mistral وغيرها." },
  { icon: "🪄", title: "قوالب تعديل جاهزة", desc: "تكتشف مواضع التعديل في Smali/المانيفست وتطبّقه تلقائيًا." },
  { icon: "🔐", title: "خصوصية محلية", desc: "ملفاتك تُفكّ وتُعدّل على جهازك، لا تُرفع لخادم سحابي." },
  { icon: "⚡", title: "توقيع جاهز للتثبيت", desc: "apktool + zipalign + apksigner في مسار واحد." },
  { icon: "🗂️", title: "تصنيف ذكي للملفات", desc: "Manifest، كود، موارد، مكتبات، إعدادات، أمان — كلها مبوبة." },
];

function Index() {
  const [bridgeOnline, setBridgeOnline] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const online = await bridgeHealth();
      if (!cancelled) setBridgeOnline(online);
    };
    check();
    const t = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-slate-100 dark">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-slate-800 bg-[#0a0a0f]/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight">
            APP<span className="text-primary">-</span>FORGE
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${
                bridgeOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${bridgeOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
              {bridgeOnline ? "الجسر المحلي متصل" : "الجسر غير متصل"}
            </span>
            <Link
              to="/editor"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              فتح المحرر
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs mb-6">
          أداة مفتوحة المصدر لتعديل تطبيقات أندرويد وتحليلها بالذكاء الاصطناعي
        </div>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight">
          عدّل أي تطبيق أندرويد
          <br />
          <span className="text-primary">وأعد توقيعه ليعمل</span>
        </h1>
        <p className="text-lg text-slate-400 mt-6 max-w-2xl mx-auto leading-relaxed">
          APP-FORGE يفكّ تطبيق APK إلى ملفاته الحقيقية، يصنّفها، يطبّق قوالب تعديل جاهزة
          (قطع التحديثات، تفعيل الشراء، إزالة الإعلانات)، ويستخدم الذكاء الاصطناعي للتحليل
          الشامل — ثم يعيد البناء والتوقيع ليخرج تطبيقًا قابلًا للتثبيت.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Link
            to="/editor"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-xl text-lg font-bold transition-all hover:scale-105 shadow-xl shadow-primary/20"
          >
            ابدأ الآن ←
          </Link>
          <a
            href="#how"
            className="bg-secondary text-secondary-foreground border border-border px-8 py-4 rounded-xl text-lg font-bold transition-all hover:bg-accent"
          >
            كيف يعمل؟
          </a>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-slate-800 bg-[#0f0f14]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-black text-center mb-10">كيف يعمل التطبيق؟</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {STEPS.map((s, i) => (
              <div key={i} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/50">
                <div className="text-3xl mb-3">{s.icon}</div>
                <div className="text-xs text-slate-500 mb-2">الخطوة {i + 1}</div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-black text-center mb-10">المميزات</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI providers */}
      <section className="border-t border-slate-800 bg-[#0f0f14]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-black text-center mb-4">ذكاء اصطناعي — مجاني ومدفوع</h2>
          <p className="text-slate-400 text-center max-w-2xl mx-auto mb-10 leading-relaxed">
            سجّل دخولك عبر API Key لأي مزوّد. المفاتيح تُحفظ محليًا في متصفحك فقط.
            يوجد أيضًا وضع Demo يعمل دون مفتاح.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["✨ Gemini", "⚡ Groq", "🧠 SiliconFlow", "🌐 OpenRouter", "🤝 Together", "🌀 Mistral", "🔍 DeepSeek", "🤗 Hugging Face", "🎮 Demo"].map((p, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900/60 text-sm text-slate-300">
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Legal / warning */}
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
          <div className="font-bold text-slate-300">APP-FORGE</div>
          <div>فكّ · عدّل · وقّع · ثبّت — كل ذلك على جهازك.</div>
        </div>
      </footer>
    </div>
  );
}
