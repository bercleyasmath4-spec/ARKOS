
import React from 'react';
import { Mic, Activity } from 'lucide-react';
import { THEME } from '../constants';

interface JarvisOrbProps {
  isListening?: boolean;
}

const JarvisOrb: React.FC<JarvisOrbProps> = ({ isListening = false }) => {
  return (
    <div className="relative flex items-center justify-center w-32 h-32 md:w-40 md:h-40">
      {/* Outer Rotating Ring */}
      <div className="absolute inset-0 border border-dashed border-cyan-400/20 rounded-full animate-slow-spin"></div>
      
      {/* Middle Pulsing Ring */}
      <div className={`absolute inset-4 border-2 border-cyan-400/10 rounded-full ${isListening ? 'animate-ping' : 'animate-pulse'}`}></div>
      
      {/* Core Orb */}
      <div className="relative z-10 w-20 h-20 md:w-24 md:h-24 rounded-full bg-black/60 border border-cyan-400 overflow-hidden flex items-center justify-center orb-glow">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-transparent"></div>
        {isListening ? (
          <Activity className="w-8 h-8 text-cyan-400 animate-pulse" />
        ) : (
          <Mic className="w-8 h-8 text-cyan-400" />
        )}
      </div>

      {/* Background Ambient Glow */}
      <div className="absolute w-24 h-24 bg-cyan-400/30 rounded-full blur-3xl"></div>
    </div>
  );
};

export default JarvisOrb;
