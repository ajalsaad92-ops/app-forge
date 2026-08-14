// APP-FORGE Mods Engine
// -----------------------------------------------------------------------------
// Ready-made modification templates ("recipes") that operate on the decompiled
// APK tree produced by apktool. Each mod knows how to:
//
//   * detect   — find editable spots (smali methods / AndroidManifest entries)
//   * apply    — apply the patch (force a boolean method's return value,
//                or remove ad/update components from the manifest)
//
// These are best-effort educational patches. They never claim to be
// exhaustive: the UI tells the user to keep a backup and test after each mod.
// -----------------------------------------------------------------------------

import fsp from "node:fs/promises";
import path from "node:path";

const TEXT_EXTS = new Set([".smali", ".xml", ".json", ".txt", ".yml", ".yaml", ".properties"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // skip huge text files (safety)

// ---------------------------------------------------------------------------
// Smali parsing helpers
// ---------------------------------------------------------------------------

const METHOD_RE = /\.method[^\n]*\n([\s\S]*?)\.end method/g;

function parseSmaliMethods(content) {
  const methods = [];
  METHOD_RE.lastIndex = 0;
  let m;
  while ((m = METHOD_RE.exec(content)) !== null) {
    const decl = m[0].split("\n")[0];
    const nameMatch = decl.match(/([\w$<>]+)\(/);
    const retMatch = decl.match(/\)\s*([\w$<>/;\[\]]+)/);
    methods.push({
      decl,
      name: nameMatch ? nameMatch[1] : "",
      returnType: retMatch ? retMatch[1] : "",
      body: m[1],
      full: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return methods;
}

// Insert `const/4 reg, value` immediately before the last `return reg`.
// This is the canonical, register-safe way to force a boolean/int method result.
function forceReturn(fullMethod, value) {
  const re = /([ \t]*)return\s+([vp]\d+)/g;
  let last = null;
  let m;
  while ((m = re.exec(fullMethod)) !== null) last = m;
  if (!last) return null;
  const indent = last[1] || "";
  const reg = last[2];
  const insert = `${indent}const/4 ${reg}, ${value}\n`;
  return fullMethod.slice(0, last.index) + insert + fullMethod.slice(last.index);
}

const BOOL_ISH = new Set(["Z", "I"]); // boolean or int — safe to force 0x0/0x1

// ---------------------------------------------------------------------------
// Manifest helpers (apktool outputs plain-text XML)
// ---------------------------------------------------------------------------

function removeComponents(xml, nameRe) {
  const isMatch = (block) => {
    const name = (block.match(/android:name="([^"]+)"/) || [])[1] || "";
    return nameRe.test(name);
  };
  // 1) self-closing components: <activity ... />
  const selfCloseRe = /<(activity|service|receiver|provider)\b[^>]*\/>/g;
  let out = xml.replace(selfCloseRe, (block) => (isMatch(block) ? "" : block));
  // 2) balanced components: <activity ...> ... </activity> (opening tag not self-closing)
  const blockRe = /<(activity|service|receiver|provider)\b[^>]*[^/]>[\s\S]*?<\/\1>/g;
  out = out.replace(blockRe, (block) => (isMatch(block) ? "" : block));
  return out;
}

function removeMetaData(xml, valueRe) {
  // 1) self-closing: <meta-data ... />
  const selfCloseRe = /<meta-data\b[^>]*\/>/g;
  let out = xml.replace(selfCloseRe, (block) => (valueRe.test(block) ? "" : block));
  // 2) balanced: <meta-data ...> ... </meta-data>
  const blockRe = /<meta-data\b[^>]*[^/]>[\s\S]*?<\/meta-data>/g;
  out = out.replace(blockRe, (block) => (valueRe.test(block) ? "" : block));
  return out;
}

function countComponents(xml, nameRe) {
  const re = /<(activity|service|receiver|provider)[^>]*\bandroid:name="([^"]+)"/g;
  let n = 0;
  let m;
  while ((m = re.exec(xml)) !== null) if (nameRe.test(m[2])) n++;
  return n;
}

function countMetaData(xml, valueRe) {
  const re = /<meta-data[^>]*>/g;
  let n = 0;
  let m;
  while ((m = re.exec(xml)) !== null) if (valueRe.test(m[0])) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Mod definitions
// ---------------------------------------------------------------------------

export const MODS = [
  {
    id: "disable-updates",
    name: "Disable Force Updates",
    nameAr: "قطع التحديثات الإجبارية",
    icon: "🚫",
    category: "updates",
    descriptionAr:
      "يكتشف دوال فحص التحديث في Smali ويجعلها تعود بـ(لا يوجد تحديث)، ويزيل أنشطة/مستقبِلات التحديث من المانيفست.",
    smali: {
      name: /update|checkupdate|forceupdate|latestversion|isupdate|versioncheck|checkversion/i,
      body: /checkForUpdate|forceUpdate|checkUpdate|getLatestVersion|isUpdateAvailable|updateUrl|appUpdate|\.apk["/]|update\.json/i,
    },
    forceValue: "0x0",
    manifestComponent: /update/i,
  },
  {
    id: "enable-premium",
    name: "Unlock Premium (Offline)",
    nameAr: "تفعيل الشراء/المميزات بلا إنترنت",
    icon: "👑",
    category: "premium",
    descriptionAr:
      "يكتشف دوال التحقق من الشراء/الترخيص (isPremium / isPurchased / checkLicense...) ويجعلها تعود بـ(مفعّل).",
    smali: {
      name: /isPremium|isPurchased|isPro|isUnlocked|hasPremium|checkLicense|isLicensed|isVip|isSubscribed|getPurchaseState|isPaid|hasPurchased/i,
      body: /billingclient|LICENSED|NOT_LICENSED|premium|purchase|unlock|inappbilling|licensecheck/i,
    },
    forceValue: "0x1",
  },
  {
    id: "remove-ads",
    name: "Remove Ads",
    nameAr: "إزالة الإعلانات",
    icon: "📢",
    category: "ads",
    descriptionAr:
      "يكتشف ويحذف إدخالات شبكات الإعلانات (AdMob/Unity Ads/AppLovin/MoPub) من المانيفست، ويُبلغ عن مراجعها في Smali.",
    smali: {
      body: /com\/google\/android\/gms\/ads|com\.google\.android\.gms\.ads|AdView|InterstitialAd|RewardedAd|com\.mopub|com\.unity3d\.ads|com\.applovin|loadAd|AdMob/i,
    },
    forceValue: null,
    manifestComponent: /\.(ads|ad)\b|AdActivity|AdMob/i,
    manifestMetaData: /com\.google\.android\.gms\.ads|admob|ad_unit|adUnit|APPLICATION_ID/i,
  },
  {
    id: "remove-root-detection",
    name: "Remove Root Detection",
    nameAr: "إزالة تحقق الجذر",
    icon: "🛡️",
    category: "security",
    descriptionAr:
      "يكتشف دوال فحص صلاحيات الجذر (RootBeer / checkRoot / isRooted) ويجعلها تعود بأن الجهاز غير مهكر.",
    smali: {
      name: /isRooted|checkRoot|isDeviceRooted|detectRoot|rootBeer|hasRoot|isRootAvailable/i,
      body: /\/system\/app\/Superuser\.apk|test-keys|magisk|frida|com\.topjohnwu|which\s+su|rootbeer|RootBeer|checkRoot/i,
    },
    forceValue: "0x0",
  },
  {
    id: "remove-signature-check",
    name: "Bypass Signature Check",
    nameAr: "تجاوز تحقق التوقيع",
    icon: "✍️",
    category: "security",
    descriptionAr:
      "يكتشف دوال التحقق من التوقيع ويجعلها تعود بأن التوقيع صحيح (مفيد بعد إعادة التوقيع بمفتاح جديد).",
    smali: {
      name: /checkSignature|verifySignature|isSignatureValid|checkSign|verifySign|signatureValid/i,
      body: /getPackageInfo|GET_SIGNATURES|signature|SIGNATURES|checkSign/i,
    },
    forceValue: "0x1",
  },
];

// ---------------------------------------------------------------------------
// Detection & application
// ---------------------------------------------------------------------------

async function collectTextFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "original") await walk(full); // skip apktool's backup copy
      } else if (TEXT_EXTS.has(path.extname(e.name).toLowerCase())) {
        out.push({
          path: path.relative(root, full).split(path.sep).join("/"),
          full,
          name: e.name,
        });
      }
    }
  }
  await walk(root);
  return out;
}

