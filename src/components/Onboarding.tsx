import * as React from "react";
import {
  Laptop,
  Cloud,
  Rocket,
  ShieldCheck,
  Puzzle,
  Bot,
  Hammer,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Wand2,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getStoredMode,
  setStoredMode,
  getLocalUrl,
  getCloudUrl,
  setCloudUrl,
  setOnboarded,
  bridgeHealthInfo,
  bridgeVerifyTools,
  type EditMode,
} from "@/lib/bridge-client";

type StepId = 0 | 1 | 2 | 3 | 4;

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
    title: "ذكاء اصطناعي",
    desc: "9 مزوّدات (مجاني/مدفوع) + تحليل شامل لكل الملفات وتعديل كود بعرض الفرق.",
  },
  {
    icon: <Hammer className="h-5 w-5" />,
    title: "بناء + توقيع",
    desc: "إعادة بناء ثم محاذاة وتوقيع لتخرج بملف APK قابل للتثبيت فعليًا.",
  },
];

export function Onboarding({ onDone }: { onDone?: (mode: EditMode) => void }) {
  const [step, setStep] = React.useState<StepId>(0);
  const [mode, setMode] = React.useState<EditMode>(getStoredMode());
  const [cloudUrl, setCloudUrlState] = React.useState<string>(getCloudUrl());
  const [checking, setChecking] = React.useState(false);
  const [status, setStatus] = React.useState<{
    ok: boolean;
    label: string;
    tools?: Record<string, { label: string; exists: boolean }>;
  } | null>(null);

  const persist = (m: EditMode) => {
    setMode(m);
    setStoredMode(m);
  };

  const saveAndFinish = () => {
    setStoredMode(mode);
    if (mode === "cloud" && cloudUrl.trim()) setCloudUrl(cloudUrl);
    setOnboarded();
    onDone?.(mode);
  };

  const runCheck = async () => {
    setChecking(true);
    setStatus(null);
    const m = mode;
    const base = m === "cloud" && cloudUrl.trim() ? cloudUrl : undefined;
    const info = await bridgeHealthInfo(m, base);
    if (info.status !== "ok") {
      setStatus({
        ok: false,
        label:
          m === "local"
            ? "الجسر المحلي غير متصل. شغّل: npm run bridge على جهازك أولًا (انظر الخطوة التالية)."
            : "تعذّر الوصول لخادم السحابة. تأكد من الرابط وأن الخادم مشغّل.",
      });
    } else {
      const tools = await bridgeVerifyTools(m);
      const all =
        tools["java"]?.exists &&
        tools["apktool"]?.exists &&
        tools["apksigner"]?.exists &&
        tools["zipalign"]?.exists;
      setStatus({
        ok: true,
        label: m === "cloud" ? "متصل بخادم السحابة بنجاح ✓" : "متصل بالجسر المحلي ✓",
        tools,
      });
      if (m === "local" && !all)
        setStatus((s) => ({
          ok: false,
          label: "متصل، لكن بعض الأدوات غير مثبّتة — ثبّتها من زر «Setup» لاحقًا.",
          tools,
        }));
    }
    setChecking(false);
  };

  const next = () => setStep((s) => Math.min(4, s + 1) as StepId);
  const back = () => setStep((s) => Math.max(0, s - 1) as StepId);

  const isLocal = mode === "local";
  const base = isLocal ? getLocalUrl() : cloudUrl;

  return (
    <div className="fixed inset-0 z-[200] bg-[#070810] text-slate-100 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Progress */}
          <div className="flex items-center justify-between mb-8">
            <div className="font-black text-lg tracking-tight">
              APP<span className="brand-gradient-text">-</span>FORGE
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 brand-gradient-bg" : i < step ? "w-3 bg-primary/60" : "w-3 bg-slate-700"}`}
                />
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-8 brand-ring-glow">
            {step === 0 && (
              <div>
                <div className="text-xs font-bold tracking-widest text-primary uppercase mb-3">
                  مرحبًا بك 👋
                </div>
                <h1 className="text-3xl font-black leading-tight mb-4">
                  عدّل أي تطبيق أندرويد
                  <br />
                  <span className="brand-gradient-text">وأعد توقيعه ليعمل</span>
                </h1>
                <p className="text-slate-400 leading-relaxed mb-6">
                  APP-FORGE يفكّ تطبيق الـ APK إلى ملفاته الحقيقية، يطبّق قوالب تعديل جاهزة، يستعين
                  بالذكاء الاصطناعي للتحليل الشامل، ثم يعيد البناء والتوقيع لتحصل على APK قابل
                  للتثبيت. سنرافقك في 5 خطوات قصيرة.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CAPABILITIES.map((c, i) => (
                    <div
                      key={i}
                      className="flex gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700"
                    >
                      <div className="text-primary shrink-0 mt-0.5">{c.icon}</div>
                      <div>
                        <div className="font-bold text-sm">{c.title}</div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">{c.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-black mb-2">أين سيتم التعديل؟</h2>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                  APP-FORGE يعمل بطريقتين. كلاهما يقدّم نفس الميزات، الفرق في <b>المكان</b> الذي
                  تُنفَّذ فيه عمليات الفكّ والتوقيع.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => persist("local")}
                    className={`text-right p-5 rounded-2xl border transition-all ${isLocal ? "border-primary bg-primary/15 brand-ring-glow" : "border-slate-700 bg-slate-800/30 hover:bg-slate-800"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="p-2 rounded-lg bg-primary/20 text-primary">
                        <Laptop className="h-5 w-5" />
                      </span>
                      <span className="font-black">محلي (موصى به)</span>
                      {isLocal && <Check className="h-4 w-4 text-primary mr-auto" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      يعمل الجسر على جهازك أنت. ملفاتك لا تغادر جهازك إطلاقًا — أسرع وأكثر خصوصية.
                      يتطلب تشغيل <code className="text-primary">npm run bridge</code> وتثبيت
                      الأدوات بنقرة واحدة.
                    </p>
                  </button>
                  <button
                    onClick={() => persist("cloud")}
                    className={`text-right p-5 rounded-2xl border transition-all ${!isLocal ? "border-primary bg-primary/15 brand-ring-glow" : "border-slate-700 bg-slate-800/30 hover:bg-slate-800"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="p-2 rounded-lg bg-primary/20 text-primary">
                        <Cloud className="h-5 w-5" />
                      </span>
                      <span className="font-black">سحابي</span>
                      {!isLocal && <Check className="h-4 w-4 text-primary mr-auto" />}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      الاتصال بخادم جسر مستضاف على السحابة (الواجهة نفسها). لا يحتاج تثبيت أدوات على
                      جهازك — فقط أدخل رابط خادمك السحابي في الخطوة التالية.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
                  {isLocal ? (
                    <Laptop className="h-6 w-6 text-primary" />
                  ) : (
                    <Cloud className="h-6 w-6 text-primary" />
                  )}
                  إعداد وضع {isLocal ? "«محلي»" : "«سحابي»"}
                </h2>
                {isLocal ? (
                  <div className="mt-4 space-y-4 text-sm text-slate-400 leading-relaxed">
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700">
                      <div className="font-bold text-slate-200 mb-2">① شغّل الجسر المحلي</div>
                      <p>افتح نافذة طرفية في مجلد المشروع ثم:</p>
                      <code className="block mt-2 p-3 rounded bg-slate-900 border border-slate-700 text-emerald-400 font-mono text-xs">
                        npm run bridge
                      </code>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700">
                      <div className="font-bold text-slate-200 mb-2">② تحقّق من الاتصال</div>
                      <p>
                        اضغط «تحقّق الآن» أدناه — سيتحول المؤشر إلى Bridge أخضر عندما يكون الجسر
                        جاهزًا.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                      الأدوات (Java/apktool/build-tools) تُثبَّت بضغطة زر واحدة من «Setup» داخل
                      المحرر، أو عبر سكربت PowerShell الجاهز.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <p className="text-sm text-slate-400 leading-relaxed">
                      أدخل الرابط العام لخادم الجسر السحابي (المكان المحدّد الذي تُستضاف فيه واجهة
                      <code className="text-primary"> server/apk-bridge.mjs</code>). مثال:
                    </p>
                    <code className="block p-3 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono text-xs break-all">
                      https://appforge-bridge.example.com
                    </code>
                    <input
                      value={cloudUrl}
                      onChange={(e) => setCloudUrlState(e.target.value)}
                      placeholder="https://your-cloud-bridge.com"
                      dir="ltr"
                      className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-slate-500">
                      سيُحفظ هذا الرابط ويُستخدام كوضع «سحابي» في التطبيق، ويمكن تعديله لاحقًا من
                      إعدادات الاتصال.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex items-center gap-3">
                  <Button onClick={runCheck} disabled={checking} className="gap-2">
                    {checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    تحقّق الآن
                  </Button>
                  {status && (
                    <div
                      className={`text-xs flex-1 ${status.ok ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {status.label}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-2xl font-black mb-4">كيفية الاستخدام — نظرة كاملة</h2>
                <div className="space-y-2.5 text-sm">
                  {[
                    [
                      "📦",
                      "ارفع الـ APK",
                      "اسحب الملف أو اضغط لرفعه؛ يُفكّ تلقائيًا إلى Smali ومانيفست وموارد.",
                    ],
                    [
                      "📂",
                      "صفّف وعدّل",
                      "العمود الأيسر يعرض الملفات مصنّفة (كود/موارد/إعدادات/أمان). اضغط أي ملف لتحريره في Monaco.",
                    ],
                    [
                      "🪄",
                      "قوالب جاهزة (Mods)",
                      "زر «Mods»: اكتشف مواضع التعديل ثم طبّقها بضغطة (تحديثات/شراء/إعلانات/جذر/توقيع).",
                    ],
                    [
                      "🤖",
                      "ذكاء اصطناعي",
                      "العمود الأيمن: محادثة AI + «تحليل شامل» لكل الملفات. المفاتيح محلية فقط.",
                    ],
                    [
                      "🔨",
                      "ابنِ ووقّع",
                      "زر «Build» يعيد البناء والمحاذاة والتوقيع وينزّل APK جاهزًا للتثبيت.",
                    ],
                  ].map(([icon, t, d], i) => (
                    <div
                      key={i}
                      className="flex gap-3 p-3 rounded-xl bg-slate-800/30 border border-slate-700"
                    >
                      <span className="text-xl shrink-0">{icon}</span>
                      <div>
                        <div className="font-bold">{t}</div>
                        <div className="text-slate-400 text-xs leading-relaxed">{d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full brand-gradient-bg brand-ring-glow">
                    <Rocket className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-black text-center mb-2">كل شيء جاهز! 🚀</h2>
                <p className="text-center text-slate-400 text-sm leading-relaxed mb-2">
                  ستبدأ في وضع <b className="text-primary">{isLocal ? "«محلي»" : "«سحابي»"}</b>. عند
                  الحاجة يمكنك تبديل الوضع من الشريط العلوي في أي وقت، وفتح هذا الدليل مجددًا من زر
                  المساعدة.
                </p>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
                  ⚠️ <b>تنبيه قانوني:</b> استخدم الأداة للأغراض التعليمية وللتطبيقات التي تملك الحق
                  في تعديلها. تعديل تطبيقات الآخرين (إزالة الشراء/الإعلانات) قد يخالف شروط الاستخدام
                  وقوانين حقوق الملكية. احتفظ دائمًا بنسخة احتياطية واختبر بعد كل تعديل.
                </div>
              </div>
            )}

            {/* Nav */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
              <Button
                variant="ghost"
                onClick={back}
                disabled={step === 0}
                className="gap-1 text-slate-400"
              >
                <ArrowRight className="h-4 w-4" /> السابق
              </Button>
              {step < 4 ? (
                <Button onClick={next} className="gap-1">
                  التالي <ArrowLeft className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={saveAndFinish} className="gap-2 brand-gradient-bg">
                  <Check className="h-4 w-4" /> ابدأ التعديل
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
