// APP-FORGE Local Bridge
// -----------------------------------------------------------------------------
// A real local server that performs the heavy Android work that a browser
// cannot do on its own:
//
//   1. Decompile an uploaded APK  -> `apktool d`  (real smali, AndroidManifest.xml, resources)
//   2. Serve the decompiled tree  -> the web UI edits files through this server
//   3. Rebuild + align + sign     -> `apktool b` + `zipalign` + `apksigner sign`
//
// It replaces the old `local-bridge-mock.ts` stub. Run it with:
//
//     npm run bridge
//
// and keep it running on the same machine as the web app (default port 3000,
// the same port the SetupGuide already expects).
// -----------------------------------------------------------------------------

import express from "express";
import multer from "multer";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { MODS, detectMod, applyMod, modsSummary } from "./mods.mjs";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const WORKSPACE = process.env.APPFORGE_WORKSPACE || path.join(os.tmpdir(), "appforge-bridge");
const INCOMING_DIR = path.join(WORKSPACE, "incoming");
const KEYSTORE_PATH = path.join(WORKSPACE, "appforge.keystore");

const KEYSTORE = {
  alias: "appforge",
  storepass: "appforge123",
  keypass: "appforge123",
  dname: "CN=APP-FORGE, O=APP-FORGE, C=US",
  validity: "10000",
};

const app = express();
app.use(express.json({ limit: "50mb" }));

// CORS: allow any origin so the browser UI (and the preview host) can talk to us.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// Tooling helpers
// ---------------------------------------------------------------------------

const TOOLS = {
  java: { label: "Java (JDK 17+)", test: () => runOk("java", ["-version"]) },
  apktool: { label: "Apktool", test: () => runOk("apktool", ["--version"]) },
  apksigner: { label: "apksigner (Android Build Tools)", test: () => runOk("apksigner", ["--version"]) },
  zipalign: { label: "zipalign (Android Build Tools)", test: () => commandExists("zipalign") },
};

