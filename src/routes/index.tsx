import { createFileRoute, Link } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8 text-center space-y-8 dark">
      <div className="space-y-4 max-w-2xl">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/20 p-4 rounded-2xl ring-1 ring-primary/50">
            <svg 
              width="64" height="64" viewBox="0 0 24 24" 
              fill="none" stroke="currentColor" strokeWidth="2" 
              strokeLinecap="round" strokeLinejoin="round" 
              className="text-primary"
            >
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
              <line x1="12" y1="2" x2="12" y2="22"></line>
            </svg>
          </div>
        </div>
        <h1 className="text-6xl font-black tracking-tighter">
          APP<span className="text-primary">-</span>FORGE
        </h1>
        <p className="text-xl text-muted-foreground">
          The professional AI-powered code analysis workspace. 
          Build, refine, and secure your source code with precision.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link 
          to="/editor" 
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-xl text-lg font-bold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
        >
          Enter Workspace
        </Link>
        <button className="bg-secondary text-secondary-foreground border border-border px-8 py-4 rounded-xl text-lg font-bold transition-all hover:bg-accent">
          View Documentation
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-12 text-left">
        {[
          { title: "AI Analysis", desc: "Deep semantic code understanding and automated reviews." },
          { title: "Monaco IDE", desc: "Professional code editing with full syntax highlighting." },
          { title: "Secure Workflow", desc: "Local-first processing for maximum code privacy." }
        ].map((feature, i) => (
          <div key={i} className="p-6 rounded-2xl border bg-card/50">
            <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
