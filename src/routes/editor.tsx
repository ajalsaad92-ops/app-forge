import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { get, set } from "idb-keyval";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { 
  FileCode, 
  FolderPlus, 
  FilePlus, 
  Trash2, 
  Play, 
  MessageSquare, 
  ChevronRight, 
  ChevronDown,
  Code2,
  Send,
  Loader2,
  Terminal,
  Settings,
  Split,
  Eye,
  Key,
  Check,
  X,
  Edit2,
  Upload,
  Download,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { analyzeCode } from "@/lib/analysis.functions";
import { getCodeAction, callAI, auditCodebase, type AIProvider, type AISettings, PROVIDER_LINKS } from "@/lib/ai-service";
import { apkProcessor, exportToZip } from "@/lib/apk-processor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/editor")({
  component: () => (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppForgeEditor />
    </ErrorBoundary>
  ),
});

interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string | Uint8Array | undefined;
  parentId: string | null;
}

const DEFAULT_FILES: FileSystemItem[] = [
  { id: '1', name: 'src', type: 'folder', parentId: null },
  { id: '2', name: 'App.tsx', type: 'file', content: 'export default function App() {\n  return <h1>Hello App-Forge!</h1>;\n}', parentId: '1' },
  { id: '3', name: 'utils.ts', type: 'file', content: 'export const add = (a: number, b: number) => a + b;', parentId: '1' },
  { id: '4', name: 'package.json', type: 'file', content: '{\n  "name": "app-forge-project",\n  "version": "1.0.0"\n}', parentId: null },
];

const STORAGE_KEY = "APPFORGE_FILES_V2";

