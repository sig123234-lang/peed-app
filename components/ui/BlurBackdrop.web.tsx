/// <reference lib="dom" />
import React from 'react';

// Web modal backdrop — blurs + dims whatever is mounted behind it (the feed,
// burning map, etc.) using CSS backdrop-filter, and centers the popup card on
// top. Raw DOM so the blur is real; RN children render fine inside (react-dom).
export function BlurBackdrop({
  children,
  onPress,
  tint = 'rgba(10, 12, 20, 0.45)',
  blur = 14,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  tint?: string;
  blur?: number;
}) {
  return (
    <div
      onClick={onPress}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: tint,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}
