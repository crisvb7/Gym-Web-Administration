import React, { useState, useEffect } from "react";
import { Plus, X, Loader2, Trash2, MapPin, Users, Calendar, ChevronLeft, ChevronRight, Edit2 } from "lucide-react";
import { supabase } from './lib/supabase';
import DetallesSesion from './DetallesSesion';

const SLOT_HEIGHT_PX = 100;

export function ScheduleManager() {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); 

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [title, setTitle] = useState('');
  const [trainer, setTrainer] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [duration, setDuration] = useState('60');
  const [maxCapacity, setMaxCapacity] = useState('20');
  const [location, setLocation] = useState('Zona Principal');
  const [intensityBadge, setIntensityBadge] = useState('Media');
  const [accessType, setAccessType] = useState('TARIFF');

  const [selectedClass, setSelectedClass] = useState<any>(null);

  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const startHour = 8;
  const totalHours = 14; 

  const getWeekDates = () => {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; 
    const monday = new Date(today);
    
    monday.setDate(today.getDate() - dayOfWeek + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const weekStart = weekDates[0];
  const weekEnd = new Date(weekDates[6]);
  weekEnd.setHours(23, 59, 59, 999);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .gte('start_time', weekStart.toISOString())
        .lte('start_time', weekEnd.toISOString());

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error("Error cargando clases:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [weekOffset]);

  const closeAndResetForm = () => {
    setIsFormModalOpen(false);
    setEditingClassId(null);
    setTitle(''); setTrainer(''); setDate(''); setTime('08:00');
    setDuration('60'); setMaxCapacity('20'); setLocation('Zona Principal'); setIntensityBadge('Media');
    setAccessType('TARIFF');
  };

  const handleEditClick = (cls: any, e: React.MouseEvent) => {
    e.stopPropagation(); 
    
    const startDate = new Date(cls.start_time);
    const endDate = new Date(cls.end_time);
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    setTitle(cls.title);
    setTrainer(cls.trainer);
    setDate(getLocalDateString(startDate));
    setTime(startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false }));
    setDuration(durationMinutes.toString());
    setMaxCapacity(cls.max_capacity.toString());
    setLocation(cls.location || 'Zona Principal');
    setIntensityBadge(cls.intensity_badge || 'Media');
    setAccessType(cls.access_type || 'TARIFF');

    setEditingClassId(cls.id);
    setIsFormModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const startDateTime = new Date(`${date}T${time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(duration) * 60000);

      const hasOverlap = classes.some(cls => {
        if (editingClassId && cls.id === editingClassId) return false;
        const existingStart = new Date(cls.start_time);
        const existingEnd = new Date(cls.end_time);
        return startDateTime < existingEnd && endDateTime > existingStart;
      });

      if (hasOverlap) {
        alert("⚠️ No se puede guardar: Ya existe otra actividad programada en este horario.");
        setIsSubmitting(false);
        return; 
      }

      const classData = {
        title, trainer,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        max_capacity: parseInt(maxCapacity),
        location, intensity_badge: intensityBadge, 
        access_type: accessType
      };

      if (editingClassId) {
        const { data, error } = await supabase.from('classes').update(classData).eq('id', editingClassId).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Supabase bloqueó la edición por permisos.");
      } else {
        const { error } = await supabase.from('classes').insert([classData]);
        if (error) throw error;
      }

      closeAndResetForm();
      fetchClasses();
    } catch (error: any) {
      alert(`Error al ${editingClassId ? 'editar' : 'crear'} la clase: ` + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClass = async (id: string, classTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); 
    if (window.confirm(`¿Cancelar la clase de ${classTitle}?`)) {
      try {
        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) throw error;
        setSelectedClass(null); 
        fetchClasses();
      } catch (error: any) {
        alert("Error al eliminar: " + error.message);
      }
    }
  };

  // --- LÓGICA CORREGIDA DE DRAG & DROP ---
  const handleDrop = async (e: React.DragEvent, dayIndex: number, hour: number) => {
    e.preventDefault();
    
    // Recuperamos los datos que guardamos al hacer clic (ID de la clase y el offset del ratón)
    const payloadStr = e.dataTransfer.getData("text/plain");
    if (!payloadStr) return;

    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch (err) {
      return; // Previene errores si se arrastra texto normal de la web por error
    }

    const { id: draggedClassId, grabOffsetY } = payload;

    const draggedClass = classes.find(c => c.id === draggedClassId);
    if (!draggedClass) return;

    const rect = e.currentTarget.getBoundingClientRect();
    
    // 1. ¿A qué altura está el ratón respecto a la celda?
    const mouseOffsetY = e.clientY - rect.top; 
    
    // 2. MAGIA: Restamos la distancia a la que agarramos la tarjeta para saber dónde está el borde superior real
    const trueCardTopY = mouseOffsetY - grabOffsetY;
    
    // 3. Calculamos los minutos basándonos en el borde de la tarjeta, no en el ratón
    const rawMinutes = (trueCardTopY / SLOT_HEIGHT_PX) * 60;
    const snappedMinutes = Math.round(rawMinutes / 15) * 15;

    const originalStart = new Date(draggedClass.start_time);
    const originalEnd = new Date(draggedClass.end_time);
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    // JavaScript es mágico: si snappedMinutes es -15, restará automáticamente 15 mins a la hora en punto
    const newStart = new Date(weekDates[dayIndex]);
    newStart.setHours(hour, snappedMinutes, 0, 0); 
    const newEnd = new Date(newStart.getTime() + durationMs);

    const hasOverlap = classes.some(cls => {
      if (cls.id === draggedClassId) return false;
      const existingStart = new Date(cls.start_time);
      const existingEnd = new Date(cls.end_time);
      return newStart < existingEnd && newEnd > existingStart;
    });

    if (hasOverlap) {
      alert("⚠️ No puedes mover la clase aquí: Ya hay otra actividad programada.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('classes')
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString()
        })
        .eq('id', draggedClassId);

      if (error) throw error;
      fetchClasses(); 
    } catch (err: any) {
      alert("Error al mover la clase: " + err.message);
      setLoading(false);
    }
  };

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getClassForSlot = (dayIndex: number, hour: number) => {
    const targetDateStr = getLocalDateString(weekDates[dayIndex]);
    return classes.filter(cls => {
      const clsDate = new Date(cls.start_time);
      const clsDateStr = getLocalDateString(clsDate);
      const clsHour = clsDate.getHours();
      return clsDateStr === targetDateStr && clsHour === hour;
    });
  };

  const calculateDurationMinutes = (start_time: string, end_time: string) => {
    const start = new Date(start_time);
    const end = new Date(end_time);
    return Math.round((end.getTime() - start.getTime()) / 60000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Calendario Semanal</h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1">
              <button onClick={() => setWeekOffset(prev => prev - 1)} className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded transition-colors">
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => setWeekOffset(0)} 
                className={`px-3 py-1 text-sm font-bold rounded transition-colors ${weekOffset === 0 ? 'text-[#E31C25] bg-[#E31C25]/10' : 'text-gray-400 hover:text-white'}`}
              >
                Hoy
              </button>
              <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>
            <p className="text-gray-400 text-sm">
              {weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - {weekDates[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>

        <button 
          onClick={() => {
            setEditingClassId(null);
            setIsFormModalOpen(true);
          }} 
          className="bg-[#E31C25] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#A6151B] shadow-[0_0_15px_rgba(227,28,37,0.2)] hover:shadow-[0_0_20px_rgba(227,28,37,0.4)] transition-all shrink-0"
        >
          <Plus size={20} /> Nueva Clase
        </button>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-8 border-b border-[#2a2a2a] bg-[#121212]">
          <div className="p-4 border-r border-[#2a2a2a] text-xs text-gray-500 flex items-center justify-center font-bold tracking-wider uppercase">Hora</div>
          {weekDays.map((day, index) => {
            const isToday = getLocalDateString(new Date()) === getLocalDateString(weekDates[index]);
            return (
              <div key={day} className={`p-4 text-center border-r border-[#2a2a2a] last:border-r-0 flex flex-col items-center justify-center ${isToday ? 'bg-[#E31C25]/5' : ''}`}>
                <span className="font-bold text-sm text-white">{day}</span>
                <span className={`text-xs font-medium mt-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[#E31C25] text-white' : 'text-[#E31C25]'}`}>
                  {weekDates[index].getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
            </div>
          )}
          
          {[...Array(totalHours)].map((_, i) => {
            const currentHour = i + startHour;
            
            return (
              <div key={i} className="grid grid-cols-8 border-b border-[#2a2a2a] last:border-b-0" style={{ minHeight: `${SLOT_HEIGHT_PX}px` }}>
                <div className="p-2 border-r border-[#2a2a2a] bg-[#121212]/50 relative">
                  <span className="text-xs font-bold text-gray-500 bg-[#1a1a1a] px-2 py-1 rounded-md border border-[#2a2a2a]">
                    {currentHour.toString().padStart(2, '0')}:00
                  </span>
                </div>
                
                {[...Array(7)].map((_, dayIndex) => {
                  const classesInSlot = getClassForSlot(dayIndex, currentHour);
                  const isToday = getLocalDateString(new Date()) === getLocalDateString(weekDates[dayIndex]);
                  
                  return (
                    <div 
                      key={dayIndex} 
                      className={`border-r border-[#2a2a2a] last:border-r-0 hover:bg-[#E31C25]/5 transition-colors p-1 relative ${isToday ? 'bg-[#E31C25]/[0.02]' : ''}`}
                      onDragOver={(e) => e.preventDefault()} 
                      onDrop={(e) => handleDrop(e, dayIndex, currentHour)}
                    >
                      {classesInSlot.map((cls) => {
                        const durationMins = calculateDurationMinutes(cls.start_time, cls.end_time);
                        const cardHeight = (durationMins / 60) * SLOT_HEIGHT_PX;
                        
                        const startMins = new Date(cls.start_time).getMinutes();
                        const topOffset = (startMins / 60) * SLOT_HEIGHT_PX + 4; 
                        
                        return (
                          <div 
                            key={cls.id} 
                            draggable={true}
                            onDragStart={(e) => {
                              // CAPTURAMOS LA POSICIÓN EXACTA DEL CLIC DENTRO DE LA TARJETA
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              const grabOffsetY = e.clientY - rect.top; 
                              
                              // Guardamos el ID y el offset en un JSON
                              const payload = JSON.stringify({ id: cls.id, grabOffsetY });
                              e.dataTransfer.setData("text/plain", payload);
                              
                              setTimeout(() => (e.target as HTMLElement).style.opacity = "0.5", 0);
                            }}
                            onDragEnd={(e) => {
                              (e.target as HTMLElement).style.opacity = "1";
                            }}
                            onClick={() => setSelectedClass(cls)}
                            className="absolute left-1 right-1 bg-[#E31C25]/10 border border-[#E31C25]/30 rounded-lg p-2 group hover:bg-[#E31C25]/20 transition-all cursor-grab active:cursor-grabbing hover:scale-[1.02] shadow-sm z-10 overflow-hidden"
                            style={{ 
                              height: `calc(${cardHeight}px - 8px)`, 
                              top: `${topOffset}px` 
                            }}
                          >
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 z-20 transition-all">
                              <button 
                                onClick={(e) => handleEditClick(cls, e)}
                                className="p-1 bg-black/50 rounded text-blue-400 hover:text-blue-500 hover:bg-black transition-colors"
                                title="Editar Clase"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button 
                                onClick={(e) => handleDeleteClass(cls.id, cls.title, e)}
                                className="p-1 bg-black/50 rounded text-red-400 hover:text-red-500 hover:bg-black transition-colors"
                                title="Cancelar Clase"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>

                            <div className="text-[10px] font-bold text-[#E31C25] mb-1 pointer-events-none">
                              {new Date(cls.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              {' - '}
                              {new Date(cls.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                            <div className="text-xs font-bold text-white leading-tight mb-1 truncate pointer-events-none">{cls.title}</div>
                            <div className="text-[10px] text-gray-400 truncate flex items-center gap-1 pointer-events-none">
                              <Users size={10} className="shrink-0"/> {cls.trainer}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-xl rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={closeAndResetForm} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
              <Calendar className="text-[#E31C25]" /> {editingClassId ? 'Editar Sesión' : 'Nueva Sesión'}
            </h2>
            
            <form onSubmit={handleSaveClass} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre de la clase</label>
                  <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors" placeholder="Ej: CrossFit WOD" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Entrenador</label>
                  <input required value={trainer} onChange={e => setTrainer(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors" placeholder="Ej: Marcos Silva" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-y border-[#2a2a2a] py-5">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha</label>
                  <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Hora</label>
                  <input type="time" required value={time} onChange={e => setTime(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Duración</label>
                  <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none">
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="90">1.5 horas</option>
                    <option value="120">2 horas</option>
                  </select>
                </div>
              </div>

              {/* AQUÍ ESTÁ EL CAMBIO VISUAL: Cambiado a grid-cols-2 para acomodar los 4 elementos */}
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Capacidad</label>
                  <input type="number" required min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Intensidad</label>
                  <select value={intensityBadge} onChange={e => setIntensityBadge(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none">
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Tipo de Acceso</label>
                  <select value={accessType} onChange={e => setAccessType(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none">
                    <option value="TARIFF">Exclusiva Tarifa (Fija)</option>
                    <option value="NORMAL">Clientes Normales / Sueltos</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Ubicación</label>
                  <input required value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors" placeholder="Ej: Sala 1" />
                </div>
              </div>

              <button disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-6 hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)]">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : (editingClassId ? 'Guardar Cambios' : 'Guardar en Calendario')}
              </button>
            </form>
          </div>
        </div>
      )}

      <DetallesSesion 
        sesion={selectedClass} 
        onClose={() => setSelectedClass(null)} 
        onDeleteRequest={handleDeleteClass}
      />

    </div>
  );
}