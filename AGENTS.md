<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

---

# APP-FORGE — دليل التطوير الكامل (لكل من يعمل على المشروع، ولوفابل)

## ما هذا المشروع؟

**APP-FORGE** تطبيق ويب لتعديل تطبيقات أندرويد (APK): يفكّ التطبيق، يصنّف ملفاته،
يطبّق قوالب تعديل جاهزة، يحلّله بالذكاء الاصطناعي، ثم يعيد البناء والتوقيع ليخرج
APK قابلًا للتثبيت.

## البنية (Architecture) — مهم جدًا

التطبيق جزآن منفصلان:

1. **الواجهة (هذا المشروع)** — TanStack Start + Vite + React 19 + Monaco Editor.
   تعمل في المتصفح، وتُستضاف على Lovable (أو تعمل محليًا بـ `npm run dev`).

2. **الجسر المحلي (Local Bridge)** — خادم Node مستقل في `server/apk-bridge.mjs`
   يعمل **على جهاز المستخدم**، ويشغّل أدوات أندرويد الحقيقية:
   `apktool` (فكّ/بناء) + `zipalign` + `apksigner` (توقيع).

> ⚠️ **لماذا هذا الفصل؟** المتصفح لا يستطيع فكّ/توقيع APK. والجسر يتطلب Java 17 +
> أدوات أندرويد مثبّتة محليًا. لذلك **لا تحاول** تشغيل apktool على خادم Lovable —
> لا توجد أدوات هناك. الجسر يعمل دائمًا محليًا على جهاز المستخدم، وتتواصل معه الواجهة
> عبر `http://localhost:3000` (وهذا يعمل حتى لو كانت الواجهة مستضافة على Lovable، لأن
> `localhost` من جهة المتصفح تعني جهاز المستخدم نفسه).

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل الواجهة محليًا (Vite) |
| `npm run build` | بناء الواجهة للإنتاج |
| `npm run bridge` | تشغيل الجسر المحلي (فكّ + توقيع) — يتطلب Java/apktool |
| `npm run lint` / `npm run format` | فحص وتنسيق الكود |

## متغيّرات البيئة (.env)

موجودة في `.env` (وتُحقن VITE_* منها إلى الواجهة):

- `VITE_SUPABASE_URL` / `SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — مطلوب فقط لدوال الخادم المتصلة بـ Supabase.

> ملاحظة: مسار Supabase غير مستخدم حاليًا في أي مسار فعّال بعد تنظيف الكود الميت
> (`src/lib/apk.functions.ts` حُذف). يمكن تجاهله، أو تفعيله لاحقًا لحفظ المشاريع.

## هيكل الملفات المهم

```
src/routes/index.tsx        → الصفحة الرئيسية (الشرح والتسويق)
src/routes/editor.tsx       → محرر التعديل الكامل (القلب)
src/routes/__root.tsx       → الهيكل الجذري + الوسوم الوصفية (meta)
src/lib/ai-service.ts       → طبقة الذكاء الاصطناعي (9 مزوّدات + تحليل شامل)
src/lib/bridge-client.ts    → عميل الجسر (typesafe، مدروس بالوضع محلي/سحابي)
src/lib/apk-processor.ts    → معالجة داخل المتصفح (احتياطي JSZip)
src/components/SetupGuide.tsx → تثبيت الأدوات + حالة كل أداة + سكربت PowerShell
src/components/Onboarding.tsx → مرشد أول استخدام (5 خطوات)
src/components/ConnectionSettings.tsx → إعدادات الاتصال (محلي/سحابي)
server/apk-bridge.mjs       → الجسر المحلي (فكّ/بناء/توقيع/قوالب)
server/mods.mjs             → محرك قوالب التعديل الجاهزة
```

## قواعد مهمة عند التعديل

- **لا تعدّل** `src/routeTree.gen.ts` يدويًا (يُولّد تلقائيًا من المسارات).
- **لا تعدّل** `src/integrations/supabase/*` (مولّدة تلقائيًا).
- ملفات المسارات بنمط file-based routing — أضف ملفًا في `src/routes/` ليظهر كمسار.
- الذكاء الاصطناعي: المفاتيح تُحفظ في `localStorage` (وليس على خادم). لا ترسلها للخادم.
- التعديلات على الجسر (server/*.mjs) تحتاج إعادة تشغيل `npm run bridge`.

## مسارا التعديل: محلي + سحابي (أُضيف في هذه المرحلة)

التطبيق يدعم **وضعين** للتعديل، قابلين للتبديل من الشريط العلوي للمحرر ومن الصفحة
الرئيسية:

1. **محلي (Local)** — الجسر يعمل على جهاز المستخدم (`http://localhost:3000`).
2. **سحابي (Cloud)** — الاتصال بنفس جسر `server/apk-bridge.mjs` لكن مستضافًا على
   خادم عام (المكان المحدّد). الرابط يُضبط من **إعدادات الاتصال** (`ConnectionSettings`)
   ويُحفظ في `localStorage` (`APPFORGE_CLOUD_URL`) مع قيمة افتراضية من `.env`
   (`VITE_APPFORGE_CLOUD_URL`).

### بنية الوضعين
- `src/lib/bridge-client.ts` يوفّر `EditMode` ودوال `getBridgeBaseFor(mode)`,
  `getLocalUrl()`, `getCloudUrl()`, `bridgeHealthInfo(mode)`, `bridgeVerifyTools(mode)`.
- **كل عمليات الجسر** (رفع/قراءة/كتابة/بناء/قوالب/تحليل) تستخدم `getBridgeBase()`
  الذي يعكس الوضع الفعّال تلقائيًا، فلا يتغير كودها.
- `src/components/Onboarding.tsx` — مرشد أول استخدام (5 خطوات) يشرح الإمكانات ويختار الوضع.
- `src/components/ConnectionSettings.tsx` — ضبط الروابط والوضع مع فحص الاتصال.
- `src/components/SetupGuide.tsx` — أصبح مدروسًا بالوضع (`baseUrl`/`mode`) ويوفّر
  **سكربت PowerShell** لفحص/تثبيت الأدوات بنقرة واحدة عبر `GET /api/install.ps1`.

### نشر الجسر السحابي
الواجهة لا تفكّ/توقّع APK بنفسها. لتشغيل الوضع السحابي انشر `server/apk-bridge.mjs`
على خادم Node.js عام (Render/Railway/VPS+PM2) مع تثبيت Java 17 + apktool + build-tools
على ذلك الخادم، ثم أدخل رابط الخادم في إعدادات الاتصال. الجسر يفعّل CORS `*` تلقائيًا.

## المتطلبات المحلية للتعديل الفعلي (للمستخدم النهائي)

1. **Java 17+** — `winget install --id EclipseAdoptium.Temurin.17.JDK -e`
2. **apktool** — `winget install --id apktool.apktool -e`
3. **Android Build Tools** (apksigner + zipalign) — عبر Android Studio أو `sdkmanager "build-tools;34.0.0"`
4. شغّل `npm run bridge` ثم استخدم التطبيق (يتحول المؤشر إلى "Bridge" أخضر).

بدون هذه الأدوات يعمل التطبيق في وضع "Browser" (فكّ ZIP داخل المتصفح) لكن **الناتج
لن يكون موقّعًا ولا قابلًا للتثبيت**.

## ملاحظة قانونية

التطبيق للأغراض التعليمية والتطبيقات التي تملك حق تعديلها. تعديل تطبيقات الآخرين
(إزالة الشراء/الإعلانات) قد يخالف شروط الاستخدام وحقوق الملكية.
