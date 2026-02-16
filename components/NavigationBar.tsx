
import React from 'react';
import { Home, Search, Bell, User } from 'lucide-react';

export type TabType = 'home' | 'search' | 'notifications';

interface NavigationBarProps {
  onMicClick: () => void;
  isListening?: boolean;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ 
  onMicClick, 
  isListening, 
  activeTab, 
  onTabChange 
}) => {
  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg glass-effect h-16 rounded-full flex items-center justify-between px-6 z-50 shadow-2xl">
      <button 
        onClick={() => onTabChange('home')}
        className={`p-2 rounded-full transition-all duration-300 ${activeTab === 'home' ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
      >
        <Home size={22} />
      </button>
      
      <button 
        onClick={() => onTabChange('search')}
        className={`p-2 rounded-full transition-all duration-300 ${activeTab === 'search' ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
      >
        <Search size={22} />
      </button>

      {/* Center Mic Button */}
      <div className="relative -top-6">
        <button 
          onClick={onMicClick}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-[#050505] transition-all duration-300 ${
            isListening ? 'bg-red-500 scale-110' : 'bg-cyan-400 hover:scale-105 active:scale-95'
          }`}
        >
          <div className={`w-full h-full flex items-center justify-center ${isListening ? 'text-white' : 'text-black'}`}>
            <span className="sr-only">Voice Commands</span>
            <div className={`w-2 h-2 rounded-full bg-current ${isListening ? 'animate-ping' : ''}`} />
          </div>
        </button>
      </div>

      <button 
        onClick={() => onTabChange('notifications')}
        className={`p-2 rounded-full transition-all duration-300 ${activeTab === 'notifications' ? 'text-cyan-400 bg-cyan-400/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
      >
        <Bell size={22} />
      </button>

      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden transition-colors hover:border-cyan-400/50">
        <User size={16} className="text-white/40" />
      </div>
    </nav>
  );
};

export default NavigationBar;
