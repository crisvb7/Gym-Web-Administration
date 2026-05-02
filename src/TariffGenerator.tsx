import React, { useState, useEffect } from 'react';
import { CalendarRange, Loader2, CheckCircle2, Zap, Users, Info, Dumbbell } from 'lucide-react';
import { supabase } from './lib/supabase';

export function TariffGenerator() {
  // Configuración de fechas
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-11
  
  // Por defecto, apuntamos al mes siguiente
  const [selectedMonth, setSelectedMonth] = useState(currentMonth === 11 ? 0 : currentMonth + 1);
  const [selectedYear, setSelectedYear] = useState(currentMonth === 11 ? currentYear + 1 : currentYear);

  // Configuración de la clase molde
  const [title, setTitle] = useState('CrossFit (Tarifa)');
  const [trainer, setTrainer] = useState('Admin');
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [maxCapacity, setMaxCapacity] = useState('20');
  const [location, setLocation] = useState('Box Principal');
  const [intensityBadge, setIntensityBadge] = useState('Alta');
  const [discipline, setDiscipline] = useState(''); // Inicializamos vacío
  
  // Lista de disciplinas cargadas desde Supabase
  const [disciplinesList, setDisciplinesList] = useState<any[]>([]);

  // Días de la semana a generar
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Estados de carga y feedback
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });
  const [stats, setStats] = useState({ classesCreated: 0, autoEnrollments: 0 });

  // --- CARGAR DISCIPLINAS AL MONTAR EL COMPONENTE ---
  useEffect(() => {
    const fetchDisciplines = async () => {
      try {
        const { data, error } = await supabase
          .from('disciplines')
          .select('name')
          .order('name');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setDisciplinesList(data);
          setDiscipline(data[0].name); // Selecciona la primera por defecto
        } else {
          // Fallback por si la tabla está vacía
          setDisciplinesList([{ name: 'CrossFit' }]);
          setDiscipline('CrossFit');
        }
      } catch (err) {
        console.error("Error al cargar disciplinas:", err);
      }
    };

    fetchDisciplines();
  }, []);

  const toggleDay = (dayNum: number) => {
    if (selectedDays.includes(dayNum)) {
      setSelectedDays(selectedDays.filter(d => d !== dayNum));
    } else {
      setSelectedDays([...selectedDays, dayNum].sort());
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.length === 0) return alert("Debes seleccionar al menos un día de la semana.");
    if (!discipline) return alert("Debes seleccionar una disciplina.");

    setIsGenerating(true);
    setFeedback({ type: null, message: '' });
    setStats({ classesCreated: 0, autoEnrollments: 0 });

    try {
      const datesToGenerate = [];
      const dateCursor = new Date(selectedYear, selectedMonth, 1);
      
      while (dateCursor.getMonth() === selectedMonth) {
        if (selectedDays.includes(dateCursor.getDay())) {
          datesToGenerate.push(new Date(dateCursor));
        }
        dateCursor.setDate(dateCursor.getDate() + 1);
      }

      if (datesToGenerate.length === 0) throw new Error("No hay días coincidentes en este mes.");

      const [hours, minutes] = time.split(':').map(Number);
      const classesToInsert = datesToGenerate.map(date => {
        const startDateTime = new Date(date);
        startDateTime.setHours(hours, minutes, 0, 0);
        
        const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60000);

        return {
          title,
          trainer,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          max_capacity: parseInt(maxCapacity),
          location,
          intensity_badge: intensityBadge,
          access_type: 'TARIFF', 
          discipline: discipline // USA LA DISCIPLINA CORRECTA
        };
      });

      const { data: insertedClasses, error: insertError } = await supabase
        .from('classes')
        .insert(classesToInsert)
        .select('id, start_time');

      if (insertError) throw insertError;
      if (!insertedClasses) throw new Error("Error al recuperar las clases creadas.");

      const { data: usersWithTariff, error: usersError } = await supabase
        .from('profiles')
        .select('id, fixed_days')
        .gt('rate_days', 0);

      if (usersError) throw usersError;

      const bookingsToInsert: any[] = [];

      if (usersWithTariff && usersWithTariff.length > 0) {
        insertedClasses.forEach(cls => {
          const classDayOfWeek = new Date(cls.start_time).getDay();
          
          usersWithTariff.forEach(user => {
            if (user.fixed_days && user.fixed_days.includes(classDayOfWeek)) {
              bookingsToInsert.push({
                class_id: cls.id,
                user_id: user.id,
                booking_type: 'FIXED',
                status: 'ACTIVE'
              });
            }
          });
        });

        if (bookingsToInsert.length > 0) {
          const { error: bookingsError } = await supabase
            .from('class_bookings')
            .insert(bookingsToInsert);
          if (bookingsError) throw bookingsError;
        }
      }

      setStats({ classesCreated: insertedClasses.length, autoEnrollments: bookingsToInsert.length });
      setFeedback({ type: 'success', message: '¡Generación completada con éxito!' });

    } catch (error: any) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Zap className="text-[#E31C25]" /> Generador de Tarifas
          </h1>
          <p className="text-gray-400 mt-1">Crea bloques mensuales de clases e inscribe a los alumnos automáticamente.</p>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-xl overflow-hidden p-6 md:p-8">
        
        {feedback.type === 'success' && (
          <div className="mb-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center text-center animate-in zoom-in-95">
            <CheckCircle2 className="text-emerald-500 w-12 h-12 mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">{feedback.message}</h3>
            <div className="flex gap-6 mt-4">
              <div className="text-center">
                <p className="text-3xl font-black text-emerald-500">{stats.classesCreated}</p>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Clases Creadas</p>
              </div>
              <div className="w-px bg-[#2a2a2a]"></div>
              <div className="text-center">
                <p className="text-3xl font-black text-emerald-500">{stats.autoEnrollments}</p>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Plazas Asignadas</p>
              </div>
            </div>
            <button onClick={() => setFeedback({ type: null, message: '' })} className="mt-6 text-sm text-emerald-500 hover:text-emerald-400 font-bold underline">
              Generar otro bloque
            </button>
          </div>
        )}

        {feedback.type === 'error' && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm font-bold text-center">
            Error: {feedback.message}
          </div>
        )}

        <form onSubmit={handleGenerate} className={`space-y-8 ${feedback.type === 'success' ? 'hidden' : ''}`}>
          
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#E31C25] uppercase tracking-widest flex items-center gap-2">
              <CalendarRange size={16} /> 1. Cuándo
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#121212] p-5 rounded-xl border border-[#2a2a2a]">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Mes a generar</label>
                <div className="flex gap-2">
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white outline-none focus:border-[#E31C25]">
                    {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="w-1/3 bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white outline-none focus:border-[#E31C25]">
                    {[currentYear, currentYear + 1, currentYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Días de la semana</label>
                <div className="flex gap-1 justify-between">
                  {[ { id: 1, label: 'L' }, { id: 2, label: 'M' }, { id: 3, label: 'X' }, { id: 4, label: 'J' }, { id: 5, label: 'V' }, { id: 6, label: 'S' }, { id: 0, label: 'D' } ].map((day) => (
                    <button
                      key={day.id} type="button" onClick={() => toggleDay(day.id)}
                      className={`flex-1 aspect-square rounded-lg border text-sm font-bold flex items-center justify-center transition-all ${
                        selectedDays.includes(day.id) ? 'bg-[#E31C25]/20 border-[#E31C25] text-[#E31C25]' : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:bg-[#2a2a2a]'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#E31C25] uppercase tracking-widest flex items-center gap-2">
              <Dumbbell size={16} /> 2. Qué se imparte
            </h2>
            <div className="bg-[#121212] p-5 rounded-xl border border-[#2a2a2a] space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre de la clase</label><input required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Entrenador Predeterminado</label><input required value={trainer} onChange={e => setTrainer(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-y border-[#2a2a2a] py-4">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Hora Inicio</label><input type="time" required value={time} onChange={e => setTime(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Duración</label><select value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none"><option value="45">45 min</option><option value="60">1 hora</option><option value="90">1.5 h</option></select></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Capacidad</label><input type="number" required min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Intensidad</label><select value={intensityBadge} onChange={e => setIntensityBadge(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none"><option value="Media">Media</option><option value="Alta">Alta</option></select></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Disciplina (Categoría)</label>
                  <select required value={discipline} onChange={e => setDiscipline(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none font-bold">
                    {/* MOSTRAMOS LA LISTA REAL CARGADA DE SUPABASE */}
                    {disciplinesList.map(d => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Ubicación</label>
                  <input required value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 text-blue-400 text-sm">
            <Info className="shrink-0 mt-0.5" size={18} />
            <p>Al hacer clic en el botón inferior, se crearán estas clases y <strong>se inscribirá automáticamente</strong> a todos los clientes que tengan su tarifa configurada en los días correspondientes.</p>
          </div>

          <button 
            type="submit" 
            disabled={isGenerating || selectedDays.length === 0} 
            className="w-full py-4 bg-[#E31C25] text-white font-bold rounded-xl hover:bg-[#A6151B] transition-all flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(227,28,37,0.3)] disabled:opacity-50 disabled:shadow-none"
          >
            {isGenerating ? <><Loader2 className="animate-spin" size={20} /> Generando ecosistema...</> : <><Zap size={20} /> Generar Clases y Matricular</>}
          </button>
        </form>
      </div>
    </div>
  );
}