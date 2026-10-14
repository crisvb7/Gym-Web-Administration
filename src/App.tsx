import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Apple, 
  Dumbbell,
  DollarSign,
  Zap, 
  LogOut,
  Loader2,
  Menu, 
  X,
  Activity, 
  Speaker,
  Megaphone,
  MonitorPlay // <-- Añadido el icono para la TV
} from "lucide-react";
import { supabase } from './lib/supabase';

// Importación de componentes
import { DashboardOverview } from "./dashboard-overview";
import { MembersPage } from "./members";
import { ScheduleManager } from "./schedule-manager";
import { NutritionManager } from "./nutrition-manager";
import { WorkoutsPage } from "./workouts";
import { NutritionForm } from "./components/nutrition-form";

// Pantallas de seguridad y legales
import { SetPasswordPage } from "./SetPassword";
import { LoginPage } from "./login";
import { BillingManager } from './billing-manager';
import { TariffGenerator } from './TariffGenerator'; 
import { PrivacyPolicy } from "./PrivacyPolicy";
import { TVDisplay } from "./TVDisplay"; // <-- Añadida la importación del Kiosko TV

// Pantalla de descargas y anuncios
import { AppDownload } from "./AppDownload";
import GestionAnuncios from './anuncios';

// Pantalla de carga inicial
import { SplashScreen } from "./components/splash-screen";

