import React, { useEffect, useState } from 'react';

// Tiempo mínimo que se muestra el splash antes de empezar a desvanecerse (ms).
const MIN_VISIBLE_MS = 1200;
// Duración del fundido de salida (debe coincidir con la clase duration-* del overlay).
const FADE_OUT_MS = 500;

// Overlay puramente visual: se monta por encima de <App /> sin alterar ninguna de
// sus rutas/estados (login, alta/cambio de contraseña, kiosko TV...), y se retira
// solo tras un temporizador fijo. Nunca debe aparecer en el kiosko TV.
export function SplashScreen() {
  const [isTvRoute] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hash.includes('tv');
  });

  const [visible, setVisible] = useState(!isTvRoute);
  const [mounted, setMounted] = useState(!isTvRoute);

  useEffect(() => {
    if (isTvRoute) return;

    const hideTimer = setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, [isTvRoute]);

  useEffect(() => {
    if (visible || !mounted) return;

    const unmountTimer = setTimeout(() => setMounted(false), FADE_OUT_MS);
    return () => clearTimeout(unmountTimer);
  }, [visible, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a] transition-opacity duration-500 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-[#E31C25]/30 blur-2xl animate-pulse" />
          <img
            src="/logo.png"
            alt="Daniel Miranda En Movimiento"
            className="relative w-24 h-24 rounded-3xl object-cover shadow-[0_0_30px_rgba(227,28,37,0.35)] border border-[#2a2a2a]"
          />
        </div>

        <div className="flex flex-col items-center mt-6">
          <span className="text-2xl font-black tracking-tighter leading-none">
            <span className="text-[#E31C25]">DANIEL</span>
            <span className="text-white">MIRANDA</span>
          </span>
          <span className="text-[11px] text-gray-400 font-bold tracking-[0.25em] mt-2 uppercase">
            En Movimiento
          </span>
        </div>

        <div className="mt-8 w-40 h-1 rounded-full bg-[#1a1a1a] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#E31C25]"
            style={{
              animation: `splash-fill ${MIN_VISIBLE_MS}ms ease-out forwards`,
            }}
          />
        </div>
      </div>

      <p className="absolute bottom-8 text-[11px] text-gray-600 font-medium tracking-wide">
        by <span className="text-gray-500 font-semibold">crisvb7</span>
      </p>

      <style>{`
        @keyframes splash-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
