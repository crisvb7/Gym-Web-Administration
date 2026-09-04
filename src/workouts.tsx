import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dumbbell, Plus, Search, Video, X, Loader2, Save, Trash2, Edit, UserPlus, Layers, Circle, Upload, Image as ImageIcon, FileText, CheckCircle, User, Calendar } from "lucide-react";
import { supabase } from "./lib/supabase";

interface HistoryDayItem {
  date: string;
  dayName: string;
  dayNumber: number;
}

const getTodayLocalWorkout = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

const generateWorkoutDaysAround = (baseDateStr: string) => {
  const days: HistoryDayItem[] = [];
  const baseDate = new Date(baseDateStr);
  for (let i = -3; i <= 3; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
      dayNumber: d.getDate(),
    });
  }
  return days;
};

export function ClientWorkoutHistory({ clientId }: { clientId: string }) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalWorkout());
  const [dayWorkouts, setDayWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const daysList = useMemo(() => generateWorkoutDaysAround(selectedDate), [selectedDate]);

  useEffect(() => {
    if (clientId && selectedDate) {
      fetchDayWorkouts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, selectedDate]);

  const fetchDayWorkouts = async () => {
    setLoading(true);
    try {
      const [{ data: assignments }, { data: logs }] = await Promise.all([
        supabase
          .from('workout_assignments')
          .select('*, exercises ( name, category, thumbnail_url )')
          .eq('user_id', clientId)
          .eq('assigned_date', selectedDate),
        supabase
          .from('workout_logs')
          .select('*, exercises ( name, category, thumbnail_url )')
          .eq('user_id', clientId)
          .gte('logged_at', `${selectedDate}T00:00:00`)
          .lte('logged_at', `${selectedDate}T23:59:59`),
      ]);

      const unified: any[] = [];
      const processedLogIds = new Set();
      const assignmentsList = assignments || [];
      const logsList = logs || [];

      assignmentsList.forEach((assignment: any) => {
        const matchingLog = logsList.find((log: any) => {
          if (processedLogIds.has(log.id)) return false;
          if (log.assignment_id === assignment.id || log.workout_assignment_id === assignment.id) return true;
          if (log.exercise_id === assignment.exercise_id) return true;
          return false;
        });

        unified.push({
          id: assignment.id,
          assignmentId: assignment.id,
          logId: matchingLog?.id ?? null,
          exercise: assignment.exercises,
          sets: matchingLog?.sets ?? assignment.target_sets ?? 0,
          reps: matchingLog?.reps ?? assignment.target_reps ?? 0,
          weight: matchingLog?.weight_kg ?? assignment.target_weight ?? 0,
          isCompleted: !!matchingLog,
        });

        if (matchingLog) processedLogIds.add(matchingLog.id);
      });

      logsList.forEach((log: any) => {
        if (!processedLogIds.has(log.id)) {
          unified.push({
            id: log.id,
            assignmentId: null,
            logId: log.id,
            exercise: log.exercises,
            sets: log.sets ?? 0,
            reps: log.reps ?? 0,
            weight: log.weight_kg ?? 0,
            isCompleted: true,
          });
        }
      });

      setDayWorkouts(unified);
    } catch (error) {
      console.error("Error cargando historial de entrenamientos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorkoutHistoryItem = async (w: any) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este registro?")) return;
    try {
      if (w.assignmentId) {
        const { error } = await supabase.from('workout_assignments').delete().eq('id', w.assignmentId);
        if (error) throw error;
      }
      if (w.logId) {
        const { error } = await supabase.from('workout_logs').delete().eq('id', w.logId);
        if (error) throw error;
      }
      setDayWorkouts(prev => prev.filter(item => item.id !== w.id));
    } catch (error: any) {
      alert("Error al eliminar el registro: " + error.message);
    }
  };

  return (
    <div className="flex flex-col w-full font-sans">
      <div className="relative flex items-center gap-2 mt-2 px-2 w-fit">
        <Calendar size={18} className="text-[#E31C25]" />
        <span className="text-[#E31C25] text-sm font-bold">Cambiar fecha</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [color-scheme:dark]"
        />
      </div>

      <div
        className="flex overflow-x-auto gap-3 py-4 mb-2 pb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {daysList.map((dayObj: HistoryDayItem) => {
          const isSelected = dayObj.date === selectedDate;
          return (
            <button
              key={dayObj.date}
              onClick={() => setSelectedDate(dayObj.date)}
              className={`flex flex-col items-center justify-center min-w-[65px] h-[80px] rounded-2xl border transition-all duration-200 shrink-0 ${
                isSelected
                  ? 'bg-[#E31C25] border-[#E31C25] shadow-lg shadow-red-500/20'
                  : 'bg-[#18181b] border-[#27272a] hover:bg-[#27272a]'
              }`}
            >
              <span className={`text-xs font-medium mb-1 ${isSelected ? 'text-white/90' : 'text-[#a1a1aa]'}`}>
                {dayObj.dayName}
              </span>
              <span className={`text-xl font-bold ${isSelected ? 'text-white' : 'text-[#d4d4d8]'}`}>
                {dayObj.dayNumber}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
          </div>
        ) : dayWorkouts.length === 0 ? (
          <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <Dumbbell className="text-[#3f3f46] mb-3" size={40} />
            <p className="text-[#a1a1aa] font-medium">No hay entrenamientos registrados para este día.</p>
          </div>
        ) : (
          dayWorkouts.map((w, idx) => (
            <div key={w.id || idx} className="bg-[#18181b] rounded-2xl p-4 border border-[#27272a]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold text-lg truncate pr-2">{w.exercise?.name || 'Ejercicio sin nombre'}</h3>
                <button
                  type="button"
                  onClick={() => handleDeleteWorkoutHistoryItem(w)}
                  className="p-1.5 text-gray-500 hover:text-red-500 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg transition-all shrink-0"
                  title="Eliminar este registro"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {w.exercise?.category && (
                <span className="inline-block text-[10px] font-bold text-[#E31C25] border border-[#E31C25] px-2 py-0.5 rounded uppercase mb-3">
                  {w.exercise.category}
                </span>
              )}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-[#27272a] overflow-hidden flex-shrink-0">
                  {w.exercise?.thumbnail_url ? (
                    <img src={w.exercise.thumbnail_url} alt={w.exercise.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Dumbbell size={24} className="text-[#52525b]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div className="bg-[#27272a] rounded-xl py-2 text-center">
                    <p className="text-[10px] text-[#a1a1aa] mb-1">Kg</p>
                    <p className="text-white font-bold text-lg">{w.weight}</p>
                  </div>
                  <div className="bg-[#27272a] rounded-xl py-2 text-center">
                    <p className="text-[10px] text-[#a1a1aa] mb-1">Sets</p>
                    <p className="text-white font-bold text-lg">{w.sets}</p>
                  </div>
                  <div className="bg-[#27272a] rounded-xl py-2 text-center">
                    <p className="text-[10px] text-[#a1a1aa] mb-1">Reps</p>
                    <p className="text-white font-bold text-lg">{w.reps}</p>
                  </div>
                </div>
              </div>
              <div className={`mt-3 w-full rounded-xl py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2 ${w.isCompleted ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46]'}`}>
                <CheckCircle size={16} /> {w.isCompleted ? 'Completado' : 'Pendiente'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
} 

interface Exercise {
  id: string;
  name: string;
  category: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
  kcal_estimate: number;
  time_estimate: number;
  rest_time: number;
}

interface SelectedInstance {
  instanceId: string;
  exercise: Exercise;
}

// NUEVAS INTERFACES PARA PLANTILLAS
interface TemplateExercise {
  id?: string;
  exercise: Exercise;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  coach_notes: string;
  order_index: number;
}

interface Template {
  id: string;
  name: string;
  workout_template_exercises: {
    id: string;
    target_sets: number;
    target_reps: number;
    target_weight: number;
    coach_notes: string;
    order_index: number;
    exercise: Exercise; // Relación con la tabla exercises
  }[];
}

export function WorkoutsPage() {
  // NAVEGACIÓN PRINCIPAL
  const [activeView, setActiveView] = useState<'exercises' | 'templates' | 'client_history'>('exercises');

  // --- ESTADOS PARA HISTORIAL DE ATLETAS ---
  const [historyClientSearch, setHistoryClientSearch] = useState('');
  const [showHistoryClientDropdown, setShowHistoryClientDropdown] = useState(false);
  const [selectedHistoryClientId, setSelectedHistoryClientId] = useState<string | null>(null);
  const [selectedHistoryClientName, setSelectedHistoryClientName] = useState<string>('');

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  
  // Estados para Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewExercise, setPreviewExercise] = useState<Exercise | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- MODO SUPERSERIE ---
  const [isSupersetMode, setIsSupersetMode] = useState(false);
  const [selectedExercises, setSelectedExercises] = useState<SelectedInstance[]>([]);
  
  // Modal de Asignación 
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningExercises, setAssigningExercises] = useState<SelectedInstance[]>([]);
  const [assignMode, setAssignMode] = useState<'individual' | 'superset' | 'template'>('individual');
  
  const [assignForm, setAssignForm] = useState({
    user_id: "",
    dates: [] as string[],
    dateConfigs: {} as Record<string, {
      target_sets: number;
      exercises_config: Record<number, { target_reps: number, target_weight: number, coach_notes: string }>
    }>
  });
  
  const [tempDate, setTempDate] = useState("");
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // ESTADOS PARA CREACIÓN DE PLANTILLAS
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "" });
  const [templateExercises, setTemplateExercises] = useState<TemplateExercise[]>([]);
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "", category: "Pecho", description: "", video_url: "", 
    thumbnail_url: "", kcal_estimate: 0.5, time_estimate: 3, rest_time: 60
  });

  const categories = ["Pecho", "Espalda", "Pierna", "Hombro", "Brazo", "Core", "Cardio", "CrossFit", "Otros"];

  useEffect(() => {
    fetchExercises();
    fetchClients();
    fetchTemplates();
  }, []);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('exercises').select('*').order('name');
      if (error) throw error;
      setExercises(data || []);
    } catch (error) {
      console.error("Error cargando ejercicios:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_templates')
        .select(`
          id, name,
          workout_template_exercises (
            id, target_sets, target_reps, target_weight, coach_notes, order_index,
            exercise:exercises (*)
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      // Ordenar ejercicios dentro de cada plantilla
      const formattedData = (data as any[]).map(t => ({
        ...t,
        workout_template_exercises: t.workout_template_exercises.sort((a: any, b: any) => a.order_index - b.order_index)
      }));
      setTemplates(formattedData);
    } catch (error) {
      console.error("Error cargando plantillas:", error);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').eq('role', 'client').order('first_name');
      if (error) throw error;
      if (data) setClients(data);
    } catch (error) {
      console.error("Error cargando clientes:", error);
    }
  };

  // FUNCIONES DE EJERCICIOS
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: "", category: "Pecho", description: "", video_url: "", thumbnail_url: "", kcal_estimate: 0.5, time_estimate: 3, rest_time: 60 });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setFormData({ ...ex });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return alert('La imagen es demasiado grande. El límite es de 5MB.');
      setIsUploadingImage(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `thumbnails/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('exercises').upload(filePath, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('exercises').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, thumbnail_url: publicUrl }));
    } catch (error: any) {
      alert(`Error al subir la imagen: ${error.message}`);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        await supabase.from('exercises').update(formData).eq('id', editingId);
      } else {
        await supabase.from('exercises').insert([formData]);
      }
      setIsModalOpen(false);
      fetchExercises();
    } catch (error) {
      alert("Hubo un error al guardar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar "${name}"?`)) {
      try {
        await supabase.from('exercises').delete().eq('id', id);
        setExercises(exercises.filter(ex => ex.id !== id));
      } catch (error) {
        console.error("Error eliminando:", error);
      }
    }
  };

  // FUNCIONES DE SUPERSERIES Y ASIGNACIÓN
  const handleAddExercise = (ex: Exercise) => {
    setSelectedExercises([...selectedExercises, { instanceId: Math.random().toString(36).substring(7), exercise: ex }]);
  };

  const handleRemoveInstance = (instanceId: string) => {
    setSelectedExercises(selectedExercises.filter(se => se.instanceId !== instanceId));
  };

  const handleToggleSupersetMode = () => {
    setIsSupersetMode(!isSupersetMode);
    setSelectedExercises([]); 
  };

  // ASIGNACIÓN UNIVERSAL (EJERCICIO, SUPERSERIE Y PLANTILLA)
  const handleOpenAssign = (exercisesToAssign: SelectedInstance[], mode: 'individual' | 'superset' | 'template' = 'individual', templateDefaults?: Template) => {
    setAssigningExercises(exercisesToAssign);
    setAssignMode(mode);
    
    const initialConfig: any = {};
    
    if (templateDefaults) {
      // Si viene de una plantilla, cargamos los valores guardados
      templateDefaults.workout_template_exercises.forEach((tex, index) => {
        initialConfig[index] = { 
          target_reps: tex.target_reps, 
          target_weight: tex.target_weight, 
          coach_notes: tex.coach_notes 
        };
      });
    } else {
      // Valores por defecto genéricos
      exercisesToAssign.forEach((_, index) => {
        initialConfig[index] = { target_reps: 10, target_weight: 0, coach_notes: "" };
      });
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Si viene de plantilla cogemos las series del primer ejercicio (suelen ser iguales para todo el bloque)
    const defaultSets = templateDefaults && templateDefaults.workout_template_exercises.length > 0 
      ? templateDefaults.workout_template_exercises[0].target_sets 
      : 3;

    setAssignForm({
      user_id: "",
      dates: [today],
      dateConfigs: {
        [today]: { target_sets: defaultSets, exercises_config: initialConfig }
      }
    });

    setTempDate("");
    setClientSearchTerm(""); 
    setShowClientDropdown(false);
    setIsAssignModalOpen(true);
  };

  const handleAddDate = () => {
    if (tempDate && !assignForm.dates.includes(tempDate)) {
      setAssignForm(prev => {
        const lastDate = prev.dates.length > 0 ? prev.dates[prev.dates.length - 1] : null;
        let newConfig;
        if (lastDate && prev.dateConfigs[lastDate]) {
          newConfig = JSON.parse(JSON.stringify(prev.dateConfigs[lastDate])); 
        } else {
          const fallbackConfig: any = {};
          assigningExercises.forEach((_, idx) => { fallbackConfig[idx] = { target_reps: 10, target_weight: 0, coach_notes: "" } });
          newConfig = { target_sets: 3, exercises_config: fallbackConfig };
        }

        return { 
          ...prev, 
          dates: [...prev.dates, tempDate].sort(),
          dateConfigs: { ...prev.dateConfigs, [tempDate]: newConfig }
        };
      });
      setTempDate(""); 
    }
  };

  const handleRemoveDate = (dateToRemove: string) => {
    setAssignForm(prev => {
      const newDates = prev.dates.filter(d => d !== dateToRemove);
      const newConfigs = { ...prev.dateConfigs };
      delete newConfigs[dateToRemove];
      return { ...prev, dates: newDates, dateConfigs: newConfigs };
    });
  };

  const updateDateSets = (dateStr: string, sets: number) => {
    setAssignForm(prev => ({
      ...prev,
      dateConfigs: {
        ...prev.dateConfigs,
        [dateStr]: { ...prev.dateConfigs[dateStr], target_sets: sets }
      }
    }));
  };

  const updateDateExConfig = (dateStr: string, index: number, field: string, value: any) => {
    setAssignForm(prev => ({
      ...prev,
      dateConfigs: {
        ...prev.dateConfigs,
        [dateStr]: {
          ...prev.dateConfigs[dateStr],
          exercises_config: {
            ...prev.dateConfigs[dateStr].exercises_config,
            [index]: { ...prev.dateConfigs[dateStr].exercises_config[index], [field]: value }
          }
        }
      }
    }));
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.user_id) return alert("Por favor, busca y selecciona un atleta de la lista.");
    if (assignForm.dates.length === 0) return alert("Debes seleccionar al menos una fecha.");
    
    setIsSubmitting(true);
    try {
      const allInserts: any[] = [];
      // Si el modo es 'superset', generamos un ID de superserie. Para 'template' o 'individual', es null.
      const isActualSuperset = assignMode === 'superset';
      
      assignForm.dates.forEach(dateStr => {
        const supersetId = isActualSuperset ? `superset-${Date.now()}-${Math.random().toString(36).substring(7)}` : null;
        const configForDate = assignForm.dateConfigs[dateStr];

        assigningExercises.forEach((se, index) => {
          allInserts.push({
            user_id: assignForm.user_id,
            exercise_id: se.exercise.id,
            assigned_date: dateStr, 
            target_sets: configForDate.target_sets,
            target_reps: configForDate.exercises_config[index].target_reps,
            target_weight: configForDate.exercises_config[index].target_weight,
            coach_notes: configForDate.exercises_config[index].coach_notes,
            superset_id: supersetId, 
            order_index: index 
          });
        });
      });

      const { error } = await supabase.from('workout_assignments').insert(allInserts);
      if (error) throw error;
      
      setIsAssignModalOpen(false);
      setSelectedExercises([]);
      setIsSupersetMode(false); 
      alert(`¡Asignado con éxito en ${assignForm.dates.length} día(s)!`);
    } catch (error: any) {
      alert("Error al asignar. Verifica las tablas de Supabase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // FUNCIONES DE CREACIÓN DE PLANTILLAS
  const handleAddExerciseToTemplate = (ex: Exercise) => {
    setTemplateExercises([...templateExercises, {
      id: Math.random().toString(36).substring(7),
      exercise: ex,
      target_sets: 3,
      target_reps: 10,
      target_weight: 0,
      coach_notes: "",
      order_index: templateExercises.length
    }]);
    setTemplateSearchTerm(""); // Limpiar buscador tras añadir
  };

  const handleUpdateTemplateExercise = (index: number, field: string, value: any) => {
    const updated = [...templateExercises];
    updated[index] = { ...updated[index], [field]: value };
    setTemplateExercises(updated);
  };

  const handleRemoveTemplateExercise = (index: number) => {
    const updated = templateExercises.filter((_, i) => i !== index);
    setTemplateExercises(updated);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) return alert("La plantilla debe tener un nombre.");
    if (templateExercises.length === 0) return alert("Añade al menos un ejercicio a la plantilla.");
    
    setIsSubmitting(true);
    try {
      // 1. Insertar Plantilla Principal
      const { data: templateData, error: templateError } = await supabase
        .from('workout_templates')
        .insert([{ name: templateForm.name }])
        .select()
        .single();
        
      if (templateError) throw templateError;

      // 2. Insertar Ejercicios de la plantilla
      const exercisesToInsert = templateExercises.map((te, idx) => ({
        template_id: templateData.id,
        exercise_id: te.exercise.id,
        target_sets: te.target_sets,
        target_reps: te.target_reps,
        target_weight: te.target_weight,
        coach_notes: te.coach_notes,
        order_index: idx
      }));

      const { error: exercisesError } = await supabase
        .from('workout_template_exercises')
        .insert(exercisesToInsert);

      if (exercisesError) throw exercisesError;

      alert("¡Plantilla guardada con éxito!");
      setIsTemplateModalOpen(false);
      setTemplateForm({ name: "" });
      setTemplateExercises([]);
      fetchTemplates();
      setActiveView('templates');

    } catch (error: any) {
      alert("Error al guardar la plantilla: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar la plantilla "${name}"?`)) {
      try {
        await supabase.from('workout_templates').delete().eq('id', id);
        setTemplates(templates.filter(t => t.id !== id));
      } catch (error) {
        console.error("Error eliminando plantilla:", error);
      }
    }
  };

  const handleAssignTemplate = (template: Template) => {
    // Transformar los ejercicios de la plantilla al formato SelectedInstance que usa el modal
    const instancesToAssign: SelectedInstance[] = template.workout_template_exercises.map(tex => ({
      instanceId: Math.random().toString(36).substring(7),
      exercise: tex.exercise
    }));
    
    handleOpenAssign(instancesToAssign, 'template', template);
  };

  // FILTROS DE BÚSQUEDA
  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(searchTerm.toLowerCase()) || ex.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "Todos" || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredClients = clients.filter(client =>
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(clientSearchTerm.toLowerCase())
  );

  const filteredHistoryClients = clients.filter(client =>
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(historyClientSearch.toLowerCase())
  );

  const filteredTemplateSearch = exercises.filter(ex => 
    ex.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) || ex.category.toLowerCase().includes(templateSearchTerm.toLowerCase())
  ).slice(0, 5); // Limitar a 5 resultados en el buscador del modal

  // 1. FUNCIÓN PARA QUITAR UN EJERCICIO DE LA ASIGNACIÓN ACTUAL
  const handleRemoveExerciseFromAssignment = (indexToRemove: number) => {
    // Filtramos el ejercicio del array temporal del modal
    const updatedExercises = assigningExercises.filter((_, idx) => idx !== indexToRemove);
    setAssigningExercises(updatedExercises);

    // Re-mapeamos los índices en el formulario para que las repeticiones/pesos no se crucen
    setAssignForm(prev => {
      const updatedDateConfigs = { ...prev.dateConfigs };

      Object.keys(updatedDateConfigs).forEach(dateStr => {
        const currentConfig = updatedDateConfigs[dateStr];
        if (currentConfig && currentConfig.exercises_config) {
          const newExercisesConfig: Record<number, any> = {};
          let newIdx = 0;

          // Recorremos la configuración vieja y desplazamos los índices de los que quedan
          assigningExercises.forEach((_, oldIdx) => {
            if (oldIdx !== indexToRemove) {
              newExercisesConfig[newIdx] = currentConfig.exercises_config[oldIdx] || {
                target_reps: 0,
                target_weight: 0,
                coach_notes: ""
              };
              newIdx++;
            }
          });

          updatedDateConfigs[dateStr] = {
            ...currentConfig,
            exercises_config: newExercisesConfig
          };
        }
      });

      return { ...prev, dateConfigs: updatedDateConfigs };
    });
  };

  // 2. FUNCIÓN PARA AÑADIR UN EJERCICIO NUEVO A LA ASIGNACIÓN ACTUAL
  const handleAddExerciseToAssignment = (exerciseId: string) => {
    const selectedEx = exercises.find(ex => ex.id === exerciseId);
    if (!selectedEx) return;

    const newInstance = {
      instanceId: `dynamic-${Math.random().toString(36).substring(2, 9)}`,
      exercise: selectedEx
    };

    const nextIndex = assigningExercises.length;
    setAssigningExercises(prev => [...prev, newInstance]);

    // Inicializamos los inputs vacíos/por defecto para este nuevo ejercicio en cada día del calendario
    setAssignForm(prev => {
      const updatedDateConfigs = { ...prev.dateConfigs };

      Object.keys(updatedDateConfigs).forEach(dateStr => {
        const currentConfig = updatedDateConfigs[dateStr];
        if (currentConfig) {
          updatedDateConfigs[dateStr] = {
            ...currentConfig,
            exercises_config: {
              ...currentConfig.exercises_config,
              [nextIndex]: { target_reps: 10, target_weight: 0, coach_notes: "" }
            }
          };
        }
      });

      return { ...prev, dateConfigs: updatedDateConfigs };
    });
  };

  return (
    <div className={`space-y-6 animate-in fade-in duration-500 relative pb-32 ${isSupersetMode ? 'select-none' : ''}`}>
      
      {/* Cabecera y Navegación de Vistas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Biblioteca de Entrenamientos</h1>
          <p className="text-gray-400 mt-1">Gestiona el catálogo, crea plantillas y asigna rutinas.</p>
        </div>
      
        <div className="flex gap-3 shrink-0">
          {activeView === 'exercises' && (
            <button 
              onClick={handleToggleSupersetMode} 
              className={`px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 border ${
                isSupersetMode 
                  ? 'bg-[#1a1a1a] text-white border-[#E31C25] shadow-[0_0_15px_rgba(227,28,37,0.3)]' 
                  : 'bg-[#121212] text-[#E31C25] border-[#E31C25]/30 hover:bg-[#E31C25]/10'
              }`}
            >
              <Layers size={20} /> {isSupersetMode ? "Cancelar Superserie" : "Modo Superserie"}
            </button>
          )}
          
          {activeView === 'exercises' && !isSupersetMode && (
            <button onClick={handleOpenCreate} className="bg-[#E31C25] text-white px-5 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)]">
              <Plus size={20} /> Añadir Ejercicio
            </button>
          )}

          {activeView === 'templates' && (
            <button onClick={() => { setTemplateForm({name: ""}); setTemplateExercises([]); setTemplateSearchTerm(""); setIsTemplateModalOpen(true); }} className="bg-[#E31C25] text-white px-5 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)]">
              <Plus size={20} /> Crear Plantilla
            </button>
          )}
        </div>
      </div>

      {/* Tabs Pestañas (Ejercicios vs Plantillas) */}
      <div className="flex gap-2 border-b border-[#2a2a2a] pb-px">
        <button onClick={() => setActiveView('exercises')} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'exercises' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <Dumbbell className="w-4 h-4" /> Ejercicios Base
        </button>
        <button onClick={() => setActiveView('templates')} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'templates' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <FileText className="w-4 h-4" /> Plantillas de Rutina
        </button>
        <button onClick={() => setActiveView('client_history')} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'client_history' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <User className="w-4 h-4" /> Historial Atletas
        </button>
      </div>

      {/* =========================================
          VISTA 1: EJERCICIOS BASE
      ============================================= */}
      {activeView === 'exercises' && (
        <>
          <div className={`bg-[#121212] border p-4 rounded-2xl flex items-center gap-3 transition-colors ${isSupersetMode ? 'border-[#E31C25]/50 shadow-[0_0_10px_rgba(227,28,37,0.1)]' : 'border-[#2a2a2a]'}`}>
            <Search className="text-gray-500 w-5 h-5" />
            <input type="text" placeholder="Buscar ejercicio por nombre..." className="bg-transparent border-none text-white outline-none w-full placeholder:text-gray-600" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            <button onClick={() => setSelectedCategory("Todos")} className={`px-5 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${selectedCategory === "Todos" ? "bg-[#E31C25] text-white" : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#2a2a2a]"}`}>Todos</button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${selectedCategory === cat ? "bg-[#E31C25] text-white" : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#2a2a2a]"}`}>{cat}</button>
            ))}
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-20"><Loader2 className="w-10 h-10 text-[#E31C25] animate-spin" /></div>
          ) : filteredExercises.length === 0 ? (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-20 flex flex-col items-center text-center shadow-xl">
              <div className="w-24 h-24 bg-[#E31C25]/5 rounded-full flex items-center justify-center mb-6 border border-[#E31C25]/10"><Dumbbell className="w-12 h-12 text-[#E31C25] opacity-80" /></div>
              <h2 className="text-2xl font-bold text-white mb-2">Sin ejercicios</h2>
              <p className="text-gray-400 max-w-sm mx-auto">No se encontraron resultados para esta búsqueda o categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredExercises.map((ex) => {
                const selectionCount = selectedExercises.filter(se => se.exercise.id === ex.id).length;
                const isSelected = selectionCount > 0;

                return (
                  <div key={ex.id} onClick={() => { if (isSupersetMode) handleAddExercise(ex); }} className={`bg-[#1a1a1a] border rounded-2xl overflow-hidden transition-all group ${isSupersetMode ? 'cursor-pointer transform hover:scale-[1.02]' : ''} ${isSelected ? 'border-[#E31C25] ring-2 ring-[#E31C25] shadow-[0_0_20px_rgba(227,28,37,0.2)]' : isSupersetMode ? 'border-[#2a2a2a] hover:border-gray-500 opacity-70 hover:opacity-100' : 'border-[#2a2a2a] hover:border-[#E31C25]/50'}`}>
                    <div className={`h-48 bg-[#121212] relative overflow-hidden ${!isSupersetMode && ex.video_url ? 'cursor-pointer' : ''}`} onClick={() => { if (!isSupersetMode && ex.video_url) setPreviewExercise(ex); }}>
                      {isSupersetMode && (
                        <div className="absolute top-3 left-3 z-30 flex items-center justify-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg ${isSelected ? 'bg-[#E31C25] text-white scale-110' : 'bg-black/60 text-gray-400 border border-white/20'}`}>
                            {isSelected ? <span className="font-black text-sm">x{selectionCount}</span> : <Circle size={20} />}
                          </div>
                        </div>
                      )}

                      {ex.thumbnail_url ? (
                        <img src={ex.thumbnail_url} alt={ex.name} className={`w-full h-full object-cover transition-transform duration-500 ${isSelected ? 'opacity-40' : 'opacity-80 group-hover:scale-105'}`} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Dumbbell className="w-12 h-12 text-gray-700" /></div>
                      )}
                      
                      {!isSupersetMode && ex.video_url && (
                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm p-2 rounded-lg text-white group-hover:text-[#E31C25] transition-colors z-20 pointer-events-none">
                          <Video size={16} />
                        </div>
                      )}

                      <div className={`absolute bottom-3 left-3 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-lg ${isSelected ? 'bg-[#A6151B]' : 'bg-[#E31C25]'}`}>
                        {ex.category}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-bold text-white truncate pr-2">{ex.name}</h3>
                        {!isSupersetMode && (
                          <div className="flex gap-2 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenAssign([{ instanceId: 'single', exercise: ex }], 'individual'); }} title="Asignar a atleta" className="text-gray-500 hover:text-white transition-colors bg-[#121212] p-1.5 rounded-md border border-[#2a2a2a]"><UserPlus size={16} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(ex); }} title="Editar" className="text-gray-500 hover:text-blue-500 transition-colors bg-[#121212] p-1.5 rounded-md border border-[#2a2a2a]"><Edit size={16} /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(ex.id, ex.name); }} title="Eliminar" className="text-gray-500 hover:text-[#E31C25] transition-colors bg-[#121212] p-1.5 rounded-md border border-[#2a2a2a]"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2 mb-4 h-10">{ex.description || "Sin descripción detallada."}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* =========================================
          VISTA 2: PLANTILLAS
      ============================================= */}
      {activeView === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.length === 0 ? (
            <div className="col-span-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-20 flex flex-col items-center text-center shadow-xl">
              <div className="w-24 h-24 bg-[#E31C25]/5 rounded-full flex items-center justify-center mb-6 border border-[#E31C25]/10"><FileText className="w-12 h-12 text-[#E31C25] opacity-80" /></div>
              <h2 className="text-2xl font-bold text-white mb-2">No hay plantillas</h2>
              <p className="text-gray-400 max-w-sm mx-auto">Crea tu primera plantilla de rutina para asignar entrenamientos completos con un solo clic.</p>
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden transition-all hover:border-[#E31C25]/50 group flex flex-col">
                <div className="bg-[#121212] p-5 border-b border-[#2a2a2a] flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">{template.name}</h3>
                    <span className="text-xs text-gray-500 font-bold uppercase">{template.workout_template_exercises.length} Ejercicios</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleAssignTemplate(template)} title="Asignar Plantilla" className="text-white hover:text-white transition-colors bg-[#E31C25] hover:bg-[#A6151B] p-2 rounded-md shadow-lg"><UserPlus size={16} /></button>
                    <button onClick={() => handleDeleteTemplate(template.id, template.name)} title="Eliminar Plantilla" className="text-gray-500 hover:text-red-500 transition-colors bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-md"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col gap-2 bg-[#171717]">
                  {template.workout_template_exercises.slice(0, 4).map((tex, i) => (
                    <div key={tex.id} className="flex items-center gap-3 text-sm border-b border-[#2a2a2a] pb-2 last:border-0 last:pb-0">
                      <span className="text-[#E31C25] font-bold text-xs">{i + 1}.</span>
                      <span className="text-gray-300 truncate flex-1">{tex.exercise.name}</span>
                      <span className="text-xs text-gray-500 shrink-0">{tex.target_sets}x{tex.target_reps}</span>
                    </div>
                  ))}
                  {template.workout_template_exercises.length > 4 && (
                    <div className="text-xs text-gray-500 font-bold italic mt-2 text-center">
                      + {template.workout_template_exercises.length - 4} ejercicios más
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* =========================================
          VISTA 3: HISTORIAL DE ATLETAS
      ============================================= */}
      {activeView === 'client_history' && (
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#2a2a2a] shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">Seleccionar Atleta</h2>
            <div className="relative z-40 max-w-md">
              <Search className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar atleta por nombre..."
                className="w-full bg-[#121212] border border-[#2a2a2a] py-3 pl-10 pr-4 rounded-xl text-white focus:border-[#E31C25] outline-none"
                value={historyClientSearch}
                onChange={(e) => {
                  setHistoryClientSearch(e.target.value);
                  setShowHistoryClientDropdown(true);
                  setSelectedHistoryClientId(null);
                }}
                onFocus={() => setShowHistoryClientDropdown(true)}
              />
              {showHistoryClientDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowHistoryClientDropdown(false)}></div>
                  <div className="absolute z-40 w-full mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredHistoryClients.length > 0 ? (
                      filteredHistoryClients.map(client => (
                        <button
                          key={client.id}
                          type="button"
                          className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#E31C25] hover:text-white transition-colors border-b border-[#2a2a2a] flex items-center gap-3"
                          onClick={() => {
                            setSelectedHistoryClientId(client.id);
                            setSelectedHistoryClientName(`${client.first_name} ${client.last_name}`);
                            setHistoryClientSearch(`${client.first_name} ${client.last_name}`);
                            setShowHistoryClientDropdown(false);
                          }}
                        >
                          <div className="w-6 h-6 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[#E31C25]">{client.first_name[0]}</div>
                          {client.first_name} {client.last_name}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-gray-500 text-center">No se encontraron atletas</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedHistoryClientId ? (
            <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-6 shadow-lg">
              <h3 className="text-lg font-bold text-white mb-6 pb-4 border-b border-[#2a2a2a]">
                Visualizando entrenamiento de: <span className="text-[#E31C25]">{selectedHistoryClientName}</span>
              </h3>
              <div className="max-w-2xl mx-auto">
                <ClientWorkoutHistory clientId={selectedHistoryClientId} />
              </div>
            </div>
          ) : (
            <div className="bg-[#1a1a1a] rounded-2xl border border-dashed border-[#2a2a2a] p-12 text-center text-gray-500">
              <User size={48} className="mx-auto mb-4 opacity-50 text-[#E31C25]" />
              <p className="text-lg font-bold text-white mb-2">Ningún atleta seleccionado</p>
              <p className="max-w-sm mx-auto">Busca y selecciona un atleta en el recuadro superior para ver su registro de entrenamientos igual que lo ve él en la app.</p>
            </div>
          )}
        </div>
      )}

      {/* BARRA FLOTANTE SUPERSERIES */}
      {isSupersetMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#121212] border-2 border-[#E31C25] p-4 rounded-2xl shadow-[0_10px_40px_rgba(227,28,37,0.5)] z-40 flex flex-col items-center gap-4 animate-in slide-in-from-bottom-10 w-[95%] max-w-2xl">
          <div className="flex items-center gap-3 w-full">
            <div className="bg-[#E31C25]/20 p-2 rounded-lg text-[#E31C25] shrink-0"><Layers size={24} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">{selectedExercises.length} Ejercicios seleccionados</p>
              <div className="flex gap-2 overflow-x-auto mt-2 pb-1 custom-scrollbar w-full">
                {selectedExercises.length === 0 && <span className="text-xs text-gray-500 italic">Toca las tarjetas para añadirlas...</span>}
                {selectedExercises.map((se, index) => (
                  <div key={se.instanceId} className="flex items-center gap-1 bg-[#2a2a2a] border border-[#3a3a3a] px-2 py-1 rounded-md shrink-0">
                    <span className="text-xs font-bold text-gray-300"><span className="text-[#E31C25]">{index + 1}.</span> {se.exercise.name}</span>
                    <button onClick={() => handleRemoveInstance(se.instanceId)} className="text-gray-500 hover:text-white ml-1 bg-black/20 rounded-full p-0.5"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto self-end">
            <button onClick={handleToggleSupersetMode} className="flex-1 sm:flex-none px-4 py-2 text-gray-400 hover:text-white font-bold transition-colors">Cancelar</button>
            <button onClick={() => handleOpenAssign(selectedExercises, 'superset')} disabled={selectedExercises.length < 2} className={`flex-1 sm:flex-none px-6 py-2 font-bold rounded-xl transition-colors shadow-lg ${selectedExercises.length < 2 ? 'bg-[#2a2a2a] text-gray-500 cursor-not-allowed' : 'bg-[#E31C25] text-white hover:bg-[#A6151B]'}`}>
              Crear Superserie
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Crear Plantilla */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a] bg-[#1a1a1a] shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="text-[#E31C25]"/> Nueva Plantilla</h2>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-1.5 rounded-full transition-colors"><X size={18} /></button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Columna Izquierda: Buscador de Ejercicios */}
              <div className="w-full md:w-1/3 bg-[#171717] border-b md:border-b-0 md:border-r border-[#2a2a2a] flex flex-col p-4">
                <label className="text-xs font-bold text-gray-400 uppercase mb-2">Añadir ejercicios</label>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 text-gray-500 w-4 h-4" />
                  <input type="text" placeholder="Buscar..." value={templateSearchTerm} onChange={(e) => setTemplateSearchTerm(e.target.value)} className="w-full bg-[#121212] border border-[#2a2a2a] p-2 pl-9 rounded-lg text-white outline-none focus:border-[#E31C25] text-sm" />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                  {templateSearchTerm === "" ? (
                     <p className="text-xs text-gray-500 text-center mt-10">Busca un ejercicio para añadirlo a la plantilla.</p>
                  ) : filteredTemplateSearch.length === 0 ? (
                     <p className="text-xs text-gray-500 text-center mt-10">No hay coincidencias.</p>
                  ) : (
                    filteredTemplateSearch.map(ex => (
                      <button key={ex.id} onClick={() => handleAddExerciseToTemplate(ex)} className="w-full text-left bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#E31C25]/50 p-3 rounded-xl flex items-center justify-between group transition-colors">
                        <span className="text-sm text-gray-300 font-bold group-hover:text-white truncate pr-2">{ex.name}</span>
                        <Plus size={16} className="text-gray-500 group-hover:text-[#E31C25] shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Columna Derecha: Configuración de la Plantilla */}
              <div className="w-full md:w-2/3 bg-[#121212] flex flex-col p-6 overflow-y-auto custom-scrollbar">
                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Nombre de la Plantilla *</label>
                  <input type="text" required placeholder="Ej: Día 1 - Pecho y Tríceps Hipertrofia" value={templateForm.name} onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white outline-none focus:border-[#E31C25] text-lg font-bold" />
                </div>

                <label className="block text-xs font-bold text-gray-400 mb-3 uppercase">Ejercicios Incluidos ({templateExercises.length})</label>
                {templateExercises.length === 0 ? (
                  <div className="flex-1 border-2 border-dashed border-[#2a2a2a] rounded-xl flex flex-col items-center justify-center p-10 text-center">
                    <Dumbbell className="text-gray-600 mb-3 w-10 h-10" />
                    <p className="text-gray-400 font-bold">Plantilla vacía</p>
                    <p className="text-sm text-gray-500 mt-1">Busca y añade ejercicios desde el panel izquierdo.</p>
                  </div>
                ) : (
                  <div className="space-y-3 flex-1">
                    {templateExercises.map((te, index) => (
                      <div key={te.id} className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 rounded-xl relative">
                        <div className="flex items-center justify-between mb-3 border-b border-[#2a2a2a] pb-2">
                          <span className="font-bold text-white text-sm"><span className="text-[#E31C25] mr-2">{index + 1}.</span>{te.exercise.name}</span>
                          <button onClick={() => handleRemoveTemplateExercise(index)} className="text-gray-500 hover:text-red-500 bg-[#121212] p-1.5 rounded-md"><Trash2 size={14}/></button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex-1 min-w-[70px]">
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Series Base</label>
                            <input type="number" value={te.target_sets} onChange={(e) => handleUpdateTemplateExercise(index, 'target_sets', parseInt(e.target.value))} className="w-full bg-[#121212] border border-[#3a3a3a] p-2 rounded text-white text-xs outline-none focus:border-[#E31C25]" />
                          </div>
                          <div className="flex-1 min-w-[70px]">
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Reps Base</label>
                            <input type="number" value={te.target_reps} onChange={(e) => handleUpdateTemplateExercise(index, 'target_reps', parseInt(e.target.value))} className="w-full bg-[#121212] border border-[#3a3a3a] p-2 rounded text-white text-xs outline-none focus:border-[#E31C25]" />
                          </div>
                          <div className="flex-1 min-w-[70px]">
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Kg Base</label>
                            <input type="number" value={te.target_weight} onChange={(e) => handleUpdateTemplateExercise(index, 'target_weight', parseFloat(e.target.value))} className="w-full bg-[#121212] border border-[#3a3a3a] p-2 rounded text-white text-xs outline-none focus:border-[#E31C25]" />
                          </div>
                          <div className="w-full mt-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Nota Base (Opcional)</label>
                            <input type="text" placeholder="Instrucción por defecto..." value={te.coach_notes} onChange={(e) => handleUpdateTemplateExercise(index, 'coach_notes', e.target.value)} className="w-full bg-[#121212] border border-[#3a3a3a] p-2 rounded text-white text-xs outline-none focus:border-[#E31C25] placeholder:text-gray-600" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-[#2a2a2a] bg-[#1a1a1a] shrink-0 flex justify-end gap-3">
              <button onClick={() => setIsTemplateModalOpen(false)} className="px-6 py-3 text-gray-400 font-bold hover:text-white transition-colors">Cancelar</button>
              <button onClick={handleSaveTemplate} disabled={isSubmitting || templateExercises.length === 0 || !templateForm.name} className="bg-[#E31C25] text-white font-bold px-8 py-3 rounded-xl hover:bg-[#A6151B] transition-colors shadow-lg disabled:opacity-50 flex items-center gap-2">
                {isSubmitting && <Loader2 className="animate-spin w-4 h-4" />} Guardar Plantilla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UNIVERSAL DE ASIGNACIÓN (Individual, Superserie o Plantilla) */}
      {isAssignModalOpen && assigningExercises.length > 0 && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a] bg-[#1a1a1a] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  {assignMode === 'template' ? <><FileText className="text-[#E31C25] w-5 h-5"/> Instanciar Plantilla</> : assignMode === 'superset' ? <><Layers className="text-[#E31C25] w-5 h-5"/> Asignar Superserie</> : 'Asignar a Atleta'}
                </h2>
                <p className="text-xs text-gray-400 mt-1">{assigningExercises.length > 1 ? `${assigningExercises.length} ejercicios vinculados` : assigningExercises[0].exercise.name}</p>
              </div>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-1.5 rounded-full transition-colors"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto p-6 custom-scrollbar bg-[#121212]">
              <form id="assign-form" onSubmit={handleAssignSubmit} className="space-y-6">
                
                {/* Selector de Atleta y Añadir Fecha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#1a1a1a] p-4 rounded-xl border border-[#2a2a2a]">
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Atleta *</label>
                    <Search className="absolute left-3 top-8 text-gray-500 w-4 h-4" />
                    <input 
                      type="text" placeholder="Buscar..." value={clientSearchTerm}
                      onChange={(e) => { setClientSearchTerm(e.target.value); setShowClientDropdown(true); if (assignForm.user_id) setAssignForm({...assignForm, user_id: ""}); }}
                      onFocus={() => setShowClientDropdown(true)} onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                      className={`w-full bg-[#121212] border p-2.5 pl-9 rounded-lg text-white outline-none text-sm transition-colors ${!assignForm.user_id && clientSearchTerm === "" ? "border-[#E31C25]/50" : "border-[#2a2a2a] focus:border-[#E31C25]"}`}
                    />
                    {showClientDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg max-h-40 overflow-y-auto shadow-2xl custom-scrollbar">
                        {filteredClients.map(c => (
                          <div key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setAssignForm({...assignForm, user_id: c.id}); setClientSearchTerm(`${c.first_name} ${c.last_name}`); setShowClientDropdown(false); }} className="p-3 hover:bg-[#2a2a2a] cursor-pointer text-white text-sm border-b border-[#2a2a2a] last:border-b-0 flex items-center gap-2">
                            <div className="w-6 h-6 bg-[#121212] rounded-full flex items-center justify-center text-[#E31C25] font-bold text-xs">{c.first_name[0]}</div>
                            {c.first_name} {c.last_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Añadir Fecha</label>
                    <div className="flex gap-2">
                      <input type="date" value={tempDate} onChange={(e) => setTempDate(e.target.value)} className="flex-1 bg-[#121212] border border-[#2a2a2a] p-2.5 rounded-lg text-white outline-none text-sm focus:border-[#E31C25] transition-colors [color-scheme:dark]" />
                      <button type="button" onClick={handleAddDate} disabled={!tempDate} className="bg-[#2a2a2a] hover:bg-[#E31C25] text-white px-4 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center shrink-0">
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* AQUÍ ESTÁ AGREGADO EL PASO 2: GESTIÓN DINÁMICA DE EJERCICIOS */}
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#2a2a2a] space-y-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide">
                    Ejercicios en esta rutina ({assigningExercises.length})
                  </label>
                  
                  {/* Lista de píldoras de los ejercicios actuales */}
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar pb-1">
                    {assigningExercises.map((se, index) => (
                      <div key={se.instanceId} className="flex items-center gap-2 bg-[#121212] border border-[#2a2a2a] pl-3 pr-1 py-1.5 rounded-lg text-xs font-bold text-gray-200">
                        <span>
                          <span className="text-[#E31C25] mr-1">{index + 1}.</span> {se.exercise.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExerciseFromAssignment(index)}
                          className="text-gray-500 hover:text-red-500 p-1 rounded-md bg-[#1a1a1a] border border-[#2a2a2a] transition-colors"
                          title="Quitar de la rutina"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {assigningExercises.length === 0 && (
                      <span className="text-xs text-gray-500 italic">No hay ejercicios en la rutina. Añade uno abajo.</span>
                    )}
                  </div>

                  {/* Desplegable para añadir un ejercicio nuevo */}
                  <div className="relative">
                    <select
                      value=""
                      onChange={(e) => {
                        handleAddExerciseToAssignment(e.target.value);
                        e.target.value = ""; 
                      }}
                      className="w-full bg-[#121212] border border-[#2a2a2a] p-2.5 pr-8 rounded-lg text-white outline-none text-sm focus:border-[#E31C25] transition-colors appearance-none cursor-pointer font-medium"
                    >
                      <option value="" disabled>+ Añadir otro ejercicio a esta rutina...</option>
                      {exercises.map(ex => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} ({ex.category})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500 text-[10px]">▼</div>
                  </div>
                </div>

                {assignForm.dates.length === 0 && (
                  <div className="bg-[#E31C25]/10 border border-[#E31C25]/30 p-6 rounded-xl text-center">
                    <p className="text-[#E31C25] font-bold">No hay fechas seleccionadas</p>
                    <p className="text-sm text-gray-400 mt-1">Utiliza el calendario de arriba para añadir los días de entrenamiento.</p>
                  </div>
                )}

                {/* BLOQUES DE CONFIGURACIÓN POR FECHA */}
                <div className="space-y-4">
                  {assignForm.dates.map((dateStr, dateIndex) => {
                    const config = assignForm.dateConfigs[dateStr];
                    if (!config) return null;

                    return (
                      <div key={dateStr} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden relative">
                        <div className="bg-[#2a2a2a]/50 p-3 flex justify-between items-center border-b border-[#2a2a2a]">
                          <div className="flex items-center gap-3">
                            <span className="bg-[#E31C25] text-white text-xs font-black px-2 py-1 rounded uppercase">Día {dateIndex + 1}</span>
                            <span className="text-white font-bold">{new Date(dateStr).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
                          </div>
                          <button type="button" onClick={() => handleRemoveDate(dateStr)} className="text-gray-400 hover:text-[#E31C25] transition-colors bg-[#121212] p-1.5 rounded-full border border-[#2a2a2a]">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
                        <div className="p-4">
                          <div className="flex items-center justify-between bg-[#121212] border border-[#2a2a2a] p-3 rounded-lg mb-4">
                            <label className="text-sm font-bold text-gray-300">Series totales del bloque:</label>
                            <div className="flex items-center gap-2">
                              <input type="number" required value={config.target_sets} onChange={(e) => updateDateSets(dateStr, parseInt(e.target.value))} className="w-16 bg-[#1a1a1a] border border-[#3a3a3a] p-1 rounded text-white text-center text-sm font-bold outline-none focus:border-[#E31C25]" />
                              <span className="text-xs text-gray-500 uppercase font-bold">Vueltas</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {assigningExercises.map((se, index) => (
                              <div key={`${dateStr}-${se.instanceId}`} className="bg-[#121212] border border-[#2a2a2a] p-3 rounded-lg flex flex-col gap-2 relative">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-5 h-5 rounded-full bg-[#2a2a2a] text-gray-400 flex items-center justify-center text-[10px] font-bold shrink-0">{index + 1}</div>
                                    <div className="truncate font-bold text-gray-300 text-sm" title={se.exercise.name}>{se.exercise.name}</div>
                                  </div>
                                  <div className="flex gap-2 shrink-0">
                                    {/* IMPORTANTE: Mapeado corregido usando 'index' para mantener concordancia con tu state 'updateDateExConfig' */}
                                    <div>
                                      <p className="text-[10px] text-gray-500 uppercase font-bold text-center mb-1">Reps</p>
                                      <input type="number" required value={config.exercises_config[index]?.target_reps || 0} onChange={(e) => updateDateExConfig(dateStr, index, 'target_reps', parseInt(e.target.value))} className="w-14 bg-[#1a1a1a] border border-[#3a3a3a] p-1.5 rounded text-white text-center text-sm outline-none focus:border-[#E31C25]" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-gray-500 uppercase font-bold text-center mb-1">Kg</p>
                                      <input type="number" value={config.exercises_config[index]?.target_weight || 0} onChange={(e) => updateDateExConfig(dateStr, index, 'target_weight', parseFloat(e.target.value))} className="w-14 bg-[#1a1a1a] border border-[#3a3a3a] p-1.5 rounded text-white text-center text-sm outline-none focus:border-[#E31C25]" />
                                    </div>
                                  </div>
                                </div>
                                <input 
                                  type="text" 
                                  placeholder="Notas técnicas (Ej: Control excéntrica)..." 
                                  value={config.exercises_config[index]?.coach_notes || ''} 
                                  onChange={(e) => updateDateExConfig(dateStr, index, 'coach_notes', e.target.value)}
                                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] p-2 rounded text-white text-xs outline-none focus:border-[#E31C25] placeholder:text-gray-600"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </form>
            </div>

            <div className="p-5 border-t border-[#2a2a2a] bg-[#1a1a1a] shrink-0">
              <button form="assign-form" type="submit" disabled={isSubmitting || !assignForm.user_id || assignForm.dates.length === 0} className={`w-full font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${isSubmitting || !assignForm.user_id || assignForm.dates.length === 0 ? 'bg-[#2a2a2a] text-gray-500 cursor-not-allowed' : 'bg-[#E31C25] text-white hover:bg-[#A6151B] shadow-[0_0_15px_rgba(227,28,37,0.3)]'}`}>
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : <CheckCircle size={20} />} 
                {assignMode === 'template' ? 'Instanciar en Atleta' : assignMode === 'superset' ? 'Guardar Superserie' : 'Confirmar Asignación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEL REPRODUCTOR DE VIDEO Y CREACIÓN DE EJERCICIOS MANTENIDOS IGUAL */}
      {previewExercise && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewExercise(null)}>
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <div>
                <h3 className="text-xl font-bold text-white">{previewExercise.name}</h3>
                <span className="text-xs font-bold text-[#E31C25] uppercase tracking-wider">{previewExercise.category}</span>
              </div>
              <button onClick={() => setPreviewExercise(null)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>
            
            <div className="aspect-video w-full bg-black">
              <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${previewExercise.video_url}?autoplay=1`} title={previewExercise.name} frameBorder="0" allowFullScreen></iframe>
            </div>

            <div className="p-6 bg-[#1a1a1a]">
              <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">Descripción e Instrucciones</h4>
              <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{previewExercise.description || "Este ejercicio no tiene instrucciones detalladas."}</p>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-200">
          <div className="bg-[#121212] w-full max-w-md h-full border-l border-[#2a2a2a] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <h2 className="text-xl font-bold text-white">{editingId ? "Editar Ejercicio" : "Nuevo Ejercicio"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <form id="exercise-form" onSubmit={handleSubmit} className="space-y-5">
                <div><label className="block text-sm font-bold text-gray-400 mb-2">Nombre del ejercicio *</label><input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                <div><label className="block text-sm font-bold text-gray-400 mb-2">Categoría *</label><select required value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none cursor-pointer">{categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                <div><label className="block text-sm font-bold text-gray-400 mb-2">ID de Video Youtube (Opcional)</label><input type="text" value={formData.video_url} onChange={(e) => setFormData({...formData, video_url: e.target.value})} placeholder="Ej: dQw4w9WgXcQ" className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none placeholder:text-gray-600" /></div>
                
                <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#2a2a2a]">
                  <label className="block text-sm font-bold text-gray-400 mb-3 flex items-center gap-2"><ImageIcon size={16} className="text-[#E31C25]"/> Imagen del Ejercicio</label>
                  
                  {formData.thumbnail_url && (
                    <div className="relative h-32 mb-4 bg-[#121212] rounded-lg border border-[#2a2a2a] overflow-hidden group">
                      <img src={formData.thumbnail_url} alt="Vista previa" className="w-full h-full object-cover opacity-80 group-hover:opacity-40 transition-opacity" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => setFormData({...formData, thumbnail_url: ""})} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 shadow-lg"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  )}

                  {!formData.thumbnail_url && (
                    <div className="flex flex-col gap-3">
                      <div className="relative">
                        <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} className="hidden" id="image-upload" />
                        <label htmlFor="image-upload" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-gray-400 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-colors">
                          {isUploadingImage ? <Loader2 className="animate-spin w-5 h-5" /> : <Upload size={18} />}
                          {isUploadingImage ? "Subiendo..." : "Subir imagen desde PC"}
                        </label>
                      </div>
                      <div className="text-center text-xs text-gray-500 font-bold uppercase my-1">O</div>
                      <input type="text" placeholder="Pega una URL de imagen aquí" value={formData.thumbnail_url} onChange={(e) => setFormData({...formData, thumbnail_url: e.target.value})} className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none placeholder:text-gray-600 text-sm" />
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Kcal</label><input type="number" step="0.1" value={formData.kcal_estimate} onChange={(e) => setFormData({...formData, kcal_estimate: parseFloat(e.target.value)})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                  <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Mins</label><input type="number" value={formData.time_estimate} onChange={(e) => setFormData({...formData, time_estimate: parseInt(e.target.value)})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                  <div><label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Descanso (s)</label><input type="number" value={formData.rest_time} onChange={(e) => setFormData({...formData, rest_time: parseInt(e.target.value)})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" /></div>
                </div>
                <div><label className="block text-sm font-bold text-gray-400 mb-2">Descripción e Instrucciones</label><textarea rows={4} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none resize-none"></textarea></div>
              </form>
            </div>
            
            <div className="p-6 border-t border-[#2a2a2a] bg-[#1a1a1a]">
              <button form="exercise-form" type="submit" disabled={isSubmitting || isUploadingImage} className="w-full bg-[#E31C25] text-white font-bold py-3 rounded-xl hover:bg-[#A6151B] transition-colors flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] disabled:opacity-50 disabled:shadow-none">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : <Save size={20} />} {editingId ? "Guardar Cambios" : "Crear Ejercicio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}