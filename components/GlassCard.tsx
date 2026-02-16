
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`glass-effect rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:border-cyan-400/40 ${onClick ? 'cursor-pointer active:scale-95' : ''} ${className}`}
    >
      {/* Subtle shine gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
      {children}
    </div>
  );
};

export default GlassCard;
