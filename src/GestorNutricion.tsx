import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase'; // Ajusta la ruta a tu cliente
import { Calendar as CalendarIcon, Clock, User, Trash2, Plus } from 'lucide-react';

export default function GestorNutricion() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  // Estados para el formulario
  const [selectedUser, setSelectedUser] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Cargar usuarios y citas
  useEffect(() => {
    fetchUsers();
    fetchAppointments();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .order('first_name');
    if (data) setUsers(data);
  };

  const fetchAppointments = async () => {
    const { data } = await supabase
      .from('nutrition_appointments')
      .select(`
        id, 
        appointment_date, 
        notes, 
        status,
        profiles (first_name, last_name)
      `)
      .gte('appointment_date', new Date().toISOString()) // Solo citas futuras
      .order('appointment_date', { ascending: true });
    
    if (data) setAppointments(data);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !date || !time) return alert('Rellena usuario, fecha y hora.');
    
    setLoading(true);
    try {
      // Separamos los números exactos introducidos en el formulario localmente
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);
      
      // Creamos el objeto Date forzando tu zona horaria local de manera nativa
      const localDate = new Date(year, month - 1, day, hour, minute);

      // .toISOString() restará automáticamente el desfase (+2h) para guardarlo en formato UTC ('Z')
      const formattedDateTime = localDate.toISOString();

      const { error } = await supabase
        .from('nutrition_appointments')
        .insert({
          user_id: selectedUser,
          appointment_date: formattedDateTime, 
          notes: notes
        });

      if (error) throw error;
      
      alert('Cita creada con éxito');
      setSelectedUser(''); setDate(''); setTime(''); setNotes('');
      fetchAppointments();
    } catch (error: any) {
      alert('Error al crear la cita: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    await supabase.from('nutrition_appointments').delete().eq('id', id);
    fetchAppointments();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <CalendarIcon className="text-emerald-500" /> Gestor de Citas de Nutrición
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* FORMULARIO PARA CREAR CITA */}
        <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#2a2a2a] md:col-span-1 h-fit">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Plus size={18} className="text-emerald-500" /> Nueva Cita
          </h3>
          <form onSubmit={handleCreateAppointment} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Atleta</label>
              <select 
                value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full bg-[#121212] border border-[#2a2a2a] p-2.5 rounded-xl text-white text-sm outline-none"
              >
                <option value="">Seleccionar...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Fecha</label>
                <input 
                  type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#121212] border border-[#2a2a2a] p-2.5 rounded-xl text-white text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Hora</label>
                <input 
                  type="time" value={time} onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-[#121212] border border-[#2a2a2a] p-2.5 rounded-xl text-white text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Notas (opcional)</label>
              <textarea 
                value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: Revisión mensual"
                className="w-full bg-[#121212] border border-[#2a2a2a] p-2.5 rounded-xl text-white text-sm outline-none min-h-[80px]"
              />
            </div>

            <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition-colors">
              {loading ? 'Guardando...' : 'Agendar Cita'}
            </button>
          </form>
        </div>

        {/* LISTADO DE PRÓXIMAS CITAS */}
        <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#2a2a2a] md:col-span-2">
          <h3 className="text-lg font-bold text-white mb-4">Próximas Citas Programadas</h3>
          
          <div className="space-y-3">
            {appointments.length === 0 ? (
              <p className="text-gray-500 italic">No hay citas programadas próximamente.</p>
            ) : (
              appointments.map(app => {
                // Convertimos el UTC de la base de datos a un objeto de fecha local
                const dateObj = new Date(app.appointment_date);
                const fecha = dateObj.toLocaleDateString('es-ES');
                const hora = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div key={app.id} className="flex items-center justify-between bg-[#121212] p-4 rounded-xl border border-[#2a2a2a]">
                    <div>
                      <p className="font-bold text-white flex items-center gap-2">
                        <User size={16} className="text-gray-400" />
                        {app.profiles.first_name} {app.profiles.last_name}
                      </p>
                      <div className="flex gap-4 mt-2 text-sm text-gray-400">
                        <span className="flex items-center gap-1"><CalendarIcon size={14} className="text-emerald-500" /> {fecha}</span>
                        <span className="flex items-center gap-1"><Clock size={14} className="text-emerald-500" /> {hora}</span>
                      </div>
                      {app.notes && <p className="text-xs text-gray-500 mt-2 italic">"{app.notes}"</p>}
                    </div>
                    
                    <button onClick={() => handleDelete(app.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}