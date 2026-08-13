import "./lib/error-capture";
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import util from 'util';
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const execPromise = util.promisify(exec);
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// ==========================================
// مسارات معالجة الـ APK (الخادم المحلي)
// ==========================================

// مسار الصحة (Health Check)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'App-Forge Local Backend' });
});

// مسار فك الـ APK
app.post('/api/decompile', upload.single('apk'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No APK file uploaded' });
      return;
    }

    const apkPath = req.file.path;
    const outputDir = path.join(process.cwd(), 'decoded_output', req.file.filename);

    const command = `apktool d -f "${apkPath}" -o "${outputDir}"`;
    await execPromise(command);

    res.json({ 
      success: true, 
      message: 'APK decompiled successfully',
      outputDir 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// مسار إعادة تجميع وتوقيع الـ APK
app.post('/api/build', async (req: Request, res: Response) => {
  try {
    const { sourceDir } = req.body;
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      res.status(400).json({ error: 'Invalid source directory' });
      return;
    }

    const rebuiltApk = path.join(sourceDir, '../dist_rebuilt.apk');
    await execPromise(`apktool b "${sourceDir}" -o "${rebuiltApk}"`);

    const signedApk = path.join(sourceDir, '../dist_signed.apk');
    // ملاحظة لمستخدمي ويندوز: مسار debug.keystore الافتراضي غالباً في مجلد المستخدم C:\Users\اسم_المستخدم\.android\debug.keystore
    const keystorePath = path.join(process.env['USERPROFILE'] || '', '.android', 'debug.keystore');
    
    await execPromise(`apksigner sign --ks "${keystorePath}" --ks-pass pass:android --key-pass pass:android --out "${signedApk}" "${rebuiltApk}"`);

    res.json({ 
      success: true, 
      message: 'APK rebuilt and signed successfully',
      downloadUrl: signedApk 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// دمج تطبيق الـ SSR (TanStack Start) مع Express
// ==========================================

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// أي طلب آخر يتم توجيهه لتطبيق الـ Frontend الأساسي
app.use(async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const serverEntry = await getServerEntry();
    const url = `http://${req.headers.host}${req.url}`;
    
    const requestInit: RequestInit = {
      method: req.method,
      headers: req.headers as HeadersInit,
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      requestInit.body = JSON.stringify(req.body);
    }

    const webRequest = new Request(url, requestInit);

    const webResponse = await serverEntry.fetch(webRequest, {}, {});
    const normalizedResponse = await normalizeCatastrophicSsrResponse(webResponse);

    res.status(normalizedResponse.status);
    normalizedResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await normalizedResponse.text();
    res.send(responseBody);
  } catch (error) {
    console.error(error);
    res.status(500).send(renderErrorPage());
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 App-Forge local server running on http://localhost:${PORT}`);
});
