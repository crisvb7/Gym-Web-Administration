import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Activity, 
  Dumbbell, 
  CheckCircle, 
  Calendar,
  Clock,
  Loader2
} from 'lucide-react';
import { supabase } from './lib/supabase';
// 1. Importamos el componente DetallesSesion
import DetallesSesion from './DetallesSesion'; 

export function DashboardOverview() {
  const [stats, setStats] = useState({
    totalClients: 0,
    upcomingClasses: [] as any[],
    recentActivity: [] as any[],
    reservasHoy: 0,
    ejerciciosHoy: 0
  });
  const [loading, setLoading] = useState(true);
  
  // 2. Añadimos el estado para controlar el modal
  const [sesionSeleccionada, setSesionSeleccionada] = useState<any | null>(null);

  // Cargar estadísticas reales desde Supabase
  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // 1. Total Clientes
        const { count: clientCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'client');

        // Limites del día de hoy
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const now = new Date();

        // 2. Clases de Hoy (Futuras)
        const { data: allTodayClasses } = await supabase
          .from('classes')
          .select('id, title, start_time, end_time, trainer, location, max_capacity') // <--- AHORA PEDIMOS TODO LO NECESARIO
          .gte('start_time', todayStart.toISOString())
          .lte('start_time', todayEnd.toISOString())
          .order('start_time', { ascending: true });

        const futureClasses = (allTodayClasses || []).filter(cls => new Date(cls.start_time) > now);

        // 3. Nuevas Reservas de Hoy (Contamos cuántas se han hecho en class_bookings hoy)
        const { count: reservasCount } = await supabase
          .from('class_bookings')
          .select('id', { count: 'exact', head: true })
          .gte('booked_at', todayStart.toISOString())
          .lte('booked_at', todayEnd.toISOString());

        // 4. Ejercicios Registrados Hoy (Contamos los logs en workout_logs)
        const { count: workoutCount } = await supabase
          .from('workout_logs')
          .select('id', { count: 'exact', head: true })
          .gte('logged_at', todayStart.toISOString())
          .lte('logged_at', todayEnd.toISOString());

        // 5. Obtener Actividad Reciente
        const { data: recentProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, created_at')
          .order('created_at', { ascending: false })
          .limit(3);

        setStats({
          totalClients: clientCount || 0,
          upcomingClasses: futureClasses,
          recentActivity: recentProfiles || [],
          reservasHoy: reservasCount || 0,
          ejerciciosHoy: workoutCount || 0
        });
      } catch (err) {
        console.error("Error cargando Dashboard:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#E31C25] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      
      {/* Cabecera */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Resumen General</h1>
        <p className="text-gray-400 mt-1">Datos en tiempo real de tu base de datos GymPro.</p>
      </div>

      {/* Tarjetas de Estadísticas (100% REALES) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Tarjeta 1: Total Clientes */}
        <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-2xl hover:border-[#E31C25]/30 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-400">Total Clientes</p>
              <h3 className="text-4xl font-black text-white mt-2">{stats.totalClients}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#E31C25]/10 flex items-center justify-center text-[#E31C25]">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <span>En toda la plataforma</span>
          </div>
        </div>

        {/* Tarjeta 2: Clases Pendientes */}
        <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-2xl hover:border-[#2a2a2a] transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-400">Clases Pendientes</p>
              <h3 className="text-4xl font-black text-white mt-2">{stats.upcomingClasses.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Calendar size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <span>Para el resto del día</span>
          </div>
        </div>

        {/* Tarjeta 3: Nuevas Reservas */}
        <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-2xl hover:border-[#2a2a2a] transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-400">Nuevas Reservas</p>
              <h3 className="text-4xl font-black text-white mt-2">{stats.reservasHoy}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <CheckCircle size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <span>Plazas reservadas hoy</span>
          </div>
        </div>

        {/* Tarjeta 4: Ejercicios Registrados */}
        <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-2xl hover:border-[#2a2a2a] transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-400">Ejercicios Completados</p>
              <h3 className="text-4xl font-black text-white mt-2">{stats.ejerciciosHoy}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Dumbbell size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <span>Entrenamientos guardados hoy</span>
          </div>
        </div>
      </div>

      {/* Sección Inferior: Dos columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Próximas Sesiones Hoy */}
        <div className="lg:col-span-2 bg-[#121212] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="text-[#E31C25]" size={20} />
              Próximas Sesiones Hoy
            </h2>
          </div>
          
          <div className="space-y-4">
            {stats.upcomingClasses.length > 0 ? (
              stats.upcomingClasses.map((cls) => {
                const timeStr = new Date(cls.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const [hours, minutes] = timeStr.split(':');
                
                return (
                  <div 
                    key={cls.id} 
                    onClick={() => setSesionSeleccionada(cls)} // 3. Se añade la función para abrir el modal
                    className="cursor-pointer flex items-center justify-between p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#E31C25]/30 transition-colors" // Añadimos cursor-pointer
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[#E31C25]/10 text-[#E31C25] flex flex-col items-center justify-center font-bold">
                        <span className="text-sm leading-none">{hours}</span>
                        <span className="text-xs leading-none">{minutes}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-white">{cls.title}</h4>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <span className="text-sm font-medium text-gray-400 bg-[#121212] px-3 py-1 rounded-full border border-[#2a2a2a]">
                        Coach: {cls.trainer || 'Sin asignar'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-sm italic py-4">No quedan más clases programadas para hoy.</p>
            )}
          </div>
        </div>

        {/* Actividad Reciente */}
        <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="text-[#E31C25]" size={20} />
              Últimos Registros
            </h2>
          </div>

          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-[#E31C25]/20 before:via-[#2a2a2a] before:to-transparent">
            {stats.recentActivity.map((user) => (
              <div key={user.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#121212] bg-[#1a1a1a] group-hover:bg-[#E31C25]/20 text-[#E31C25] shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors">
                  <div className="w-2 h-2 bg-[#E31C25] rounded-full" />
                </div>
                
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] shadow">
                  <div className="flex items-center justify-between mb-1">
                    <time className="text-xs font-medium text-[#E31C25]">
                      {new Date(user.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  <div className="text-sm text-gray-300">
                    Nuevo cliente: <span className="font-bold text-white">{user.first_name} {user.last_name}</span>
                  </div>
                </div>
              </div>
            ))}
            
            {stats.recentActivity.length === 0 && (
              <p className="text-gray-500 text-sm italic">No hay actividad reciente.</p>
            )}
          </div>
        </div>

      </div>

      {/* 4. Renderizamos el modal pasándole la sesión seleccionada */}
      {sesionSeleccionada && (
        <DetallesSesion 
          sesion={sesionSeleccionada} 
          onClose={() => setSesionSeleccionada(null)} 
        />
      )}
    </div>
  );
}