function AppForgeEditor() {
  const [files, setFiles] = React.useState<FileSystemItem[]>(DEFAULT_FILES);
  const [activeFileId, setActiveFileId] = React.useState<string>('2');
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set(['1']));
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isBackendLoading, setIsBackendLoading] = React.useState<{[key: string]: boolean}>({});
  const [chatMessages, setChatMessages] = React.useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [viewMode, setViewMode] = React.useState<'editor' | 'diff'>('editor');
  const [originalCode, setOriginalCode] = React.useState<string>("");
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const [aiSettings, setAiSettings] = React.useState<AISettings>({
    provider: 'gemini',
    apiKey: ''
  });
  const [showSettings, setShowSettings] = React.useState(false);
  const [isFileSystemLoaded, setIsFileSystemLoaded] = React.useState(false);

  // Load API Key and Files from storage
  React.useEffect(() => {
    const init = async () => {
      const savedSettings = localStorage.getItem("APPFORGE_AI_SETTINGS");
      if (savedSettings) {
        try {
          setAiSettings(JSON.parse(savedSettings));
        } catch (e) {
          console.error("Failed to parse AI settings", e);
        }
      } else {
        // Fallback to old key if exists
        const oldKey = localStorage.getItem("APPFORGE_GEMINI_KEY");
        if (oldKey) setAiSettings({ provider: 'gemini', apiKey: oldKey });
      }

      try {
        const storedFiles = await get<FileSystemItem[]>(STORAGE_KEY);
        if (storedFiles && storedFiles.length > 0) {
          setFiles(storedFiles);
          const firstFile = storedFiles.find(f => f.type === 'file');
          if (firstFile) setActiveFileId(firstFile.id);
        }
      } catch (err) {
        console.error("Failed to load files from IndexedDB", err);
      } finally {
        setIsFileSystemLoaded(true);
      }
    };
    init();
  }, []);

  // Save files to IndexedDB on change
  React.useEffect(() => {
    if (isFileSystemLoaded) {
      set(STORAGE_KEY, files).catch(err => {
        console.error("Failed to save files to IndexedDB", err);
      });
    }
  }, [files, isFileSystemLoaded]);

  const saveAiSettings = (settings: AISettings) => {
    localStorage.setItem("APPFORGE_AI_SETTINGS", JSON.stringify(settings));
    setAiSettings(settings);
    setShowSettings(false);
    toast.success("AI Settings saved");
  };

  const activeFile = files.find(f => f.id === activeFileId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Extracting ${file.name}...`);
    try {
      const paths = await apkProcessor.loadAPK(file);
      
      // Cleanup: memory management for large APKs
      // We are about to map the entire APK to our files state
      // This is a memory-heavy operation. 
      // Using a temporary Set to avoid duplicates if any
      const pathSet = new Set(paths);
      
      const newFiles: FileSystemItem[] = [];
      const folderMap = new Map<string, string>();

      const getOrCreateFolder = (path: string): string | null => {
        const parts = path.split('/');
        if (parts.length <= 1) return null;
        
        const parentPath = parts.slice(0, -1).join('/');
        if (folderMap.has(parentPath)) return folderMap.get(parentPath)!;

        const grandParentId = getOrCreateFolder(parentPath);
        const folderId = Math.random().toString(36).substring(2, 9);
        const folderName = parts[parts.length - 2] || "folder";
        
        newFiles.push({
          id: folderId,
          name: folderName,
          type: 'folder',
          parentId: grandParentId
        });
        folderMap.set(parentPath, folderId);
        return folderId;
      };

      for (const path of Array.from(pathSet)) {
        const apkFile = apkProcessor.getFileContent(path);
        if (!apkFile) continue;

        const parentId = getOrCreateFolder(path);
        newFiles.push({
          id: Math.random().toString(36).substring(2, 9),
          name: apkFile.name,
          type: 'file',
          content: apkFile.content,
          parentId: parentId
        });
      }

      if (newFiles.length > 0) {
        setFiles(newFiles);
        const firstFile = newFiles.find(f => f.type === 'file');
        if (firstFile) setActiveFileId(firstFile.id);
        toast.success("File extracted successfully", { id: toastId });
      }
    } catch (err) {
      console.error("Extraction failed", err);
      toast.error("Failed to extract file", { id: toastId });
    }
  };

  const handleExport = async () => {
    const toastId = toast.loading("Building export package...");
    try {
      const blob = await exportToZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "app-forge-export.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", { id: toastId });
    } catch (err) {
      console.error("Export failed", err);
      toast.error("Export failed", { id: toastId });
    }
  };

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const addFile = (parentId: string | null) => {
    const name = window.prompt("Enter file name:");
    if (!name) return;
    const newFile: FileSystemItem = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      type: 'file',
      content: '// New file',
      parentId
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const deleteItem = (id: string) => {
    if (confirm("Are you sure?")) {
      setFiles(files.filter(f => f.id !== id && f.parentId !== id));
      if (activeFileId === id) setActiveFileId('');
    }
  };

  const renameItem = (id: string, oldName: string) => {
    const newName = window.prompt("Enter new name:", oldName);
    if (!newName || newName === oldName) return;
    setFiles(files.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeFileId) return;
    setFiles(files.map(f => f.id === activeFileId ? { ...f, content: value } : f));
  };

  const runAnalysis = async () => {
    if (!activeFile || activeFile.type !== 'file' || typeof activeFile.content !== 'string') return;
    setIsAnalyzing(true);
    toast.info("Analyzing code...");
    try {
      const result = await analyzeCode({ 
        data: {
          code: activeFile.content, 
          fileName: activeFile.name 
        }
      });
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `${result.summary}\n\nSuggestions:\n${result.suggestions.map(s => `• ${s}`).join('\n')}` 
      }]);
      toast.success("Analysis complete");
    } catch (err) {
      toast.error("Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runMetaAudit = async () => {
    if (!aiSettings.apiKey) {
      toast.error("Please configure AI settings first");
      setShowSettings(true);
      return;
    }

    setIsAnalyzing(true);
    const toastId = toast.loading("Performing Meta-Audit on App-Forge source...");
    try {
      // Pick some core files for context

      const auditResult = await auditCodebase(aiSettings);

      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `### 🛡️ App-Forge Meta-Audit Results\n\n${auditResult}` 
      }]);
      toast.success("Meta-Audit complete", { id: toastId });
    } catch (err: any) {
      toast.error(`Audit failed: ${err.message}`, { id: toastId });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");

    if (!activeFile || activeFile.type !== 'file' || typeof activeFile.content !== 'string') {
      setChatMessages(prev => [...prev, { role: 'ai', content: "Please select a text file for the AI to analyze." }]);
      return;
    }
    const context = `The user is currently viewing this file: ${activeFile.name}. File Content: \n ${activeFile.content}. Answer their question based strictly on this file.`;
    const prompt = `${context}\n\nUser Question: ${userMessage}`;

    if (!aiSettings.apiKey) {
      setChatMessages(prev => [...prev, { role: 'ai', content: `Please configure your ${aiSettings.provider} API Key in settings first.` }]);
      setShowSettings(true);
      return;
    }

    setIsAnalyzing(true);
    setChatMessages(prev => [...prev, { role: 'ai', content: "Thinking..." }]);
    
    try {
      const currentCode = activeFile.content;
      const actionResult = await getCodeAction(aiSettings, currentCode, prompt);
      
      setPendingCode(actionResult.modifiedCode);
      setOriginalCode(currentCode);
      
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `${actionResult.explanation}\n\nReview changes in Diff View.` 
      }]);
      
      setViewMode('diff');
      toast.info("AI suggested changes. Review them now.");
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', content: `Error: ${err.message}` }]);
      toast.error("AI action failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyChanges = async () => {
    if (pendingCode === null || !activeFileId) return;
    
    const updatedFiles = files.map(f => f.id === activeFileId ? { ...f, content: pendingCode } : f);
    setFiles(updatedFiles);
    
    // Explicit sync to IndexedDB immediately
    try {
      await set(STORAGE_KEY, updatedFiles);
      setPendingCode(null);
      setViewMode('editor');
      toast.success("Changes applied and persisted.");
    } catch (err) {
      console.error("Persistence failed", err);
      toast.error("Changes applied but failed to persist to disk.");
      // Still update UI
      setPendingCode(null);
      setViewMode('editor');
    }
  };

  const discardChanges = () => {
    setPendingCode(null);
    setViewMode('editor');
    toast.info("Changes discarded");
  };

  const renderTree = (parentId: string | null, level = 0) => {
    const filteredFiles = files.filter(f => {
      if (f.parentId !== parentId) return false;
      if (!searchQuery) return true;
      
      // If searching, show if name matches OR if it has children that match
      const nameMatches = f.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (nameMatches) return true;
      
      if (f.type === 'folder') {
        const hasMatchingChild = (fid: string): boolean => {
          return files.some(child => 
            child.parentId === fid && 
            (child.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             (child.type === 'folder' && hasMatchingChild(child.id)))
          );
        };
        return hasMatchingChild(f.id);
      }
      return false;
    });

    return filteredFiles.map(item => (
        <div key={item.id} className="select-none">
          <div 
            className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-accent/50 group ${activeFileId === item.id ? 'bg-accent text-accent-foreground' : ''}`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => item.type === 'folder' ? toggleFolder(item.id) : setActiveFileId(item.id)}
          >
            {item.type === 'folder' ? (
              expandedFolders.has(item.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <FileCode className="h-4 w-4 text-primary/70" />
            )}
            <span className="flex-1 truncate">{item.name}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button 
                onClick={(e) => { e.stopPropagation(); renameItem(item.id, item.name); }}
                className="p-1 hover:text-primary"
              >
                <Edit2 className="h-3 w-3" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                className="p-1 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          {item.type === 'folder' && expandedFolders.has(item.id) && renderTree(item.id, level + 1)}
        </div>
      ));
  };

  const editorContent = activeFile?.content;
  const BINARY_EXTENSIONS = ['.dex', '.so', '.arsc', '.apk', '.zip', '.pdf', '.png', '.jpg', '.pb'];
  const isBinary = activeFile?.type === 'file' && (
    typeof editorContent !== 'string' || 
    BINARY_EXTENSIONS.some(ext => activeFile.name.toLowerCase().endsWith(ext))
  );

  const callBackend = async (endpoint: string, label: string) => {
    setIsBackendLoading(prev => ({ ...prev, [label]: true }));
    try {
      const response = await fetch(`http://localhost:3000/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        toast.success(`${label} successful`);
      } else {
        toast.error(`${label} failed: ${response.statusText}`);
      }
    } catch (err) {
      toast.error(`Local backend not found at http://localhost:3000`);
      console.error(err);
    } finally {
      setIsBackendLoading(prev => ({ ...prev, [label]: false }));
    }
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans dark">
      <aside className="w-64 border-r flex flex-col bg-sidebar/50 backdrop-blur-sm">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Code2 className="h-5 w-5 text-primary" />
            <span>App-Forge</span>
          </div>
          <div className="flex gap-1">
            <label className="p-1 hover:bg-accent rounded cursor-pointer" title="Upload APK/ZIP">
              <Upload className="h-4 w-4" />
              <input type="file" accept=".apk,.zip" className="hidden" onChange={handleFileUpload} />
            </label>
            <button onClick={handleExport} className="p-1 hover:bg-accent rounded" title="Export Project">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => addFile(null)} className="p-1 hover:bg-accent rounded" title="New File">
              <FilePlus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              className="pl-8 h-9 bg-muted/50 border-muted focus-visible:ring-primary/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-2">{renderTree(null)}</div>
        </ScrollArea>
        <div className="p-4 border-t bg-muted/20 text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Terminal className="h-3 w-3" />
          <span>Workspace Active</span>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b flex items-center justify-between px-4 bg-muted/10 shrink-0">
          <div className="text-sm font-mono text-muted-foreground">
            {activeFile ? activeFile.name : 'No file selected'}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setViewMode(viewMode === 'editor' ? 'diff' : 'editor')}
              className="h-8 px-3"
            >
              {viewMode === 'editor' ? <Split className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {viewMode === 'editor' ? 'Diff' : 'Editor'}
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={runMetaAudit}
              disabled={isAnalyzing || isBinary}
              className="h-8 px-3 text-xs"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Audit Source
            </Button>
            <Button 
              size="sm" 
              onClick={runAnalysis}
              disabled={isAnalyzing || !activeFile || isBinary}
              className="h-8 px-3"
            >
              {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Analyze
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 relative bg-[#1e1e1e]">
          {activeFile ? (
            isBinary ? (
              <div className="flex-1 flex items-center justify-center bg-background/50 backdrop-blur-sm p-8 text-center h-full">
                <div className="max-w-md space-y-4">
                  <ShieldCheck className="h-12 w-12 text-warning mx-auto" />
                  <h3 className="text-xl font-bold text-foreground">Decompilation Required</h3>
                  <p className="text-muted-foreground">
                    Cannot AI-edit raw binary or Dalvik executable files directly in the browser. 
                    Please use a backend decompilation tool (like Apktool/JADX) to extract Smali/Java source first.
                  </p>
                </div>
              </div>
            ) : viewMode === 'editor' ? (
              <Editor
                height="100%"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={(editorContent as string) || ""}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
                  automaticLayout: true,
                }}
              />
            ) : (
              <DiffEditor
                height="100%"
                original={originalCode}
                modified={pendingCode || (editorContent as string) || ""}
                language="typescript"
                theme="vs-dark"
                options={{
                  renderSideBySide: true,
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
                  automaticLayout: true,
                  minimap: { enabled: false },
                }}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground italic">
              Select a file to begin
            </div>
          )}
        </div>

        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Forge AI Settings</DialogTitle>
              <DialogDescription>
                Configure your preferred AI provider and API keys.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>AI Provider</Label>
                <Select 
                  value={aiSettings.provider} 
                  onValueChange={(v: AIProvider) => setAiSettings({...aiSettings, provider: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="groq">Groq (Llama 3)</SelectItem>
                    <SelectItem value="siliconflow">SiliconFlow (Qwen/DeepSeek)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api-key" className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Key className="h-4 w-4" /> API Key</div>
                  <a 
                    href={PROVIDER_LINKS[aiSettings.provider]} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    Get Key
                  </a>
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={`Enter ${aiSettings.provider} API key...`}
                  value={aiSettings.apiKey}
                  onChange={(e) => setAiSettings({...aiSettings, apiKey: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => saveAiSettings(aiSettings)}>Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      <aside className="w-80 border-l flex flex-col bg-card/30">
        <header className="h-12 border-b flex items-center px-4 bg-muted/10 shrink-0">
          <MessageSquare className="h-4 w-4 mr-2 text-primary" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </header>
        
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  {msg.role === 'ai' && pendingCode && i === chatMessages.length - 1 && (
                    <div className="flex gap-2 mt-3 pt-2 border-t">
                      <Button size="sm" onClick={applyChanges} className="h-7 text-[10px]">
                        <Check className="h-3 w-3 mr-1" /> Apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={discardChanges} className="h-7 text-[10px]">
                        <X className="h-3 w-3 mr-1" /> Discard
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <form onSubmit={sendChatMessage} className="p-4 border-t bg-muted/5">
          <div className="relative">
            <Input 
              placeholder="Ask AI..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="pr-10"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:text-primary">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
