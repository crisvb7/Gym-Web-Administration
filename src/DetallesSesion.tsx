import React, { useState, useEffect } from 'react';
import { X, Users, MapPin, Loader2, Trash2, UserPlus, ShieldAlert } from 'lucide-react';
import { supabase } from './lib/supabase';

interface DetallesSesionProps {
  sesion: any | null;
  onClose: () => void;
  onDeleteRequest?: (id: string, title: string) => void; 
}

export default function DetallesSesion({ sesion, onClose, onDeleteRequest }: DetallesSesionProps) {
  const [bookedClients, setBookedClients] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

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
    } catch (err) {
      console.error("Error cargando reservas:", err);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    loadClassDetails();
  }, [sesion]);

  // --- NUEVA FUNCIÓN: ELIMINAR ATLETA DE LA CLASE ---
  const handleRemoveUser = async (bookingId: string, clientName: string) => {
    if (!window.confirm(`¿Estás seguro de que quieres expulsar a ${clientName} de esta clase?`)) return;

    try {
      // Usamos DELETE para borrar el registro por completo si el admin lo decide
      const { error } = await supabase.from('class_bookings').delete().eq('id', bookingId);
      if (error) throw error;
      
      loadClassDetails(); // Recargar lista
    } catch (error: any) {
      alert("Error al eliminar al atleta: " + error.message);
    }
  };

  // Función para añadir usuario manualmente (Ajustada a la nueva lógica de clase)
  const handleAddUserManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return alert("Selecciona un atleta primero.");
    
    setIsAddingUser(true);
    try {
      // El tipo de reserva lo dicta la propia clase (TARIFF = FIXED, NORMAL = NORMAL)
      const assignedBookingType = sesion.access_type === 'TARIFF' ? 'FIXED' : 'NORMAL';

      const existingBooking = bookedClients.find(b => b.profiles.id === selectedUserId);
      
      if (existingBooking) {
        if (existingBooking.status === 'ACTIVE') {
          throw new Error("Este atleta ya está apuntado a la clase.");
        } else {
          // Reactivamos con el tipo de reserva que dicte la clase
          const { error } = await supabase
            .from('class_bookings')
            .update({ status: 'ACTIVE', booking_type: assignedBookingType })
            .eq('id', existingBooking.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from('class_bookings')
          .insert({
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
      <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Cabecera del Modal */}
        <div className="bg-[#1a1a1a] p-6 border-b border-[#2a2a2a] relative">
          <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors bg-[#121212] p-1.5 rounded-full border border-[#2a2a2a]">
            <X size={20} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-[#E31C25]/10 text-[#E31C25] text-xs font-bold px-2 py-1 rounded-md uppercase">
              {new Date(sesion.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
            <span className="text-gray-400 text-xs font-bold">
              {new Date(sesion.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(sesion.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {/* Badge de tipo de acceso */}
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ml-auto border ${sesion.access_type === 'TARIFF' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
              {sesion.access_type === 'TARIFF' ? 'SOLO TARIFA' : 'CLASE NORMAL'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white">{sesion.title}</h2>
          <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
            <span className="flex items-center gap-1"><Users size={16} className="text-[#E31C25]" /> Coach: {sesion.trainer}</span>
            <span className="flex items-center gap-1"><MapPin size={16} className="text-[#E31C25]" /> {sesion.location}</span>
          </div>
        </div>

        {/* Contenido (Scrollable) */}
        <div className="p-6 bg-[#121212] max-h-[55vh] overflow-y-auto custom-scrollbar">
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Atletas Apuntados</h3>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${activeClients.length >= sesion.max_capacity ? 'bg-red-500/10 text-red-500' : 'bg-[#E31C25]/10 text-[#E31C25]'}`}>
              {activeClients.length} / {sesion.max_capacity}
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
                    <p className="text-sm text-gray-400 strike-through line-through">
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