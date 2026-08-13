import * as React from "react";
import { 
  Terminal, 
  Settings, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  Check, 
  Cpu, 
  Package, 
  ShieldCheck,
  Zap
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SetupStepProps {
  title: string;
  description: string;
  command?: string;
  link?: string;
  isCompleted: boolean;
  onToggle: () => void;
}

const SetupStep = ({ title, description, command, link, isCompleted, onToggle }: SetupStepProps) => {
  const [copied, setCopied] = React.useState(false);

  const copyCommand = () => {
    if (command) {
      navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Command copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`p-4 rounded-lg border transition-all ${isCompleted ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className={`text-sm font-semibold flex items-center gap-2 ${isCompleted ? 'text-emerald-400' : 'text-slate-200'}`}>
            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Package className="h-4 w-4" />}
            {title}
          </h4>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {description}
          </p>
          
          {command && (
            <div className="mt-3 relative group">
              <code className="block p-3 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-primary break-all">
                {command}
              </code>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={copyCommand}
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}

          {link && (
            <a 
              href={link} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-primary hover:underline flex items-center gap-1 mt-2 inline-flex"
            >
              Download Page <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        
        <Button 
          variant={isCompleted ? "default" : "outline"} 
          size="sm" 
          onClick={onToggle}
          className={isCompleted ? "bg-emerald-600 hover:bg-emerald-700" : ""}
        >
          {isCompleted ? "Completed" : "Mark Done"}
        </Button>
      </div>
    </div>
  );
};

export function SetupGuide({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [serverStatus, setServerStatus] = React.useState<'checking' | 'online' | 'offline'>('checking');
  const [completedSteps, setCompletedSteps] = React.useState<Record<string, boolean>>({});

  const checkHealth = React.useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch('http://localhost:3000/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) setServerStatus('online');
      else setServerStatus('offline');
    } catch (err) {
      setServerStatus('offline');
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      checkHealth();
      const interval = setInterval(checkHealth, 5000);
      
      const saved = localStorage.getItem('APPFORGE_SETUP_PROGRESS');
      if (saved) {
        try {
          setCompletedSteps(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse setup progress", e);
        }
      }
      return () => clearInterval(interval);
    }
  }, [open, checkHealth]);

  const toggleStep = (id: string) => {
    const next = { ...completedSteps, [id]: !completedSteps[id] };
    setCompletedSteps(next);
    localStorage.setItem('APPFORGE_SETUP_PROGRESS', JSON.stringify(next));
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Terminal className="h-5 w-5 text-primary" />
              Environment Setup Guide
            </DialogTitle>
            <Badge variant={serverStatus === 'online' ? 'default' : 'destructive'} className={`flex items-center gap-1.5 px-3 py-1 ${serverStatus === 'online' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}>
              <div className={`h-2 w-2 rounded-full ${serverStatus === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              {serverStatus === 'online' ? 'Local Server Connected' : 'Server Offline (Port 3000)'}
            </Badge>
          </div>
          <DialogDescription className="text-slate-400">
            Follow these steps to configure your Windows 11 machine for full APK decompilation and rebuilding capabilities.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4 mt-4">
          <div className="space-y-6 pb-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Required Dependencies
              </h3>
              
              <SetupStep 
                title="Step 1: Install Java (JDK 17+)"
                description="Java Development Kit is required for Apktool and Apksigner to run. Version 17 is recommended for maximum compatibility."
                link="https://www.oracle.com/java/technologies/downloads/#java17"
                isCompleted={!!completedSteps['java']}
                onToggle={() => toggleStep('java')}
              />

              <SetupStep 
                title="Step 2: Install Apktool"
                description="The core engine for decompiling APKs to Smali and rebuilding them. Ensure it's in your system PATH."
                command="apktool --version"
                isCompleted={!!completedSteps['apktool']}
                onToggle={() => toggleStep('apktool')}
              />

              <SetupStep 
                title="Step 3: Install Android Build Tools"
                description="Required for 'apksigner' to sign your rebuilt APKs so they can be installed on Android devices. Use winget for fast installation."
                command="winget install Google.AndroidSDK.BuildTools"
                isCompleted={!!completedSteps['buildtools']}
                onToggle={() => toggleStep('buildtools')}
              />
            </div>

            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <h3 className="text-sm font-medium text-primary flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4" />
                Quick Verification
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Run this command in PowerShell to verify your environment is ready:
              </p>
              <code className="block p-3 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-emerald-400">
                java -version; apktool --version; apksigner --version
              </code>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-slate-800 pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 hover:bg-slate-800">
            Close
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90"
            onClick={() => window.open('https://github.com/APKLab/APKLab', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View APKLab Docs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
