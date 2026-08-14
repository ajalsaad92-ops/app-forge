import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { execSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const JAVA_PATH = '/nix/store/5ddplampdr05fan1mxswgy6l8a2g26hf-openjdk-minimal-jre-21.0.10+7/bin/java';
const APKTOOL_JAR = '/tmp/apktool.jar';

export const Route = createFileRoute('/api/apk/rebuild')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData();
          const filesJson = formData.get('files') as string;
          const packageName = formData.get('packageName') as string || 'modded_app';
          
          if (!filesJson) {
            return new Response('No project files provided', { status: 400 });
          }

          const projectFiles = JSON.parse(filesJson) as { path: string, content: string | null }[];
          const workDir = path.join(os.tmpdir(), `apk_rebuild_${Date.now()}`);
          const sourceDir = path.join(workDir, 'source');
          mkdirSync(sourceDir, { recursive: true });

          // 1. Write project files back to disk for Apktool
          for (const file of projectFiles) {
            const filePath = path.join(sourceDir, file.path);
            const dir = path.dirname(filePath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            
            if (file.content !== null) {
              writeFileSync(filePath, file.content);
            }
          }

          // 2. Ensure apktool jar exists
          if (!existsSync(APKTOOL_JAR)) {
            const { execSync: syncExec } = await import('node:child_process');
            syncExec(`curl -L -o ${APKTOOL_JAR} https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar`);
          }

          const outApk = path.join(workDir, 'output.apk');
          
          // 3. Execute build
          const { execSync: syncExecBuild } = await import('node:child_process');
          try {
            syncExecBuild(`${JAVA_PATH} -jar ${APKTOOL_JAR} b -o ${outApk} ${sourceDir}`, { stdio: 'pipe' });
          } catch (err: any) {
            console.error('Build error:', err.stderr?.toString());
            return new Response(`Build failed: ${err.stderr?.toString() || err.message}`, { status: 500 });
          }

          // 4. Return built APK
          const apkBuffer = readFileSync(outApk);
          
          // Cleanup
          // rmSync(workDir, { recursive: true, force: true });

          return new Response(apkBuffer, {
            headers: { 
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': `attachment; filename="${packageName}-modded.apk"`
            }
          });
        } catch (error: any) {
          return new Response(error.message, { status: 500 });
        }
      }
    }
  }
});
