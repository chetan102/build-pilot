'use client';

import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';

export default function LoginPage() {
  const handleGithubLogin = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    window.location.href = `${apiUrl}/api/v1/github/oauth/authorize?redirect=true`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center">
        <h1 className="text-3xl font-bold text-white mb-2">BuildPilot</h1>
        <p className="text-slate-400 mb-8">Sign in to your account</p>
        
        <Button 
          size="lg" 
          className="w-full bg-white text-black hover:bg-slate-200" 
          onClick={handleGithubLogin}
        >
          <Github className="mr-2 h-5 w-5" />
          Continue with GitHub
        </Button>
      </div>
      
      <p className="text-slate-500 mt-8 text-sm">
        Autonomous AI Software Engineering Platform
      </p>
    </div>
  );
}