// Límite de espera de la comprobación de sesión/rol y cada cuánto se reintenta si falla.
const AUTH_TIMEOUT_MS = 10000;
const AUTH_RETRY_MS = 8000;

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Sin respuesta en ${ms / 1000}s`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// El splash se monta como overlay independiente por encima de <AppShell />, así que
// no toca ninguna de sus rutas/estados (login, invitación, recuperar contraseña,
// kiosko TV...) y se retira solo con un temporizador — ver components/splash-screen.tsx.
export default function App() {
  return (
    <>
      <AppShell />
      <SplashScreen />
    </>
  );
}

function AppShell() {
  // 1. EL BYPASS INSTANTÁNEO (Detecta el link mágico en el milisegundo 0)
  const [isDirectInvite] = useState(() => {
    if (typeof window === 'undefined') return false;
    const url = window.location.href;
    return url.includes('type=invite') || url.includes('type=recovery') || url.includes('access_token=');
  });

  // 2. DETECTOR DE LA PÁGINA PÚBLICA DE PRIVACIDAD
  const [isPrivacyRoute] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.href.includes('privacidad');
  });

  // 3. DETECTOR DE LA PÁGINA DE DESCARGA DE LA APP
  const [isAppDownloadRoute] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname === '/app' || window.location.pathname === '/app/';
  });

  // 4. NUEVO: DETECTOR DE LA TV USANDO HASH (#/tv) PARA GITHUB PAGES
  const [isTvRoute] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hash.includes('tv');
  });

  const [linkExpired] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.href.includes('error=');
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // ESTADOS DE SEGURIDAD
  const [session, setSession] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState(false); 
  // ⚠️ Añadimos isTvRoute al bypass para no cargar el Auth
  const [isCheckingAuth, setIsCheckingAuth] = useState(!isDirectInvite && !linkExpired && !isPrivacyRoute && !isAppDownloadRoute && !isTvRoute);
  const [isClientPortal, setIsClientPortal] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  // Si Supabase no responde, en vez de dejar el cargador girando para siempre se muestra un
  // aviso y se reintenta solo (authAttempt vuelve a lanzar la comprobación).
  const [authError, setAuthError] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);

  useEffect(() => {
    // ⚠️ ATENCIÓN AQUÍ: Añadimos isTvRoute al bypass de comprobaciones
    if (isDirectInvite || linkExpired || isPrivacyRoute || isAppDownloadRoute || isTvRoute) return;

    let cancelled = false;
    let checkSeq = 0;
    let grantedUserId: string | null = null;

    const checkStaffRole = async (currentSession: any) => {
      const seq = ++checkSeq;
      const isLatest = () => !cancelled && seq === checkSeq;

      if (!currentSession) {
        grantedUserId = null;
        setSession(null);
        setHasAccess(false);
        setIsClientPortal(false);
        setAuthError(false);
        setIsCheckingAuth(false);
        return;
      }

      // Comprobamos quién es en la BD (con límite de tiempo: si la BD va lenta no nos quedamos colgados)
      const { data, error, status } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentSession.user.id)
        .abortSignal(timeoutSignal(AUTH_TIMEOUT_MS))
        .single();

      if (!isLatest()) return;

      // Sesión guardada que ya no vale (token caducado/revocado): al login.
      if (error && (status === 401 || status === 403)) {
        await supabase.auth.signOut({ scope: 'local' });
        if (!isLatest()) return;
        grantedUserId = null;
        setSession(null);
        setHasAccess(false);
        setIsClientPortal(false);
        setAuthError(false);
        setIsCheckingAuth(false);
        return;
      }

      // Fallo de red, tiempo agotado o error del servidor: no se manda al staff a la pantalla de
      // clientes por eso; se avisa y se reintenta. (PGRST116 = no existe el perfil → cliente, como antes.)
      if (error && error.code !== 'PGRST116' && (status === 0 || status >= 500 || status === 408)) {
        console.error('[Auth] No se pudo comprobar el rol:', error.message);
        // Si ya estaba dentro (p. ej. al refrescar el token) no le echamos del panel.
        if (grantedUserId === currentSession.user.id) return;
        setAuthError(true);
        setIsCheckingAuth(false);
        return;
      }

      setAuthError(false);
      if (data?.role === 'admin' || data?.role === 'trainer') {
        grantedUserId = currentSession.user.id;
        setSession(currentSession);
        setHasAccess(true);
        setIsClientPortal(false);
      } else {
        grantedUserId = null;
        setSession(currentSession);
        setHasAccess(false);
        setIsClientPortal(true); 
      }
      setIsCheckingAuth(false);
    };

    withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS)
      .then(({ data: { session } }) => checkStaffRole(session))
      .catch((err) => {
        if (cancelled) return;
        console.error('[Auth] No se pudo recuperar la sesión:', err);
        setAuthError(true);
        setIsCheckingAuth(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      // Fuera del callback: llamar a Supabase dentro de él puede bloquear el cliente de auth.
      setTimeout(() => { if (!cancelled) checkStaffRole(newSession); }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isDirectInvite, linkExpired, isPrivacyRoute, isAppDownloadRoute, isTvRoute, authAttempt]); // ⚠️ Añadido a dependencias

  // Mientras no hay conexión, se reintenta solo cada pocos segundos.
  useEffect(() => {
    if (!authError) return;
    const retry = setTimeout(() => setAuthAttempt((n) => n + 1), AUTH_RETRY_MS);
    return () => clearTimeout(retry);
  }, [authError, authAttempt]);

  const retryAuth = () => {
    setIsCheckingAuth(true);
    setAuthAttempt((n) => n + 1);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setIsSidebarOpen(false); 
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardOverview />;
      case 'members': return <MembersPage onSelectMember={(u) => setSelectedUser(u)} />;
      case 'schedule': return <ScheduleManager />;
      case 'tariff-generator': return <TariffGenerator />; 
      case 'nutrition': return <NutritionManager />;
      case 'workouts': return <WorkoutsPage />;
      case 'billing': return <BillingManager />; 
      case 'anuncios': return <GestionAnuncios />;
      default: return <DashboardOverview />;
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Panel de Control', icon: LayoutDashboard },
    { id: 'members', label: 'Clientes', icon: Users },
    { id: 'schedule', label: 'Horarios', icon: Calendar },
    { id: 'tariff-generator', label: 'Generador Tarifas', icon: Zap }, 
    { id: 'nutrition', label: 'Nutrición', icon: Apple },
    { id: 'workouts', label: 'Entrenamientos', icon: Dumbbell },
    { id: 'billing', label: 'Facturación', icon: DollarSign }, 
    { id: 'anuncios', label: 'Anuncios', icon: Megaphone },
  ];

  // ==========================================
  // ORDEN DE PANTALLAS (UX MEJORADA)
  // ==========================================

  // 1. LA PÁGINA PÚBLICA DE PRIVACIDAD
  if (isPrivacyRoute) {
    return <PrivacyPolicy />;
  }

  // 1.5. LA PÁGINA DE DESCARGA DE LA APP (Pública)
  if (isAppDownloadRoute) {
    return <AppDownload />;
  }

  // 1.7. PANTALLA DE TV (Limpia sin menús, usando Hash Router)
  if (isTvRoute) {
    return <TVDisplay />;
  }

  // 2. ERROR DE ENLACE
  if (linkExpired) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] border border-red-500/30 p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-[#E31C25] mx-auto mb-4 text-2xl">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Enlace no válido</h2>
          <p className="text-gray-400 mb-6">Este enlace ya ha sido utilizado o ha caducado.</p>
        </div>
      </div>
    );
  }

  // 3. EL PASE VIP INSTANTÁNEO (Contraseña de cliente)
  if (isDirectInvite || isClientPortal || isRecovery) {
    return <SetPasswordPage />;
  }

  // 4. CARGADOR
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
      </div>
    );
  }

  // 4.5. SIN CONEXIÓN CON EL SERVIDOR (se reintenta solo)
  if (authError && !hasAccess) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-8 rounded-2xl max-w-md w-full text-center">
          <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No se puede conectar con el servidor</h2>
          <p className="text-gray-400 mb-6">Lo estamos reintentando automáticamente. Si tarda, revisa tu conexión a internet.</p>
          <button
            onClick={retryAuth}
            className="px-5 py-2.5 bg-[#E31C25] hover:bg-[#c4161e] text-white font-semibold rounded-xl transition-colors"
          >
            Reintentar ahora
          </button>
        </div>
      </div>
    );
  }

  // 5. LOGIN
  if (!session || !hasAccess) {
    return <LoginPage />;
  }

  // 6. DASHBOARD PRINCIPAL (Solo Staff)
  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white font-sans animate-in fade-in duration-500 relative overflow-hidden">
      
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden absolute top-4 left-4 z-40 p-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-white hover:text-[#E31C25] transition-colors"
      >
        <Menu size={24} />
      </button>

      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#121212] border-r border-[#2a2a2a] flex flex-col h-screen
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="p-5 flex justify-between items-center">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 bg-[#E31C25] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(227,28,37,0.4)]">
              <ActivityIcon className="text-white w-6 h-6" />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-lg font-black tracking-tighter truncate leading-none">
                <span className="text-[#E31C25]">DANIEL</span>MIRANDA
              </span>
              <span className="text-[10px] text-gray-400 font-bold tracking-widest mt-1 uppercase truncate">
                En Movimiento
              </span>
            </div>
          </div>
          
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white shrink-0 ml-2">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-2 pb-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group active:scale-[0.98] ${
                  isActive
                    ? 'bg-[#E31C25]/10 text-[#E31C25] border border-[#E31C25]/20'
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white hover:translate-x-0.5'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-[#E31C25]' : 'group-hover:text-[#E31C25]'}`} />
                <span className="font-semibold text-sm">{item.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#E31C25] shadow-[0_0_8px_#E31C25] animate-pulse" />}
              </button>
            );
          })}

          {/* === BOTÓN KIOSKO TV === */}
          <div className="pt-6 pb-2 border-t border-[#2a2a2a] mt-4">
            <a
              href="#/tv"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
            >
              <MonitorPlay className="w-5 h-5 group-hover:text-[#E31C25] transition-colors" />
              <span className="font-semibold text-sm">Kiosko TV</span>
            </a>
          </div>
        </nav>

        <div className="p-4 border-t border-[#2a2a2a]">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-[#E31C25] hover:bg-[#E31C25]/10 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-semibold text-sm">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-y-auto w-full">
        <div key={activeTab} className="p-4 pt-20 lg:p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
          {renderContent()}
        </div>
      </main>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex justify-end animate-in fade-in duration-200" onClick={() => setSelectedUser(null)}>
          <div
            className="w-full max-w-md bg-[#1a1a1a] h-full p-8 border-l border-[#2a2a2a] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">Plan para {selectedUser.first_name}</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            <NutritionForm user={selectedUser} onComplete={() => setSelectedUser(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
  );
}
