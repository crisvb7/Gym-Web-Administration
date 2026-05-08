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
  X     
} from "lucide-react";
import { supabase } from './lib/supabase';

// Importación de componentes
import { DashboardOverview } from "./dashboard-overview";
import { MembersPage } from "./members";
import { ScheduleManager } from "./schedule-manager";
import { NutritionManager } from "./nutrition-manager";
import { WorkoutsPage } from "./workouts";
import { NutritionForm } from "./components/nutrition-form";

// Pantallas de seguridad
import { SetPasswordPage } from "./SetPassword";
import { LoginPage } from "./login";
import { BillingManager } from './billing-manager';
import { TariffGenerator } from './TariffGenerator'; 

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Detección de error en el enlace
  const [linkExpired] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.location.href.includes('error=');
  });

  // ESTADOS DE SEGURIDAD
  const [session, setSession] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState(false); 
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // NUEVO: Estados para capturar al cliente sin echarlo
  const [isClientPortal, setIsClientPortal] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const checkStaffRole = async (currentSession: any) => {
      if (!currentSession) {
        setSession(null);
        setHasAccess(false);
        // IMPORTANTE: NO ponemos isClientPortal a false aquí.
        // Así permitimos que vean el mensaje de "¡Contraseña Guardada!" tras guardarla y cerrar sesión.
        setIsCheckingAuth(false);
        return;
      }

      // Comprobamos quién es en la base de datos
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentSession.user.id)
        .single();

      if (data?.role === 'admin' || data?.role === 'trainer') {
        // Es del equipo, le damos acceso al panel principal
        setSession(currentSession);
        setHasAccess(true);
        setIsClientPortal(false);
      } else {
        // ¡LA SOLUCIÓN ESTÁ AQUÍ!
        // Es un cliente (Atleta). En vez de cerrarle la sesión y echarlo, 
        // lo retenemos en el "Portal de Cliente" para que ponga su contraseña.
        setSession(currentSession);
        setHasAccess(false);
        setIsClientPortal(true); 
      }
      setIsCheckingAuth(false);
    };

    // 1. Miramos la sesión al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkStaffRole(session);
    });

    // 2. Escuchamos cambios (por ejemplo, cuando Supabase detecta el token mágico)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
      checkStaffRole(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

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
  ];

  // ==========================================
  // ORDEN DE PANTALLAS (UX MEJORADA)
  // ==========================================

  // 1. Enlace caducado o usado
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

  // 2. Pantalla de carga mientras comprobamos el perfil
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
      </div>
    );
  }

  // 3. ¡EL PORTAL DE CLIENTE! Si detectamos que es Atleta o alguien recuperando la clave
  if (isClientPortal || isRecovery) {
    return <SetPasswordPage />;
  }

  // 4. Si no hay sesión válida, al Login
  if (!session || !hasAccess) {
    return <LoginPage />;
  }

  // 5. EL PANEL DE CONTROL PRINCIPAL PARA EL STAFF
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
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
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
              <Activity className="text-white w-6 h-6" />
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

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-[#E31C25]/10 text-[#E31C25] border border-[#E31C25]/20' 
                    : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#E31C25]' : 'group-hover:text-[#E31C25]'}`} />
                <span className="font-semibold text-sm">{item.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#E31C25] shadow-[0_0_8px_#E31C25]" />}
              </button>
            );
          })}
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
        <div className="p-4 pt-20 lg:p-8 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex justify-end">
          <div className="w-full max-w-md bg-[#1a1a1a] h-full p-8 border-l border-[#2a2a2a] shadow-2xl overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">Plan para {selectedUser.first_name}</h2>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white">
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

function Activity(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
  );
}