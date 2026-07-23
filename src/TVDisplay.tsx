import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Users, Zap, Calendar, Layers } from 'lucide-react';
import { supabase } from './lib/supabase';

// Límite de atletas para cambiar a vista compacta de lista
const COMPACT_THRESHOLD = 8;

// Helper adaptado para usar 'discipline' de forma segura
const getClassTypeStyle = (discipline?: string) => {
  const name = (discipline || '').toLowerCase();

  if (name.includes('abiert') || name.includes('open')) {
    return {
      badgeBg: 'bg-emerald-500/15',
      border: 'border-emerald-500/40',
      text: 'text-emerald-400',
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
      dot: 'bg-emerald-400',
      tag: 'ABIERTA',
    };
  }

  if (name.includes('tarifa') || name.includes('dirigida') || name.includes('general')) {
    return {
      badgeBg: 'bg-blue-500/15',
      border: 'border-blue-500/40',
      text: 'text-blue-400',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]',
      dot: 'bg-blue-400',
      tag: 'TARIFA',
    };
  }

  if (name.includes('personal') || name.includes('pt')) {
    return {
      badgeBg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]',
      dot: 'bg-amber-400',
      tag: 'PERSONAL',
    };
  }

  // Por defecto (Rojo corporativo)
  return {
    badgeBg: 'bg-[#E31C25]/15',
    border: 'border-[#E31C25]/40',
    text: 'text-[#E31C25]',
    glow: 'shadow-[0_0_20px_rgba(227,28,37,0.3)]',
    dot: 'bg-[#E31C25]',
    tag: discipline?.toUpperCase() || 'GENERAL',
  };
};

