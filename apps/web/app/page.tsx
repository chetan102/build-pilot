export default function HomePage() {
  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-8 border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">BuildPilot</h1>
            <p className="text-sm text-slate-500 mt-1">Autonomous AI Engineering Control Plane</p>
          </div>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
            System Online
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Active Tasks</h3>
          <p className="text-3xl font-bold text-slate-900 mt-2">0</p>
        </div>
        <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Completed PRs</h3>
          <p className="text-3xl font-bold text-slate-900 mt-2">0</p>
        </div>
        <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500">Connected Providers</h3>
          <p className="text-3xl font-bold text-slate-900 mt-2">1</p>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Task Queue</h2>
        <div className="text-center py-12 text-slate-400">
          <p>No active tasks in queue. Create an issue with the <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">buildpilot</code> label to start.</p>
        </div>
      </section>
    </main>
  );
}
