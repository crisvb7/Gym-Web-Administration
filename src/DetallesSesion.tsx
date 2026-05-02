import React, { useState, useEffect } from 'react';
import { X, Users, MapPin, Loader2, Trash2, UserPlus, ShieldAlert, Dumbbell } from 'lucide-react';
import { supabase } from './lib/supabase';

// Función para recrear el color transparente del badge de disciplina
const hexToRgba = (hex: string, opacity: number) => {
  if (!hex) return `rgba(227, 28, 37, ${opacity})`;
  const r = parseInt(hex.slice(1, 3), 16) || 227;
  const g = parseInt(hex.slice(3, 5), 16) || 28;
  const b = parseInt(hex.slice(5, 7), 16) || 37;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

interface DetallesSesionProps {
  sesion: any | null;
  onClose: () => void;
  onDeleteRequest?: (id: string, title: string) => void; 
}

export default function DetallesSesion({ sesion, onClose, onDeleteRequest }: DetallesSesionProps) {
  const [bookedClients, setBookedClients] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  
  // Estado para guardar el color de la disciplina
  const [disciplineColor, setDisciplineColor] = useState<string>('#E31C25');

  // Estados para la inscripción manual
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);

  useEffect(() => {
    const fetchAllUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .order('first_name', { ascending: true });
      
      if (!error && data) {
        setAllUsers(data.filter(u => u.role === 'client' || !u.role));
      }
    };
    fetchAllUsers();
  }, []);

  const loadClassDetails = async () => {
    if (!sesion) return;
    setLoadingBookings(true);
    try {
      // Cargamos las reservas
      const { data, error } = await supabase
        .from('class_bookings')
        .select(`
          id,
          booked_at,
          status,
          booking_type,
          profiles!class_bookings_user_id_fkey (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('class_id', sesion.id)
        .order('booked_at', { ascending: true });

      if (error) throw error;
      setBookedClients(data || []);

      // Cargamos el color de la disciplina de esta clase
      if (sesion.discipline) {
        const { data: dData } = await supabase.from('disciplines').select('color').eq('name', sesion.discipline).single();
        if (dData) setDisciplineColor(dData.color);
      }

    } catch (err) {
      console.error("Error cargando reservas:", err);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    loadClassDetails();
  }, [sesion]);

  const handleRemoveUser = async (bookingId: string, clientName: string) => {
    if (!window.confirm(`¿Estás seguro de que quieres expulsar a ${clientName} de esta clase?`)) return;

    try {
      const { error } = await supabase.from('class_bookings').delete().eq('id', bookingId);
      if (error) throw error;
      
      loadClassDetails();
    } catch (error: any) {
      alert("Error al eliminar al atleta: " + error.message);
    }
  };

  const handleAddUserManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return alert("Selecciona un atleta primero.");
    
    // VERIFICACIÓN MODO DIOS ADMIN
    const activeClients = bookedClients.filter(b => b.status === 'ACTIVE');
    if (activeClients.length >= sesion.max_capacity) {
      if (!window.confirm("⚠️ La clase ha alcanzado su aforo máximo. ¿Quieres forzar la inscripción y crear una plaza extra (Sobreaforo)?")) {
        return; // Si dice que no, cancelamos. Si dice que sí, continúa y lo inscribe a la fuerza.
      }
    }

    setIsAddingUser(true);
    try {
      const assignedBookingType = sesion.access_type === 'TARIFF' ? 'FIXED' : 'NORMAL';
      const existingBooking = bookedClients.find(b => b.profiles.id === selectedUserId);
      
      if (existingBooking) {
        if (existingBooking.status === 'ACTIVE') {
          throw new Error("Este atleta ya está apuntado a la clase.");
        } else {
          const { error } = await supabase.from('class_bookings').update({ status: 'ACTIVE', booking_type: assignedBookingType }).eq('id', existingBooking.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from('class_bookings').insert({
          class_id: sesion.id,
          user_id: selectedUserId,
          booking_type: assignedBookingType,
          status: 'ACTIVE'
        });
        if (error) throw error;
      }

      setSelectedUserId('');
      loadClassDetails();
    } catch (error: any) {
      alert("Error al inscribir: " + error.message);
    } finally {
      setIsAddingUser(false);
    }
  };

  if (!sesion) return null;

  const activeClients = bookedClients.filter(b => b.status === 'ACTIVE');
  const cancelledClients = bookedClients.filter(b => b.status === 'CANCELLED');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* CAPA DE CIERRE AL CLICAR FUERA */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* TARJETA CENTRAL */}
      <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300 relative z-10">
        
        {/* Cabecera del Modal */}
        <div className="bg-[#1a1a1a] p-6 border-b border-[#2a2a2a] relative">
          
          {/* BOTÓN X CORREGIDO: Absoluto, arriba y a la derecha */}
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-[#121212] p-1.5 rounded-full border border-[#2a2a2a] z-20"
          >
            <X size={20} />
          </button>
          
          {/* Fila de insignias SUPERIORES */}
          <div className="flex items-center gap-2 mb-3 mr-10 flex-wrap">
            <span className="bg-[#E31C25]/10 text-[#E31C25] text-[10px] font-bold px-2 py-1 rounded-md uppercase border border-[#E31C25]/20">
              {new Date(sesion.start_time).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span className="text-gray-400 text-[10px] font-bold shrink-0 bg-[#2a2a2a] px-2 py-1 rounded-md">
              {new Date(sesion.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(sesion.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            
            {/* ETIQUETA DE TIPO DE ACCESO */}
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${sesion.access_type === 'TARIFF' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
              {sesion.access_type === 'TARIFF' ? 'SOLO TARIFA' : 'ACCESO LIBRE'}
            </span>

            {/* ETIQUETA DE CATEGORÍA (DISCIPLINA) SÚPER VISIBLE */}
            <span 
              className="text-[10px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 uppercase"
              style={{
                backgroundColor: hexToRgba(disciplineColor, 0.1),
                borderColor: hexToRgba(disciplineColor, 0.3),
                color: disciplineColor
              }}
            >
              <Dumbbell size={10} /> {sesion.discipline || 'CrossFit'}
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2 leading-tight pr-8">{sesion.title}</h2>
          
          <div className="flex flex-col gap-2 mt-3 text-sm text-gray-400 border-t border-[#2a2a2a] pt-3">
            <span className="flex items-center gap-2"><Users size={16} className="text-[#E31C25]" /> Coach: <span className="text-white font-medium">{sesion.trainer}</span></span>
            <span className="flex items-center gap-2"><MapPin size={16} className="text-[#E31C25]" /> Ubicación: <span className="text-white font-medium">{sesion.location}</span></span>
          </div>
        </div>

        {/* Contenido (Scrollable) */}
        <div className="p-6 bg-[#121212] max-h-[55vh] overflow-y-auto custom-scrollbar">
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Atletas Apuntados</h3>
            {/* Si es TARIFA, mostramos visualmente que hay un hueco extra para tokens */}
            <span className={`text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 ${activeClients.length > sesion.max_capacity ? 'bg-red-500/10 text-red-500' : 'bg-[#E31C25]/10 text-[#E31C25]'}`}>
              {activeClients.length} / {sesion.max_capacity} {sesion.access_type === 'TARIFF' && <span className="text-emerald-500 font-bold">(+1 Token)</span>}
            </span>
          </div>

          <div className="space-y-3 mb-8">
            {loadingBookings ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 text-[#E31C25] animate-spin" />
              </div>
            ) : activeClients.length > 0 ? (
              activeClients.map((booking, idx) => (
                <div key={booking.id} className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-[#2a2a2a] group">
                  <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center font-bold text-xs text-gray-400 shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {booking.profiles?.first_name} {booking.profiles?.last_name}
                    </p>
                  </div>
                  
                  {/* Botón de Eliminar Usuario */}
                  <button 
                    onClick={() => handleRemoveUser(booking.id, booking.profiles?.first_name)}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Expulsar de la clase"
                  >
                    <Trash2 size={16} />
                  </button>

                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 italic text-center py-4 border border-[#2a2a2a] border-dashed rounded-xl">Nadie apuntado aún.</p>
            )}
          </div>

          {/* Cancelaciones */}
          {cancelledClients.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Historial de Cancelaciones</h3>
              <div className="space-y-2 opacity-60">
                {cancelledClients.map((booking) => (
                  <div key={booking.id} className="flex items-center gap-3 bg-transparent p-2 rounded-lg border border-[#2a2a2a] border-dashed">
                    <X className="text-gray-500 shrink-0" size={16} />
                    <p className="text-sm text-gray-400 strike-through line-through truncate">
                      {booking.profiles?.first_name} {booking.profiles?.last_name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AÑADIR MANUALMENTE */}
          <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-[#2a2a2a]">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <UserPlus size={16} className="text-[#E31C25]" /> Inscribir Manualmente
            </h3>
            <form onSubmit={handleAddUserManually} className="space-y-3">
              <select 
                required
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full bg-[#121212] border border-[#2a2a2a] p-2.5 rounded-xl text-white text-sm outline-none focus:border-[#E31C25]"
              >
                <option value="" disabled>Seleccionar Atleta...</option>
                {allUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>
                ))}
              </select>

              <button 
                type="submit" 
                disabled={isAddingUser}
                className="w-full py-2.5 bg-[#E31C25] text-white text-sm font-bold rounded-xl hover:bg-[#A6151B] transition-colors flex justify-center items-center gap-2"
              >
                {isAddingUser ? <Loader2 size={16} className="animate-spin" /> : 'Inscribir a la sesión'}
              </button>
            </form>
          </div>

        </div>

        {/* Pie del modal (Cancelar Sesión Completa) */}
        {onDeleteRequest && (
          <div className="p-4 border-t border-[#2a2a2a] bg-[#1a1a1a]">
            <button onClick={() => onDeleteRequest(sesion.id, sesion.title)} className="w-full py-3 text-gray-400 text-sm font-bold hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors flex items-center justify-center gap-2">
              <ShieldAlert size={16} /> Eliminar Sesión del Calendario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}