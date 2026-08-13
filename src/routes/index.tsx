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
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between border-b pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Android App Manager</h1>
            <p className="text-muted-foreground mt-2">
              Analyze and manage your Android application projects.
            </p>
          </div>
          <Link to="/editor" className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors">
            Open APK Editor
          </Link>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card text-card-foreground rounded-xl border shadow-sm transition-all hover:shadow-md">
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center text-xl">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-semibold leading-none tracking-tight">Sample App {i}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">com.example.app{i}</p>
                  </div>
                </div>
                <div className="mt-6 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span>1.0.{i}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size</span>
                    <span>{i * 12.5} MB</span>
                  </div>
                </div>
                <button className="mt-6 w-full rounded-md border py-2 text-sm font-medium transition-colors hover:bg-accent">
                  View Analysis
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
