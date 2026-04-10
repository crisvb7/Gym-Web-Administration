import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Apple, 
  Dumbbell, 
  // Settings,
  LogOut,
  Loader2,
  Menu, 
  X     
} from "lucide-react";
import { supabase } from './lib/supabase';

// Importación de tus componentes
import { DashboardOverview } from "./dashboard-overview";
import { MembersPage } from "./members";
import { ScheduleManager } from "./schedule-manager";
import { NutritionManager } from "./nutrition-manager";
import { WorkoutsPage } from "./workouts";
// import { SettingsPage } from "./settings";
import { NutritionForm } from "./components/nutrition-form";

// Importamos las pantallas de seguridad
import { SetPasswordPage } from "./SetPassword";
import { LoginPage } from "./login";

export default function App() {
  // --- ESTADO PARA EL MENÚ EN MÓVIL ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 1. DETECTAMOS LA INVITACIÓN SÍNCRONAMENTE
  const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
  const [isInviteFlow, setIsInviteFlow] = useState(
    initialHash.includes('type=invite') || initialHash.includes('type=recovery')
  );
  const [linkExpired, setLinkExpired] = useState(
    initialHash.includes('error=')
  );

  // Estados de tu panel
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Estados de seguridad
  const [session, setSession] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState(false); 
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // 2. GUARDIA DE SEGURIDAD
  useEffect(() => {
    const checkStaffRole = async (currentSession: any) => {
      if (!currentSession) {
        setSession(null);
        setHasAccess(false);
        setIsCheckingAuth(false);
        return;
      }

      // Si el cliente viene por una invitación, el guardia lo deja pasar.
      if (isInviteFlow || linkExpired) {
        setSession(currentSession);
        setIsCheckingAuth(false);
        return; 
      }

      // Si es un acceso normal (login), comprobamos que sea staff
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentSession.user.id)
        .single();

      if (data?.role === 'admin' || data?.role === 'trainer') {
        setSession(currentSession);
        setHasAccess(true);
      } else {
        await supabase.auth.signOut(); 
        setSession(null);
        setHasAccess(false);
      }
      setIsCheckingAuth(false);
    };

    // Miramos la sesión al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkStaffRole(session);
    });

    // Escuchamos cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      checkStaffRole(newSession);
    });

    return () => subscription.unsubscribe();
  }, [isInviteFlow, linkExpired]);

  // Función para cerrar sesión
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  
  // --- FUNCIÓN PARA CAMBIAR DE TAB Y CERRAR EL MENÚ EN MÓVIL ---
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setIsSidebarOpen(false); 
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardOverview />;
      case 'members': return <MembersPage onSelectMember={(u) => setSelectedUser(u)} />;
      case 'schedule': return <ScheduleManager />;
      case 'nutrition': return <NutritionManager />;
      case 'workouts': return <WorkoutsPage />;
      default: return <DashboardOverview />;
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Panel de Control', icon: LayoutDashboard },
    { id: 'members', label: 'Clientes', icon: Users },
    { id: 'schedule', label: 'Horarios', icon: Calendar },
    { id: 'nutrition', label: 'Nutrición', icon: Apple },
    { id: 'workouts', label: 'Entrenamientos', icon: Dumbbell },
  ];

  // ==========================================
  // FLUJOS DE PANTALLA
  // ==========================================

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

  if (isInviteFlow) {
    return <SetPasswordPage />;
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
      </div>
    );
  }

  if (!session || !hasAccess) {
    return <LoginPage />;
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white font-sans animate-in fade-in duration-500 relative overflow-hidden">
      
      {/* --- BOTÓN HAMBURGUESA (MÓVIL) --- */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden absolute top-4 left-4 z-40 p-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-white hover:text-[#E31C25] transition-colors"
      >
        <Menu size={24} />
      </button>

      {/* --- OVERLAY OSCURO (MÓVIL) --- */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- BARRA LATERAL (SIDEBAR) --- */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#121212] border-r border-[#2a2a2a] flex flex-col h-screen
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="p-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E31C25] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(227,28,37,0.4)]">
              <Activity className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-black tracking-tighter">
              <span className="text-[#E31C25]">DANIEL</span>MIRANDA
            </span>
          </div>
          
          {/* Botón Cerrar (Solo Móvil) */}
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
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

      {/* --- CONTENIDO PRINCIPAL --- */}
      <main className="flex-1 h-screen overflow-y-auto w-full">
        {/* Añadimos padding-top en móvil para que el contenido no quede debajo del botón hamburguesa */}
        <div className="p-4 pt-20 lg:p-8 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Nutrition Form Modal */}
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