import "./lib/error-capture";
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
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
// Local APK Processing Routes
// ==========================================

app.get('/api/health', (_req: ExpressRequest, res: ExpressResponse) => {
  res.json({ status: 'ok', server: 'App-Forge Local Backend' });
});

app.post('/api/decompile', upload.single('apk'), async (req: ExpressRequest, res: ExpressResponse) => {
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

app.post('/api/build', async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { sourceDir } = req.body;
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      res.status(400).json({ error: 'Invalid source directory' });
      return;
    }

    const rebuiltApk = path.join(sourceDir, '../dist_rebuilt.apk');
    await execPromise(`apktool b "${sourceDir}" -o "${rebuiltApk}"`);

    const signedApk = path.join(sourceDir, '../dist_signed.apk');
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
// SSR Middleware (TanStack Start Integration)
// ==========================================

type ServerEntry = {
  fetch: (request: Request) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as unknown as ServerEntry,
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

app.use(async (req: ExpressRequest, res: ExpressResponse, _next: NextFunction) => {
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

    const webResponse = await serverEntry.fetch(webRequest);
    const normalizedResponse = await normalizeCatastrophicSsrResponse(webResponse);

    res.status(normalizedResponse.status);
    normalizedResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await normalizedResponse.text();
    res.send(responseBody);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).send(renderErrorPage());
    }
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 App-Forge local server running on http://localhost:${PORT}`);
});
