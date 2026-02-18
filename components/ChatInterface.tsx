
import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Sparkles, Loader2, RefreshCw, Paperclip, X, Mic, History, Plus, MessageSquare, Trash2 } from 'lucide-react';
import { GoogleGenAI, Chat } from "@google/genai";
import { DashboardState, Message, ChatSession } from '../types';
import GlassCard from './GlassCard';

// CONFIGURATION
// Keep the last 30 messages to maintain conversational context while managing token usage.
const MAX_CONTEXT_HISTORY = 30;

interface ChatInterfaceProps {
  dashboardState: DashboardState;
  sessions: ChatSession[];
  activeSessionId: string;
  onSessionChange: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  onUpdateMessages: (messages: Message[]) => void;
  isListening?: boolean;
  onMicClick?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  dashboardState, 
  sessions,
  activeSessionId,
  onSessionChange,
  onCreateSession,
  onDeleteSession,
  onUpdateMessages,
  isListening,
  onMicClick
}) => {
  // We use messages from the active session
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{data: string, mimeType: string} | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>(messages);

  // Sync ref with current messages for useEffects that shouldn't re-trigger on every message
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Re-initialize Chat Session when Dashboard State changes OR when Active Session changes
  useEffect(() => {
    const initChat = async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const taskContext = dashboardState.tasks.map(t => 
        `- ${t.title} (${t.priority}, ${t.type}, ${t.completed ? 'Done' : 'Pending'}) due ${new Date(t.startTime).toLocaleTimeString()}`
      ).join('\n');
      
      const expenseContext = `Total Spent: $${dashboardState.expenses.reduce((a,b) => a+b.amount, 0)}. Budget Limit: $${dashboardState.budgetConfig.limit}.`;

      const systemInstruction = `You are Arkos, an advanced AI assistant embedded in a personal dashboard.
      
      CURRENT USER DATA (Real-time):
      TASKS:
      ${taskContext || "No tasks currently listed."}
      
      FINANCES:
      ${expenseContext}
      
      INSTRUCTIONS:
      - Answer questions about the user's schedule, tasks, and budget based on the data above.
      - Keep responses concise, witty, and slightly futuristic/cyberpunk in tone.
      - If the user asks to add tasks or expenses, politely inform them to use the Voice Assistant (Central Button) or the + button on the dashboard, as you are currently in "Text Analysis Mode".
      - You can analyze patterns (e.g., "You have a lot of critical tasks today").
      `;

      // SLIDING WINDOW STRATEGY:
      // Load history from the ACTIVE session
      const historyToLoad = messagesRef.current
        .slice(-MAX_CONTEXT_HISTORY) 
        .map(m => ({
          role: m.role,
          parts: m.image 
            ? [{ text: m.text }, { inlineData: { mimeType: 'image/png', data: m.image.split(',')[1] } }] 
            : [{ text: m.text }]
        }));

      chatSessionRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction },
        history: historyToLoad
      });
    };

    initChat();
  }, [dashboardState.tasks, dashboardState.expenses, dashboardState.budgetConfig, activeSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, selectedImage]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage({
          data: reader.result as string,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && !selectedImage) || !chatSessionRef.current) return;

    const currentImage = selectedImage;
    const currentText = inputText;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentText,
      image: currentImage?.data,
      timestamp: new Date()
    };

    // Update via prop
    const updatedMessages = [...messages, userMsg];
    onUpdateMessages(updatedMessages);
    
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      let responseText = "";
      
      if (currentImage) {
        // Send multimodal message
        const base64Data = currentImage.data.split(',')[1];
        const result = await chatSessionRef.current.sendMessage({
          message: [
             { text: currentText || " " },
             { inlineData: { mimeType: currentImage.mimeType, data: base64Data } }
          ]
        });
        responseText = result.text;
      } else {
        // Text only
        const result = await chatSessionRef.current.sendMessage({ message: currentText });
        responseText = result.text;
      }
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };

      onUpdateMessages([...updatedMessages, botMsg]);

    } catch (err) {
      console.error("Chat Error", err);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'model',
        text: "Connection interrupted. Neural link unstable or token limit exceeded.",
        timestamp: new Date()
      };
      onUpdateMessages([...updatedMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      
      {/* History Sidebar/Overlay */}
      {showHistory && (
        <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-xl rounded-3xl p-4 flex flex-col animate-in slide-in-from-left duration-300">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <History size={14} className="text-cyan-400" /> Session History
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-2 text-white/20 hover:text-white transition-colors">
                <X size={18} />
              </button>
           </div>
           
           <button 
             onClick={() => {
                onCreateSession();
                setShowHistory(false);
             }}
             className="w-full py-3 mb-4 bg-cyan-400/10 border border-cyan-400/30 rounded-xl text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-400/20 flex items-center justify-center gap-2 transition-all"
           >
             <Plus size={14} /> New Context Window
           </button>

           <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
             {sessions.map(session => (
               <div
                 key={session.id}
                 className={`w-full p-3 rounded-xl border text-left transition-all group relative flex items-center justify-between cursor-pointer ${
                   activeSessionId === session.id 
                   ? 'bg-white/10 border-cyan-400/50' 
                   : 'bg-transparent border-white/5 hover:bg-white/5'
                 }`}
                 onClick={() => {
                   onSessionChange(session.id);
                   setShowHistory(false);
                 }}
               >
                 <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-3 mb-1">
                      <MessageSquare size={12} className={activeSessionId === session.id ? 'text-cyan-400' : 'text-white/30'} />
                      <span className={`text-[10px] font-bold truncate ${activeSessionId === session.id ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`}>
                          {session.title || "Untitled Session"}
                      </span>
                    </div>
                    <div className="text-[8px] font-mono text-white/20 pl-6">
                        {new Date(session.createdAt).toLocaleDateString()} • {new Date(session.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                 </div>
                 
                 <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        if(confirm("Delete this conversation?")) onDeleteSession(session.id);
                    }}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-white/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10"
                    title="Delete Context"
                 >
                    <Trash2 size={14} />
                 </button>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* Header Area */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-cyan-400/20 blur-xl animate-pulse" />
                <Sparkles size={20} className="text-cyan-400 relative z-10" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-white tracking-widest uppercase flex items-center gap-2">
                  Arkos Chat
                  {isListening && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"/>}
                </h2>
                <p className="text-[9px] text-cyan-400/60 font-mono tracking-widest uppercase">
                  {isListening ? 'Voice Link Active' : 'Online • v3.0'}
                </p>
            </div>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={() => setShowHistory(true)}
             className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-cyan-400 hover:border-cyan-400/30 transition-all active:scale-95"
             title="Session History"
           >
             <History size={16} />
           </button>
           <button 
            onClick={onCreateSession}
            className="p-2.5 rounded-xl bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/20 transition-all active:scale-95"
            title="New Chat"
           >
             <Plus size={16} />
           </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4 space-y-4">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
                <Bot size={48} className="text-white mb-4" />
                <p className="text-xs font-mono text-center max-w-[200px] leading-relaxed">
                    SYSTEM READY.<br/>
                    <span className="text-[9px] text-cyan-400">ASK ABOUT TASKS, BUDGET, OR UPLOAD IMAGES FOR ANALYSIS.</span>
                </p>
            </div>
        )}
        
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex items-end gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' 
                    ? 'bg-white/10 border border-white/20' 
                    : 'bg-cyan-400/10 border border-cyan-400/30'
                }`}>
                    {msg.role === 'user' ? <User size={12} className="text-white" /> : <Bot size={12} className="text-cyan-400" />}
                </div>

                {/* Bubble Container */}
                <div className="flex flex-col gap-1">
                    {/* Image Attachment */}
                    {msg.image && (
                        <div className={`rounded-xl overflow-hidden border border-white/10 max-w-[200px] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                            <img src={msg.image} alt="attachment" className="w-full h-auto" />
                        </div>
                    )}
                    
                    {/* Text Bubble */}
                    {msg.text && (
                        <div className={`p-3 rounded-2xl text-xs leading-relaxed font-medium backdrop-blur-md ${
                            msg.role === 'user'
                            ? 'bg-white/10 border border-white/10 text-white rounded-br-none'
                            : 'bg-black/40 border border-cyan-400/20 text-white/90 rounded-bl-none shadow-[0_0_15px_rgba(6,182,212,0.05)]'
                        }`}>
                            {msg.text}
                        </div>
                    )}
                </div>
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start w-full">
               <div className="flex items-end gap-2">
                   <div className="w-6 h-6 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
                       <Bot size={12} className="text-cyan-400" />
                   </div>
                   <div className="p-3 rounded-2xl bg-black/40 border border-cyan-400/20 rounded-bl-none">
                       <Loader2 size={16} className="text-cyan-400 animate-spin" />
                   </div>
               </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <GlassCard className="p-2 flex items-end gap-2 border-white/10 relative">
        {selectedImage && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl flex items-center gap-2">
                <img src={selectedImage.data} alt="preview" className="h-12 w-12 rounded-lg object-cover" />
                <button onClick={() => setSelectedImage(null)} className="p-1 text-white/50 hover:text-white bg-white/10 rounded-full"><X size={12} /></button>
            </div>
        )}
        
        <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            className="hidden" 
            onChange={handleImageSelect}
        />
        
        <button 
            onClick={() => fileInputRef.current?.click()}
            className={`p-2.5 rounded-xl transition-all ${selectedImage ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
        >
            <Paperclip size={18} />
        </button>

        <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            }}
            placeholder={isListening ? "Listening..." : "Type a command..."}
            className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-white/20 font-medium px-2 py-2.5 resize-none max-h-24 custom-scrollbar"
            rows={1}
            disabled={isListening}
        />

        {onMicClick && (
             <button 
                onClick={onMicClick}
                className={`p-2.5 rounded-xl transition-all ${isListening ? 'text-red-500 bg-red-500/10 animate-pulse' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
             >
                <Mic size={18} />
             </button>
        )}
        
        <button 
            onClick={() => handleSend()}
            disabled={isLoading || (!inputText.trim() && !selectedImage) || isListening}
            className="p-2.5 bg-cyan-400 text-black rounded-xl hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 mb-0.5"
        >
            <Send size={16} />
        </button>
      </GlassCard>
    </div>
  );
};

export default ChatInterface;
