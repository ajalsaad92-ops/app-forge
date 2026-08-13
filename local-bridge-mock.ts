import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import cors from 'cors';

const execAsync = promisify(exec);
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Verify tool existence
app.get('/api/verify-tool', async (req, res) => {
  const tool = req.query.tool as string;
  const commands: Record<string, string> = {
    java: 'java -version',
    apktool: 'apktool --version',
    buildtools: 'apksigner --version'
  };

  const command = commands[tool];
  if (!command) return res.status(400).json({ error: 'Unknown tool' });

  try {
    await execAsync(command);
    res.json({ exists: true });
  } catch (err) {
    res.json({ exists: false });
  }
});

// Mock installation endpoint (triggers winget on Windows)
app.post('/api/install-tools', async (req, res) => {
  try {
    // In a real local server, this would run winget commands
    // exec('winget install ...');
    res.json({ message: 'Installation commands triggered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger installation' });
  }
});

// Decompile / Build mocks
app.post('/api/decompile', (req, res) => res.json({ success: true }));
app.post('/api/build', (req, res) => res.json({ success: true }));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Local bridge running on http://localhost:${PORT}`);
});
