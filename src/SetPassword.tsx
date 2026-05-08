import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle, Activity, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';

export function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // NUEVO ESTADO: Controla la pantalla de carga inicial
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Le damos tiempo a Supabase para que lea y valide el token de la URL
    const verifyToken = async () => {
      await supabase.auth.getSession();
      setIsVerifying(false);
    };

    verifyToken();

    // Escuchamos si el estado de autenticación cambia de repente
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setIsVerifying(false);
      }
    });

    // Seguro de vida: Si Supabase tarda más de 3 segundos, mostramos el formulario de todas formas
    const fallbackTimer = setTimeout(() => setIsVerifying(false), 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

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

  // 1. VISTA DE CARGA INICIAL (La que ve el usuario al hacer clic en el correo)
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E31C25]/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="z-10 flex flex-col items-center gap-6 animate-in fade-in duration-500">
          <div className="w-16 h-16 bg-[#121212] border border-[#2a2a2a] rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(227,28,37,0.2)]">
            <Loader2 className="text-[#E31C25] w-8 h-8 animate-spin" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white mb-2">Verificando enlace seguro...</h2>
            <p className="text-gray-400 text-sm max-w-xs mx-auto">Conectando con la base de datos, por favor no cierres esta ventana.</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. VISTA DE ÉXITO
  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
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

  // 3. VISTA DEL FORMULARIO
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#E31C25]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="bg-[#121212] border border-[#2a2a2a] p-10 rounded-3xl max-w-md w-full shadow-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-10">
          
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
            className="w-full py-4 mt-2 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] hover:shadow-[0_0_20px_rgba(227,28,37,0.3)] transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-none flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}