# APP-FORGE

**أداة لتعديل تطبيقات أندرويد (APK) وإعادة توقيعها — مدعومة بالذكاء الاصطناعي.**

يفكّ APP-FORGE التطبيق إلى ملفاته الحقيقية (Smali + AndroidManifest + موارد)، يصنّفها،
يطبّق قوالب تعديل جاهزة (قطع التحديثات، تفعيل الشراء بلا إنترنت، إزالة الإعلانات، إزالة
تحقق الجذر والتوقيع)، ويحلّلها بالذكاء الاصطناعي، ثم يعيد البناء والتوقيع لتحصل على
APK قابل للتثبيت.

---

## ⚡ التشغيل السريع

```sh
git clone <this-repository-url>
cd app-forge
npm i
npm run dev          # الواجهة
npm run bridge       # الجسر المحلي (نافذة طرفية ثانية) — يتطلب Java 17 + apktool
```

ثم افتح `http://localhost:5173`.

> للحصول على التعديل الفعلي (فكّ + توقيع)، يجب تثبيت الأدوات أولًا وتشغيل `npm run bridge`.
> الواجهة تكتشف الجسر تلقائيًا وتعرض مؤشر "Bridge" أخضر عند اتصاله.

## 🔀 مسارا التعديل: محلي + سحابي

APP-FORGE يعمل بطريقتين، تختارهما من الشريط العلوي في المحرر (أو من الصفحة الرئيسية):

| | **محلي (Local)** | **سحابي (Cloud)** |
|---|---|---|
| أين تعمل عمليات الفكّ/التوقيع؟ | على جهازك (`http://localhost:3000`) | على خادم سحابي مستضاف |
| يتطلب أدوات على جهازك؟ | نعم (تثبيت بنقرة أو سكربت PowerShell) | لا |
| الإعداد | شغّل `npm run bridge` | أدخل رابط خادمك في «إعدادات الاتصال» |
| الميزة | أسرع وأكثر خصوصية | يعمل دون أدوات محلية |

**سكربت PowerShell (زرّ واحد):** من نافذة **Setup** ← «تنزيل سكربت PowerShell»، أو
نقطة النهاية `GET /api/install.ps1`، تحصل على سكربت يفحص Java/apktool/apksigner/zipalign
ويُثبّت الناقص تلقائيًا عبر winget.

> لتشغيل الوضع السحابي: انشر `server/apk-bridge.mjs` على خادم Node عام (مع Java/apktool
> على الخادم) ثم أدخل رابط الخادم في إعدادات الاتصال. التفاصيل في [`AGENTS.md`](./AGENTS.md).

## 📋 متطلبات التعديل الفعلي

1. **Java 17+** — `winget install --id EclipseAdoptium.Temurin.17.JDK -e`
2. **apktool** — `winget install --id apktool.apktool -e`
3. **Android Build Tools** (apksigner + zipalign) — عبر Android Studio أو `sdkmanager "build-tools;34.0.0"`

يمكن تثبيت Java وapktool تلقائيًا من داخل التطبيق (زر **Setup** ← "تثبيت تلقائي الآن").

## 🧠 مزوّدات الذكاء الاصطناعي

يدعم 9 مزوّدات عبر API Key (تُحفظ محليًا في متصفحك فقط):

- **مجانية**: Gemini، Groq، SiliconFlow، OpenRouter (:free)، Together، Mistral، Hugging Face
- **مدفوعة/منخفضة التكلفة**: DeepSeek
- **Demo**: يعمل دون مفتاح (تحليل محلي)

## 🏗️ البنية

- **الواجهة**: TanStack Start + Vite + React 19 + Monaco Editor + Tailwind.
- **الجسر المحلي**: `server/apk-bridge.mjs` (Node/Express) يشغّل apktool/zipalign/apksigner،
  ويستضيف محرك القوالب `server/mods.mjs`.

التوثيق التفصيلي للمطوّرين في [`AGENTS.md`](./AGENTS.md)، والتحليل الكامل للمشروع في [`ANALYSIS.md`](./ANALYSIS.md).

## ☁️ الربط مع Lovable

هذا المشروع مبني على [Lovable](https://lovable.dev) ومتصل به. أي commit تدفعه إلى الفرع
المتصل يتزامن تلقائيًا مع محرر Lovable.

- **لا تعِد كتابة التاريخ** (لا force-push / rebase / amend) للcommits المرفوعة مسبقًا.
- حافظ على الفرع في حالة تعمل (`npm run build` ينجح).
- الجسر المحلي يعمل دائمًا على جهاز المستخدم؛ لا تحاول تشغيله على خادم Lovable.
