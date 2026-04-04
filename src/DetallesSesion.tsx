import React, { useState, useEffect } from 'react';
import { X, Users, MapPin, Loader2, Trash2 } from 'lucide-react';
import { supabase } from './lib/supabase';

interface DetallesSesionProps {
  sesion: any | null;
  onClose: () => void;
  // Hacemos que la función de borrar sea opcional, por si en el dashboard no quieres que borren
  onDeleteRequest?: (id: string, title: string) => void; 
}

export default function DetallesSesion({ sesion, onClose, onDeleteRequest }: DetallesSesionProps) {
  const [bookedClients, setBookedClients] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Cuando se abre el modal y recibe una sesión, buscamos automáticamente a los apuntados
  useEffect(() => {
    if (!sesion) return;

    const loadClassDetails = async () => {
      setLoadingBookings(true);
      try {
        const { data, error } = await supabase
          .from('class_bookings')
          .select(`
            id,
            booked_at,
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

    loadClassDetails();
  }, [sesion]);

  if (!sesion) return null;

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
          </div>
          <h2 className="text-2xl font-bold text-white">{sesion.title}</h2>
          <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
            <span className="flex items-center gap-1"><Users size={16} className="text-[#E31C25]" /> Coach: {sesion.trainer}</span>
            <span className="flex items-center gap-1"><MapPin size={16} className="text-[#E31C25]" /> {sesion.location}</span>
          </div>
        </div>

        {/* Lista de Atletas */}
        <div className="p-6 bg-[#121212]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Atletas Apuntados</h3>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${bookedClients.length >= sesion.max_capacity ? 'bg-red-500/10 text-red-500' : 'bg-[#E31C25]/10 text-[#E31C25]'}`}>
              {bookedClients.length} / {sesion.max_capacity}
            </span>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {loadingBookings ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
              </div>
            ) : bookedClients.length > 0 ? (
              bookedClients.map((booking, idx) => (
                <div key={booking.id} className="flex items-center gap-3 bg-[#1a1a1a] p-3 rounded-xl border border-[#2a2a2a]">
                  <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center font-bold text-xs text-gray-400">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      {booking.profiles?.first_name} {booking.profiles?.last_name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      Reservó el {new Date(booking.booked_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-[#1a1a1a] border border-[#2a2a2a] border-dashed rounded-xl">
                <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Todavía no hay nadie apuntado.</p>
              </div>
            )}
          </div>
        </div>

        {/* Pie del modal (Botón de cancelar sesión) */}
        {onDeleteRequest && (
          <div className="p-4 border-t border-[#2a2a2a] bg-[#1a1a1a]">
            <button onClick={() => onDeleteRequest(sesion.id, sesion.title)} className="w-full py-3 text-gray-400 font-bold hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Trash2 size={18} /> Cancelar Sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}