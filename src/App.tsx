/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Code, 
  Image as ImageIcon, 
  Eye, 
  Globe, 
  Layers, 
  Zap, 
  Terminal, 
  Share2, 
  Download, 
  Plus, 
  Trash2, 
  Play, 
  Settings, 
  Cpu, 
  Video, 
  Workflow,
  Sparkles,
  Copy,
  Check,
  ChevronRight,
  Loader2,
  Menu,
  X,
  Monitor,
  Smartphone,
  Tablet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import JSZip from 'jszip';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

type Tab = 
  | 'chat' 
  | 'code' 
  | 'photo' 
  | 'vision' 
  | 'website' 
  | 'app' 
  | 'agents' 
  | 'prompt' 
  | 'viral' 
  | 'workflow' 
  | 'video';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface WorkflowStep {
  id: string;
  type: 'prompt' | 'image' | 'code';
  content: string;
  result?: string;
}

// --- Components ---

const GlassPanel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl", className)}>
    {children}
  </div>
);

const GradientButton = ({ children, onClick, className, disabled, loading }: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}) => (
  <button 
    onClick={onClick}
    disabled={disabled || loading}
    className={cn(
      "relative group px-6 py-3 rounded-xl font-medium transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden",
      "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20",
      className
    )}
  >
    <div className="flex items-center justify-center gap-2">
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </div>
    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
  </button>
);


