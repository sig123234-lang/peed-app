/// <reference lib="dom" />
import React from 'react';

// Web modal backdrop — blurs + dims whatever is mounted behind it (the feed,
// burning map, etc.) using CSS backdrop-filter, and centers the popup card on
// top. Raw DOM so the blur is real; RN children render fine inside (react-dom).
//
// IMPORTANT: this is portaled to <body>. Each router tab screen is wrapped in a
// `transform`-ed container by react-navigation, and a CSS transform on any
// ancestor makes `position: fixed` resolve against THAT ancestor instead of the
// viewport. Mounted inline, the backdrop then can't cover the screen and the
// page behind (nav bars, buttons) bleeds through on top of the card. Portaling
// to <body> escapes every transformed ancestor so `fixed` covers the viewport.
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
  const overlay = (
    <div
      onClick={onPress}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
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

  // No document during static prerender — render nothing in-place (the popup
  // only ever opens from a client interaction, so there's nothing to show yet).
  if (typeof document === 'undefined') return null;
  // Lazy require so the native bundle never pulls in react-dom (matches the
  // Portal idiom in AdminApp). Avoids needing @types/react-dom too.
  const createPortal = require('react-dom').createPortal as (
    c: React.ReactNode,
    el: Element
  ) => any;
  return createPortal(overlay, document.body);
}