export function TVDisplay() {
  const [classesToday, setClassesToday] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // 1. Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Consulta a Supabase
  const fetchTodayClasses = useCallback(async () => {
    try {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select(`
          id, title, start_time, end_time, trainer, max_capacity, discipline,
          class_bookings (
            status,
            profiles ( first_name, last_name )
          )
        `)
        .gte('end_time', now.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true });

      if (classesError) throw classesError;

      setClassesToday(classesData || []);
    } catch (error: any) {
      console.error("Error cargando el Kiosko TV:", error?.message || error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 3. Suscripción en Tiempo Real (Realtime)
  useEffect(() => {
    fetchTodayClasses();

    const channel = supabase
      .channel('tv-display-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'class_bookings' },
        () => fetchTodayClasses()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        () => fetchTodayClasses()
      )
      .subscribe();

    const interval = setInterval(fetchTodayClasses, 2 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchTodayClasses]);

  // Filtramos las clases que siguen vigentes
  const upcomingClasses = classesToday.filter(
    (c) => new Date(c.end_time) >= currentTime
  );

  useEffect(() => {
    if (currentIndex >= upcomingClasses.length && upcomingClasses.length > 0) {
      setCurrentIndex(0);
    }
  }, [upcomingClasses.length, currentIndex]);

  // Carrusel automático (10 segundos)
  useEffect(() => {
    if (upcomingClasses.length <= 1) return;

    const carrusel = setInterval(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex >= upcomingClasses.length - 1 ? 0 : prevIndex + 1
      );
    }, 10000);

    return () => clearInterval(carrusel);
  }, [upcomingClasses.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070708] flex items-center justify-center">
        <Zap className="text-[#E31C25] animate-pulse w-24 h-24 drop-shadow-[0_0_20px_rgba(227,28,37,0.6)]" />
      </div>
    );
  }

  if (upcomingClasses.length === 0) {
    return (
      <div className="relative min-h-screen bg-[#070a0f] text-white flex flex-col items-center justify-center p-10 text-center overflow-hidden">
        <div className="absolute w-[500px] h-[500px] bg-[#E31C25]/5 rounded-full blur-[140px] pointer-events-none" />
        <Calendar className="w-32 h-32 text-gray-700 mb-8 relative z-10" />
        <h1 className="text-6xl font-bold mb-4 relative z-10">No hay más clases por hoy</h1>
        <p className="text-3xl text-gray-400 relative z-10">¡Todas las sesiones del día han finalizado!</p>
      </div>
    );
  }

  const currentClass = upcomingClasses[currentIndex] || upcomingClasses[0];
  
  // Detección de clases en paralelo (coincidentes en horario)
  const parallelClasses = upcomingClasses.filter(
    (c) => c.start_time === currentClass.start_time
  );
  const parallelIndex = parallelClasses.findIndex((c) => c.id === currentClass.id) + 1;

  // Estilos según la disciplina de clase
  const typeStyle = getClassTypeStyle(currentClass.discipline);

  // Lista de asistentes
  const attendees = currentClass.class_bookings
    ?.filter((booking: any) => booking.status === 'ACTIVE')
    .map((booking: any) => booking.profiles) || [];

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isCompactMode = attendees.length > COMPACT_THRESHOLD;

  return (
    <div className="relative min-h-screen bg-[#070a0f] text-white p-8 flex flex-col overflow-hidden">
      
      {/* CAPA AMBIENTAL DE FONDO */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(227,28,37,0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(227,28,37,0.06),transparent_50%)] pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#E31C25]/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* CONTENIDO PRINCIPAL */}
      <div className="relative z-10 flex flex-col h-full flex-1">
        
        {/* CABECERA */}
        <header className="flex justify-between items-end border-b border-[#2a2a2a]/60 backdrop-blur-md pb-6 mb-8">
          <div>
            <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-100 to-[#E31C25] tracking-tighter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </h1>
            <p className="text-2xl text-gray-400 font-bold uppercase tracking-widest mt-2 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E31C25] shadow-[0_0_10px_#E31C25] animate-ping" />
              {currentTime.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          
          {/* Indicador de carrusel */}
          <div className="flex gap-3 pb-4">
            {upcomingClasses.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-3 rounded-full transition-all duration-500 ${
                  idx === currentIndex 
                    ? 'w-12 bg-[#E31C25] shadow-[0_0_15px_rgba(227,28,37,0.8)]' 
                    : 'w-3 bg-gray-800'
                }`}
              />
            ))}
          </div>
        </header>

        {/* CONTENIDO CENTRAL */}
        <main key={currentClass.id} className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-8 duration-700">
          
          <div className="flex justify-between items-start mb-8">
            <div>
              
              {/* ETIQUETAS SUPERIORES: Horario, Tipo de Clase e Indicador Simultáneo */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                
                {/* Badge Horario */}
                <div className="inline-flex items-center gap-2 px-5 py-2 bg-[#1a1a1a]/80 border border-[#333] text-gray-200 text-xl font-bold uppercase tracking-widest rounded-full backdrop-blur-md shadow-lg">
                  <Clock className="w-5 h-5 text-[#E31C25]" />
                  {formatTime(currentClass.start_time)} - {formatTime(currentClass.end_time)}
                </div>

                {/* Badge TIPO DE CLASE con color dinámico */}
                <div className={`inline-flex items-center gap-2 px-5 py-2 ${typeStyle.badgeBg} ${typeStyle.border} ${typeStyle.text} ${typeStyle.glow} text-xl font-black uppercase tracking-widest rounded-full border backdrop-blur-md`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${typeStyle.dot}`} />
                  {currentClass.discipline || typeStyle.tag}
                </div>

                {/* Badge AVISO CLASES EN PARALELO (Si coinciden a la misma hora) */}
                {parallelClasses.length > 1 && (
                  <div className="inline-flex items-center gap-2 px-5 py-2 bg-purple-500/15 border border-purple-500/40 text-purple-400 text-xl font-bold uppercase tracking-widest rounded-full backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.25)]">
                    <Layers className="w-5 h-5 text-purple-400 animate-pulse" />
                    En Paralelo ({parallelIndex}/{parallelClasses.length})
                  </div>
                )}
              </div>

              <h2 className="text-7xl font-black mb-2 tracking-tight drop-shadow-md">{currentClass.title}</h2>
              <p className="text-3xl text-gray-400">Coach: <span className="text-white font-semibold">{currentClass.trainer}</span></p>
            </div>
            
            {/* Contador Asistentes */}
            <div className="text-right flex flex-col items-end">
              <div className="flex items-center gap-4 text-4xl text-gray-300 font-bold bg-[#14171d]/80 backdrop-blur-xl px-8 py-6 rounded-3xl border border-[#2a2a2a] shadow-2xl">
                <Users className="w-12 h-12 text-[#E31C25]" />
                <span className={attendees.length >= currentClass.max_capacity ? 'text-[#E31C25]' : 'text-white'}>
                  {attendees.length}
                </span>
                <span className="text-gray-500">/ {currentClass.max_capacity}</span>
              </div>
            </div>
          </div>

          {/* ATLETAS INSCRITOS */}
          <div className="flex-1">
            {attendees.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 bg-[#14171d]/30 border border-[#2a2a2a]/40 rounded-3xl backdrop-blur-sm p-12">
                <Users className="w-32 h-32 mb-6 opacity-20 text-gray-400" />
                <p className="text-4xl font-bold">Sin inscripciones aún</p>
              </div>
            ) : isCompactMode ? (
              
              /* VISTA COMPACTA EN LISTA (Si hay más de 8 personas) */
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {attendees.map((athlete: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="bg-[#14171d]/80 backdrop-blur-md border border-[#2a2a2a] hover:border-[#E31C25]/50 rounded-xl p-4 flex items-center gap-4 shadow-md transition-all duration-300"
                  >
                    <div className={`w-10 h-10 rounded-lg ${typeStyle.badgeBg} border ${typeStyle.border} flex items-center justify-center text-lg font-black shrink-0 ${typeStyle.text}`}>
                      {athlete.first_name?.[0]}{athlete.last_name?.[0]}
                    </div>
                    <span className="text-xl font-bold truncate text-gray-100">
                      {athlete.first_name} {athlete.last_name?.charAt(0)}.
                    </span>
                  </div>
                ))}
              </div>

            ) : (

              /* VISTA EN TARJETAS GRANDES (Hasta 8 personas) */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {attendees.map((athlete: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="bg-[#14171d]/70 backdrop-blur-md border border-[#2a2a2a] hover:border-[#E31C25]/50 rounded-2xl p-6 flex items-center gap-6 shadow-xl transition-all duration-300"
                  >
                    <div className={`w-16 h-16 rounded-full ${typeStyle.badgeBg} border ${typeStyle.border} flex items-center justify-center text-2xl font-black shrink-0 ${typeStyle.text} ${typeStyle.glow}`}>
                      {athlete.first_name?.[0]}{athlete.last_name?.[0]}
                    </div>
                    <span className="text-3xl font-bold truncate">
                      {athlete.first_name} {athlete.last_name?.charAt(0)}.
                    </span>
                  </div>
                ))}
              </div>

            )}
          </div>
        </main>
      </div>
    </div>
  );
}