function PrivateAccessGate({ checking, onLogin }: { checking: boolean; onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">GOD MODE</h1>
            <p className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">Private workspace</p>
          </div>
        </div>
        <h2 className="text-2xl font-semibold mb-2">Secure sign-in</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          Gemini requests run through the server. Your provider API key is never sent to this browser.
        </p>
        {checking ? (
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking your private session…
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Private access password"
              maxLength={256}
              required
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-indigo-500/60"
            />
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || !password}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Unlocking…" : "Unlock GOD MODE"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

async function compressImageToDataUrl(file: File): Promise<string> {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Use a JPG, PNG or WEBP image.");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("The original image must be smaller than 20 MB.");
  }

  let source: ImageBitmap | HTMLImageElement | null = null;
  let temporaryUrl: string | null = null;

  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
    } else {
      temporaryUrl = URL.createObjectURL(file);
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The selected image could not be opened."));
        image.src = temporaryUrl!;
      });
    }

    const width = source.width || (source as HTMLImageElement).naturalWidth;
    const height = source.height || (source as HTMLImageElement).naturalHeight;
    if (!width || !height) throw new Error("The selected image has invalid dimensions.");

    const renderJpeg = async (maxDimension: number, quality: number): Promise<Blob | null> => {
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image compression is unavailable in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    };

    let blob = await renderJpeg(1920, 0.8);
    if (!blob) throw new Error("The image could not be prepared.");
    if (blob.size > 4 * 1024 * 1024) blob = await renderJpeg(1440, 0.65);
    if (!blob || blob.size > 4 * 1024 * 1024) {
      throw new Error("The compressed image is still too large. Choose a smaller photo.");
    }

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the prepared image."));
      reader.readAsDataURL(blob);
    });
  } finally {
    if (source && "close" in source && typeof source.close === "function") source.close();
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  }
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [uploadError, setUploadError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [aiModel, setAiModel] = useState<'gemini-3-flash-preview' | 'gemini-3.1-pro-preview'>('gemini-3-flash-preview');
  
  // Feature States
  const [codeContent, setCodeContent] = useState('');
  const [codeResult, setCodeResult] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState('');
  const [websitePrompt, setWebsitePrompt] = useState('');
  const [generatedWebsite, setGeneratedWebsite] = useState('');
  const [appPrompt, setAppPrompt] = useState('');
  const [generatedApp, setGeneratedApp] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Session check failed.");
        return data;
      })
      .then((data) => {
        if (active) setAuthState(data.authenticated ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (active) setAuthState("anonymous");
      });
    return () => { active = false; };
  }, []);

  const handleLogin = async (password: string) => {
    const response = await fetch("/api/auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Sign-in failed.");
    setAuthState("authenticated");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" })
      });
    } finally {
      setAuthState("anonymous");
      setMessages([]);
    }
  };



  // --- AI Logic ---

  const callGemini = async (prompt: string, image?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/gemini/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, image, model: aiModel })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthState("anonymous");
        throw new Error("Your session has expired. Sign in again.");
      }
      if (!response.ok) throw new Error(data.error || "Gemini request failed.");
      return typeof data.text === "string" ? data.text : "";
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Error: " + (error instanceof Error ? error.message : "Gemini request failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChat = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    const response = await callGemini(input);
    const aiMsg: Message = { role: 'assistant', content: response || '', timestamp: new Date() };
    setMessages(prev => [...prev, aiMsg]);
  };

  const handleCodeAction = async (action: 'analyze' | 'repair' | 'optimize' | 'generate') => {
    const prompt = `Action: ${action}\nCode:\n${codeContent}\n\nPlease provide the ${action} result with clear explanations and the improved code block.`;
    const result = await callGemini(prompt);
    setCodeResult(result || '');
  };

  const handleVisionAnalysis = async () => {
    if (!uploadedImage) return;
    const prompt = "Perform a full visual analysis of this image. Describe objects, colors, mood, and any text present.";
    const result = await callGemini(prompt, uploadedImage);
    setVisionAnalysis(result || '');
  };

  const handleWebsiteBuild = async () => {
    const prompt = `Generate a complete, modern, single-file responsive website based on this prompt: "${websitePrompt}". 
    Include HTML, Tailwind CSS (via CDN), and Vanilla JavaScript. Return ONLY the code block.`;
    const result = await callGemini(prompt);
    // Extract code from markdown
    const code = result?.match(/```html([\s\S]*?)```/)?.[1] || result || '';
    setGeneratedWebsite(code.trim());
  };

  const handleAppBuild = async () => {
    const prompt = `Generate a complete React application in a single file (using React.createElement or JSX style) based on this prompt: "${appPrompt}". 
    Include Tailwind CSS classes. Return ONLY the code block.`;
    const result = await callGemini(prompt);
    const code = result?.match(/```(?:javascript|typescript|jsx|tsx)([\s\S]*?)```/)?.[1] || result || '';
    setGeneratedApp(code.trim());
  };

  const handleVideoGeneration = async () => {
    if (!videoPrompt.trim()) return;
    setIsLoading(true);
    setUploadError("");
    try {
      const response = await fetch("/api/gemini/video", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: videoPrompt, image: uploadedImage })
      });
      if (response.status === 401) {
        setAuthState("anonymous");
        throw new Error("Your session has expired. Sign in again.");
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Video generation failed.");
      }
      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      setGeneratedVideoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    } catch (error) {
      console.error("Video Generation Error:", error);
      setUploadError(error instanceof Error ? error.message : "Video generation failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleZipExport = async (type: 'website' | 'app') => {
    const zip = new JSZip();
    const content = type === 'website' ? generatedWebsite : generatedApp;
    const filename = type === 'website' ? 'index.html' : 'App.tsx';
    zip.file(filename, content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-project.zip`;
    a.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputElement = e.target;
    const file = inputElement.files?.[0];
    inputElement.value = "";
    if (!file) return;
    try {
      const prepared = await compressImageToDataUrl(file);
      setUploadedImage(prepared);
      setUploadError("");
      setGeneratedVideoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed.");
    }
  };

  if (authState !== "authenticated") {
    return <PrivateAccessGate checking={authState === "checking"} onLogin={handleLogin} />;
  }

  // --- UI Sections ---

  const SidebarItem = ({ id, icon: Icon, label }: { id: Tab; icon: any; label: string }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        if (window.innerWidth < 1024) setIsSidebarOpen(false);
      }}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        activeTab === id 
          ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" 
          : "text-gray-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className={cn("w-5 h-5", activeTab === id ? "text-indigo-400" : "group-hover:text-white")} />
      <span className="font-medium">{label}</span>
      {activeTab === id && <motion.div layoutId="activeTab" className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30 flex overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed lg:relative inset-y-0 left-0 w-72 border-r border-white/10 bg-black/80 lg:bg-black/40 backdrop-blur-2xl flex flex-col z-50"
          >
            <div className="p-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">GOD MODE</h1>
                <p className="text-[10px] text-indigo-400 font-mono tracking-widest uppercase">Version v8.0</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 mb-2 mt-4">Core Studio</div>
              <SidebarItem id="chat" icon={MessageSquare} label="AI Chat" />
              <SidebarItem id="code" icon={Code} label="Code Doctor" />
              <SidebarItem id="photo" icon={ImageIcon} label="Photo AI Lab" />
              <SidebarItem id="vision" icon={Eye} label="Vision AI" />
              
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 mb-2 mt-6">Builders</div>
              <SidebarItem id="website" icon={Globe} label="Website Builder" />
              <SidebarItem id="app" icon={Layers} label="App Builder" />
              <SidebarItem id="workflow" icon={Workflow} label="Workflow Builder" />
              
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-4 mb-2 mt-6">Creative</div>
              <SidebarItem id="video" icon={Video} label="Photo → Video" />
              <SidebarItem id="viral" icon={Share2} label="Viral Content" />
              <SidebarItem id="prompt" icon={Terminal} label="Prompt Lab" />
              <SidebarItem id="agents" icon={Cpu} label="AI Agents" />
            </div>

            <div className="p-4 border-t border-white/10">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium">Model Selection</p>
                  <select 
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value as any)}
                    className="bg-transparent text-[10px] text-gray-400 outline-none w-full"
                  >
                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                  </select>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 z-40">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">Private Session</span>
            </div>
            <button onClick={handleLogout} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-300 hover:bg-white/10">Lock</button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 border border-white/20" />
          </div>
        </header>

        {uploadError && <div role="alert" className="mx-6 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{uploadError}<button onClick={() => setUploadError("")} className="ml-3 underline">Dismiss</button></div>}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto h-full"
            >
              {activeTab === 'chat' && (
                <div className="flex flex-col h-[calc(100vh-10rem)] lg:h-[calc(100vh-12rem)]">
                  <div className="flex-1 overflow-y-auto space-y-6 mb-4 lg:mb-6 pr-2 lg:pr-4 custom-scrollbar">
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                        <MessageSquare className="w-12 h-12 text-indigo-500" />
                        <div>
                          <h3 className="text-xl font-bold">AI Chat Studio</h3>
                          <p className="text-sm">Start a conversation with the world's most powerful AI.</p>
                        </div>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div key={i} className={cn("flex gap-4", msg.role === 'assistant' ? "justify-start" : "justify-end")}>
                        <div className={cn(
                          "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                          msg.role === 'assistant' 
                            ? "bg-white/5 border border-white/10" 
                            : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                        )}>
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="relative">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                      placeholder="Type your message..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-16 focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                    <button 
                      onClick={handleChat}
                      disabled={isLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'code' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                  <div className="flex flex-col gap-4">
                    <GlassPanel className="flex-1 flex flex-col">
                      <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-white/5">
                        <span className="text-xs font-mono text-gray-400">Input Code</span>
                        <div className="flex gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500/50" />
                          <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                          <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                        </div>
                      </div>
                      <textarea
                        value={codeContent}
                        onChange={(e) => setCodeContent(e.target.value)}
                        placeholder="Paste your code here..."
                        className="flex-1 bg-transparent p-6 font-mono text-sm focus:outline-none resize-none custom-scrollbar"
                      />
                    </GlassPanel>
                    <div className="grid grid-cols-2 gap-3">
                      <GradientButton onClick={() => handleCodeAction('analyze')} loading={isLoading}>Analyze Bugs</GradientButton>
                      <GradientButton onClick={() => handleCodeAction('repair')} loading={isLoading}>Repair Code</GradientButton>
                      <GradientButton onClick={() => handleCodeAction('optimize')} loading={isLoading}>Optimize</GradientButton>
                      <GradientButton onClick={() => handleCodeAction('generate')} loading={isLoading}>Generate New</GradientButton>
                    </div>
                  </div>
                  <GlassPanel className="flex flex-col">
                    <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
                      <span className="text-xs font-mono text-gray-400">AI Diagnosis</span>
                      <button onClick={() => { navigator.clipboard.writeText(codeResult); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>
                          {codeResult || "Results will appear here..."}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </GlassPanel>
                </div>
              )}

              {activeTab === 'photo' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <GlassPanel className="p-8 flex flex-col items-center justify-center text-center space-y-4 border-dashed border-2">
                      {uploadedImage ? (
                        <div className="relative group w-full aspect-video rounded-xl overflow-hidden">
                          <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                            <button onClick={() => setUploadedImage(null)} className="p-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors">
                              <Trash2 className="w-6 h-6" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center">
                            <Plus className="w-8 h-8 text-indigo-500" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold">Upload Photo</h3>
                            <p className="text-sm text-gray-400">Drag and drop or click to browse</p>
                          </div>
                          <input type="file" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/jpeg,image/png,image/webp" />
                        </>
                      )}
                    </GlassPanel>
                    <div className="space-y-4">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                        AI Enhancements
                      </h3>
                      <div className="grid grid-cols-1 gap-3">
                        <button className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left flex items-center justify-between group">
                          <span>Upscale Image (4K)</span>
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        </button>
                        <button className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left flex items-center justify-between group">
                          <span>Remove Background</span>
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        </button>
                        <button className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left flex items-center justify-between group">
                          <span>Artistic Style Transfer</span>
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        </button>
                        <button className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left flex items-center justify-between group">
                          <span>Color Correction</span>
                          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vision' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                  <div className="space-y-4">
                    <GlassPanel className="aspect-square flex items-center justify-center relative">
                      {uploadedImage ? (
                        <img src={uploadedImage} alt="Vision" className="w-full h-full object-contain p-4" />
                      ) : (
                        <div className="text-center p-8 opacity-50">
                          <Eye className="w-12 h-12 mx-auto mb-4" />
                          <p>Upload an image for analysis</p>
                        </div>
                      )}
                      <input type="file" onChange={handleImageUpload} accept="image/jpeg,image/png,image/webp" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </GlassPanel>
                    <GradientButton onClick={handleVisionAnalysis} disabled={!uploadedImage} loading={isLoading} className="w-full">
                      Start Visual Analysis
                    </GradientButton>
                  </div>
                  <GlassPanel className="flex flex-col">
                    <div className="px-4 py-3 border-b border-white/10 bg-white/5 font-bold">Analysis Report</div>
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>
                          {visionAnalysis || "Waiting for image analysis..."}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </GlassPanel>
                </div>
              )}

              {(activeTab === 'website' || activeTab === 'app') && (
                <div className="flex flex-col h-full gap-6">
                  <div className="flex gap-4">
                    <div className="flex-1 relative">
                      <input
                        value={activeTab === 'website' ? websitePrompt : appPrompt}
                        onChange={(e) => activeTab === 'website' ? setWebsitePrompt(e.target.value) : setAppPrompt(e.target.value)}
                        placeholder={`Describe the ${activeTab === 'website' ? 'website' : 'app'} you want to build...`}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/50"
                      />
                    </div>
                    <GradientButton onClick={activeTab === 'website' ? handleWebsiteBuild : handleAppBuild} loading={isLoading}>
                      Generate
                    </GradientButton>
                  </div>

                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                    <GlassPanel className="flex flex-col h-[400px] lg:h-auto">
                      <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
                        <span className="text-xs font-mono text-gray-400">Source Code</span>
                        <div className="flex gap-2">
                          <button onClick={() => handleZipExport(activeTab as any)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(activeTab === 'website' ? generatedWebsite : generatedApp); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <pre className="flex-1 p-6 font-mono text-xs overflow-auto custom-scrollbar text-indigo-300">
                        {activeTab === 'website' ? generatedWebsite : generatedApp || "// Code will appear here..."}
                      </pre>
                    </GlassPanel>

                    <GlassPanel className="flex flex-col h-[500px] lg:h-auto">
                      <div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
                        <span className="text-xs font-mono text-gray-400">Live Preview</span>
                        <div className="flex gap-2 p-1 bg-black/40 rounded-lg">
                          <button onClick={() => setPreviewMode('desktop')} className={cn("p-1 rounded", previewMode === 'desktop' && "bg-white/10")}><Monitor className="w-3 h-3" /></button>
                          <button onClick={() => setPreviewMode('tablet')} className={cn("p-1 rounded", previewMode === 'tablet' && "bg-white/10")}><Tablet className="w-3 h-3" /></button>
                          <button onClick={() => setPreviewMode('mobile')} className={cn("p-1 rounded", previewMode === 'mobile' && "bg-white/10")}><Smartphone className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="flex-1 bg-white flex items-center justify-center overflow-hidden p-4">
                        <div className={cn(
                          "bg-white shadow-2xl transition-all duration-500 overflow-hidden",
                          previewMode === 'desktop' ? "w-full h-full" : 
                          previewMode === 'tablet' ? "w-[768px] h-full" : "w-[375px] h-full"
                        )}>
                          <iframe
                            title="Preview"
                            srcDoc={activeTab === 'website' ? generatedWebsite : `
                              <html>
                                <head><script src="https://cdn.tailwindcss.com"></script></head>
                                <body><div id="root"></div><script>${generatedApp}</script></body>
                              </html>
                            `}
                            className="w-full h-full border-none"
                          />
                        </div>
                      </div>
                    </GlassPanel>
                  </div>
                </div>
              )}

              {activeTab === 'workflow' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                  <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-xl font-bold">Workflow Builder</h3>
                    <div className="space-y-3">
                      <button 
                        onClick={() => setWorkflowSteps([...workflowSteps, { id: Math.random().toString(), type: 'prompt', content: '' }])}
                        className="w-full p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center gap-3"
                      >
                        <Plus className="w-5 h-5 text-indigo-400" />
                        <span>Add Prompt Step</span>
                      </button>
                      <button className="w-full p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex items-center gap-3 opacity-50 cursor-not-allowed">
                        <ImageIcon className="w-5 h-5 text-indigo-400" />
                        <span>Add Image Step</span>
                      </button>
                    </div>
                    <GradientButton className="w-full mt-6">Run Entire Workflow</GradientButton>
                  </div>
                  <div className="lg:col-span-2 space-y-4 overflow-y-auto custom-scrollbar pr-2">
                    {workflowSteps.map((step, i) => (
                      <GlassPanel key={step.id} className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Step {i + 1}: {step.type}</span>
                          <button onClick={() => setWorkflowSteps(workflowSteps.filter(s => s.id !== step.id))} className="text-gray-500 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={step.content}
                          onChange={(e) => {
                            const newSteps = [...workflowSteps];
                            newSteps[i].content = e.target.value;
                            setWorkflowSteps(newSteps);
                          }}
                          placeholder="Enter prompt for this step..."
                          className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm focus:outline-none h-24"
                        />
                      </GlassPanel>
                    ))}
                    {workflowSteps.length === 0 && (
                      <div className="h-64 flex flex-col items-center justify-center text-center opacity-30 border-2 border-dashed border-white/10 rounded-2xl">
                        <Workflow className="w-12 h-12 mb-4" />
                        <p>No steps added yet. Start building your AI chain.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'video' && (
                <div className="max-w-3xl mx-auto space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold">Photo → Video Generator</h2>
                    <p className="text-gray-400">Transform static images into cinematic AI videos.</p>
                  </div>

                  <GlassPanel className="p-8 space-y-6">
                    <div className="aspect-video bg-black/40 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden relative">
                      {generatedVideoUrl ? (
                        <video src={generatedVideoUrl} controls className="w-full h-full object-contain" />
                      ) : uploadedImage ? (
                        <img src={uploadedImage} alt="Reference" className="w-full h-full object-contain opacity-50" />
                      ) : (
                        <div className="text-center opacity-30">
                          <Video className="w-16 h-16 mx-auto mb-4" />
                          <p>Upload a reference photo or just use a prompt</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <div className="flex-1 relative">
                          <input
                            value={videoPrompt}
                            onChange={(e) => setVideoPrompt(e.target.value)}
                            placeholder="Describe the motion (e.g., 'A cat driving a car at top speed')"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                        <input type="file" id="video-ref" onChange={handleImageUpload} accept="image/jpeg,image/png,image/webp" className="hidden" />
                        <button 
                          onClick={() => document.getElementById('video-ref')?.click()}
                          className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors"
                        >
                          <ImageIcon className="w-6 h-6" />
                        </button>
                      </div>
                      <GradientButton onClick={handleVideoGeneration} loading={isLoading} className="w-full py-4 text-lg">
                        Generate Cinematic Video
                      </GradientButton>
                    </div>
                  </GlassPanel>
                </div>
              )}

              {/* Other tabs follow similar patterns... */}
              {['viral', 'prompt', 'agents'].includes(activeTab) && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-50">
                  <Cpu className="w-16 h-16 text-indigo-500 animate-pulse" />
                  <div>
                    <h3 className="text-2xl font-bold uppercase tracking-widest">{activeTab} Studio</h3>
                    <p className="max-w-md mx-auto mt-2">This module is being optimized for the latest Gemini 3.1 Pro architecture. Stay tuned for v8.1.</p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Stats */}
        <footer className="h-10 border-t border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 text-[10px] text-gray-500 font-mono uppercase tracking-widest">
          <div className="flex gap-6">
            <span>CPU: 0.4%</span>
            <span>MEM: 1.2GB</span>
            <span>LATENCY: 42ms</span>
          </div>
          <div className="flex gap-4">
            <span className="text-indigo-400">AI GOD MODE ACTIVE</span>
            <span>© 2026 AI HUB</span>
          </div>
        </footer>
      </main>

      {/* Global Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center space-y-4"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-indigo-500 animate-pulse" />
            </div>
            <p className="text-sm font-medium tracking-widest text-indigo-400 uppercase animate-pulse">Processing Request...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
