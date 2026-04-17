import React, { useState } from 'react';
import { Lock, CheckCircle, Activity } from 'lucide-react';
import { supabase } from './lib/supabase';

export function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      await supabase.auth.signOut();
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Brillo de fondo con el Rojo Movimiento */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E31C25]/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="bg-[#121212] border border-[#E31C25]/30 p-10 rounded-3xl max-w-md w-full text-center shadow-2xl relative z-10 animate-in zoom-in duration-300">
          <CheckCircle className="w-20 h-20 text-[#E31C25] mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">¡Contraseña Guardada!</h2>
          <p className="text-gray-400 mb-8 text-lg">Tu cuenta está configurada correctamente.</p>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-6 rounded-2xl">
            <p className="text-sm text-gray-300 font-medium">
              Ya puedes cerrar esta ventana con seguridad e iniciar sesión en la aplicación móvil de <span className="text-white font-bold">DANIEL MIRANDA</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Brillo de fondo con el Rojo Movimiento */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E31C25]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="bg-[#121212] border border-[#2a2a2a] p-10 rounded-3xl max-w-md w-full shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-10">
          
          {/* Logo de la marca */}
          <div className="flex flex-col items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-[#E31C25] rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(227,28,37,0.4)]">
              <Activity className="text-white w-7 h-7" />
            </div>
            <span className="text-2xl font-black tracking-tighter">
              <span className="text-[#E31C25]">DANIEL</span><span className="text-white">MIRANDA</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white">Configura tu cuenta</h2>
          <p className="text-gray-400 mt-2 text-sm leading-relaxed">Crea una contraseña segura para acceder a tus entrenamientos y dieta.</p>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-6">
          <div>
            <label className="text-xs text-gray-500 uppercase font-bold tracking-wider block mb-2">Nueva Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
              <input 
                type="password" 
                required
                minLength={6}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] py-3.5 pl-12 pr-4 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
                placeholder="Mínimo 6 caracteres..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-4 rounded-xl font-medium">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-2 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] hover:shadow-[0_0_20px_rgba(227,28,37,0.3)] transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-none flex justify-center items-center"
          >
            {loading ? <span className="animate-pulse">Guardando...</span> : 'Guardar Contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}