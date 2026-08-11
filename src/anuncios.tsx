import React, { useState, useEffect } from "react";
import { Megaphone, Calendar, Loader2, CheckCircle, AlertCircle, Edit2, Trash2, Clock, X } from "lucide-react";
import { supabase } from "./lib/supabase"; // Asegúrate de que la ruta sea correcta

export default function GestionAnuncios() {
  const [message, setMessage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Nuevos estados para la lista y edición
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Función para cargar anuncios (excluye los que ya han caducado)
  const fetchAnnouncements = async () => {
    setFetching(true);
    const ahora = new Date().toISOString();
    
    // Solo traemos los que su fecha de fin es mayor o igual a AHORA
    const { data, error } = await supabase
      .from('gym_announcements')
      .select('*')
      .gte('end_date', ahora)
      .order('start_date', { ascending: true }); // Ordenados por los más próximos
      
    if (!error && data) {
      setAnnouncements(data);
    }
    setFetching(false);
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  // Utilidad para transformar fechas ISO a formato del input datetime-local
  const toLocalDatetimeLocal = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    if (new Date(startDate) >= new Date(endDate)) {
      setNotification({ type: 'error', text: 'La fecha y hora de finalización debe ser posterior a la de inicio.' });
      setLoading(false);
      return;
    }

    const payload = {
      message: message,
      start_date: new Date(startDate).toISOString(),
      end_date: new Date(endDate).toISOString(),
    };

    let error;

    if (editingId) {
      // Si estamos editando, hacemos un UPDATE
      const { error: updateError } = await supabase
        .from('gym_announcements')
        .update(payload)
        .eq('id', editingId);
      error = updateError;
    } else {
      // Si es nuevo, hacemos un INSERT
      const { error: insertError } = await supabase
        .from('gym_announcements')
        .insert([payload]);
      error = insertError;
    }

    setLoading(false);

    if (error) {
      setNotification({ type: 'error', text: `Error: ${error.message}` });
    } else {
      setNotification({ 
        type: 'success', 
        text: editingId ? '¡Anuncio actualizado correctamente!' : '¡Anuncio programado con éxito!' 
      });
      // Limpiar y recargar
      cancelEdit();
      fetchAnnouncements();
    }
  };

  const handleEdit = (anuncio: any) => {
    setEditingId(anuncio.id);
    setMessage(anuncio.message);
    setStartDate(toLocalDatetimeLocal(anuncio.start_date));
    setEndDate(toLocalDatetimeLocal(anuncio.end_date));
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Sube arriba para ver el formulario
  };

  const cancelEdit = () => {
    setEditingId(null);
    setMessage('');
    setStartDate('');
    setEndDate('');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este anuncio? Desaparecerá de la app inmediatamente.")) return;
    
    const { error } = await supabase.from('gym_announcements').delete().eq('id', id);
    if (!error) {
      fetchAnnouncements();
    } else {
      alert("Error al eliminar: " + error.message);
    }
  };

  const formatDisplayDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('es-ES', { 
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl">
      
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Megaphone className="text-[#E31C25]" size={32} />
            Comunicados Globales
          </h1>
          <p className="text-gray-400 mt-1">
            Gestiona los mensajes emergentes. Los caducados se ocultan automáticamente.
          </p>
        </div>
      </div>

      {/* CONTENEDOR DEL FORMULARIO */}
      <div className={`bg-[#1a1a1a] border rounded-2xl p-6 md:p-8 shadow-xl transition-colors ${editingId ? 'border-[#E31C25]' : 'border-[#2a2a2a]'}`}>
        
        {editingId && (
          <div className="flex justify-between items-center mb-6 border-b border-[#2a2a2a] pb-4">
            <h2 className="text-[#E31C25] font-bold flex items-center gap-2"><Edit2 size={18} /> Editando Anuncio</h2>
            <button onClick={cancelEdit} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm font-bold bg-[#121212] px-3 py-1.5 rounded-lg border border-[#2a2a2a]">
              <X size={16}/> Cancelar Edición
            </button>
          </div>
        )}

        {notification && (
          <div className={`p-4 rounded-xl mb-8 flex items-start gap-3 border ${
            notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            <div className="shrink-0 mt-0.5">
              {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            </div>
            <span className="font-bold text-sm">{notification.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Mensaje del aviso</label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej: Mañana viernes el gimnasio cerrará a las 14:00 por mantenimiento. ¡Disculpen las molestias!"
              className="w-full bg-[#121212] border border-[#2a2a2a] p-4 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors resize-y min-h-[120px]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#121212] p-5 rounded-xl border border-[#2a2a2a]">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Mostrar Desde</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="datetime-local"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] pl-10 pr-4 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Ocultar Hasta</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="datetime-local"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] pl-10 pr-4 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#2a2a2a] flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto bg-[#E31C25] text-white px-8 py-3.5 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingId ? <CheckCircle size={20} /> : <Megaphone size={20} />)}
              {loading ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Publicar Anuncio')}
            </button>
          </div>
        </form>
      </div>

      {/* LISTA DE ANUNCIOS ACTIVOS */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="text-gray-400" size={20} /> 
          Anuncios Activos y Programados
        </h2>
        
        {fetching ? (
          <div className="text-center py-10 border border-dashed border-[#2a2a2a] rounded-2xl">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#E31C25] mb-2" />
            <p className="text-gray-500">Cargando anuncios...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-10 rounded-2xl text-center text-gray-500">
            <Megaphone size={40} className="mx-auto mb-3 opacity-20" />
            <p>No hay ningún anuncio en circulación.</p>
            <p className="text-sm mt-1">Los anuncios que programes aparecerán aquí hasta su fecha de fin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {announcements.map((anuncio) => {
              const isActiveNow = new Date() >= new Date(anuncio.start_date) && new Date() < new Date(anuncio.end_date);

              return (
                <div key={anuncio.id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-all hover:border-gray-700">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                        isActiveNow ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {isActiveNow ? 'Mostrándose Ahora' : 'Programado'}
                      </span>
                    </div>
                    <p className="text-white text-sm leading-relaxed font-medium bg-[#121212] p-3 rounded-lg border border-[#2a2a2a]">
                      "{anuncio.message}"
                    </p>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-xs text-gray-400">
                      <div className="flex items-center gap-1.5"><Calendar size={14} /> <b>Inicio:</b> {formatDisplayDate(anuncio.start_date)}</div>
                      <div className="flex items-center gap-1.5 text-gray-500"><Clock size={14} /> <b>Fin:</b> {formatDisplayDate(anuncio.end_date)}</div>
                    </div>
                  </div>

                  <div className="flex sm:flex-col gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-[#2a2a2a] pt-4 sm:pt-0 sm:pl-4">
                    <button 
                      onClick={() => handleEdit(anuncio)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#121212] text-gray-300 hover:text-white border border-[#2a2a2a] hover:border-gray-500 rounded-lg transition-colors text-sm font-bold"
                    >
                      <Edit2 size={16} /> Editar
                    </button>
                    <button 
                      onClick={() => handleDelete(anuncio.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-500/5 text-red-500 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/30 rounded-lg transition-colors text-sm font-bold"
                    >
                      <Trash2 size={16} /> Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}