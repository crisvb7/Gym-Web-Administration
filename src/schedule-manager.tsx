import React, { useState, useEffect } from "react";
import { Plus, X, Loader2, Trash2, MapPin, Users, Calendar, ChevronLeft, ChevronRight, Edit2, Filter, Settings, Palette } from "lucide-react";
import { supabase } from './lib/supabase';
import DetallesSesion from './DetallesSesion';

const SLOT_HEIGHT_PX = 100;

// Función auxiliar para convertir el HEX (#ff0000) a colores con transparencia en el calendario
const hexToRgba = (hex: string, opacity: number) => {
  const r = parseInt(hex.slice(1, 3), 16) || 227;
  const g = parseInt(hex.slice(3, 5), 16) || 28;
  const b = parseInt(hex.slice(5, 7), 16) || 37;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export function ScheduleManager() {
  const [classes, setClasses] = useState<any[]>([]);
  const [disciplines, setDisciplines] = useState<any[]>([]); // NUEVO ESTADO PARA DISCIPLINAS
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); 
  
  const [viewFilter, setViewFilter] = useState<'NORMAL' | 'TARIFF' | 'ALL'>('NORMAL');

  // Estados de Modales
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false); // NUEVO MODAL DE AJUSTES

  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Datos de la clase
  const [title, setTitle] = useState('');
  const [trainer, setTrainer] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [duration, setDuration] = useState('60');
  const [maxCapacity, setMaxCapacity] = useState('20');
  const [location, setLocation] = useState('Zona Principal');
  const [intensityBadge, setIntensityBadge] = useState('Media');
  const [accessType, setAccessType] = useState('NORMAL'); 
  const [discipline, setDiscipline] = useState('CrossFit');

  // Datos de Nueva Disciplina
  const [newDisciplineName, setNewDisciplineName] = useState('');
  const [newDisciplineColor, setNewDisciplineColor] = useState('#ffffff');
  const [isAddingDiscipline, setIsAddingDiscipline] = useState(false);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      // Traemos las clases y las disciplinas en paralelo
      const [classesRes, disciplinesRes] = await Promise.all([
        supabase.from('classes').select('*').gte('start_time', weekStart.toISOString()).lte('start_time', weekEnd.toISOString()),
        supabase.from('disciplines').select('*').order('name')
      ]);

      if (classesRes.error) throw classesRes.error;
      if (disciplinesRes.error) throw disciplinesRes.error;

      setClasses(classesRes.data || []);
      setDisciplines(disciplinesRes.data || []);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [weekOffset]);

  // --- LÓGICA GESTIÓN DE DISCIPLINAS ---
  const handleAddDiscipline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisciplineName.trim()) return;

    // Validación local: el color y el nombre no pueden existir ya
    const nameExists = disciplines.some(d => d.name.toLowerCase() === newDisciplineName.toLowerCase());
    const colorExists = disciplines.some(d => d.color.toLowerCase() === newDisciplineColor.toLowerCase());

    if (nameExists) return alert("Ya existe una disciplina con ese nombre.");
    if (colorExists) return alert("Ese color ya está siendo usado por otra disciplina. Elige uno diferente para que sea reconocible.");

    setIsAddingDiscipline(true);
    try {
      const { error } = await supabase.from('disciplines').insert([{ name: newDisciplineName, color: newDisciplineColor }]);
      if (error) throw error;
      setNewDisciplineName('');
      setNewDisciplineColor('#ffffff');
      fetchData(); // Recargamos para ver la nueva en la lista
    } catch (err: any) {
      alert("Error al añadir disciplina: " + err.message);
    } finally {
      setIsAddingDiscipline(false);
    }
  };

  const handleDeleteDiscipline = async (name: string) => {
    if (window.confirm(`¿Seguro que quieres borrar la categoría "${name}"? Las clases que ya tengan este nombre lo mantendrán, pero no podrás crear nuevas con este color.`)) {
      try {
        const { error } = await supabase.from('disciplines').delete().eq('name', name);
        if (error) throw error;
        fetchData();
      } catch (err: any) {
        alert("Error al borrar: " + err.message);
      }
    }
  };

  const closeAndResetForm = () => {
    setIsFormModalOpen(false);
    setEditingClassId(null);
    setTitle(''); setTrainer(''); setDate(''); setTime('08:00');
    setDuration('60'); setMaxCapacity('20'); setLocation('Zona Principal'); setIntensityBadge('Media');
    setAccessType(viewFilter === 'TARIFF' ? 'TARIFF' : 'NORMAL'); 
    setDiscipline(disciplines.length > 0 ? disciplines[0].name : 'CrossFit');
  };

  const handleEditClick = (cls: any, e: React.MouseEvent) => {
    e.stopPropagation(); 
    const startDate = new Date(cls.start_time);
    const endDate = new Date(cls.end_time);
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    setTitle(cls.title); setTrainer(cls.trainer); setDate(getLocalDateString(startDate));
    setTime(startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false }));
    setDuration(durationMinutes.toString()); setMaxCapacity(cls.max_capacity.toString());
    setLocation(cls.location || 'Zona Principal'); setIntensityBadge(cls.intensity_badge || 'Media');
    setAccessType(cls.access_type || 'NORMAL'); setDiscipline(cls.discipline || (disciplines.length > 0 ? disciplines[0].name : 'CrossFit'));

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
        setIsSubmitting(false); return; 
      }

      const classData = {
        title, trainer, start_time: startDateTime.toISOString(), end_time: endDateTime.toISOString(),
        max_capacity: parseInt(maxCapacity), location, intensity_badge: intensityBadge, access_type: accessType, discipline: discipline
      };

      if (editingClassId) {
        const { data, error } = await supabase.from('classes').update(classData).eq('id', editingClassId).select();
        if (error) throw error;
      } else {
        const { error } = await supabase.from('classes').insert([classData]);
        if (error) throw error;
      }

      closeAndResetForm(); fetchData();
    } catch (error: any) { alert(`Error: ` + error.message); } 
    finally { setIsSubmitting(false); }
  };

  const handleDeleteClass = async (id: string, classTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); 
    if (window.confirm(`¿Cancelar la clase de ${classTitle}?`)) {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (!error) { setSelectedClass(null); fetchData(); }
    }
  };

  const handleDrop = async (e: React.DragEvent, dayIndex: number, hour: number) => {
    e.preventDefault();
    const payloadStr = e.dataTransfer.getData("text/plain");
    if (!payloadStr) return;

    let payload;
    try { payload = JSON.parse(payloadStr); } catch (err) { return; }

    const { id: draggedClassId, grabOffsetY } = payload;
    const draggedClass = classes.find(c => c.id === draggedClassId);
    if (!draggedClass) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const rawMinutes = ((e.clientY - rect.top - grabOffsetY) / SLOT_HEIGHT_PX) * 60;
    const snappedMinutes = Math.round(rawMinutes / 15) * 15;

    const durationMs = new Date(draggedClass.end_time).getTime() - new Date(draggedClass.start_time).getTime();
    const newStart = new Date(weekDates[dayIndex]);
    newStart.setHours(hour, snappedMinutes, 0, 0); 
    const newEnd = new Date(newStart.getTime() + durationMs);

    const hasOverlap = classes.some(cls => {
      if (cls.id === draggedClassId) return false;
      return newStart < new Date(cls.end_time) && newEnd > new Date(cls.start_time);
    });

    if (hasOverlap) return alert("⚠️ No puedes mover la clase aquí: Ya hay otra actividad programada.");

    try {
      setLoading(true);
      await supabase.from('classes').update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() }).eq('id', draggedClassId);
      fetchData(); 
    } catch (err: any) { alert("Error al mover: " + err.message); setLoading(false); }
  };

  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filteredClasses = classes.filter(cls => {
    if (viewFilter === 'ALL') return true;
    return cls.access_type === viewFilter;
  });

  const getClassForSlot = (dayIndex: number, hour: number) => {
    const targetDateStr = getLocalDateString(weekDates[dayIndex]);
    return filteredClasses.filter(cls => {
      const clsDate = new Date(cls.start_time);
      return getLocalDateString(clsDate) === targetDateStr && clsDate.getHours() === hour;
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Calendario Semanal</h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1">
              <button onClick={() => setWeekOffset(prev => prev - 1)} className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded transition-colors"><ChevronLeft size={20} /></button>
              <button onClick={() => setWeekOffset(0)} className={`px-3 py-1 text-sm font-bold rounded transition-colors ${weekOffset === 0 ? 'text-[#E31C25] bg-[#E31C25]/10' : 'text-gray-400 hover:text-white'}`}>Hoy</button>
              <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded transition-colors"><ChevronRight size={20} /></button>
            </div>
            <p className="text-gray-400 text-sm font-medium">{weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - {weekDates[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-1 shrink-0">
            <button onClick={() => setViewFilter('NORMAL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewFilter === 'NORMAL' ? 'bg-[#121212] border border-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Abiertas</button>
            <button onClick={() => setViewFilter('TARIFF')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewFilter === 'TARIFF' ? 'bg-[#121212] border border-[#2a2a2a] text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Tarifas Fijas</button>
            <button onClick={() => setViewFilter('ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewFilter === 'ALL' ? 'bg-[#121212] border border-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}><Filter size={14} /> Todas</button>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            {/* NUEVO BOTÓN: AJUSTES DE DISCIPLINAS */}
            <button onClick={() => setShowSettingsModal(true)} className="bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 px-4 py-2.5 rounded-xl hover:text-white hover:bg-[#2a2a2a] transition-colors shrink-0">
              <Settings size={20} />
            </button>
            <button onClick={() => { setEditingClassId(null); setIsFormModalOpen(true); }} className="flex-1 bg-[#E31C25] text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#A6151B] shadow-[0_0_15px_rgba(227,28,37,0.2)] hover:shadow-[0_0_20px_rgba(227,28,37,0.4)] transition-all shrink-0">
              <Plus size={20} /> Nueva Clase
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-8 border-b border-[#2a2a2a] bg-[#121212]">
          <div className="p-4 border-r border-[#2a2a2a] text-xs text-gray-500 flex items-center justify-center font-bold tracking-wider uppercase">Hora</div>
          {weekDays.map((day, index) => {
            const isToday = getLocalDateString(new Date()) === getLocalDateString(weekDates[index]);
            return (
              <div key={day} className={`p-4 text-center border-r border-[#2a2a2a] last:border-r-0 flex flex-col items-center justify-center ${isToday ? 'bg-[#E31C25]/5' : ''}`}>
                <span className="font-bold text-sm text-white">{day}</span>
                <span className={`text-xs font-medium mt-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[#E31C25] text-white' : 'text-[#E31C25]'}`}>{weekDates[index].getDate()}</span>
              </div>
            );
          })}
        </div>

        <div className="relative">
          {loading && <div className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" /></div>}
          
          {[...Array(totalHours)].map((_, i) => {
            const currentHour = i + startHour;
            
            return (
              <div key={i} className="grid grid-cols-8 border-b border-[#2a2a2a] last:border-b-0" style={{ minHeight: `${SLOT_HEIGHT_PX}px` }}>
                <div className="p-2 border-r border-[#2a2a2a] bg-[#121212]/50 relative"><span className="text-xs font-bold text-gray-500 bg-[#1a1a1a] px-2 py-1 rounded-md border border-[#2a2a2a]">{currentHour.toString().padStart(2, '0')}:00</span></div>
                
                {[...Array(7)].map((_, dayIndex) => {
                  const classesInSlot = getClassForSlot(dayIndex, currentHour);
                  const isToday = getLocalDateString(new Date()) === getLocalDateString(weekDates[dayIndex]);
                  
                  return (
                    <div key={dayIndex} className={`border-r border-[#2a2a2a] last:border-r-0 hover:bg-[#E31C25]/5 transition-colors p-1 relative ${isToday ? 'bg-[#E31C25]/[0.02]' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, dayIndex, currentHour)}>
                      {classesInSlot.map((cls) => {
                        const durationMins = Math.round((new Date(cls.end_time).getTime() - new Date(cls.start_time).getTime()) / 60000);
                        const cardHeight = (durationMins / 60) * SLOT_HEIGHT_PX;
                        const topOffset = (new Date(cls.start_time).getMinutes() / 60) * SLOT_HEIGHT_PX + 4; 
                        
                        // BUSCAMOS EL COLOR EN LA BASE DE DATOS Y CONSTRUIMOS EL ESTILO EN TIEMPO REAL
                        const dColor = disciplines.find(d => d.name === cls.discipline)?.color || '#E31C25';

                        return (
                          <div 
                            key={cls.id} draggable={true}
                            onDragStart={(e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              e.dataTransfer.setData("text/plain", JSON.stringify({ id: cls.id, grabOffsetY: e.clientY - rect.top }));
                              setTimeout(() => (e.target as HTMLElement).style.opacity = "0.5", 0);
                            }}
                            onDragEnd={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                            onClick={() => setSelectedClass(cls)}
                            className="absolute left-1 right-1 border rounded-lg p-2 group transition-all cursor-grab active:cursor-grabbing hover:scale-[1.02] z-10 overflow-hidden"
                            style={{ 
                              height: `calc(${cardHeight}px - 8px)`, top: `${topOffset}px`,
                              backgroundColor: hexToRgba(dColor, 0.1), // Fondo semitransparente
                              borderColor: hexToRgba(dColor, 0.3),     // Borde visible
                              color: dColor,                           // Color del texto y sombras
                              boxShadow: `0 0 15px ${hexToRgba(dColor, 0.1)}` 
                            }}
                          >
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 z-20 transition-all bg-[#121212]/80 backdrop-blur-sm rounded p-0.5 border border-[#2a2a2a]">
                              <button onClick={(e) => handleEditClick(cls, e)} className="p-1 rounded text-gray-300 hover:text-white hover:bg-[#2a2a2a]"><Edit2 size={12} /></button>
                              <button onClick={(e) => handleDeleteClass(cls.id, cls.title, e)} className="p-1 rounded text-red-400 hover:text-red-500 hover:bg-red-500/20"><Trash2 size={12} /></button>
                            </div>
                            <div className="text-[10px] font-black opacity-80 mb-0.5 pointer-events-none tracking-tight">{new Date(cls.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {' - '} {new Date(cls.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            <div className="text-xs font-bold leading-tight mb-1 truncate pointer-events-none" style={{ color: '#fff' }}>{cls.title}</div>
                            <div className="text-[10px] opacity-70 truncate flex items-center gap-1 pointer-events-none font-medium"><Users size={10} className="shrink-0"/> {cls.trainer}</div>
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

      {/* MODAL: AJUSTES DE DISCIPLINAS */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-lg rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowSettingsModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white"><X size={24} /></button>
            <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-2"><Palette className="text-[#E31C25]" /> Categorías y Colores</h2>
            
            {/* Lista actual */}
            <div className="space-y-2 mb-8 max-h-[40vh] overflow-y-auto pr-2">
              {disciplines.length === 0 ? (
                <p className="text-gray-500 text-sm italic">No hay disciplinas creadas.</p>
              ) : (
                disciplines.map(d => (
                  <div key={d.name} className="flex items-center justify-between p-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-md border border-white/10" style={{ backgroundColor: d.color }}></div>
                      <span className="font-bold text-white text-sm">{d.name}</span>
                    </div>
                    <button onClick={() => handleDeleteDiscipline(d.name)} className="text-gray-500 hover:text-red-500 p-1 rounded-lg hover:bg-red-500/10 transition-colors"><Trash2 size={16}/></button>
                  </div>
                ))
              )}
            </div>

            {/* Añadir nueva */}
            <form onSubmit={handleAddDiscipline} className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-3">Añadir nueva categoría</h3>
              <div className="flex gap-3">
                <input required value={newDisciplineName} onChange={e => setNewDisciplineName(e.target.value)} placeholder="Ej: Yoga" className="flex-1 bg-[#121212] border border-[#2a2a2a] px-3 py-2 rounded-xl text-sm text-white focus:border-[#E31C25] outline-none" />
                <div className="relative">
                  {/* El selector de color nativo mola, pero lo estilizamos */}
                  <input type="color" required value={newDisciplineColor} onChange={e => setNewDisciplineColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="w-10 h-10 rounded-xl border-2 border-[#2a2a2a] flex items-center justify-center shadow-inner" style={{ backgroundColor: newDisciplineColor }}></div>
                </div>
                <button type="submit" disabled={isAddingDiscipline} className="bg-[#E31C25] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#A6151B] transition-colors">{isAddingDiscipline ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Añadir'}</button>
              </div>
              <p className="text-xs text-gray-500 mt-3">* Los colores deben ser únicos para evitar confusión en el calendario.</p>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVA/EDITAR CLASE */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-2xl rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={closeAndResetForm} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><Calendar className="text-[#E31C25]" /> {editingClassId ? 'Editar Sesión' : 'Nueva Sesión'}</h2>
            
            <form onSubmit={handleSaveClass} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre de la clase</label><input required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" placeholder="Ej: WOD de Tarde" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Entrenador</label><input required value={trainer} onChange={e => setTrainer(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" placeholder="Ej: Marcos Silva" /></div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-y border-[#2a2a2a] py-5">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Hora</label><input type="time" required value={time} onChange={e => setTime(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Duración</label><select value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none"><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hora</option><option value="90">1.5 horas</option><option value="120">2 horas</option></select></div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Disciplina (Color)</label>
                  <select required value={discipline} onChange={e => setDiscipline(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none font-bold">
                    {disciplines.length === 0 && <option value="CrossFit">CrossFit (Predeterminado)</option>}
                    {disciplines.map(d => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Tipo de Acceso</label>
                  <select value={accessType} onChange={e => setAccessType(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none">
                    <option value="NORMAL">Abierta / Normal</option>
                    <option value="TARIFF">Exclusiva Tarifa Fija</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Intensidad</label>
                  <select value={intensityBadge} onChange={e => setIntensityBadge(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none">
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block flex items-center gap-1"><MapPin size={12}/> Ubicación</label><input required value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block flex items-center gap-1"><Users size={12}/> Capacidad</label><input type="number" required min="1" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
              </div>

              <button disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-6 hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)]">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : (editingClassId ? 'Guardar Cambios' : 'Guardar en Calendario')}
              </button>
            </form>
          </div>
        </div>
      )}

      <DetallesSesion sesion={selectedClass} onClose={() => setSelectedClass(null)} onDeleteRequest={handleDeleteClass} />
    </div>
  );
}