import React, { useEffect, useState } from "react";
import { Users, Apple, UserPlus, X, Mail, MoreVertical, Dumbbell, Edit2, Trash2, Calendar as CalendarIcon, Clock, KeyRound, Flame, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";

export function MembersPage({ onSelectMember }: { onSelectMember: (user: any) => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para controlar los Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWorkoutsModal, setShowWorkoutsModal] = useState(false);
  const [showKcalModal, setShowKcalModal] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  // Estados de datos
  const [newAtleta, setNewAtleta] = useState({ first_name: '', last_name: '', email: '', role: 'client' });
  const [editAtleta, setEditAtleta] = useState<any>(null);
  const [viewingAthlete, setViewingAthlete] = useState<any>(null);
  const [athleteWorkouts, setAthleteWorkouts] = useState<any[]>([]);
  
  // Estados para el límite calórico
  const [kcalAthlete, setKcalAthlete] = useState<any>(null);
  const [kcalGoal, setKcalGoal] = useState<string>('2500');
  const [isSavingKcal, setIsSavingKcal] = useState(false);

  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // --- OBTENER MIEMBROS ---
  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) setMembers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  // --- CREAR MIEMBRO ---
  const handleAddAtleta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: newAtleta.email }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const newUserId = data.user.id;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: newAtleta.first_name,
          last_name: newAtleta.last_name,
          full_name: `${newAtleta.first_name.toLowerCase()}${newAtleta.last_name.toLowerCase()}`,
          role: newAtleta.role,
          daily_kcal_goal: 2500 
        })
        .eq('id', newUserId);

      if (profileError) throw profileError;

      alert(`¡Invitación enviada con éxito a ${newAtleta.email}!`);
      setShowAddModal(false);
      setNewAtleta({ first_name: '', last_name: '', email: '', role: 'client' });
      fetchMembers(); 

    } catch (err: any) {
      alert("Error al invitar atleta: " + err.message);
    }
  };

  // --- ACTUALIZAR MIEMBRO ---
  const handleEditAtleta = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: editAtleta.first_name,
        last_name: editAtleta.last_name,
        full_name: `${editAtleta.first_name.toLowerCase()}${editAtleta.last_name.toLowerCase()}`,
        role: editAtleta.role
      })
      .eq('id', editAtleta.id);

    if (error) alert("Error al actualizar: " + error.message);
    else {
      setShowEditModal(false);
      fetchMembers();
    }
  };

  // --- ACTUALIZAR LÍMITE CALÓRICO CON HISTORIAL BLINDADO ---
  const handleSaveKcal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingKcal(true);
    
    const newGoal = parseInt(kcalGoal) || 2500;
    const today = new Date().toISOString().split('T')[0];

    try {
      // 0. Comprobar si ya existe algún historial para este atleta
      const { data: existingHistory } = await supabase
        .from('calorie_goal_history')
        .select('id')
        .eq('user_id', kcalAthlete.id)
        .limit(1);

      // Si es la PRIMERA vez que le cambiamos las calorías, guardamos su meta antigua para el pasado
      if (!existingHistory || existingHistory.length === 0) {
        await supabase.from('calorie_goal_history').insert({
          user_id: kcalAthlete.id,
          daily_kcal_goal: kcalAthlete.daily_kcal_goal || 2500,
          effective_date: '2020-01-01' // Fecha muy antigua para blindar su pasado
        });
      }

      // 1. Actualizamos el perfil (dato actual para la tabla)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ daily_kcal_goal: newGoal })
        .eq('id', kcalAthlete.id);
        
      if (updateError) throw updateError;

      // 2. Guardamos el cambio nuevo en el historial a partir de HOY
      const { error: historyError } = await supabase
        .from('calorie_goal_history')
        .insert({
          user_id: kcalAthlete.id,
          daily_kcal_goal: newGoal,
          effective_date: today
        });
        
      if (historyError && historyError.code !== '42P01') throw historyError;

      setShowKcalModal(false);
      fetchMembers();
    } catch (error: any) {
      alert("Error al actualizar calorías: " + error.message);
    } finally {
      setIsSavingKcal(false);
    }
  };

  // --- ENVIAR CORREO DE RESETEO ---
  const handleResetPassword = async () => {
    if (!editAtleta.email) return alert("Este usuario no tiene un correo registrado.");
    
    setIsResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(editAtleta.email);
    if (error) alert("Error al enviar el correo: " + error.message);
    else alert(`¡Correo de recuperación enviado a ${editAtleta.email}!`);
    setIsResetting(false);
  };

  // --- BORRAR MIEMBRO ---
  const handleDeleteAtleta = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar a ${name}? Esta acción borrará todo su historial, su acceso a la app, y no se puede deshacer.`)) {
      try {
        const { error: functionError } = await supabase.functions.invoke('delete-user', { body: { userId: id } });
        if (functionError) throw new Error("Error al borrar credenciales de acceso.");

        const { error: dbError } = await supabase.from('profiles').delete().eq('id', id);
        if (dbError) throw dbError;

        alert(`Atleta ${name} eliminado por completo del sistema.`);
        fetchMembers(); 
      } catch (err: any) {
        alert("Error al eliminar: " + err.message);
      }
    }
  };

  // --- VER ENTRENOS ---
  const handleViewWorkouts = async (member: any) => {
    setViewingAthlete(member);
    setShowWorkoutsModal(true);
    setLoadingWorkouts(true);
    
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', member.id)
      .order('created_at', { ascending: false });
      
    if (!error && data) setAthleteWorkouts(data);
    setLoadingWorkouts(false);
  };

  return (
    <div className="space-y-6">
      {/* --- CABECERA --- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Atletas</h1>
          <p className="text-gray-400 mt-1">Gestión de la base de datos de miembros</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-[#E31C25] text-white px-6 py-3 rounded-lg font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)]"
        >
          <UserPlus className="w-5 h-5" />
          Añadir Atleta
        </button>
      </div>

      {/* --- TABLA PRINCIPAL --- */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-visible">
        <table className="w-full text-left">
          <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-400 text-xs uppercase">
            <tr>
              <th className="p-4">Cliente</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {loading ? (
              <tr><td colSpan={3} className="p-8 text-center text-[#E31C25] animate-pulse">Cargando atletas...</td></tr>
            ) : members.map((member) => (
              <tr key={member.id} className="hover:bg-white/5 transition-colors">
                <td className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#E31C25]/10 rounded-full flex items-center justify-center text-[#E31C25] font-bold border border-[#E31C25]/20">
                    {member.first_name?.[0] || 'U'}
                  </div>
                  <div>
                    <p className="font-bold text-white">{member.first_name} {member.last_name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{member.email || 'Sin email'}</p>
                  </div>
                </td>
                <td className="p-4">
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold uppercase">
                    {member.role || 'Cliente'}
                  </span>
                </td>
                
                {/* Menú de los 3 puntos */}
                <td className="p-4 text-right">
                  <div className="relative inline-block text-left">
                    <button 
                      onClick={() => setOpenDropdownId(openDropdownId === member.id ? null : member.id)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors"
                    >
                      <MoreVertical size={20} />
                    </button>

                    {openDropdownId === member.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)}></div>
                        <div className="absolute right-0 top-10 mt-1 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl z-50 overflow-hidden text-left animate-in fade-in slide-in-from-top-2 duration-200">
                          
                          <button 
                            onClick={() => { 
                              setKcalAthlete(member); 
                              setKcalGoal(member.daily_kcal_goal ? String(member.daily_kcal_goal) : '2500');
                              setShowKcalModal(true); 
                              setOpenDropdownId(null); 
                            }}
                            className="w-full px-4 py-3 text-sm text-gray-300 hover:text-[#E31C25] hover:bg-[#2a2a2a] flex items-center gap-3"
                          >
                            <Flame size={16} /> Límite calórico
                          </button>
                          
                          <button 
                            onClick={() => { handleViewWorkouts(member); setOpenDropdownId(null); }}
                            className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#2a2a2a] flex items-center gap-3"
                          >
                            <Dumbbell size={16} /> Ver Entrenos
                          </button>
                          
                          <button 
                            onClick={() => { setEditAtleta(member); setShowEditModal(true); setOpenDropdownId(null); }}
                            className="w-full px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-[#2a2a2a] flex items-center gap-3"
                          >
                            <Edit2 size={16} /> Editar Perfil
                          </button>

                          <div className="h-px bg-[#2a2a2a] w-full my-1"></div>
                          
                          <button 
                            onClick={() => { handleDeleteAtleta(member.id, member.first_name); setOpenDropdownId(null); }}
                            className="w-full px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-3"
                          >
                            <Trash2 size={16} /> Eliminar Cliente
                          </button>
                          
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODAL: LÍMITE CALÓRICO PERFECTAMENTE CENTRADO --- */}
      {showKcalModal && kcalAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-[#E31C25]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#E31C25]/20">
              <Flame className="text-[#E31C25] w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Plan Nutricional</h2>
            <p className="text-gray-400 text-sm mb-6">
              Establece la meta diaria de calorías para <span className="text-[#E31C25] font-bold">{kcalAthlete.first_name}</span>.
            </p>

            <form onSubmit={handleSaveKcal}>
              
              {/* CAJA DEL INPUT CENTRADA PERFECTAMENTE SIN FLECHAS */}
              <div className="mb-8 bg-[#121212] border-2 border-[#2a2a2a] focus-within:border-[#E31C25] rounded-2xl py-6 flex flex-col items-center justify-center transition-colors">
                <input 
                  type="number" 
                  required 
                  value={kcalGoal}
                  onChange={(e) => setKcalGoal(e.target.value)}
                  className="bg-transparent text-center text-5xl font-bold text-white outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2 pointer-events-none">
                  Kcal / Día
                </span>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowKcalModal(false)} className="flex-1 py-4 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-zinc-800 transition-colors">Cancelar</button>
                <button type="submit" disabled={isSavingKcal} className="flex-1 py-4 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)]">
                  {isSavingKcal ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: AÑADIR ATLETA --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Registrar Nuevo Cliente</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddAtleta} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Nombre</label>
                  <input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white focus:border-[#E31C25] outline-none" value={newAtleta.first_name} onChange={(e) => setNewAtleta({...newAtleta, first_name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Apellido</label>
                  <input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white focus:border-[#E31C25] outline-none" value={newAtleta.last_name} onChange={(e) => setNewAtleta({...newAtleta, last_name: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">Correo Electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-4 text-gray-600" size={18} />
                  <input required type="email" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 pl-10 rounded-xl mt-1 text-white focus:border-[#E31C25] outline-none" placeholder="atleta@correo.com" value={newAtleta.email} onChange={(e) => setNewAtleta({...newAtleta, email: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">Rol</label>
                <select className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white outline-none focus:border-[#E31C25]" value={newAtleta.role} onChange={(e) => setNewAtleta({...newAtleta, role: e.target.value})}>
                  <option value="client">Cliente</option>
                  <option value="trainer">Entrenador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-3 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-zinc-800 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] transition-all">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: EDITAR ATLETA --- */}
      {showEditModal && editAtleta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] w-full max-w-md rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Editar Perfil</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>

            <div className="mb-6 p-4 bg-[#121212] border border-[#2a2a2a] rounded-xl">
              <h3 className="text-sm font-bold text-white mb-2">Seguridad de la cuenta</h3>
              <button 
                type="button"
                onClick={handleResetPassword}
                disabled={isResetting}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-transparent border border-gray-600 text-gray-300 rounded-lg hover:border-white hover:text-white transition-colors text-sm disabled:opacity-50"
              >
                <KeyRound size={16} />
                {isResetting ? 'Enviando...' : 'Enviar enlace para cambiar contraseña'}
              </button>
            </div>

            <form onSubmit={handleEditAtleta} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Nombre</label>
                  <input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white focus:border-[#E31C25] outline-none" value={editAtleta.first_name || ''} onChange={(e) => setEditAtleta({...editAtleta, first_name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Apellido</label>
                  <input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white focus:border-[#E31C25] outline-none" value={editAtleta.last_name || ''} onChange={(e) => setEditAtleta({...editAtleta, last_name: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">Rol</label>
                <select className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white outline-none focus:border-[#E31C25]" value={editAtleta.role || 'client'} onChange={(e) => setEditAtleta({...editAtleta, role: e.target.value})}>
                  <option value="client">Cliente</option>
                  <option value="trainer">Entrenador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-3 bg-[#121212] border border-[#2a2a2a] rounded-xl text-gray-400 font-bold hover:bg-zinc-800 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-[#E31C25] text-white rounded-xl font-bold hover:bg-[#A6151B] transition-all">Actualizar Perfil</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: VER ENTRENOS --- */}
      {showWorkoutsModal && viewingAthlete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex justify-end">
          <div className="bg-[#1a1a1a] border-l border-[#2a2a2a] w-full max-w-md h-full p-8 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-bold text-white">Historial de Entrenos</h2>
                <p className="text-[#E31C25] text-sm mt-1">{viewingAthlete.first_name} {viewingAthlete.last_name}</p>
              </div>
              <button onClick={() => setShowWorkoutsModal(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-2 rounded-full"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {loadingWorkouts ? (
                <p className="text-gray-500 text-center py-10">Buscando entrenamientos...</p>
              ) : athleteWorkouts.length === 0 ? (
                <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-8 text-center">
                  <Dumbbell className="w-12 h-12 text-gray-600 mx-auto mb-3 opacity-50" />
                  <p className="text-gray-400">Este Cliente aún no ha registrado ningún entrenamiento.</p>
                </div>
              ) : (
                athleteWorkouts.map((workout: any) => (
                  <div key={workout.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 hover:border-[#E31C25]/30 transition-colors">
                    <h3 className="font-bold text-white text-lg">{workout.name || 'Entrenamiento sin título'}</h3>
                    <div className="flex gap-4 mt-3 text-xs text-gray-400">
                      <div className="flex items-center gap-1"><CalendarIcon size={14}/> {new Date(workout.created_at).toLocaleDateString('es-ES')}</div>
                      {workout.duration && <div className="flex items-center gap-1"><Clock size={14}/> {workout.duration} min</div>}
                    </div>
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