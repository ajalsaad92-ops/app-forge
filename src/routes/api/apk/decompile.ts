import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const JAVA_PATH = '/nix/store/5ddplampdr05fan1mxswgy6l8a2g26hf-openjdk-minimal-jre-21.0.10+7/bin/java';
const APKTOOL_JAR = '/tmp/apktool.jar';

export const Route = createFileRoute('/api/apk/decompile')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData();
          const file = formData.get('file') as File;
          
          if (!file) {
            return new Response('No file uploaded', { status: 400 });
          }

          const workDir = path.join(os.tmpdir(), `apk_decompile_${Date.now()}`);
          mkdirSync(workDir, { recursive: true });

          const apkPath = path.join(workDir, 'app.apk');
          const buffer = Buffer.from(await file.arrayBuffer());
          fs.writeFileSync(apkPath, buffer);

          const outputDir = path.join(workDir, 'out');
          
          // Ensure apktool jar exists
          if (!fs.existsSync(APKTOOL_JAR)) {
            // Auto-download if missing
            const { spawnSync: spSync } = await import('node:child_process');
            spSync('curl', ['-L', '-o', APKTOOL_JAR, 'https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar']);
          }

          // Execute decompile
          const { execSync: syncExecDecompile } = await import('node:child_process');
          try {
            syncExecDecompile(`${JAVA_PATH} -jar ${APKTOOL_JAR} d -f -o ${outputDir} ${apkPath}`, { stdio: 'pipe' });
          } catch (err: any) {
            console.error('Decompile error:', err.stderr?.toString());
            return new Response(`Decompile failed: ${err.stderr?.toString() || err.message}`, { status: 500 });
          }

          // Read decompiled files (recursively)
          const resultFiles: { path: string, content: string | null, isBinary: boolean }[] = [];
          
          const scan = (dir: string, base: string) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const fullPath = path.join(dir, item);
              const relPath = path.join(base, item);
              const stats = fs.statSync(fullPath);
              
              if (stats.isDirectory()) {
                scan(fullPath, relPath);
              } else {
                // Check if text or binary
                const ext = path.extname(item).toLowerCase();
                const isText = ['.xml', '.smali', '.yml', '.yaml', '.json', '.txt', '.properties'].includes(ext);
                
                if (isText) {
                  resultFiles.push({
                    path: relPath,
                    content: fs.readFileSync(fullPath, 'utf8'),
                    isBinary: false
                  });
                } else {
                  // For now, only send text files to client, binaries will be kept on server or re-read later
                  resultFiles.push({
                    path: relPath,
                    content: null,
                    isBinary: true
                  });
                }
              }
            }
          };

          scan(outputDir, '');

          // Cleanup
          // rmSync(workDir, { recursive: true, force: true });

          return new Response(JSON.stringify({ files: resultFiles, workId: path.basename(workDir) }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          return new Response(error.message, { status: 500 });
        }
      }
    }
  }
});
