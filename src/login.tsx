import React, { useState } from 'react';
import { Lock, AlertCircle, Activity } from 'lucide-react';
import { supabase } from './lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // 1. Intentamos iniciar sesión con Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Correo o contraseña incorrectos.');
      setLoading(false);
      return;
    }

    // 2. Comprobamos si el usuario es administrador o entrenador
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    // 🔒 Validamos que sea admin O entrenador (en base a tu DB real)
    if (profile?.role !== 'admin' && profile?.role !== 'entrenador' && profile?.role !== 'trainer') {
      await supabase.auth.signOut();
      setError('Acceso denegado. Zona exclusiva para personal del centro.');
      setLoading(false);
    }
    
    // Si es admin o entrenador, App.tsx se dará cuenta automáticamente
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Brillo de fondo con el Rojo Movimiento */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E31C25]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="bg-[#121212] border border-[#2a2a2a] p-8 rounded-3xl max-w-md w-full shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-8">
          
          {/* Logo Centralizado */}
          <div className="flex flex-col items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#E31C25] rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(227,28,37,0.4)]">
              <Activity className="text-white w-7 h-7" />
            </div>
            <span className="text-2xl font-black tracking-tighter">
              <span className="text-[#E31C25]">DANIEL</span><span className="text-white">MIRANDA</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white">Acceso de Personal</h2>
          <p className="text-gray-400 mt-2 text-sm">Panel de gestión exclusivo para entrenadores y administración.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Correo Electrónico</label>
            <input 
              type="email" 
              required
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3.5 rounded-xl mt-1.5 text-white focus:border-[#E31C25] outline-none transition-colors"
              placeholder="staff@danielmiranda.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Contraseña</label>
            <input 
              type="password" 
              required
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3.5 rounded-xl mt-1.5 text-white focus:border-[#E31C25] outline-none transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-3 rounded-xl text-sm border border-red-500/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 mt-4 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] hover:shadow-[0_0_20px_rgba(227,28,37,0.3)] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:shadow-none"
          >
            {loading ? (
              <span className="animate-pulse">Verificando acceso...</span>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Entrar al Panel</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}