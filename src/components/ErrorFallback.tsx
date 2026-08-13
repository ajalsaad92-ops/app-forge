import { ErrorBoundary } from "react-error-boundary";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center bg-destructive/10 rounded-lg border border-destructive/20 m-4">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-bold text-destructive mb-2">Something went wrong</h2>
      <pre className="text-sm font-mono bg-background/50 p-4 rounded mb-6 max-w-full overflow-auto text-left border">
        {error.message}
      </pre>
      <Button onClick={resetErrorBoundary} variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-white">
        Try again
      </Button>
    </div>
  );
}