async function commandExists(cmd) {
  try {
    const probe = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
    await execAsync(probe, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function runOk(cmd, args) {
  try {
    await execFileAsync(cmd, args, { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, { timeout = 120000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  return execFileAsync(cmd, args, {
    timeout,
    maxBuffer,
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------
// APK workspace state
// ---------------------------------------------------------------------------

let state = {
  projectName: null,
  apkPath: null, // uploaded original
  decompiledDir: null,
  builtApk: null,
  signedApk: null,
  error: null,
};

function textLike(name) {
  const ext = path.extname(name).toLowerCase();
  return [
    ".smali", ".xml", ".json", ".txt", ".yml", ".yaml", ".properties",
    ".java", ".kt", ".gradle", ".md", ".html", ".css", ".js", ".ts", ".csv",
  ].includes(ext);
}

async function listDirRecursive(dir, base = dir) {
  const out = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      out.push({ type: "folder", path: rel });
      out.push(...(await listDirRecursive(full, base)));
    } else {
      const stat = await fsp.stat(full);
      out.push({
        type: "file",
        path: rel,
        size: stat.size,
        editable: textLike(entry.name),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AndroidManifest.xml parser (apktool outputs plain-text XML)
// ---------------------------------------------------------------------------

function parseManifest(xml) {
  const get = (re) => {
    const m = xml.match(re);
    return m ? m[1] : null;
  };
  const getAll = (tag, attr) => {
    const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]+)"`, "g");
    const res = [];
    let m;
    while ((m = re.exec(xml)) !== null) res.push(m[1]);
    return res;
  };
  const safeGetAll = (tag) => {
    // attributes may appear in any order; grab name="..." from the tag
    const re = new RegExp(`<${tag}[^>]*>`, "g");
    const res = [];
    let m;
    while ((m = re.exec(xml)) !== null) {
      const name = m[0].match(/\bname="([^"]+)"/);
      const exported = m[0].match(/\bexported="([^"]+)"/);
      if (name) res.push({ name: name[1], exported: exported ? exported[1] === "true" : undefined });
    }
    return res;
  };
  return {
    packageName: get(/package="([^"]+)"/) || get(/package='([^']+)'/),
    versionName: get(/android:versionName="([^"]+)"/),
    versionCode: get(/android:versionCode="([^"]+)"/),
    minSdk: get(/android:minSdkVersion="([^"]+)"/),
    targetSdk: get(/android:targetSdkVersion="([^"]+)"/),
    appName: null,
    debuggable: get(/android:debuggable="([^"]+)"/) === "true",
    permissions: getAll("uses-permission", "android:name").map((n) => {
      const last = n.split(".").pop();
      return { name: n, isDangerous: /CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|READ_CONTACTS|WRITE_CONTACTS|READ_SMS|SEND_SMS|READ_PHONE_STATE|CALL_PHONE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|BODY_SENSORS|ACTIVITY_RECOGNITION/.test(last) };
    }),
    activities: safeGetAll("activity"),
    services: safeGetAll("service"),
    receivers: safeGetAll("receiver"),
    providers: safeGetAll("provider"),
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", port: PORT, projectLoaded: !!state.decompiledDir });
});

app.get("/api/verify-tool", async (req, res) => {
  const tool = (req.query.tool || "").toString().toLowerCase();
  const entry = TOOLS[tool];
  if (!entry) return res.status(400).json({ error: "Unknown tool", tool });
  const exists = await entry.test();
  res.json({ tool, label: entry.label, exists });
});

app.get("/api/tools", async (req, res) => {
  const results = {};
  for (const [id, entry] of Object.entries(TOOLS)) {
    results[id] = { label: entry.label, exists: await entry.test() };
  }
  res.json(results);
});

app.post("/api/install-tools", async (req, res) => {
  // Real best-effort install. Returns per-command results so the UI can show
  // exactly what succeeded. Manual instructions remain in the SetupGuide.
  const plan = process.platform === "win32"
    ? [
        "winget install --id EclipseAdoptium.Temurin.17.JDK -e --accept-source-agreements --accept-package-agreements",
        "winget install --id apktool.apktool -e --accept-source-agreements --accept-package-agreements",
      ]
    : process.platform === "darwin"
      ? ["brew install --cask temurin", "brew install apktool"]
      : [];

  if (plan.length === 0) {
    return res.json({
      message: "التثبيت التلقائي غير مدعوم على نظام التشغيل هذا. ثبّت JDK 17 + apktool + Android build-tools يدويًا.",
      results: [],
      unsupported: true,
    });
  }

  const results = [];
  for (const cmd of plan) {
    try {
      await execAsync(cmd, { timeout: 10 * 60 * 1000 });
      results.push({ cmd, ok: true });
    } catch (err) {
      results.push({ cmd, ok: false, error: err.message });
    }
  }
  res.json({ message: "تم تشغيل أوامر التثبيت", results });
});

// ---------------------------------------------------------------------------
// Mods engine (ready-made patches)
// ---------------------------------------------------------------------------

app.get("/api/mods", (req, res) => {
  res.json({ mods: modsSummary() });
});

app.post("/api/mods/detect", async (req, res) => {
  try {
    const { modId } = req.body || {};
    if (!state.decompiledDir) return res.status(400).json({ error: "لا يوجد مشروع محمّل. ارفع APK أولًا." });
    const mod = MODS.find((m) => m.id === modId);
    if (!mod) return res.status(400).json({ error: "قالب غير معروف" });
    const matches = await detectMod(state.decompiledDir, mod);
    res.json({ modId, count: matches.length, matches: matches.slice(0, 300) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mods/apply", async (req, res) => {
  try {
    const { modId } = req.body || {};
    if (!state.decompiledDir) return res.status(400).json({ error: "لا يوجد مشروع محمّل. ارفع APK أولًا." });
    const mod = MODS.find((m) => m.id === modId);
    if (!mod) return res.status(400).json({ error: "قالب غير معروف" });
    const changed = await applyMod(state.decompiledDir, mod);
    res.json({ modId, changed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload an APK and decompile it.
app.post("/api/upload", multer({ dest: INCOMING_DIR, limits: { fileSize: 512 * 1024 * 1024 } }).single("file"), async (req, res) => {
  try {
    await fsp.mkdir(INCOMING_DIR, { recursive: true });
    if (!req.file) return res.status(400).json({ error: "No file uploaded. Send multipart form field 'file'." });

    const id = crypto.randomBytes(6).toString("hex");
    const apkPath = path.join(INCOMING_DIR, `${id}.apk`);
    await fsp.rename(req.file.path, apkPath);

    const decompiledDir = path.join(WORKSPACE, `project-${id}`);
    await fsp.mkdir(decompiledDir, { recursive: true });

    try {
      await run("apktool", ["d", "-f", apkPath, "-o", decompiledDir]);
    } catch (err) {
      return res.status(500).json({ error: `apktool decompile failed: ${err.message}` });
    }

    const manifestPath = path.join(decompiledDir, "AndroidManifest.xml");
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      manifest = parseManifest(await fsp.readFile(manifestPath, "utf8"));
    }

    const files = await listDirRecursive(decompiledDir);

    state = {
      projectName: req.file.originalname,
      apkPath,
      decompiledDir,
      builtApk: null,
      signedApk: null,
      error: null,
    };

    res.json({
      id,
      originalName: req.file.originalname,
      manifest,
      files,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    projectName: state.projectName,
    decompiled: !!state.decompiledDir,
    built: !!state.builtApk,
    signed: !!state.signedApk,
    error: state.error,
  });
});

app.get("/api/files", async (req, res) => {
  if (!state.decompiledDir) return res.json({ files: [] });
  const files = await listDirRecursive(state.decompiledDir);
  res.json({ files });
});

app.get("/api/dump", async (req, res) => {
  if (!state.decompiledDir) return res.json({ files: [] });
  const entries = await listDirRecursive(state.decompiledDir);
  const textFiles = entries.filter((e) => e.type === "file" && textLike(e.path));
  const files = [];
  let total = 0;
  for (const e of textFiles) {
    if (total > 500_000) break;
    const full = path.join(state.decompiledDir, e.path);
    let content = "";
    try {
      content = await fsp.readFile(full, "utf8");
    } catch {
      continue;
    }
    if (content.length > 30_000) content = content.slice(0, 30_000);
    files.push({ path: e.path, content });
    total += content.length;
  }
  res.json({ files });
});

app.get("/api/file", async (req, res) => {
  const rel = req.query.path;
  if (!rel || !state.decompiledDir) return res.status(400).json({ error: "Missing path or no project loaded." });
  const full = path.join(state.decompiledDir, rel);
  if (!full.startsWith(state.decompiledDir)) return res.status(400).json({ error: "Invalid path." });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "Not found." });
  if (!textLike(rel)) return res.status(415).json({ error: "Binary file; not editable as text." });
  res.json({ path: rel, content: await fsp.readFile(full, "utf8") });
});

app.post("/api/file", async (req, res) => {
  const { path: rel, content } = req.body || {};
  if (!rel || typeof content !== "string" || !state.decompiledDir) {
    return res.status(400).json({ error: "Missing path/content or no project loaded." });
  }
  const full = path.join(state.decompiledDir, rel);
  if (!full.startsWith(state.decompiledDir)) return res.status(400).json({ error: "Invalid path." });
  if (!textLike(rel)) return res.status(415).json({ error: "Binary file; not editable as text." });
  await fsp.writeFile(full, content, "utf8");
  res.json({ ok: true, path: rel });
});

// Build: apktool b -> zipalign -> apksigner sign (auto-generates a keystore).
app.post("/api/build", async (req, res) => {
  try {
    if (!state.decompiledDir) return res.status(400).json({ error: "No project loaded. Upload an APK first." });

    const builtApk = path.join(WORKSPACE, "built.apk");
    const alignedApk = path.join(WORKSPACE, "aligned.apk");
    const signedApk = path.join(WORKSPACE, "signed.apk");

    // 1) rebuild
    await run("apktool", ["b", state.decompiledDir, "-o", builtApk]);

    // 2) align (required for targetSdk >= 30)
    await run("zipalign", ["-f", "4", builtApk, alignedApk]);

    // 3) ensure keystore exists
    if (!fs.existsSync(KEYSTORE_PATH)) {
      await run("keytool", [
        "-genkeypair", "-v",
        "-keystore", KEYSTORE_PATH,
        "-alias", KEYSTORE.alias,
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", KEYSTORE.validity,
        "-storepass", KEYSTORE.storepass,
        "-keypass", KEYSTORE.keypass,
        "-dname", KEYSTORE.dname,
      ]);
    }

    // 4) sign
    await run("apksigner", [
      "sign",
      "--ks", KEYSTORE_PATH,
      "--ks-key-alias", KEYSTORE.alias,
      "--ks-pass", `pass:${KEYSTORE.storepass}`,
      "--key-pass", `pass:${KEYSTORE.keypass}`,
      "--out", signedApk,
      alignedApk,
    ]);

    state.builtApk = builtApk;
    state.signedApk = signedApk;
    state.error = null;

    res.json({ ok: true, fileName: `${state.projectName?.replace(/\.apk$/i, "") || "app"}-modded.apk` });
  } catch (err) {
    state.error = err.message;
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/download", (req, res) => {
  if (!state.signedApk || !fs.existsSync(state.signedApk)) {
    return res.status(404).json({ error: "No signed APK available. Run /api/build first." });
  }
  const fileName = `${state.projectName?.replace(/\.apk$/i, "") || "app"}-modded.apk`;
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  fs.createReadStream(state.signedApk).pipe(res);
});

app.listen(PORT, HOST, () => {
  console.log(`[APP-FORGE bridge] listening on http://${HOST}:${PORT}`);
  console.log(`[APP-FORGE bridge] workspace: ${WORKSPACE}`);
});
