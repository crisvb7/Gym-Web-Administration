import React, { useEffect, useState } from "react";
import { Users, UserPlus, X, Mail, MoreVertical, Dumbbell, Edit2, Trash2, Calendar as CalendarIcon, Clock, KeyRound, Flame, Loader2, Shield, CalendarCheck, FileSignature, CheckCircle, RefreshCw, Search, ChevronLeft, ChevronRight, ClipboardList, Utensils } from "lucide-react";
import { supabase } from "./lib/supabase";

export function MembersPage({ onSelectMember }: { onSelectMember: (user: any) => void }) {

  // Estados para Tokens Manuales
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenAthlete, setTokenAthlete] = useState<any>(null);
  const [tokenAmount, setTokenAmount] = useState<number>(1);
  const [isSavingTokens, setIsSavingTokens] = useState(false);

  // Estados para Pagos Multimes
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAthlete, setPaymentAthlete] = useState<any>(null);
  const [monthsPaid, setMonthsPaid] = useState<number>(1);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeView, setActiveView] = useState<'clientes' | 'equipo'>('clientes');
  const [searchTerm, setSearchTerm] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWorkoutsModal, setShowWorkoutsModal] = useState(false);
  const [showKcalModal, setShowKcalModal] = useState(false);
  const [showTariffModal, setShowTariffModal] = useState(false); 
  const [showContractViewModal, setShowContractViewModal] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  const [newAtleta, setNewAtleta] = useState({ first_name: '', last_name: '', email: '', role: 'client' });
  const [editAtleta, setEditAtleta] = useState<any>(null);
  const [viewingAthlete, setViewingAthlete] = useState<any>(null);
  const [contractAthlete, setContractAthlete] = useState<any>(null);
  const [athleteWorkouts, setAthleteWorkouts] = useState<any[]>([]);
  
  // Estados para el filtro de fechas del historial de entrenamientos
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  
  // Estados para la edición rápida de entrenamientos
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editVolume, setEditVolume] = useState({ sets: '', reps: '', weight: '', note: '' });
  const [isUpdatingWorkout, setIsUpdatingWorkout] = useState(false);
  
  const [kcalAthlete, setKcalAthlete] = useState<any>(null);
  const [kcalGoal, setKcalGoal] = useState<string>('2500');
  const [isSavingKcal, setIsSavingKcal] = useState(false);

  // ESTADOS PARA TARIFA (Modificado a un array de objetos para guardar Día + Hora)
  const [tariffAthlete, setTariffAthlete] = useState<any>(null);
  const [rateDays, setRateDays] = useState<number>(0); 
  const [fixedDays, setFixedDays] = useState<any[]>([]);
  const [isSavingTariff, setIsSavingTariff] = useState(false);

  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // ESTADOS: Rutina y comidas asignadas (lo que el asistente de IA guarda en
  // workout_assignments / assigned_meals, antes no se podía ver desde ningún sitio)
  const [showAssignedPlanModal, setShowAssignedPlanModal] = useState(false);
  const [planAthlete, setPlanAthlete] = useState<any>(null);
  const [planMonth, setPlanMonth] = useState<Date>(new Date());
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planByDate, setPlanByDate] = useState<Record<string, { exercises: any[]; meals: any[] }>>({});

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) setMembers(data);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, []);

  const displayedMembers = members.filter(member => {
    // 1. Filtrado de pestañas
    const matchesView = activeView === 'clientes' 
      ? member.role === 'client' || !member.role
      : member.role === 'trainer' || member.role === 'admin';

    if (!matchesView) return false;

    // 2. Filtrado de buscador por texto
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const fullName = `${member.first_name || ''} ${member.last_name || ''}`.toLowerCase();
    const email = (member.email || '').toLowerCase();

    return fullName.includes(term) || email.includes(term);
  });

  const handleAddAtleta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', { body: { email: newAtleta.email } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const newUserId = data.user.id;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: newAtleta.first_name, last_name: newAtleta.last_name,
          full_name: `${newAtleta.first_name.toLowerCase()}${newAtleta.last_name.toLowerCase()}`,
          role: newAtleta.role, daily_kcal_goal: 2500, rate_days: 0, fixed_days: []
        })
        .eq('id', newUserId);

      if (profileError) throw profileError;
      alert(`¡Invitación enviada con éxito a ${newAtleta.email}!`);
      setShowAddModal(false);
      setNewAtleta({ first_name: '', last_name: '', email: '', role: 'client' });
      fetchMembers(); 
    } catch (err: any) { alert("Error al invitar atleta: " + err.message); }
  };

  const handleEditAtleta = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: editAtleta.first_name, last_name: editAtleta.last_name,
        full_name: `${editAtleta.first_name.toLowerCase()}${editAtleta.last_name.toLowerCase()}`,
        role: editAtleta.role
      })
      .eq('id', editAtleta.id);

    if (error) alert("Error al actualizar: " + error.message);
    else { setShowEditModal(false); fetchMembers(); }
  };

  const handleSaveTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTariff(true);

    try {
      const now = new Date().toISOString();

      if (rateDays === 0) {
        const { error: profileError } = await supabase.from('profiles').update({ rate_days: 0, fixed_days: [] }).eq('id', tariffAthlete.id);
        if (profileError) throw profileError;

        const { data: futureClasses } = await supabase.from('classes').select('id').gte('start_time', now);
        if (futureClasses && futureClasses.length > 0) {
          const classIds = futureClasses.map(c => c.id);
          await supabase.from('class_bookings').update({ status: 'CANCELLED' }).eq('user_id', tariffAthlete.id).eq('booking_type', 'FIXED').eq('status', 'ACTIVE').in('class_id', classIds);
        }
        alert(`Se ha eliminado la tarifa de ${tariffAthlete.first_name}. Se han cancelado y liberado sus clases fijas futuras.`);

      } else {
        const { error: profileError } = await supabase.from('profiles').update({ rate_days: rateDays, fixed_days: fixedDays }).eq('id', tariffAthlete.id);
        if (profileError) throw profileError;

        const { data: futureClasses, error: classesError } = await supabase
          .from('classes')
          .select('id, start_time, max_capacity, class_bookings (id, status)')
          .eq('access_type', 'TARIFF')
          .gte('start_time', now);
        
        if (classesError) throw classesError;

        const classesToBook = futureClasses?.filter(c => {
          const classDate = new Date(c.start_time);
          const classDay = classDate.getDay();
          
          const hours = String(classDate.getHours()).padStart(2, '0');
          const minutes = String(classDate.getMinutes()).padStart(2, '0');
          const classTime = `${hours}:${minutes}`;

          return fixedDays.some(d => d.day === classDay && d.time === classTime);
        }) || [];

        let successfullyBookedCount = 0;
        let forcedOverbookCount = 0; 

        if (classesToBook.length > 0) {
          const classIds = classesToBook.map(c => c.id);
          const { data: existingBookings } = await supabase.from('class_bookings').select('class_id, status, id').eq('user_id', tariffAthlete.id).in('class_id', classIds);

          const newInserts = [];
          const reactivations = [];

          for (const cls of classesToBook) {
            const existing = existingBookings?.find(b => b.class_id === cls.id);
            const activeCount = cls.class_bookings?.filter((b: any) => b.status === 'ACTIVE').length || 0;

            if (activeCount >= cls.max_capacity) forcedOverbookCount++;

            if (existing) {
              if (existing.status === 'CANCELLED') reactivations.push(existing.id);
            } else {
              newInserts.push({ class_id: cls.id, user_id: tariffAthlete.id, booking_type: 'FIXED', status: 'ACTIVE' });
            }
          }

          if (newInserts.length > 0) {
            const { error: insertError } = await supabase.from('class_bookings').insert(newInserts);
            if (!insertError) successfullyBookedCount += newInserts.length;
          }

          if (reactivations.length > 0) {
            const { error: updateError } = await supabase.from('class_bookings').update({ status: 'ACTIVE', booking_type: 'FIXED' }).in('id', reactivations);
            if (!updateError) successfullyBookedCount += reactivations.length;
          }
        }

        let finalMessage = `¡Todo listo!\nSe ha guardado la tarifa para ${tariffAthlete.first_name} y se ha inscrito en ${successfullyBookedCount} clases futuras que coinciden en día y hora exacta.`;
        if (forcedOverbookCount > 0) finalMessage += `\n\n⚠️ NOTA: Se ha forzado la plaza y superado el aforo máximo en ${forcedOverbookCount} de estas clases.`;
        alert(finalMessage);
      }

      setShowTariffModal(false);
      fetchMembers();
    } catch (error: any) { alert("Error al guardar la tarifa: " + error.message); } 
    finally { setIsSavingTariff(false); }
  };

  const toggleDay = (dayNum: number) => {
    const exists = fixedDays.some(d => d.day === dayNum);
    if (exists) {
      setFixedDays(fixedDays.filter(d => d.day !== dayNum));
    } else {
      if (fixedDays.length >= rateDays) {
        alert(`Has seleccionado una tarifa de ${rateDays} días. No puedes marcar más días en la semana.`);
        return;
      }
      setFixedDays([...fixedDays, { day: dayNum, time: "18:00" }]); 
    }
  };

  const handleUpdateTime = (dayNum: number, timeStr: string) => {
    setFixedDays(fixedDays.map(d => d.day === dayNum ? { ...d, time: timeStr } : d));
  };

  const handleSaveKcal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingKcal(true);
    const newGoal = parseInt(kcalGoal) || 2500;
    const today = new Date().toISOString().split('T')[0];

    try {
      const { data: existingHistory } = await supabase.from('calorie_goal_history').select('id').eq('user_id', kcalAthlete.id).limit(1);
      if (!existingHistory || existingHistory.length === 0) {
        await supabase.from('calorie_goal_history').insert({ user_id: kcalAthlete.id, daily_kcal_goal: kcalAthlete.daily_kcal_goal || 2500, effective_date: '2020-01-01' });
      }

      const { error: updateError } = await supabase.from('profiles').update({ daily_kcal_goal: newGoal }).eq('id', kcalAthlete.id);
      if (updateError) throw updateError;

      const { error: historyError } = await supabase.from('calorie_goal_history').insert({ user_id: kcalAthlete.id, daily_kcal_goal: newGoal, effective_date: today });
      if (historyError && historyError.code !== '42P01') throw historyError;

      setShowKcalModal(false); fetchMembers();
    } catch (error: any) { alert("Error al actualizar calorías: " + error.message); } 
    finally { setIsSavingKcal(false); }
  };

  const handleResetPassword = async () => {
    if (!editAtleta.email) return alert("Este usuario no tiene un correo registrado.");
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(editAtleta.email, { redirectTo: window.location.origin });
      if (error) throw error;
      alert(`¡Petición enviada a ${editAtleta.email}!`);
    } catch (err: any) { alert("Error al enviar el correo: " + err.message); } 
    finally { setIsResetting(false); }
  };

  const handleDeleteAtleta = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar a ${name}?`)) {
      try {
        const { error: functionError } = await supabase.functions.invoke('delete-user', { body: { userId: id } });
        if (functionError) throw new Error("Error al borrar credenciales.");
        const { error: dbError } = await supabase.from('profiles').delete().eq('id', id);
        if (dbError) throw dbError;
        alert(`Atleta eliminado.`); fetchMembers(); 
      } catch (err: any) { alert("Error al eliminar: " + err.message); }
    }
  };

  const handleViewWorkouts = async (member: any) => {
    if (!member) return;
    setViewingAthlete(member); 
    setShowWorkoutsModal(true); 
    setLoadingWorkouts(true);

    try {
      const [assignmentsResponse, logsResponse] = await Promise.all([
        supabase
          .from('workout_assignments')
          .select(`*, exercises ( name ), coach_notes`)
          .eq('user_id', member.id),
        supabase
          .from('workout_logs')
          .select(`*, exercises ( name )`)
          .eq('user_id', member.id)
      ]);

      const unifiedWorkouts: any[] = [];
      const processedLogIds = new Set();

      const assignments = assignmentsResponse.data ? [...assignmentsResponse.data] : [];
      const logs = logsResponse.data ? [...logsResponse.data] : [];

      assignments.forEach((assignment) => {
        let isCompleted = assignment.is_completed === true || assignment.is_completed === "true" || assignment.status === "COMPLETED" || assignment.status === "DONE";
        
        const matchingLog = logs.find(log => {
          if (processedLogIds.has(log.id)) return false;
          if (log.assignment_id === assignment.id || log.workout_assignment_id === assignment.id) return true;
          if (!isCompleted && log.exercise_id === assignment.exercise_id) return true;
          return false;
        });

        const targetDate = assignment.assigned_date || assignment.date || assignment.scheduled_date || assignment.created_at;

        unifiedWorkouts.push({
          ...assignment,
          source: 'assignment',
          isCompletedVisual: isCompleted || !!matchingLog,
          dateToOrder: targetDate, 
          display_sets: matchingLog?.sets || assignment.target_sets || 0,
          display_reps: matchingLog?.reps || assignment.target_reps || 0,
          display_weight: matchingLog?.weight_kg || assignment.target_weight || 0
        });
        
        if (matchingLog) processedLogIds.add(matchingLog.id);
      });

      logs.forEach((log) => {
        if (!processedLogIds.has(log.id)) {
          unifiedWorkouts.push({
            ...log,
            source: 'log',
            isCompletedVisual: true,
            dateToOrder: log.logged_at || log.date || log.created_at,
            display_sets: log.sets || log.series,
            display_reps: log.reps || log.repeticiones,
            display_weight: log.weight_kg || log.kg || log.peso
          });
        }
      });

      unifiedWorkouts.sort((a, b) => new Date(b.dateToOrder).getTime() - new Date(a.dateToOrder).getTime());
      setAthleteWorkouts(unifiedWorkouts);
    } catch (error) {
      console.error("Error al sincronizar e integrar entrenamientos:", error);
    } finally {
      setLoadingWorkouts(false);
    }
  };

  const handleUpdateWorkout = async (workout: any) => {
    setIsUpdatingWorkout(true);
    try {
      const table = workout.source === 'log' ? 'workout_logs' : 'workout_assignments';
      let updateData: any = {};

      if (table === 'workout_assignments') {
        updateData = {
          target_sets: editVolume.sets,
          target_reps: editVolume.reps,
          target_weight: editVolume.weight,
          coach_notes: editVolume.note
        };
      } else {
        updateData = {
          sets: editVolume.sets,
          reps: editVolume.reps,
          weight_kg: editVolume.weight
        };
      }

      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', workout.id);

      if (error) throw error;
      
      setEditingWorkoutId(null);
      handleViewWorkouts(viewingAthlete); 
    } catch (error: any) {
      alert("Error al modificar: " + error.message);
    } finally {
      setIsUpdatingWorkout(false);
    }
  };

  const handleDeleteWorkout = async (workout: any) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar permanentemente este registro de ejercicio?")) return;
    
    try {
      const table = workout.source === 'log' ? 'workout_logs' : 'workout_assignments';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', workout.id);

      if (error) throw error;
      
      alert("Ejercicio eliminado correctamente.");
      handleViewWorkouts(viewingAthlete);
    } catch (error: any) {
      alert("Error al eliminar el ejercicio: " + error.message);
    }
  };

  const formatWorkoutDate = (dateString: string) => {
    if (!dateString) return "-";
    if (dateString.length >= 10 && dateString.includes('-') && !dateString.includes('T')) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    try {
      return new Date(dateString).toLocaleDateString('es-ES');
    } catch (e) {
      return dateString;
    }
  };

  const filteredWorkouts = athleteWorkouts.filter(workout => {
    if (!filterStartDate && !filterEndDate) return true;
    
    const cleanWorkoutDate = typeof workout.dateToOrder === 'string' 
      ? workout.dateToOrder.split('T')[0] 
      : new Date(workout.dateToOrder).toISOString().split('T')[0];
      
    if (filterStartDate && cleanWorkoutDate < filterStartDate) return false;
    if (filterEndDate && cleanWorkoutDate > filterEndDate) return false;
    
    return true;
  });

  const handleAddTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTokens(true);
    try {
      const newTotal = (tokenAthlete.recovery_tokens || 0) + tokenAmount;
      const { error } = await supabase
        .from('profiles')
        .update({ recovery_tokens: newTotal })
        .eq('id', tokenAthlete.id);

      if (error) throw error;
      alert(`Se han añadido ${tokenAmount} tokens a ${tokenAthlete.first_name}.`);
      setShowTokenModal(false);
      fetchMembers();
    } catch (error: any) {
      alert("Error al añadir tokens: " + error.message);
    } finally {
      setIsSavingTokens(false);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPayment(true);
    try {
      const currentDate = new Date();
      const baseDate = (paymentAthlete.paid_until && new Date(paymentAthlete.paid_until) > currentDate) 
        ? new Date(paymentAthlete.paid_until) 
        : currentDate;
      
      baseDate.setMonth(baseDate.getMonth() + monthsPaid);
      
      const { error } = await supabase
        .from('profiles')
        .update({ 
          paid_until: baseDate.toISOString(),
          payment_status: 'paid',
          is_frozen: false
        })
        .eq('id', paymentAthlete.id);
      
      if (error) throw error;
      alert(`Pago registrado. Cuenta activa hasta: ${baseDate.toLocaleDateString()}`);
      setShowPaymentModal(false);
      fetchMembers();
    } catch (error: any) {
      alert("Error al registrar pago: " + error.message);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Rutina de ejercicios y plan de comidas ya ASIGNADOS a un atleta (workout_assignments /
  // assigned_meals), agrupados por día, para el mes seleccionado.
  const fetchAssignedPlan = async (member: any, month: Date) => {
    setLoadingPlan(true);
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const from = new Date(year, monthIndex, 1).toISOString().split('T')[0];
    const to = new Date(year, monthIndex + 1, 0).toISOString().split('T')[0];

    const [{ data: workouts }, { data: meals }] = await Promise.all([
      supabase.from('workout_assignments')
        .select('assigned_date, target_sets, target_reps, target_weight, exercises ( name )')
        .eq('user_id', member.id).gte('assigned_date', from).lte('assigned_date', to)
        .order('assigned_date'),
      supabase.from('assigned_meals')
        .select('assigned_date, meal_type, recipes ( name )')
        .eq('user_id', member.id).gte('assigned_date', from).lte('assigned_date', to)
        .order('assigned_date'),
    ]);

    const grouped: Record<string, { exercises: any[]; meals: any[] }> = {};
    (workouts || []).forEach((w: any) => {
      if (!grouped[w.assigned_date]) grouped[w.assigned_date] = { exercises: [], meals: [] };
      grouped[w.assigned_date].exercises.push(w);
    });
    (meals || []).forEach((m: any) => {
      if (!grouped[m.assigned_date]) grouped[m.assigned_date] = { exercises: [], meals: [] };
      grouped[m.assigned_date].meals.push(m);
    });

    setPlanByDate(grouped);
    setLoadingPlan(false);
  };

  const handleViewAssignedPlan = (member: any) => {
    const now = new Date();
    setPlanAthlete(member);
    setPlanMonth(now);
    setShowAssignedPlanModal(true);
    fetchAssignedPlan(member, now);
  };

  const changePlanMonth = (delta: number) => {
    const newMonth = new Date(planMonth.getFullYear(), planMonth.getMonth() + delta, 1);
    setPlanMonth(newMonth);
    if (planAthlete) fetchAssignedPlan(planAthlete, newMonth);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Directorio</h1>
          <p className="text-gray-400 mt-1">Gestión de base de datos de usuarios</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-[#E31C25] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.2)] hover:shadow-[0_0_20px_rgba(227,28,37,0.4)] shrink-0"
        >
          <UserPlus className="w-5 h-5" /> Nuevo Registro
        </button>
      </div>

      <div className="flex gap-2 border-b border-[#2a2a2a] pb-px">
        <button onClick={() => { setActiveView('clientes'); setSearchTerm(""); }} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'clientes' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <Users className="w-4 h-4" /> Atletas
          <span className="ml-2 bg-[#2a2a2a] text-xs px-2 py-0.5 rounded-full text-white">{members.filter(m => m.role === 'client' || !m.role).length}</span>
        </button>
        <button onClick={() => { setActiveView('equipo'); setSearchTerm(""); }} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'equipo' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <Shield className="w-4 h-4" /> Equipo Técnico
          <span className="ml-2 bg-[#2a2a2a] text-xs px-2 py-0.5 rounded-full text-white">{members.filter(m => m.role === 'trainer' || m.role === 'admin').length}</span>
        </button>
      </div>

      {/* COMPONENTE DE BÚSQUEDA DINÁMICA */}
      <div className="relative mt-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por nombre, apellidos o correo electrónico..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#121212] border border-[#2a2a2a] text-white rounded-xl py-3 pl-12 pr-10 text-sm focus:border-[#E31C25] outline-none transition-colors placeholder:text-gray-500"
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm("")} 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-xl overflow-x-auto lg:overflow-visible min-h-[250px]">
        <table className="w-full text-left min-w-full">
          <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-500 text-xs uppercase font-bold tracking-wider">
            <tr>
              <th className="p-3 md:p-5">Usuario</th>
              <th className="p-3 md:p-5">Tarifa</th>
              <th className="p-3 md:p-5">Rol</th>
              <th className="p-3 md:p-5 text-right">Gestión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {loading ? (
              <tr><td colSpan={4} className="p-12 text-center text-[#E31C25] animate-pulse font-bold">Cargando base de datos...</td></tr>
            ) : displayedMembers.length === 0 ? (
              <tr><td colSpan={4} className="p-12 text-center text-gray-500">No hay usuarios registrados en esta categoría.</td></tr>
            ) : displayedMembers.map((member, index) => (
              <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="p-3 md:p-5 flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-[#121212] rounded-xl flex items-center justify-center text-[#E31C25] font-bold border border-[#2a2a2a] shadow-sm group-hover:border-[#E31C25]/30 transition-colors relative">
                    {member.first_name?.[0] || 'U'}
                    {member.contract_accepted && (
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-0.5 shadow-lg" title="Contrato Firmado">
                        <CheckCircle size={10} className="text-black" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm md:text-base truncate">{member.first_name} {member.last_name}</p>
                    <p className="text-xs md:text-sm text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[100px] sm:max-w-[200px] md:max-w-none" title={member.email}>{member.email || 'Sin email'}</span>
                    </p>
                  </div>
                </td>

                <td className="p-3 md:p-5 whitespace-nowrap">
                  {(!member.role || member.role === 'client') ? (
                    member.rate_days > 0 ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-white font-bold text-sm">{member.rate_days} días / sem</span>
                        <span className="text-xs text-gray-500">Tokens: {member.recovery_tokens || 0}</span>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm italic">Sin tarifa</span>
                    )
                  ) : (
                    <span className="text-gray-600 text-sm">-</span>
                  )}
                </td>
                
                <td className="p-3 md:p-5 whitespace-nowrap">
                  <span className={`px-2 py-1 md:px-3 md:py-1 text-[10px] md:text-xs font-bold uppercase rounded-lg border ${
                    member.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : member.role === 'trainer' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {member.role || 'Cliente'}
                  </span>
                </td>
                
                <td className="p-3 md:p-5 text-right relative whitespace-nowrap">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === member.id ? null : member.id); }}
                    className="p-1.5 md:p-2 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded-xl transition-colors"
                  >
                    <MoreVertical size={20} />
                  </button>

                  {openDropdownId === member.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)}></div>
                      <div className={`absolute right-4 md:right-8 ${index >= displayedMembers.length - 2 && displayedMembers.length > 2 ? 'bottom-8 md:bottom-10 mb-2 slide-in-from-bottom-2' : 'top-10 md:top-12 slide-in-from-top-2'} w-48 md:w-56 bg-[#121212] border border-[#2a2a2a] rounded-xl shadow-2xl z-[9999] overflow-hidden text-left animate-in fade-in duration-200`}>
                        
                        {(member.role === 'client' || !member.role) && (
                          <>
                            {member.contract_accepted && (
                              <button 
                                onClick={() => { setContractAthlete(member); setShowContractViewModal(true); setOpenDropdownId(null); }}
                                className="w-full px-4 py-3 text-sm text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-3 transition-colors font-bold"
                              >
                                <FileSignature size={16} /> Ver Contrato
                              </button>
                            )}

                            <button 
                              onClick={() => { 
                                setTariffAthlete(member); 
                                setRateDays(member.rate_days || 0); 
                                const rawFixedDays = member.fixed_days || [];
                                const mappedFixedDays = rawFixedDays.map((d: any) => {
                                  if (typeof d === 'number') return { day: d, time: '18:00' };
                                  return d;
                                });
                                
                                setFixedDays(mappedFixedDays);
                                setShowTariffModal(true); 
                                setOpenDropdownId(null); 
                              }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-[#E31C25] hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors font-bold border-t border-[#2a2a2a]"
                            >
                              <CalendarCheck size={16} /> Gestión de Tarifa
                            </button>

                            <button 
                              onClick={() => { setKcalAthlete(member); setKcalGoal(member.daily_kcal_goal ? String(member.daily_kcal_goal) : '2500'); setShowKcalModal(true); setOpenDropdownId(null); }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                            >
                              <Flame size={16} /> Plan Nutricional
                            </button>

                            <button 
                              onClick={() => { setTokenAthlete(member); setTokenAmount(1); setShowTokenModal(true); setOpenDropdownId(null); }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                            >
                              <RefreshCw size={16} /> Añadir Tokens Extra
                            </button>

                            <button 
                              onClick={() => { setPaymentAthlete(member); setMonthsPaid(1); setShowPaymentModal(true); setOpenDropdownId(null); }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                            >
                              <CalendarIcon size={16} /> Registrar Pago
                            </button>
                            
                            <button
                              onClick={() => { handleViewWorkouts(member); setOpenDropdownId(null); }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                            >
                              <Dumbbell size={16} /> Historial Entrenos
                            </button>

                            <button
                              onClick={() => { handleViewAssignedPlan(member); setOpenDropdownId(null); }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                            >
                              <ClipboardList size={16} /> Rutina y Comidas Asignadas
                            </button>

                            <div className="h-px bg-[#2a2a2a] w-full my-1"></div>
                          </>
                        )}
                        
                        <button 
                          onClick={() => { setEditAtleta(member); setShowEditModal(true); setOpenDropdownId(null); }}
                          className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                        >
                          <Edit2 size={16} /> Editar Cuenta
                        </button>
                        <div className="h-px bg-[#2a2a2a] w-full my-1"></div>
                        <button 
                          onClick={() => { handleDeleteAtleta(member.id, member.first_name); setOpenDropdownId(null); }}
                          className="w-full px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-3 transition-colors font-bold"
                        >
                          <Trash2 size={16} /> Borrar Acceso
                        </button>
                        
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODALES --- */}

      {/* MODAL DE NUEVO REGISTRO */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserPlus className="text-[#E31C25]" /> Nuevo Registro
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-lg border border-[#2a2a2a]">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddAtleta} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={newAtleta.first_name}
                  onChange={(e) => setNewAtleta({...newAtleta, first_name: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Apellidos</label>
                <input
                  type="text"
                  required
                  value={newAtleta.last_name}
                  onChange={(e) => setNewAtleta({...newAtleta, last_name: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newAtleta.email}
                  onChange={(e) => setNewAtleta({...newAtleta, email: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Rol de Acceso</label>
                <select
                  value={newAtleta.role}
                  onChange={(e) => setNewAtleta({...newAtleta, role: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                >
                  <option value="client">Atleta (Cliente)</option>
                  <option value="trainer">Entrenador (Equipo)</option>
                  <option value="admin">Administrador (Equipo)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-[#E31C25] text-white py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-colors mt-2"
              >
                Enviar Invitación
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VISOR DE CONTRATO FIRMADO */}
      {showContractViewModal && contractAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-2xl h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            
            <div className="p-6 bg-[#121212] border-b border-[#2a2a2a] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <FileSignature className="text-emerald-500" size={24} />
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">Contrato de Conformidad</h2>
                  <p className="text-sm text-gray-400">Atleta: {contractAthlete.first_name} {contractAthlete.last_name}</p>
                </div>
              </div>
              <button onClick={() => setShowContractViewModal(false)} className="text-gray-500 hover:text-white bg-[#1a1a1a] p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="prose prose-invert max-w-none">
                <h3 className="text-white font-bold text-xl mb-6 text-center">Normativa del Centro Daniel Miranda | En Movimiento</h3>
                
                <p className="text-gray-300 mb-6 leading-relaxed text-justify">
                  El usuario <strong>{contractAthlete.first_name} {contractAthlete.last_name}</strong> (con correo electrónico {contractAthlete.email}) declara haber leído, comprendido y aceptado las siguientes conditions para la utilización de las instalaciones y de la aplicación móvil del centro.
                </p>

                <div className="space-y-6 text-gray-300 text-sm leading-relaxed text-justify">
                  <div>
                    <h4 className="text-white font-bold text-base mb-2">1. Normas generales de asistencia:</h4>
                    <p>• El cliente se compromete a asistir puntualmente a las sesiones contratadas. Se establece un margen máximo de 10 minutos desde el inicio de la clase para incorporarse a la misma.</p>
                    <p>• Las clases deberán cancelarse con una antelación mínima de 4 horas respecto al inicio de la sesión programada.</p>
                    <p>• En caso de no asistencia a la clase, la reserva debe cancelarse. Si el usuario acumula inasistencias reiteradas sin haber efectuado la cancelación previa, el sistema se reserva el derecho de bloquear temporalmente sus futuras reservas para asegurar el correcto flujo de aforo.</p>
                    <p>• El cliente acepta expresamente el número de sesiones mensuales asociadas a cada tarifa contratada: 8 clases mensuales para la tarifa de 2 días por semana; 12 clases mensuales para la tarifa de 3 días por semana; 16 clases mensuales para la tarifa de 4 días por semana; y 20 clases mensuales para la tarifa de 5 días por semana.</p>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base mb-2">2. Condiciones de pago y fianza:</h4>
                    <p>Los pagos deberán realizarse antes del día 5 de cada mes. En caso de impago o retraso en el abono de la cuota correspondiente, el día 6 la aplicación de reservas quedará temporalmente congelada hasta que se regularice la situación.</p>
                    <p>Asimismo, el cliente deberá abonar una fianza de 50 euros en el momento de formalizar su inscripción en el centro. Dicha fianza será devuelta siempre que el cliente comunique su decisión de abandonar el centro antes del día 20 del mes en curso. En caso de no realizar dicha comunicación dentro del plazo establecido, el centro podrá retener la fianza.</p>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base mb-2">3. Exención de responsabilidad:</h4>
                    <p>El usuario declara de forma expresa encontrarse en condiciones físicas óptimas para la práctica deportiva y asume la total responsabilidad de cualquier lesión, accident o percance de salud derivado del mal uso de las instalaciones, eximiendo a Daniel Miranda y a su equipo de cualquier responsabilidad legal.</p>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base mb-2">4. Protección de datos personales:</h4>
                    <p>De conformidad con la normativa vigente en materia de protección de datos, el cliente autoriza al centro a tratar sus datos personales exclusivamente con fines administrativos, organizativos y relacionados con la prestación del servicio contratado. Los datos no serán cedidos a terceros salvo obligación legal.</p>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base mb-2">5. Autorización de uso de imágenes:</h4>
                    <p>El cliente autoriza al centro a captar y utilizar fotografías y/o vídeos realizados durante las actividades y entrenamientos con fines promocionales y de comunicación en redes sociales, página web o materiales corporativos del centro. En caso de no autorizar dicho uso, deberá comunicarlo expresamente por escrito.</p>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base mb-2">6. Declaración de conformidad:</h4>
                    <p>Mediante la firma del presente documento, el cliente declara haber leído, comprendido y aceptado todas las normas, condiciones y políticas del centro de entrenamiento personal.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-[#0f172a]/50 border-t border-slate-800 shrink-0">
              <div className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle className="text-emerald-500" size={20} />
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-sm uppercase tracking-wider">Firma Digital Registrada</p>
                  <p className="text-gray-400 text-sm mt-0.5">
                    Aceptado electrónicamente el: <span className="text-white font-medium">
                      {contractAthlete.contract_accepted_at ? new Date(contractAthlete.contract_accepted_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'medium' }) : 'Fecha no registrada'}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">ID de Usuario: {contractAthlete.id}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
      
      {/* GESTIÓN DE TARIFA (MODIFICADO CON SELECCIÓN DE HORA INDIVIDUAL) */}
      {showTariffModal && tariffAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CalendarCheck className="text-[#E31C25]" /> Configurar Tarifa
              </h2>
              <button onClick={() => setShowTariffModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-full"><X size={20} /></button>
            </div>
            
            <p className="text-gray-400 text-sm mb-6">Configura los días fijos y las horas de las clases para <span className="text-white font-bold">{tariffAthlete.first_name}</span>. Al guardar, se le inscribirá automáticamente solo en las clases que coincidan en día y hora exacta.</p>
            
            <form onSubmit={handleSaveTariff} className="space-y-5">
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Días por Semana</label>
                <select
                  value={rateDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setRateDays(val);
                    setFixedDays([]); 
                  }}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                >
                  <option value={0}>Sin Tarifa (Cancelar clases fijas)</option>
                  <option value={1}>1 Día a la semana</option>
                  <option value={2}>2 Días a la semana</option>
                  <option value={3}>3 Días a la semana</option>
                  <option value={4}>4 Días a la semana</option>
                  <option value={5}>5 Días a la semana</option>
                  <option value={6}>6 Días a la semana</option>
                  <option value={7}>7 Días a la semana</option>
                </select>
              </div>

              {rateDays > 0 && (
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                  <label className="text-xs text-gray-400 font-bold uppercase block mb-1">
                    Selecciona los días fijos ({fixedDays.length}/{rateDays}) y su hora
                  </label>
                  {[
                    { num: 1, label: 'Lunes' },
                    { num: 2, label: 'Martes' },
                    { num: 3, label: 'Miércoles' },
                    { num: 4, label: 'Jueves' },
                    { num: 5, label: 'Viernes' },
                    { num: 6, label: 'Sábado' },
                    { num: 0, label: 'Domingo' }
                  ].map((d) => {
                    const foundConfig = fixedDays.find(fd => fd.day === d.num);
                    const isSelected = !!foundConfig;
                    return (
                      <div 
                        key={d.num}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          isSelected 
                            ? 'bg-[#E31C25]/5 border-[#E31C25]/40' 
                            : 'bg-[#121212] border-[#2a2a2a] opacity-60 hover:opacity-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDay(d.num)}
                          className="flex items-center gap-2.5 text-left flex-1"
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                            isSelected ? 'bg-[#E31C25] border-[#E31C25] text-white' : 'border-gray-600 bg-transparent'
                          }`}>
                            {isSelected && <span className="text-[10px] font-bold">✓</span>}
                          </div>
                          <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                            {d.label}
                          </span>
                        </button>

                        {isSelected && (
                          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-150">
                            <span className="text-[10px] text-gray-500 font-medium">Hora:</span>
                            <input
                              type="time"
                              required
                              value={foundConfig.time}
                              onChange={(e) => handleUpdateTime(d.num, e.target.value)}
                              className="bg-[#121212] border border-[#3a3a3a] p-1 rounded text-white text-center text-xs font-bold outline-none focus:border-[#E31C25] [color-scheme:dark]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingTariff || (rateDays > 0 && fixedDays.length !== rateDays)}
                className="w-full bg-[#E31C25] text-white py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {isSavingTariff && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar Configuración
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PLAN NUTRICIONAL */}
      {showKcalModal && kcalAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Flame className="text-orange-500" /> Objetivo Calórico
              </h2>
              <button onClick={() => setShowKcalModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-lg border border-[#2a2a2a]">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveKcal} className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-4">Ajusta las calorías diarias recomendadas para <span className="text-white font-bold">{kcalAthlete.first_name}</span>.</p>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Kcal Diarias</label>
                <input
                  type="number"
                  required
                  value={kcalGoal}
                  onChange={(e) => setKcalGoal(e.target.value)}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingKcal}
                className="w-full bg-[#E31C25] text-white py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {isSavingKcal && <Loader2 className="w-4 h-4 animate-spin" />}
                Actualizar Objetivo
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR CUENTA */}
      {showEditModal && editAtleta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Edit2 className="text-[#E31C25]" size={20} /> Editar Cuenta
              </h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-lg border border-[#2a2a2a]">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditAtleta} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={editAtleta.first_name || ''}
                  onChange={(e) => setEditAtleta({...editAtleta, first_name: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Apellidos</label>
                <input
                  type="text"
                  required
                  value={editAtleta.last_name || ''}
                  onChange={(e) => setEditAtleta({...editAtleta, last_name: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase block mb-1">Rol de Acceso</label>
                <select
                  value={editAtleta.role || 'client'}
                  onChange={(e) => setEditAtleta({...editAtleta, role: e.target.value})}
                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm focus:border-[#E31C25] outline-none"
                >
                  <option value="client">Atleta (Cliente)</option>
                  <option value="trainer">Entrenador (Equipo)</option>
                  <option value="admin">Administrador (Equipo)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#2a2a2a] flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="w-full bg-zinc-800 text-gray-300 py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound size={14} />
                  {isResetting ? "Enviando..." : "Enviar restablecimiento de contraseña"}
                </button>

                <button
                  type="submit"
                  className="w-full bg-[#E31C25] text-white py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-colors mt-2"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL DE ENTRENAMIENTOS CON FILTROS DE TEXTO Y BOTÓN RESTABLECER */}
      {showWorkoutsModal && viewingAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-2xl h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            
            <div className="p-6 bg-[#121212] border-b border-[#2a2a2a] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <Dumbbell className="text-[#E31C25]" size={24} />
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">Historial de Entrenamientos</h2>
                  <p className="text-sm text-gray-400">Atleta: {viewingAthlete.first_name} {viewingAthlete.last_name}</p>
                </div>
              </div>
              <button onClick={() => setShowWorkoutsModal(false)} className="text-gray-500 hover:text-white bg-[#1a1a1a] p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-[#141414] border-b border-[#2a2a2a] flex flex-col sm:flex-row items-end gap-3 shrink-0">
              <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase ml-1 block mb-1">Desde</label>
                  <input 
                    type="date" 
                    value={filterStartDate} 
                    onChange={(e) => setFilterStartDate(e.target.value)} 
                    className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#E31C25]" 
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase ml-1 block mb-1">Hasta</label>
                  <input 
                    type="date" 
                    value={filterEndDate} 
                    onChange={(e) => setFilterEndDate(e.target.value)} 
                    className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#E31C25]" 
                  />
                </div>
              </div>
              
              {(filterStartDate || filterEndDate) && (
                <button
                  type="button"
                  onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 h-[36px] w-full sm:w-auto border border-[#333] hover:border-gray-500 shrink-0"
                >
                  <RefreshCw size={12} /> Limpiar
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingWorkouts ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#E31C25]" />
                  <p>Sincronizando entrenamientos...</p>
                </div>
              ) : filteredWorkouts.length === 0 ? (
                <div className="text-center py-12 text-gray-500 h-full flex flex-col items-center justify-center">
                  <Dumbbell className="w-12 h-12 mb-3 opacity-20" />
                  <p>No hay entrenamientos para este rango de días o asignaciones.</p>
                </div>
              ) : (
                filteredWorkouts.map((workout, idx) => {
                  const isCompleted = workout.isCompletedVisual;
                  
                  return (
                    <div key={workout.id || idx} className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-white font-bold">{workout.exercises?.name || 'Ejercicio sin nombre'}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${workout.source === 'log' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                            {workout.source === 'log' ? 'Autónomo' : 'Planificado'}
                          </span>
                        </div>

                        {editingWorkoutId === workout.id ? (
                          <div className="flex flex-col gap-3 bg-[#1a1a1a] p-3 rounded-lg border border-[#E31C25]/50 mt-2 w-full max-w-sm">
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">Sets</label>
                                <input type="text" value={editVolume.sets} onChange={(e) => setEditVolume({...editVolume, sets: e.target.value})} className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-[#E31C25]" />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">Reps</label>
                                <input type="text" value={editVolume.reps} onChange={(e) => setEditVolume({...editVolume, reps: e.target.value})} className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-[#E31C25]" />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">Peso</label>
                                <input type="text" value={editVolume.weight} onChange={(e) => setEditVolume({...editVolume, weight: e.target.value})} className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-[#E31C25]" />
                              </div>
                            </div>

                            {workout.source === 'assignment' && (
                              <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase ml-1">Notas del Coach</label>
                                <textarea 
                                  value={editVolume.note || ''} 
                                  onChange={(e) => setEditVolume({...editVolume, note: e.target.value})}
                                  className="w-full bg-[#121212] text-white border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-[#E31C25] mt-1"
                                  rows={2}
                                />
                              </div>
                            )}

                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setEditingWorkoutId(null)} className="px-3 py-1 text-xs text-gray-400 hover:text-white">Cancelar</button>
                              <button type="button" onClick={() => handleUpdateWorkout(workout)} disabled={isUpdatingWorkout} className="px-3 py-1 text-xs bg-[#E31C25] text-white font-bold rounded-md hover:bg-[#A6151B] disabled:opacity-50 flex items-center gap-1.5">
                                {isUpdatingWorkout && <Loader2 size={12} className="animate-spin" />}
                                Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 mt-2">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-4 text-xs text-gray-400 bg-[#171717] px-3 py-1.5 rounded-lg border border-[#222] w-fit">
                                <span>Sets: <b className="text-white">{workout.display_sets || 0}</b></span>
                                <span>Reps: <b className="text-white">{workout.display_reps || 0}</b></span>
                                <span>Peso: <b className="text-white">{workout.display_weight || 0} kg</b></span>
                              </div>
                              
                              <button 
                                type="button"
                                onClick={() => {
                                  setEditingWorkoutId(workout.id);
                                  setEditVolume({
                                    sets: workout.display_sets?.toString() || '',
                                    reps: workout.display_reps?.toString() || '',
                                    weight: workout.display_weight?.toString() || '',
                                    note: workout.coach_notes || ''
                                  });
                                }}
                                className="p-1.5 text-gray-500 hover:text-[#E31C25] bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#E31C25]/30 rounded-lg transition-all"
                                title="Editar pesos/repeticiones"
                              >
                                <Edit2 size={13} />
                              </button>

                              <button 
                                type="button"
                                onClick={() => handleDeleteWorkout(workout)}
                                className="p-1.5 text-gray-500 hover:text-red-500 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg transition-all"
                                title="Eliminar este ejercicio"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            
                            {workout.coach_notes && (
                              <p className="text-[11px] text-[#E31C25] bg-[#E31C25]/5 border border-[#E31C25]/10 px-2 py-1 rounded w-fit italic">
                                Nota: {workout.coach_notes}
                              </p>
                            )}
                          </div>
                        )}

                        <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                          <CalendarIcon size={11} /> {formatWorkoutDate(workout.dateToOrder)}
                        </p>
                      </div>
                      
                      <div className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0 self-start sm:self-center ${isCompleted ? 'text-emerald-400 bg-emerald-400/10' : 'text-yellow-500 bg-yellow-500/10'}`}>
                        {isCompleted ? 'Completado' : 'Pendiente'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>
      )}

      {/*Modal para Añadir Tokens Manualmente */}
      {showTokenModal && tokenAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#2a2a2a] flex justify-between items-center">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <RefreshCw className="text-[#E31C25]" size={20} /> Añadir Tokens
              </h3>
              <button onClick={() => setShowTokenModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddTokens} className="p-6">
              <p className="text-gray-400 text-sm mb-4">
                Vas a añadir tokens a la cuenta de <span className="text-white font-bold">{tokenAthlete.first_name}</span>.
              </p>
              <div className="mb-6">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">
                  Cantidad de tokens
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(parseInt(e.target.value) || 1)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowTokenModal(false)} className="flex-1 bg-transparent border border-[#2a2a2a] text-white py-3 rounded-xl font-bold hover:bg-[#1a1a1a] transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingTokens} className="flex-1 bg-[#E31C25] text-white py-3 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {isSavingTokens ? 'Guardando...' : 'Añadir Tokens'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Registrar Pago Multimes */}
      {showPaymentModal && paymentAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-[#2a2a2a] flex justify-between items-center">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <CalendarIcon className="text-[#E31C25]" size={20} /> Registrar Pago
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRegisterPayment} className="p-6">
              <p className="text-gray-400 text-sm mb-4">
                Registrando nuevo pago para <span className="text-white font-bold">{paymentAthlete.first_name}</span>.
              </p>
              <div className="mb-6">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">
                  Meses a sumar
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={monthsPaid}
                  onChange={(e) => setMonthsPaid(parseInt(e.target.value) || 1)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 bg-transparent border border-[#2a2a2a] text-white py-3 rounded-xl font-bold hover:bg-[#1a1a1a] transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingPayment} className="flex-1 bg-[#E31C25] text-white py-3 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {isSavingPayment ? 'Guardando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rutina y Comidas Asignadas (workout_assignments / assigned_meals) */}
      {showAssignedPlanModal && planAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex justify-end">
          <div className="bg-[#1a1a1a] border-l border-[#2a2a2a] w-full max-w-xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="p-6 bg-[#121212] border-b border-[#2a2a2a] flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-bold text-white">Rutina y Comidas Asignadas</h2>
                <p className="text-[#E31C25] text-sm mt-1">{planAthlete.first_name} {planAthlete.last_name}</p>
              </div>
              <button onClick={() => setShowAssignedPlanModal(false)} className="text-gray-400 hover:text-white bg-[#1a1a1a] p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] shrink-0">
              <button onClick={() => changePlanMonth(-1)} className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors"><ChevronLeft size={20} /></button>
              <span className="font-bold text-white capitalize">{planMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => changePlanMonth(1)} className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors"><ChevronRight size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {loadingPlan ? (
                <p className="text-gray-500 text-center py-10">Cargando...</p>
              ) : Object.keys(planByDate).length === 0 ? (
                <div className="text-center py-16">
                  <ClipboardList className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500">Sin rutina ni comidas asignadas este mes.</p>
                </div>
              ) : (
                Object.entries(planByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, day]) => (
                    <div key={date} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4">
                      <p className="text-sm font-bold text-white mb-3 capitalize">
                        {new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>

                      {day.exercises.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                            <Dumbbell size={12} className="text-[#E31C25]" /> Ejercicios
                          </p>
                          <ul className="space-y-1">
                            {day.exercises.map((ex: any, i: number) => (
                              <li key={i} className="text-sm text-gray-300">
                                {ex.exercises?.name || 'Ejercicio'} — {ex.target_sets}x{ex.target_reps}
                                {ex.target_weight ? ` @ ${ex.target_weight}kg` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {day.meals.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                            <Utensils size={12} className="text-[#E31C25]" /> Comidas
                          </p>
                          <ul className="space-y-1">
                            {day.meals.map((m: any, i: number) => (
                              <li key={i} className="text-sm text-gray-300">
                                <span className="text-gray-500">{m.meal_type}:</span> {m.recipes?.name || 'Plato'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}