function smaliMatches(mod, name, body) {
  if (mod.smali.name && mod.smali.name.test(name)) return true;
  if (mod.smali.body && mod.smali.body.test(body)) return true;
  return false;
}

export async function detectMod(root, mod) {
  const files = await collectTextFiles(root);
  const matches = [];
  for (const f of files) {
    let stat;
    try {
      stat = await fsp.stat(f.full);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;
    const content = await fsp.readFile(f.full, "utf8");

    if (f.name.endsWith(".smali") && mod.smali) {
      for (const meth of parseSmaliMethods(content)) {
        if (smaliMatches(mod, meth.name, meth.body + "\n" + meth.decl)) {
          matches.push({
            path: f.path,
            kind: "smali",
            method: meth.name,
            snippet: meth.decl.trim(),
          });
        }
      }
    } else if (f.name === "AndroidManifest.xml") {
      if (mod.manifestComponent) {
        const n = countComponents(content, mod.manifestComponent);
        if (n > 0) matches.push({ path: f.path, kind: "manifest-component", method: null, snippet: `${n} عنصر مكوّن مطابق` });
      }
      if (mod.manifestMetaData) {
        const n = countMetaData(content, mod.manifestMetaData);
        if (n > 0) matches.push({ path: f.path, kind: "manifest-meta", method: null, snippet: `${n} عنصر meta-data مطابق` });
      }
    }
  }
  return matches;
}

function applySmaliForce(content, mod, value) {
  const methods = parseSmaliMethods(content);
  if (methods.length === 0) return content;
  let result = content;
  for (let i = methods.length - 1; i >= 0; i--) {
    const meth = methods[i];
    if (!BOOL_ISH.has(meth.returnType)) continue;
    if (!smaliMatches(mod, meth.name, meth.body + "\n" + meth.decl)) continue;
    const forced = forceReturn(meth.full, value);
    if (!forced || forced === meth.full) continue;
    result = result.slice(0, meth.start) + forced + result.slice(meth.end);
  }
  return result;
}

export async function applyMod(root, mod) {
  const files = await collectTextFiles(root);
  const changed = [];
  for (const f of files) {
    let content;
    try {
      content = await fsp.readFile(f.full, "utf8");
    } catch {
      continue;
    }
    let next = content;

    if (f.name.endsWith(".smali") && mod.forceValue) {
      next = applySmaliForce(content, mod, mod.forceValue);
    } else if (f.name === "AndroidManifest.xml") {
      if (mod.manifestComponent) next = removeComponents(next, mod.manifestComponent);
      if (mod.manifestMetaData) next = removeMetaData(next, mod.manifestMetaData);
    }

    if (next !== content) {
      await fsp.writeFile(f.full, next, "utf8");
      changed.push(f.path);
    }
  }
  return changed;
}

// JSON-safe summary (strip RegExp and functions).
export function modsSummary() {
  return MODS.map(({ id, name, nameAr, icon, category, descriptionAr }) => ({
    id,
    name,
    nameAr,
    icon,
    category,
    descriptionAr,
  }));
}
