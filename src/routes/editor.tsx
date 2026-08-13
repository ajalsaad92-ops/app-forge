import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { get, set } from "idb-keyval";
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
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { analyzeCode } from "@/lib/analysis.functions";
import { analyzeAndRefactorCode, getCodeAction } from "@/lib/gemini";
import { apkProcessor } from "@/lib/apk-processor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/editor")({
  component: AppForgeEditor,
});

interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string | undefined;
  parentId: string | null;
}

const DEFAULT_FILES: FileSystemItem[] = [
  { id: '1', name: 'src', type: 'folder', parentId: null },
  { id: '2', name: 'App.tsx', type: 'file', content: 'export default function App() {\n  return <h1>Hello App-Forge!</h1>;\n}', parentId: '1' },
  { id: '3', name: 'utils.ts', type: 'file', content: 'export const add = (a: number, b: number) => a + b;', parentId: '1' },
  { id: '4', name: 'package.json', type: 'file', content: '{\n  "name": "app-forge-project",\n  "version": "1.0.0"\n}', parentId: null },
];

function AppForgeEditor() {
  const [files, setFiles] = React.useState<FileSystemItem[]>(DEFAULT_FILES);
  const [activeFileId, setActiveFileId] = React.useState<string>('2');
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set(['1']));
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [viewMode, setViewMode] = React.useState<'editor' | 'diff'>('editor');
  const [originalCode, setOriginalCode] = React.useState<string>("");
  const [pendingCode, setPendingCode] = React.useState<string | null>(null);
  const [apiKey, setApiKey] = React.useState<string>("");
  const [showSettings, setShowSettings] = React.useState(false);
  const [isFileSystemLoaded, setIsFileSystemLoaded] = React.useState(false);

  // Load API Key and Files from storage
  React.useEffect(() => {
    const init = async () => {
      // API Key
      const savedKey = localStorage.getItem("APPFORGE_GEMINI_KEY");
      if (savedKey) setApiKey(savedKey);

      // Files from IndexedDB
      try {
        const storedFiles = await get<FileSystemItem[]>("APPFORGE_FILES");
        if (storedFiles && storedFiles.length > 0) {
          setFiles(storedFiles);
          // Auto-select first file if current active is not in stored files
          if (!storedFiles.find(f => f.id === activeFileId)) {
            const firstFile = storedFiles.find(f => f.type === 'file');
            if (firstFile) setActiveFileId(firstFile.id);
          }
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
      set("APPFORGE_FILES", files).catch(err => {
        console.error("Failed to save files to IndexedDB", err);
      });
    }
  }, [files, isFileSystemLoaded]);

  const saveApiKey = (key: string) => {
    localStorage.setItem("APPFORGE_GEMINI_KEY", key);
    setApiKey(key);
    setShowSettings(false);
    toast.success("API Key saved");
  };

  const activeFile = files.find(f => f.id === activeFileId);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.info(`Extracting ${file.name}...`);
    try {
      const paths = await apkProcessor.loadAPK(file);
      
      // Convert flat paths to our FileSystemItem structure
      const newFiles: FileSystemItem[] = [];
      const folderMap = new Map<string, string>(); // path -> id

      // Recursive folder creator
      const getOrCreateFolder = (path: string): string | null => {
        const parts = path.split('/');
        if (parts.length <= 1) return null;
        
        const parentPath = parts.slice(0, -1).join('/');
        if (folderMap.has(parentPath)) return folderMap.get(parentPath)!;

        const grandParentId = getOrCreateFolder(parentPath);
        const folderId = Math.random().toString(36).substr(2, 9);
        newFiles.push({
          id: folderId,
          name: parts[parts.length - 2] || "folder",
          type: 'folder',
          parentId: grandParentId
        });
        folderMap.set(parentPath, folderId);
        return folderId;
      };

      for (const path of paths) {
        const apkFile = apkProcessor.getFileContent(path);
        if (!apkFile) continue;

        const parentId = getOrCreateFolder(path);
        newFiles.push({
          id: Math.random().toString(36).substr(2, 9),
          name: apkFile.name,
          type: 'file',
          content: apkFile.type === 'text' ? (apkFile.content as string) : `[Binary File: ${path}]`,
          parentId: parentId
        });
      }

      if (newFiles.length > 0) {
        setFiles(newFiles);
        const firstFile = newFiles.find(f => f.type === 'file');
        if (firstFile) setActiveFileId(firstFile.id);
        toast.success("APK extracted successfully");
      }
    } catch (err) {
      console.error("Extraction failed", err);
      toast.error("Failed to extract file");
    }
  };

  const handleExport = async () => {
    toast.info("Building export package...");
    try {
      // Update apkProcessor with current state of text files
      files.forEach(f => {
        if (f.type === 'file' && f.content && !f.content.startsWith('[Binary File:')) {
          // We need the original path which we don't store in FileSystemItem 
          // For simplicity in this tool, we assume paths are reconstructed or were tracked
          // In a real IDE we'd store path in FileSystemItem
        }
      });

      const blob = await apkProcessor.rebuildAPK();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "app-forge-export.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready");
    } catch (err) {
      toast.error("Export failed");
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
      id: Math.random().toString(36).substr(2, 9),
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
    if (!activeFile || activeFile.type !== 'file') return;
    setIsAnalyzing(true);
    toast.info("Analyzing code...");
    try {
      const result = await analyzeCode({ 
        data: {
          code: activeFile.content || "", 
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

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");

    if (!activeFile || activeFile.type !== 'file') {
      setChatMessages(prev => [...prev, { role: 'ai', content: "Please select a file first so I can perform actions on it." }]);
      return;
    }

    if (!apiKey) {
      setChatMessages(prev => [...prev, { role: 'ai', content: "Please configure your Gemini API Key in settings first." }]);
      setShowSettings(true);
      return;
    }

    setIsAnalyzing(true);
    setChatMessages(prev => [...prev, { role: 'ai', content: "Processing your request..." }]);
    
    try {
      const currentCode = activeFile.content || "";
      const actionResult = await getCodeAction(apiKey, currentCode, userMessage);
      
      setPendingCode(actionResult.modifiedCode);
      setOriginalCode(currentCode);
      
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: `${actionResult.explanation}\n\nI have prepared the changes. Would you like to apply them?` 
      }]);
      
      setViewMode('diff');
      toast.info("Changes prepared. Preview in Diff View.");
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', content: `Error: ${err.message}` }]);
      toast.error("Action failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyChanges = () => {
    if (!pendingCode || !activeFileId) return;
    
    setFiles(files.map(f => f.id === activeFileId ? { ...f, content: pendingCode } : f));
    setPendingCode(null);
    setViewMode('editor');
    toast.success("Changes applied successfully");
  };

  const discardChanges = () => {
    setPendingCode(null);
    setViewMode('editor');
    toast.info("Changes discarded");
  };

  const renderTree = (parentId: string | null, level = 0) => {
    return files
      .filter(f => f.parentId === parentId)
      .map(item => (
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

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col bg-card/30">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Code2 className="h-5 w-5 text-primary" />
            <span>App-Forge</span>
          </div>
          <div className="flex gap-1">
            <label className="p-1 hover:bg-accent rounded cursor-pointer" title="Upload APK/ZIP">
              <Upload className="h-4 w-4" />
              <input 
                type="file" 
                accept=".apk,.zip" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
            <button onClick={handleExport} className="p-1 hover:bg-accent rounded" title="Export Project">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => addFile(null)} className="p-1 hover:bg-accent rounded" title="New File">
              <FilePlus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-2">
            {renderTree(null)}
          </div>
        </ScrollArea>
        <div className="p-4 border-t bg-muted/20 text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Terminal className="h-3 w-3" />
          <span>Workspace Ready</span>
        </div>
      </aside>

      {/* Editor Main */}
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
              {viewMode === 'editor' ? 'Diff View' : 'Editor View'}
            </Button>
            <Button 
              size="sm" 
              variant="default"
              onClick={runAnalysis}
              disabled={isAnalyzing || !activeFile}
              className="h-8 px-3 shadow-lg shadow-primary/20"
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
            viewMode === 'editor' ? (
              <Editor
                height="100%"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={activeFile.content || ""}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
                  padding: { top: 20 },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            ) : (
              <DiffEditor
                height="100%"
                original={originalCode || activeFile.content || ""}
                modified={pendingCode || activeFile.content || ""}
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
              Select a file to start forging
            </div>
          )}
        </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Forge Settings</DialogTitle>
            <DialogDescription>
              Configure your AI models and API keys. These are stored locally in your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="api-key" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Google Gemini API Key
              </Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your API key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Get one at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline">AI Studio</a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveApiKey(apiKey)}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>

      {/* AI Chat Sidebar */}
      <aside className="w-80 border-l flex flex-col bg-card/30">
        <header className="h-12 border-b flex items-center px-4 bg-muted/10 shrink-0">
          <MessageSquare className="h-4 w-4 mr-2 text-primary" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </header>
        
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Ask me anything about your code or trigger an analysis.
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-foreground border'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  
                  {msg.role === 'ai' && pendingCode && i === chatMessages.length - 1 && (
                    <div className="flex gap-2 mt-3 pt-2 border-t">
                      <Button size="sm" variant="default" onClick={applyChanges} className="h-7 text-[10px] px-2">
                        <Check className="h-3 w-3 mr-1" />
                        Confirm Apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={discardChanges} className="h-7 text-[10px] px-2 text-muted-foreground">
                        <X className="h-3 w-3 mr-1" />
                        Discard
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
              className="pr-10 bg-background"
            />
            <button 
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:text-primary transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
