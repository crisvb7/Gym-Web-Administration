import React, { useEffect, useState } from "react";
import { Users, Apple, UserPlus, X, Mail, MoreVertical, Dumbbell, Edit2, Trash2, Calendar as CalendarIcon, Clock, KeyRound, Flame, Loader2, Shield, CalendarCheck } from "lucide-react";
import { supabase } from "./lib/supabase";

export function MembersPage({ onSelectMember }: { onSelectMember: (user: any) => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeView, setActiveView] = useState<'clientes' | 'equipo'>('clientes');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWorkoutsModal, setShowWorkoutsModal] = useState(false);
  const [showKcalModal, setShowKcalModal] = useState(false);
  const [showTariffModal, setShowTariffModal] = useState(false); 
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  const [newAtleta, setNewAtleta] = useState({ first_name: '', last_name: '', email: '', role: 'client' });
  const [editAtleta, setEditAtleta] = useState<any>(null);
  const [viewingAthlete, setViewingAthlete] = useState<any>(null);
  const [athleteWorkouts, setAthleteWorkouts] = useState<any[]>([]);
  
  const [kcalAthlete, setKcalAthlete] = useState<any>(null);
  const [kcalGoal, setKcalGoal] = useState<string>('2500');
  const [isSavingKcal, setIsSavingKcal] = useState(false);

  // ESTADOS PARA TARIFA
  const [tariffAthlete, setTariffAthlete] = useState<any>(null);
  const [rateDays, setRateDays] = useState<number>(0); // Ahora empieza en 0
  const [fixedDays, setFixedDays] = useState<number[]>([]);
  const [isSavingTariff, setIsSavingTariff] = useState(false);

  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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
    if (activeView === 'clientes') return member.role === 'client' || !member.role;
    return member.role === 'trainer' || member.role === 'admin';
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

  // --- LÓGICA: GUARDAR TARIFA E INSCRIBIR/CANCELAR MASIVAMENTE ---
  const handleSaveTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTariff(true);

    try {
      const now = new Date().toISOString();

      if (rateDays === 0) {
        // --- 1. LÓGICA DE QUITAR TARIFA (CANCELAR) ---
        // Actualizamos el perfil
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ rate_days: 0, fixed_days: [] })
          .eq('id', tariffAthlete.id);
        if (profileError) throw profileError;

        // Buscamos todas las clases futuras para cancelar sus reservas fijas
        const { data: futureClasses } = await supabase
          .from('classes')
          .select('id')
          .gte('start_time', now);

        if (futureClasses && futureClasses.length > 0) {
          const classIds = futureClasses.map(c => c.id);
          // Cancelamos todas sus reservas de tipo FIXED en el futuro
          await supabase
            .from('class_bookings')
            .update({ status: 'CANCELLED' })
            .eq('user_id', tariffAthlete.id)
            .eq('booking_type', 'FIXED')
            .eq('status', 'ACTIVE')
            .in('class_id', classIds);
        }

        alert(`Se ha eliminado la tarifa de ${tariffAthlete.first_name}. Se han cancelado y liberado sus clases fijas futuras.`);

      } else {
        // --- 2. LÓGICA DE ASIGNAR TARIFA (INSCRIBIR) ---
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ rate_days: rateDays, fixed_days: fixedDays })
          .eq('id', tariffAthlete.id);
        
        if (profileError) throw profileError;

        const { data: futureClasses, error: classesError } = await supabase
          .from('classes')
          .select('id, start_time, max_capacity')
          .eq('access_type', 'TARIFF')
          .gte('start_time', now);
        
        if (classesError) throw classesError;

        const classesToBook = futureClasses?.filter(c => {
          const classDay = new Date(c.start_time).getDay();
          return fixedDays.includes(classDay);
        }) || [];

        let successfullyBookedCount = 0;

        if (classesToBook.length > 0) {
          const classIds = classesToBook.map(c => c.id);
          const { data: existingBookings } = await supabase
            .from('class_bookings')
            .select('class_id, status, id')
            .eq('user_id', tariffAthlete.id)
            .in('class_id', classIds);

          const newInserts = [];
          const reactivations = [];

          for (const cls of classesToBook) {
            const existing = existingBookings?.find(b => b.class_id === cls.id);
            if (existing) {
              if (existing.status === 'CANCELLED') reactivations.push(existing.id);
            } else {
              newInserts.push({
                class_id: cls.id,
                user_id: tariffAthlete.id,
                booking_type: 'FIXED',
                status: 'ACTIVE'
              });
            }
          }

          if (newInserts.length > 0) {
            const { error: insertError } = await supabase.from('class_bookings').insert(newInserts);
            if (!insertError) successfullyBookedCount += newInserts.length;
          }

          if (reactivations.length > 0) {
            const { error: updateError } = await supabase
              .from('class_bookings')
              .update({ status: 'ACTIVE', booking_type: 'FIXED' })
              .in('id', reactivations);
            if (!updateError) successfullyBookedCount += reactivations.length;
          }
        }

        alert(`Tarifa asignada correctamente.\nSe ha inscrito automáticamente a ${tariffAthlete.first_name} en ${successfullyBookedCount} clases fijas a futuro.`);
      }

      setShowTariffModal(false);
      fetchMembers();

    } catch (error: any) {
      alert("Error al guardar la tarifa: " + error.message);
    } finally {
      setIsSavingTariff(false);
    }
  };

  const toggleDay = (dayNum: number) => {
    if (fixedDays.includes(dayNum)) {
      setFixedDays(fixedDays.filter(d => d !== dayNum));
    } else {
      if (fixedDays.length >= rateDays) {
        alert(`Has seleccionado una tarifa de ${rateDays} días. No puedes marcar más días en la semana.`);
        return;
      }
      setFixedDays([...fixedDays, dayNum]);
    }
  };

  // --- RESTO DE FUNCIONES (Kcal, Delete, Reset, Workouts) ---
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
    setViewingAthlete(member); setShowWorkoutsModal(true); setLoadingWorkouts(true);
    const { data, error } = await supabase.from('workout_logs').select(`*, exercises ( name ) `).eq('user_id', member.id).order('logged_at', { ascending: false });
    if (!error && data) setAthleteWorkouts(data);
    setLoadingWorkouts(false);
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
        <button onClick={() => setActiveView('clientes')} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'clientes' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <Users className="w-4 h-4" /> Atletas
          <span className="ml-2 bg-[#2a2a2a] text-xs px-2 py-0.5 rounded-full text-white">{members.filter(m => m.role === 'client' || !m.role).length}</span>
        </button>
        <button onClick={() => setActiveView('equipo')} className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeView === 'equipo' ? 'text-[#E31C25] border-[#E31C25]' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>
          <Shield className="w-4 h-4" /> Equipo Técnico
          <span className="ml-2 bg-[#2a2a2a] text-xs px-2 py-0.5 rounded-full text-white">{members.filter(m => m.role === 'trainer' || m.role === 'admin').length}</span>
        </button>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-xl overflow-x-auto">
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
            ) : displayedMembers.map((member) => (
              <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="p-3 md:p-5 flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-[#121212] rounded-xl flex items-center justify-center text-[#E31C25] font-bold border border-[#2a2a2a] shadow-sm group-hover:border-[#E31C25]/30 transition-colors">
                    {member.first_name?.[0] || 'U'}
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
                      <div className="absolute right-4 md:right-8 top-10 md:top-12 w-48 md:w-56 bg-[#121212] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 overflow-hidden text-left animate-in fade-in slide-in-from-top-2 duration-200">
                        
                        {(member.role === 'client' || !member.role) && (
                          <>
                            <button 
                              onClick={() => { 
                                setTariffAthlete(member); 
                                setRateDays(member.rate_days || 0); // Empieza en lo que tenga, o 0
                                setFixedDays(member.fixed_days || []);
                                setShowTariffModal(true); 
                                setOpenDropdownId(null); 
                              }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-[#E31C25] hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors font-bold"
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
                              onClick={() => { handleViewWorkouts(member); setOpenDropdownId(null); }}
                              className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#1a1a1a] flex items-center gap-3 transition-colors"
                            >
                              <Dumbbell size={16} /> Historial Entrenos
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
      
      {/* MODAL: GESTIÓN DE TARIFA */}
      {showTariffModal && tariffAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CalendarCheck className="text-[#E31C25]" /> Configurar Tarifa
              </h2>
              <button onClick={() => setShowTariffModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-full"><X size={20} /></button>
            </div>
            
            <p className="text-gray-400 text-sm mb-6">Configura los días fijos para <span className="text-white font-bold">{tariffAthlete.first_name}</span>. Al guardar, se le inscribirá automáticamente o se cancelarán sus plazas.</p>

            <form onSubmit={handleSaveTariff} className="space-y-6">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Días por Semana (Tarifa)</label>
                {/* Cuadrícula de 5 columnas para incluir "Sin Tarifa" */}
                <div className="grid grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => { setRateDays(0); setFixedDays([]); }}
                    className={`py-3 rounded-xl border text-sm font-bold transition-all ${rateDays === 0 ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-[#121212] border-[#2a2a2a] text-gray-400 hover:border-gray-500'}`}
                  >
                    0
                  </button>
                  {[2, 3, 4, 5].map((num) => (
                    <button
                      key={num} type="button"
                      onClick={() => { setRateDays(num); setFixedDays(fixedDays.slice(0, num)); }}
                      className={`py-3 rounded-xl border text-sm font-bold transition-all ${rateDays === num ? 'bg-[#E31C25] border-[#E31C25] text-white' : 'bg-[#121212] border-[#2a2a2a] text-gray-400 hover:border-gray-500'}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contenedor de días: se bloquea si rateDays === 0 */}
              <div style={{ opacity: rateDays === 0 ? 0.3 : 1, pointerEvents: rateDays === 0 ? 'none' : 'auto' }}>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block flex items-center justify-between">
                  <span>Selección de Días</span>
                  <span className={fixedDays.length === rateDays ? 'text-[#E31C25]' : 'text-gray-500'}>{fixedDays.length} / {rateDays || 0} asignados</span>
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {[ { id: 1, label: 'L' }, { id: 2, label: 'M' }, { id: 3, label: 'X' }, { id: 4, label: 'J' }, { id: 5, label: 'V' }, { id: 6, label: 'S' }, { id: 0, label: 'D' } ].map((day) => (
                    <button
                      key={day.id} type="button"
                      onClick={() => toggleDay(day.id)}
                      className={`aspect-square rounded-lg border text-sm font-bold flex items-center justify-center transition-all ${
                        fixedDays.includes(day.id) ? 'bg-[#E31C25]/20 border-[#E31C25] text-[#E31C25]' : 'bg-[#121212] border-[#2a2a2a] text-gray-500 hover:bg-[#2a2a2a]'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowTariffModal(false)} className="flex-1 py-4 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-[#2a2a2a] transition-colors">Cancelar</button>
                <button 
                  type="submit" 
                  disabled={isSavingTariff || (rateDays > 0 && fixedDays.length !== rateDays)} 
                  className={`flex-1 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    (rateDays === 0 || fixedDays.length === rateDays) && !isSavingTariff 
                      ? (rateDays === 0 ? 'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-[#E31C25] text-white hover:bg-[#A6151B] shadow-[0_0_15px_rgba(227,28,37,0.3)]') 
                      : 'bg-[#2a2a2a] text-gray-500'
                  }`}
                >
                  {isSavingTariff ? <Loader2 className="w-5 h-5 animate-spin" /> : rateDays === 0 ? 'Quitar Tarifa' : 'Asignar Tarifa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* (Resto de modales existentes: Kcal, Add, Edit, Workouts...) */}
      {showKcalModal && kcalAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-[#E31C25]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#E31C25]/20"><Flame className="text-[#E31C25] w-8 h-8" /></div>
            <h2 className="text-xl font-bold text-white mb-1">Plan Nutricional</h2>
            <form onSubmit={handleSaveKcal}>
              <div className="mb-8 mt-4 bg-[#121212] border-2 border-[#2a2a2a] focus-within:border-[#E31C25] rounded-2xl py-6 flex flex-col items-center justify-center transition-colors">
                <input type="number" required value={kcalGoal} onChange={(e) => setKcalGoal(e.target.value)} className="bg-transparent text-center text-5xl font-bold text-white outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2 pointer-events-none">Kcal / Día</span>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowKcalModal(false)} className="flex-1 py-4 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-zinc-800 transition-colors">Cancelar</button>
                <button type="submit" disabled={isSavingKcal} className="flex-1 py-4 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center justify-center gap-2">{isSavingKcal ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Añadir Atleta */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-white">Nuevo Registro</h2><button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-full"><X size={20} /></button></div>
            <form onSubmit={handleAddAtleta} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre</label><input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newAtleta.first_name} onChange={(e) => setNewAtleta({...newAtleta, first_name: e.target.value})} /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Apellido</label><input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newAtleta.last_name} onChange={(e) => setNewAtleta({...newAtleta, last_name: e.target.value})} /></div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Correo Electrónico</label>
                <div className="relative"><Mail className="absolute left-3 top-3.5 text-gray-500" size={18} /><input required type="email" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 pl-10 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newAtleta.email} onChange={(e) => setNewAtleta({...newAtleta, email: e.target.value})} /></div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Rol</label>
                <select className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white outline-none focus:border-[#E31C25] appearance-none" value={newAtleta.role} onChange={(e) => setNewAtleta({...newAtleta, role: e.target.value})}>
                  <option value="client">Atleta (Cliente)</option><option value="trainer">Entrenador (Staff)</option><option value="admin">Administrador Principal</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3"><button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-[#2a2a2a]">Cancelar</button><button type="submit" className="flex-1 py-4 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B]">Enviar Invitación</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Atleta */}
      {showEditModal && editAtleta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-white">Editar Perfil</h2><button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-full"><X size={20} /></button></div>
            <div className="mb-6 p-4 bg-[#121212] border border-[#2a2a2a] rounded-xl"><button type="button" onClick={handleResetPassword} disabled={isResetting} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-transparent border border-[#2a2a2a] text-gray-300 rounded-xl hover:border-white hover:text-white text-sm font-bold"><KeyRound size={16} />{isResetting ? 'Enviando...' : 'Restablecer Contraseña'}</button></div>
            <form onSubmit={handleEditAtleta} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre</label><input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={editAtleta.first_name || ''} onChange={(e) => setEditAtleta({...editAtleta, first_name: e.target.value})} /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Apellido</label><input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={editAtleta.last_name || ''} onChange={(e) => setEditAtleta({...editAtleta, last_name: e.target.value})} /></div>
              </div>
              <div className="pt-4 flex gap-3"><button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-4 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-[#2a2a2a]">Cancelar</button><button type="submit" className="flex-1 py-4 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B]">Guardar Cambios</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ver Entrenos */}
      {showWorkoutsModal && viewingAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex justify-end">
          <div className="bg-[#1a1a1a] border-l border-[#2a2a2a] w-full max-w-md h-full p-8 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-8">
              <div><h2 className="text-xl font-bold text-white">Historial</h2><p className="text-[#E31C25] text-sm mt-1">{viewingAthlete.first_name}</p></div>
              <button onClick={() => setShowWorkoutsModal(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-2 rounded-full"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {loadingWorkouts ? <p className="text-gray-500 text-center py-10">Buscando...</p> : athleteWorkouts.length === 0 ? <p className="text-gray-500 text-center py-10">Sin entrenamientos.</p> : athleteWorkouts.map((workout: any) => (
                <div key={workout.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4"><h3 className="font-bold text-white text-lg">{workout.name || 'Sin título'}</h3><div className="flex gap-4 mt-3 text-xs text-gray-400"><div className="flex items-center gap-1"><CalendarIcon size={14} className="text-[#E31C25]" /> {new Date(workout.created_at).toLocaleDateString('es-ES')}</div></div></div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}