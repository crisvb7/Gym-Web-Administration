import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, X, Apple, CalendarPlus, Loader2, UploadCloud, Search, ArrowUpDown, Filter } from "lucide-react";
import { supabase } from "./lib/supabase";

export function NutritionManager() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE FILTRO Y BÚSQUEDA ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [sortOrder, setSortOrder] = useState('default'); // 'default', 'asc', 'desc'

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [newRecipe, setNewRecipe] = useState({
    name: '', category: 'Desayuno', calories: '', protein: '', carbs: '', fat: '', image_url: '', description: '', instructions: ''
  });

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [recipeToAssign, setRecipeToAssign] = useState<any>(null);
  const [assignData, setAssignData] = useState({
    user_id: '', assigned_date: '', meal_type: 'Almuerzo'
  });

  const fetchData = async () => {
    setLoading(true);
    const { data: recipesData } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
    if (recipesData) setRecipes(recipesData);

    const { data: clientsData } = await supabase.from('profiles').select('id, first_name, last_name').eq('role', 'client');
    if (clientsData) setClients(clientsData);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- LÓGICA DE FILTRADO Y ORDENACIÓN ---
  const processedRecipes = recipes
    .filter(recipe => filterCategory === 'Todas' || recipe.category === filterCategory)
    .filter(recipe => recipe.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'asc') return a.calories - b.calories;
      if (sortOrder === 'desc') return b.calories - a.calories;
      return 0; // default (por fecha de creación, como viene de la DB)
    });

  const handleOpenCreate = () => {
    setEditingRecipeId(null);
    setImageFile(null);
    setNewRecipe({ name: '', category: 'Desayuno', calories: '', protein: '', carbs: '', fat: '', image_url: '', description: '', instructions: '' });
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (recipe: any) => {
    setEditingRecipeId(recipe.id);
    setImageFile(null);
    setNewRecipe({
      name: recipe.name || '',
      category: recipe.category || 'Desayuno',
      calories: String(recipe.calories || ''),
      protein: String(recipe.protein || ''),
      carbs: String(recipe.carbs || ''),
      fat: String(recipe.fat || ''),
      image_url: recipe.image_url || '',
      description: recipe.description || '',
      instructions: recipe.instructions || ''
    });
    setIsDrawerOpen(true);
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let finalImageUrl = newRecipe.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop";

    if (imageFile) {
      try {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `recipes/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('recipe-images').upload(filePath, imageFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('recipe-images').getPublicUrl(filePath);
        finalImageUrl = publicUrl;
      } catch (err: any) {
        alert("Error al subir la imagen: " + err.message);
        setIsSubmitting(false);
        return; 
      }
    }
    
    const recipeData = {
      name: newRecipe.name,
      category: newRecipe.category,
      calories: parseInt(newRecipe.calories) || 0,
      protein: parseInt(newRecipe.protein) || 0,
      carbs: parseInt(newRecipe.carbs) || 0,
      fat: parseInt(newRecipe.fat) || 0,
      image_url: finalImageUrl,
      description: newRecipe.description,
      instructions: newRecipe.instructions
    };

    let error;
    if (editingRecipeId) {
      const { error: updateError } = await supabase.from('recipes').update(recipeData).eq('id', editingRecipeId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('recipes').insert([recipeData]);
      error = insertError;
    }

    if (!error) {
      setIsDrawerOpen(false);
      setEditingRecipeId(null);
      setImageFile(null);
      setNewRecipe({ name: '', category: 'Desayuno', calories: '', protein: '', carbs: '', fat: '', image_url: '', description: '', instructions: '' });
      fetchData();
    } else {
      alert("Error guardando receta: " + error.message);
    }
    setIsSubmitting(false);
  };

  const handleDeleteRecipe = async (id: string, name: string) => {
    if (window.confirm(`¿Seguro que quieres borrar la receta: ${name}?`)) {
      await supabase.from('recipes').delete().eq('id', id);
      fetchData();
    }
  };

  const openAssignModal = (recipe: any) => {
    setRecipeToAssign(recipe);
    setAssignData({ user_id: clients[0]?.id || '', assigned_date: new Date().toISOString().split('T')[0], meal_type: recipe.category });
    setIsAssignModalOpen(true);
  };

  const handleAssignMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignData.user_id) return alert("Selecciona un cliente");

    setIsSubmitting(true);
    const { error } = await supabase.from('assigned_meals').insert([{
      user_id: assignData.user_id,
      recipe_id: recipeToAssign.id,
      assigned_date: assignData.assigned_date,
      meal_type: assignData.meal_type
    }]);

    if (!error) {
      setIsAssignModalOpen(false);
      alert(`¡Receta asignada correctamente!`);
    } else {
      alert("Error al asignar: " + error.message);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Gestor de Nutrición</h1>
          <p className="text-gray-400 mt-1">Base de datos de recetas maestras y asignaciones.</p>
        </div>
        <button onClick={handleOpenCreate} className="bg-[#E31C25] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] shrink-0">
          <Plus size={20} /> Añadir Receta
        </button>
      </div>

      {/* --- BARRA DE HERRAMIENTAS (Buscador y Filtros) --- */}
      <div className="flex flex-col xl:flex-row gap-4 bg-[#1a1a1a] p-4 rounded-2xl border border-[#2a2a2a] shadow-lg">
        
        {/* Buscador */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre..." 
            className="w-full bg-[#121212] border border-[#2a2a2a] pl-10 pr-4 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filtros (Categoría y Orden) */}
        <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
          <div className="relative w-full sm:w-auto">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <select 
              className="w-full sm:w-auto bg-[#121212] border border-[#2a2a2a] pl-10 pr-8 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="Todas">Todas las categorías</option>
              <option value="Desayuno">Desayuno</option>
              <option value="Almuerzo">Almuerzo</option>
              <option value="Cena">Cena</option>
              <option value="Snack">Snack</option>
              <option value="Pre-Entreno">Pre-Entreno</option>
              <option value="Post-Entreno">Post-Entreno</option>
            </select>
          </div>
          
          <div className="relative w-full sm:w-auto">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <select 
              className="w-full sm:w-auto bg-[#121212] border border-[#2a2a2a] pl-10 pr-8 py-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="default">Orden por defecto</option>
              <option value="asc">Menos calorías primero</option>
              <option value="desc">Más calorías primero</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-[#121212] border-b border-[#2a2a2a] text-gray-400 text-xs uppercase font-bold tracking-wider">
            <tr>
              <th className="p-4">Receta y Macros</th>
              <th className="p-4 hidden sm:table-cell">Categoría</th>
              <th className="p-4">Calorías</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {loading ? (
              <tr><td colSpan={4} className="p-8 text-center text-[#E31C25]"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
            ) : processedRecipes.map((recipe) => (
              <tr key={recipe.id} className="hover:bg-white/5 transition-colors group">
                <td className="p-4 flex items-center gap-4">
                  <img src={recipe.image_url} alt={recipe.name} className="w-12 h-12 rounded-xl object-cover border border-[#2a2a2a]" />
                  <div>
                    <span className="font-bold text-white block">{recipe.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono mt-1 block">P: {recipe.protein}g • C: {recipe.carbs}g • G: {recipe.fat}g</span>
                  </div>
                </td>
                <td className="p-4 hidden sm:table-cell">
                  <span className="px-3 py-1 bg-[#2a2a2a] text-gray-300 rounded-lg text-xs font-medium">{recipe.category}</span>
                </td>
                <td className="p-4 font-bold text-[#E31C25]">{recipe.calories} kcal</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openAssignModal(recipe)} className="p-2 text-gray-400 hover:text-[#E31C25] hover:bg-[#E31C25]/10 rounded-lg transition-colors flex items-center gap-2" title="Asignar a Cliente">
                      <CalendarPlus size={18} className="sm:hidden" />
                      <span className="hidden sm:block text-xs font-bold uppercase bg-[#E31C25]/10 text-[#E31C25] px-2 py-1 rounded">Asignar</span>
                    </button>
                    <button onClick={() => handleOpenEdit(recipe)} className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2a2a] rounded-lg transition-colors" title="Editar">
                      <Edit2 size={18}/>
                    </button>
                    <button onClick={() => handleDeleteRecipe(recipe.id, recipe.name)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar">
                      <Trash2 size={18}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && processedRecipes.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-gray-500">No hay recetas que coincidan con los filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- PANEL LATERAL (Añadir/Editar Receta) --- */}
      {isDrawerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex justify-end">
          <div className="w-full max-w-md bg-[#1a1a1a] h-full p-8 border-l border-[#2a2a2a] animate-in slide-in-from-right duration-300 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Apple className="text-[#E31C25]" /> {editingRecipeId ? 'Editar Receta' : 'Nueva Receta'}
              </h2>
              <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-white transition-colors bg-[#121212] p-2 rounded-full border border-[#2a2a2a]"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSaveRecipe} className="space-y-5">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre del plato</label>
                <input required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.name} onChange={e => setNewRecipe({...newRecipe, name: e.target.value})} placeholder="Ej: Avena con Proteína" />
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fotografía del Plato</label>
                <div className="relative border-2 border-dashed border-[#2a2a2a] hover:border-[#E31C25] rounded-xl p-4 text-center transition-colors bg-[#121212]">
                  <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <UploadCloud className="w-8 h-8 text-gray-500" />
                    <span className="text-sm font-bold text-white">{imageFile ? imageFile.name : 'Haz clic para subir desde tu PC'}</span>
                    {!imageFile && <span className="text-xs text-gray-500">JPG, PNG, WEBP</span>}
                  </div>
                </div>
                {editingRecipeId && !imageFile && newRecipe.image_url && (
                  <p className="text-xs text-[#E31C25] mt-2 text-right">Ya hay una imagen guardada. Sube otra solo si quieres cambiarla.</p>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Resumen / Descripción</label>
                <textarea className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none min-h-[80px]" value={newRecipe.description} onChange={e => setNewRecipe({...newRecipe, description: e.target.value})} placeholder="Breve descripción del plato..." />
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Instrucciones de preparación</label>
                <textarea className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none min-h-[120px]" value={newRecipe.instructions} onChange={e => setNewRecipe({...newRecipe, instructions: e.target.value})} placeholder="1. Mezcla la avena...&#10;2. Calienta en el microondas..." />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Momento ideal</label>
                  <select className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none" value={newRecipe.category} onChange={e => setNewRecipe({...newRecipe, category: e.target.value})}>
                    <option>Desayuno</option>
                    <option>Almuerzo</option>
                    <option>Cena</option>
                    <option>Snack</option>
                    <option>Pre-Entreno</option>
                    <option>Post-Entreno</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">URL de Imagen</label>
                  <input type="url" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.image_url} onChange={e => setNewRecipe({...newRecipe, image_url: e.target.value})} placeholder="https://..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-[#2a2a2a] pt-5 mt-5">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Calorías</label><input type="number" required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.calories} onChange={e => setNewRecipe({...newRecipe, calories: e.target.value})} placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Proteína (g)</label><input type="number" required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.protein} onChange={e => setNewRecipe({...newRecipe, protein: e.target.value})} placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Carbs (g)</label><input type="number" required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.carbs} onChange={e => setNewRecipe({...newRecipe, carbs: e.target.value})} placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Grasas (g)</label><input type="number" required className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.fat} onChange={e => setNewRecipe({...newRecipe, fat: e.target.value})} placeholder="0" /></div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-8 hover:bg-[#A6151B] transition-colors flex items-center justify-center shadow-[0_0_15px_rgba(227,28,37,0.2)]">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingRecipeId ? 'Actualizar Receta' : 'Guardar en Base de Datos')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ASIGNAR RECETA AL CLIENTE --- */}
      {isAssignModalOpen && recipeToAssign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsAssignModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-2 text-white flex items-center gap-2">
              <CalendarPlus className="text-[#E31C25]" /> Asignar Plan
            </h2>
            <p className="text-sm text-gray-400 mb-6">Enviando: <span className="font-bold text-[#E31C25]">{recipeToAssign.name}</span></p>
            
            <form onSubmit={handleAssignMeal} className="space-y-5">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Seleccionar Atleta</label>
                <select required className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={assignData.user_id} onChange={e => setAssignData({...assignData, user_id: e.target.value})}>
                  <option value="" disabled>-- Elige un cliente --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.first_name} {client.last_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha</label>
                  <input type="date" required className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" value={assignData.assigned_date} onChange={e => setAssignData({...assignData, assigned_date: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Tipo de Comida</label>
                  <select className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none" value={assignData.meal_type} onChange={e => setAssignData({...assignData, meal_type: e.target.value})}>
                    <option>Desayuno</option>
                    <option>Almuerzo</option>
                    <option>Cena</option>
                    <option>Snack</option>
                    <option>Pre-Entreno</option>
                    <option>Post-Entreno</option>
                  </select>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-6 hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Confirmar Asignación'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}