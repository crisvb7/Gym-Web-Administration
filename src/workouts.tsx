import React, { useState, useEffect } from "react";
import { Dumbbell, Plus, Search, Video, X, Loader2, Save, Trash2, Edit, Play, UserPlus, Calendar } from "lucide-react";
import { supabase } from "./lib/supabase"; 

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

export function WorkoutsPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  
  // Estados para los Modales de Creación/Edición/Preview
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewExercise, setPreviewExercise] = useState<Exercise | null>(null);
  
  // Estados para el Modal de Asignación
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningExercise, setAssigningExercise] = useState<Exercise | null>(null);
  const [assignData, setAssignData] = useState({
    user_id: "",
    exercise_id: "",
    date: new Date().toISOString().split('T')[0],
    target_sets: 3,
    target_reps: 10,
    target_weight: 0
  });

  // NUEVO: Estados para el buscador de clientes
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    category: "Pecho",
    description: "",
    video_url: "",
    thumbnail_url: "",
    kcal_estimate: 0.5,
    time_estimate: 3,
    rest_time: 60
  });

  const categories = ["Pecho", "Espalda", "Pierna", "Hombro", "Brazo", "Core", "Cardio", "CrossFit", "Otros"];

  useEffect(() => {
    fetchExercises();
    fetchClients();
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

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('role', 'client')
        .order('first_name');
      
      if (error) throw error;
      if (data) {
        setClients(data);
      }
    } catch (error) {
      console.error("Error cargando clientes:", error);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      name: "", category: "Pecho", description: "", video_url: "", 
      thumbnail_url: "", kcal_estimate: 0.5, time_estimate: 3, rest_time: 60
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setFormData({
      name: ex.name || "",
      category: ex.category || "Pecho",
      description: ex.description || "",
      video_url: ex.video_url || "",
      thumbnail_url: ex.thumbnail_url || "",
      kcal_estimate: ex.kcal_estimate || 0.5,
      time_estimate: ex.time_estimate || 3,
      rest_time: ex.rest_time || 60
    });
    setIsModalOpen(true);
  };

  const handleOpenAssign = (ex: Exercise) => {
    setAssigningExercise(ex);
    setAssignData(prev => ({ 
      ...prev, 
      exercise_id: ex.id,
      user_id: "", // Reseteamos el usuario
      date: new Date().toISOString().split('T')[0] 
    }));
    setClientSearchTerm(""); // Reseteamos el buscador
    setShowClientDropdown(false);
    setIsAssignModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('exercises').update(formData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('exercises').insert([formData]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchExercises(); 
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Hubo un error al guardar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignData.user_id) return alert("Por favor, busca y selecciona un atleta de la lista.");
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('workout_assignments').insert([{
        user_id: assignData.user_id,
        exercise_id: assignData.exercise_id,
        assigned_date: assignData.date,
        target_sets: assignData.target_sets,
        target_reps: assignData.target_reps,
        target_weight: assignData.target_weight
      }]);

      if (error) throw error;
      
      setIsAssignModalOpen(false);
      alert("¡Ejercicio asignado correctamente!");
    } catch (error: any) {
      console.error("Error asignando:", error);
      alert("Error al asignar el ejercicio. Verifica que la tabla exista en Supabase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar "${name}"?`)) {
      try {
        const { error } = await supabase.from('exercises').delete().eq('id', id);
        if (error) throw error;
        setExercises(exercises.filter(ex => ex.id !== id));
      } catch (error) {
        console.error("Error eliminando:", error);
      }
    }
  };

  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(searchTerm.toLowerCase()) || ex.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "Todos" || ex.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // NUEVO: Clientes filtrados por la barra de búsqueda del modal
  const filteredClients = clients.filter(client => 
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(clientSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Biblioteca de Ejercicios</h1>
          <p className="text-gray-400 mt-1">Gestiona el catálogo y asigna rutinas a tus atletas.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="bg-[#E31C25] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] shrink-0"
        >
          <Plus size={20} /> Añadir Ejercicio
        </button>
      </div>

      {/* Barra de Búsqueda */}
      <div className="bg-[#121212] border border-[#2a2a2a] p-4 rounded-2xl flex items-center gap-3">
        <Search className="text-gray-500 w-5 h-5" />
        <input 
          type="text"
          placeholder="Buscar ejercicio por nombre..."
          className="bg-transparent border-none text-white outline-none w-full placeholder:text-gray-600"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Filtros por Categoría */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        <button 
          onClick={() => setSelectedCategory("Todos")}
          className={`px-5 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${selectedCategory === "Todos" ? "bg-[#E31C25] text-white" : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#2a2a2a]"}`}
        >
          Todos
        </button>
        {categories.map(cat => (
          <button 
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-5 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${selectedCategory === cat ? "bg-[#E31C25] text-white" : "bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a] hover:bg-[#2a2a2a]"}`}
          >
            {cat}
          </button>
        ))}
      </div>
      
      {/* Contenido Principal */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-10 h-10 text-[#E31C25] animate-spin" />
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-20 flex flex-col items-center text-center shadow-xl">
          <div className="w-24 h-24 bg-[#E31C25]/5 rounded-full flex items-center justify-center mb-6 border border-[#E31C25]/10">
            <Dumbbell className="w-12 h-12 text-[#E31C25] opacity-80" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Sin ejercicios</h2>
          <p className="text-gray-400 max-w-sm mx-auto">
            No se encontraron resultados para esta búsqueda o categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExercises.map((ex) => (
            <div key={ex.id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden hover:border-[#E31C25]/50 transition-all group">
              
              {/* Tarjeta de Imagen */}
              <div 
                className={`h-48 bg-[#121212] relative overflow-hidden group ${ex.video_url ? 'cursor-pointer' : ''}`}
                onClick={() => ex.video_url && setPreviewExercise(ex)}
              >
                {ex.thumbnail_url ? (
                  <img src={ex.thumbnail_url} alt={ex.name} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Dumbbell className="w-12 h-12 text-gray-700" />
                  </div>
                )}
                
                {ex.video_url && (
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm p-2 rounded-lg text-white">
                    <Video size={16} />
                  </div>
                )}

                {ex.video_url && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-[#E31C25] p-4 rounded-full text-white shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                      <Play size={24} fill="currentColor" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 bg-[#E31C25] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-lg">
                  {ex.category}
                </div>
              </div>

              {/* Información de la Tarjeta */}
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-white truncate pr-2">{ex.name}</h3>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleOpenAssign(ex)} title="Asignar a atleta" className="text-gray-500 hover:text-white transition-colors bg-[#121212] p-1.5 rounded-md border border-[#2a2a2a]">
                      <UserPlus size={16} />
                    </button>
                    <button onClick={() => handleOpenEdit(ex)} title="Editar" className="text-gray-500 hover:text-blue-500 transition-colors bg-[#121212] p-1.5 rounded-md border border-[#2a2a2a]">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(ex.id, ex.name)} title="Eliminar" className="text-gray-500 hover:text-[#E31C25] transition-colors bg-[#121212] p-1.5 rounded-md border border-[#2a2a2a]">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-400 line-clamp-2 mb-4 h-10">
                  {ex.description || "Sin descripción detallada."}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal del Reproductor de Video */}
      {previewExercise && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewExercise(null)}
        >
          <div 
            className="bg-[#121212] border border-[#2a2a2a] w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <div>
                <h3 className="text-xl font-bold text-white">{previewExercise.name}</h3>
                <span className="text-xs font-bold text-[#E31C25] uppercase tracking-wider">{previewExercise.category}</span>
              </div>
              <button onClick={() => setPreviewExercise(null)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="aspect-video w-full bg-black">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${previewExercise.video_url}?autoplay=1`}
                title={previewExercise.name}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>

            <div className="p-6 bg-[#1a1a1a]">
              <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wide">Descripción e Instrucciones</h4>
              <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                {previewExercise.description || "Este ejercicio no tiene instrucciones detalladas."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Asignar a Cliente (Con buscador integrado) */}
      {isAssignModalOpen && assigningExercise && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between p-5 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <div>
                <h2 className="text-lg font-bold text-white">Asignar a Atleta</h2>
                <p className="text-xs text-gray-400">{assigningExercise.name}</p>
              </div>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-1.5 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              
              {/* BUSCADOR DE ATLETAS PERSONALIZADO */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-400 mb-2">Buscar y Seleccionar Atleta *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Escribe el nombre del atleta..."
                    value={clientSearchTerm}
                    onChange={(e) => {
                      setClientSearchTerm(e.target.value);
                      setShowClientDropdown(true);
                      if (assignData.user_id) setAssignData({...assignData, user_id: ""}); // Limpia ID si el usuario borra/escribe
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)} // Delay para que el click funcione
                    className={`w-full bg-[#1a1a1a] border p-3 pl-10 rounded-xl text-white outline-none transition-colors ${!assignData.user_id && clientSearchTerm === "" ? "border-[#E31C25]/50" : "border-[#2a2a2a] focus:border-[#E31C25]"}`}
                  />
                </div>

                {/* Desplegable de Resultados */}
                {showClientDropdown && (
                  <div className="absolute z-10 w-full mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl max-h-48 overflow-y-auto shadow-2xl custom-scrollbar">
                    {filteredClients.length > 0 ? (
                      filteredClients.map(client => (
                        <div 
                          key={client.id}
                          className="p-3 hover:bg-[#2a2a2a] cursor-pointer text-white border-b border-[#2a2a2a] last:border-b-0 flex items-center gap-2"
                          onClick={() => {
                            setAssignData({...assignData, user_id: client.id});
                            setClientSearchTerm(`${client.first_name} ${client.last_name}`);
                            setShowClientDropdown(false);
                          }}
                        >
                          <div className="w-6 h-6 bg-[#E31C25]/20 text-[#E31C25] rounded-full flex items-center justify-center text-xs font-bold">
                            {client.first_name.charAt(0)}
                          </div>
                          {client.first_name} {client.last_name}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-gray-500 text-sm text-center italic">
                        No se encontraron atletas con ese nombre.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Fecha Programada</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
                  <input 
                    type="date" 
                    required 
                    value={assignData.date} 
                    onChange={(e) => setAssignData({...assignData, date: e.target.value})} 
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 pl-10 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 text-center">Peso Obj. (Kg)</label>
                  <input type="number" value={assignData.target_weight} onChange={(e) => setAssignData({...assignData, target_weight: parseFloat(e.target.value)})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-lg text-white text-center outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 text-center">Series (Sets)</label>
                  <input type="number" required value={assignData.target_sets} onChange={(e) => setAssignData({...assignData, target_sets: parseInt(e.target.value)})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-lg text-white text-center outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1 text-center">Repeticiones</label>
                  <input type="number" required value={assignData.target_reps} onChange={(e) => setAssignData({...assignData, target_reps: parseInt(e.target.value)})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-lg text-white text-center outline-none" />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting || !assignData.user_id}
                className={`w-full font-bold py-3 mt-4 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                  isSubmitting || !assignData.user_id ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#E31C25] text-white hover:bg-[#A6151B]'
                }`}
              >
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Confirmar Asignación'}
              </button>
            </form>

          </div>
        </div>
      )}

      {/* Modal de Creación/Edición General */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-[#121212] w-full max-w-md h-full border-l border-[#2a2a2a] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <h2 className="text-xl font-bold text-white">
                {editingId ? "Editar Ejercicio" : "Nuevo Ejercicio"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white bg-[#2a2a2a] p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <form id="exercise-form" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Nombre del ejercicio *</label>
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" placeholder="Ej: Press de Banca" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Categoría *</label>
                  <select required value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none cursor-pointer">
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">ID de Video de YouTube (Opcional)</label>
                  <input type="text" value={formData.video_url} onChange={(e) => setFormData({...formData, video_url: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" placeholder="Ej: dQw4w9WgXcQ" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">URL de la Miniatura (Opcional)</label>
                  <input type="url" value={formData.thumbnail_url} onChange={(e) => setFormData({...formData, thumbnail_url: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" placeholder="https://ejemplo.com/imagen.jpg" />
                </div>
                <div className="grid grid-cols-3 gap-4 p-4 bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 text-center">Kcal / Rep</label>
                    <input type="number" step="0.1" required value={formData.kcal_estimate} onChange={(e) => setFormData({...formData, kcal_estimate: parseFloat(e.target.value)})} className="w-full bg-[#121212] border border-[#2a2a2a] p-2 rounded-lg text-white text-center outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 text-center">Tiempo (s)</label>
                    <input type="number" required value={formData.time_estimate} onChange={(e) => setFormData({...formData, time_estimate: parseInt(e.target.value)})} className="w-full bg-[#121212] border border-[#2a2a2a] p-2 rounded-lg text-white text-center outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 text-center">Descanso (s)</label>
                    <input type="number" required value={formData.rest_time} onChange={(e) => setFormData({...formData, rest_time: parseInt(e.target.value)})} className="w-full bg-[#121212] border border-[#2a2a2a] p-2 rounded-lg text-white text-center outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2">Descripción</label>
                  <textarea rows={4} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none resize-none" placeholder="Explica la técnica..." />
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-[#2a2a2a] bg-[#1a1a1a]">
              <button form="exercise-form" type="submit" disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : <><Save size={20} /> {editingId ? "Guardar Cambios" : "Crear Ejercicio"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}