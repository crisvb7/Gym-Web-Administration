import React, { useState, useEffect, useMemo } from "react";
import { Plus, Edit2, Trash2, X, Apple, CalendarPlus, Loader2, UploadCloud, Search, ArrowUpDown, Filter, Calendar, Clock, FileText, CheckCircle, User, Utensils, Flame } from "lucide-react";
import { supabase } from "./lib/supabase";

// ==========================================
// FUNCIONES AUXILIARES Y COMPONENTES
// ==========================================

const MEAL_TYPES = ['Desayuno', 'Media mañana', 'Almuerzo', 'Comida', 'Merienda', 'Cena', 'Snack', 'Pre-Entreno', 'Intra-Entreno', 'Post-Entreno'];

interface DayItem {
  date: string;
  dayName: string;
  dayNumber: number;
}

// 1. Lógica para obtener fecha local sin desfase UTC
const getTodayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

// 2. Generador de días ajustado a fecha local
const generateDaysAround = (baseDateStr: string) => {
  const days = [];
  const baseDate = new Date(baseDateStr);
  for (let i = -3; i <= 3; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
      dayNumber: d.getDate(),
    });
  }
  return days;
};

export function ClientNutritionHistory({ clientId }: { clientId: string }) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocal());
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Al pasarle 'selectedDate', el carrusel siempre se centrará en la fecha que elijas
  const daysList = useMemo(() => generateDaysAround(selectedDate), [selectedDate]);

  useEffect(() => {
    if (clientId && selectedDate) {
      fetchDayHistory();
    }
  }, [clientId, selectedDate]);

  const fetchDayHistory = async () => {
    setLoading(true);
    try {
      const { data: logsData } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('user_id', clientId)
        .gte('logged_at', `${selectedDate}T00:00:00`)
        .lte('logged_at', `${selectedDate}T23:59:59`);

      const { data: assignedData } = await supabase
        .from('assigned_meals')
        .select('id, meal_type, recipes(name, calories, protein, carbs, fat, image_url)')
        .eq('user_id', clientId)
        .eq('assigned_date', selectedDate);

      let combined: any[] = [];

      if (assignedData) {
        assignedData.forEach((item: any) => {
          const recipe = item.recipes || {};
          combined.push({
            id: item.id,
            food_name: recipe.name,
            calories: recipe.calories,
            protein: recipe.protein,
            carbs: recipe.carbs,
            fat: recipe.fat,
            image_url: recipe.image_url,
            meal_type: item.meal_type || 'Snack',
            is_planned: true
          });
        });
      }

      if (logsData) {
        logsData.forEach((item: any) => {
          combined.push({
            id: item.id,
            food_name: item.food_name,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            image_url: item.image_url,
            meal_type: item.meal_type || 'Snack',
            is_planned: false
          });
        });
      }

      setHistory(combined);
    } catch (error) {
      console.error("Error cargando historial:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full font-sans">
      
      {/* NUEVO: Botón "Cambiar fecha" invisible que abre el calendario nativo */}
      <div className="relative flex items-center gap-2 mt-2 px-2 w-fit">
        <Calendar size={18} className="text-[#E31C25]" />
        <span className="text-[#E31C25] text-sm font-bold">Cambiar fecha</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [color-scheme:dark]"
        />
      </div>

      <div 
        className="flex overflow-x-auto gap-3 py-4 mb-2 pb-4" 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {daysList.map((dayObj: DayItem) => {
          const isSelected = dayObj.date === selectedDate;
          return (
            <button
              key={dayObj.date}
              onClick={() => setSelectedDate(dayObj.date)}
              className={`flex flex-col items-center justify-center min-w-[65px] h-[80px] rounded-2xl border transition-all duration-200 shrink-0 ${
                isSelected 
                  ? 'bg-[#E31C25] border-[#E31C25] shadow-lg shadow-red-500/20' 
                  : 'bg-[#18181b] border-[#27272a] hover:bg-[#27272a]'
              }`}
            >
              <span className={`text-xs font-medium mb-1 ${isSelected ? 'text-white/90' : 'text-[#a1a1aa]'}`}>
                {dayObj.dayName}
              </span>
              <span className={`text-xl font-bold ${isSelected ? 'text-white' : 'text-[#d4d4d8]'}`}>
                {dayObj.dayNumber}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-[#E31C25] animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <Utensils className="text-[#3f3f46] mb-3" size={40} />
            <p className="text-[#a1a1aa] font-medium">No hay comidas registradas para este día.</p>
          </div>
        ) : (
          MEAL_TYPES.map(category => {
            const categoryLogs = history.filter(log => (log.meal_type || 'Otros') === category);
            if (categoryLogs.length === 0) return null;

            return (
              <div key={category} className="mb-6">
                <h4 className="text-[#a1a1aa] text-xs font-bold uppercase tracking-wider mb-3 px-2">{category}</h4>
                {categoryLogs.map(log => (
                  <div key={log.id} className={`bg-[#18181b] rounded-2xl p-4 flex items-center gap-4 border mb-3 ${log.is_planned ? 'border-[#E31C25]' : 'border-[#27272a]'}`}>
                    <div className="w-14 h-14 rounded-xl bg-[#27272a] overflow-hidden flex-shrink-0">
                      {log.image_url ? (
                        <img src={log.image_url} alt={log.food_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Utensils size={20} className="text-[#52525b]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-bold text-base truncate">{log.food_name}</h3>
                        {log.is_planned && <span className="text-[10px] font-bold text-[#E31C25] bg-[#E31C25]/20 px-1.5 py-0.5 rounded shrink-0">PLAN</span>}
                      </div>
                      <p className="text-[#a1a1aa] text-xs mb-1.5">P: {log.protein || 0}g · C: {log.carbs || 0}g · G: {log.fat || 0}g</p>
                      <div className="flex items-center text-[#E31C25] text-xs font-bold">
                        <Flame size={12} className="mr-1 text-[#a1a1aa]" /> {log.calories} kcal
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export function NutritionManager() {
  // --- ESTADOS GENERALES ---
  const [recipes, setRecipes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recipes' | 'templates' | 'nutrition_appointments' | 'client_history'>('recipes');

  // --- ESTADOS DE FILTRO Y BÚSQUEDA ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [sortOrder, setSortOrder] = useState('default'); 

  // --- ESTADOS DE GESTIÓN DE RECETAS ---
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [newRecipe, setNewRecipe] = useState({
    name: '', category: 'Desayuno', calories: '', protein: '', carbs: '', fat: '', image_url: '', description: '', instructions: '', ingredients: ''
  });

  // --- ESTADOS DE ASIGNACIÓN INDIVIDUAL ---
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [recipeToAssign, setRecipeToAssign] = useState<any>(null);
  const [assignData, setAssignData] = useState({
    user_id: '', assigned_date: '', meal_type: 'Almuerzo'
  });

  // --- ESTADOS DE CITAS ---
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [appointmentData, setAppointmentData] = useState({ user_id: '', appointment_date: '' });
  const [appointmentMonthFilter, setAppointmentMonthFilter] = useState('all');

  // --- ESTADOS DE BÚSQUEDA DE CLIENTES (Compartido) ---
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // --- ESTADOS PARA PLANTILLAS DE NUTRICIÓN ---
  const [templates, setTemplates] = useState<any[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "" });
  const [selectedTemplateRecipes, setSelectedTemplateRecipes] = useState<any[]>([]);
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");  

  // --- ESTADOS PARA ASIGNAR PLANTILLA ---
  const [isTemplateAssignModalOpen, setIsTemplateAssignModalOpen] = useState(false);
  const [templateToAssign, setTemplateToAssign] = useState<any>(null);

  // --- ESTADOS PARA HISTORIAL DE CLIENTES ---
  const [historyClientSearch, setHistoryClientSearch] = useState('');
  const [showHistoryClientDropdown, setShowHistoryClientDropdown] = useState(false);
  const [selectedHistoryClientId, setSelectedHistoryClientId] = useState<string | null>(null);
  const [selectedHistoryClientName, setSelectedHistoryClientName] = useState<string>('');


  // ==========================================
  // CARGA DE DATOS
  // ==========================================
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: recipesData } = await supabase.from('recipes').select('*').order('created_at', { ascending: false });
      if (recipesData) setRecipes(recipesData);

      const { data: clientsData } = await supabase.from('profiles').select('id, first_name, last_name').eq('role', 'client').order('first_name');
      if (clientsData) setClients(clientsData);

      const { data: apptData } = await supabase
        .from('nutrition_appointments')
        .select('*, profiles(first_name, last_name)')
        .order('appointment_date', { ascending: true });
      if (apptData) setAppointments(apptData);
      
      const { data: templatesData } = await supabase
        .from('nutrition_templates')
        .select(`
          id, name,
          nutrition_template_recipes (
            id, meal_type, order_index,
            recipe:recipes (*)
          )
        `)
        .order('created_at', { ascending: false });

      if (templatesData) {
        const formatted = templatesData.map((t: any) => ({
          ...t,
          nutrition_template_recipes: t.nutrition_template_recipes.sort((a: any, b: any) => a.order_index - b.order_index)
        }));
        setTemplates(formatted);
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ==========================================
  // LÓGICA DE RECETAS INDIVIDUALES
  // ==========================================
  const handleOpenCreate = () => {
    setEditingRecipeId(null);
    setImageFile(null);
    setNewRecipe({ name: '', category: 'Desayuno', calories: '', protein: '', carbs: '', fat: '', image_url: '', description: '', instructions: '', ingredients: '' });
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (recipe: any) => {
    setEditingRecipeId(recipe.id);
    setImageFile(null);
    
    let splitIngredients = '';
    let splitInstructions = recipe.instructions || '';
    
    if (splitInstructions.includes('Preparación:\n')) {
      const parts = splitInstructions.split('\n\nPreparación:\n');
      splitIngredients = parts[0].replace('Ingredientes:\n', '');
      splitInstructions = parts[1];
    }

    setNewRecipe({
      name: recipe.name || '',
      category: recipe.category || 'Desayuno',
      calories: String(recipe.calories || ''),
      protein: String(recipe.protein || ''),
      carbs: String(recipe.carbs || ''),
      fat: String(recipe.fat || ''),
      image_url: recipe.image_url || '',
      description: recipe.description || '',
      instructions: splitInstructions,
      ingredients: splitIngredients
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
    
    const finalInstructions = newRecipe.ingredients.trim() !== '' 
      ? `Ingredientes:\n${newRecipe.ingredients}\n\nPreparación:\n${newRecipe.instructions}`
      : newRecipe.instructions;

    const recipeData = {
      name: newRecipe.name,
      category: newRecipe.category,
      calories: parseInt(newRecipe.calories) || 0,
      protein: parseInt(newRecipe.protein) || 0,
      carbs: parseInt(newRecipe.carbs) || 0,
      fat: parseInt(newRecipe.fat) || 0,
      image_url: finalImageUrl,
      description: newRecipe.description,
      instructions: finalInstructions 
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
    setAssignData({ user_id: '', assigned_date: new Date().toISOString().split('T')[0], meal_type: recipe.category });
    setClientSearch('');
    setShowClientDropdown(false);
    setIsAssignModalOpen(true);
  };

  const handleAssignMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignData.user_id) return alert("Por favor, busca y selecciona un atleta de la lista.");

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

  // ==========================================
  // LÓGICA DE CITAS
  // ==========================================
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointmentData.appointment_date || !appointmentData.user_id) return;
    
    try {
      const [datePart, timePart] = appointmentData.appointment_date.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      const localDateObj = new Date(year, month - 1, day, hour, minute);
      const dateToSave = localDateObj.toISOString();

      const { error } = await supabase
        .from('nutrition_appointments')
        .insert([{
          user_id: appointmentData.user_id,
          appointment_date: dateToSave,
        }]);

      if (error) throw error;

      setIsAppointmentModalOpen(false);
      setAppointmentData({ user_id: '', appointment_date: '' });
      fetchData(); 
      alert('¡Cita agendada correctamente!');
    } catch (err: any) {
      alert("Hubo un error al guardar la cita: " + err.message);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta cita?")) return;
    try {
      const { error } = await supabase.from('nutrition_appointments').delete().eq('id', id);
      if (error) throw error;
      fetchData(); 
    } catch (err) {
      alert("No se pudo eliminar la cita");
    }
  };

  // ==========================================
  // LÓGICA DE PLANTILLAS NUTRICIONALES
  // ==========================================
  const handleAddRecipeToTemplate = (recipe: any) => {
    setSelectedTemplateRecipes([
      ...selectedTemplateRecipes,
      { recipe, meal_type: "Desayuno" }
    ]);
    setTemplateSearchTerm("");
  };

  const handleRemoveRecipeFromTemplate = (index: number) => {
    setSelectedTemplateRecipes(selectedTemplateRecipes.filter((_, i) => i !== index));
  };

  const handleTemplateMealTypeChange = (index: number, type: string) => {
    const updated = [...selectedTemplateRecipes];
    updated[index].meal_type = type;
    setSelectedTemplateRecipes(updated);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || selectedTemplateRecipes.length === 0) return alert("Falta el nombre o añadir recetas.");
    setIsSubmitting(true);

    try {
      const { data: templateData, error: tError } = await supabase
        .from('nutrition_templates')
        .insert([{ name: templateForm.name }])
        .select()
        .single();

      if (tError) throw tError;

      const detailsInserts = selectedTemplateRecipes.map((item, idx) => ({
        template_id: templateData.id,
        recipe_id: item.recipe.id,
        meal_type: item.meal_type,
        order_index: idx
      }));

      const { error: dError } = await supabase.from('nutrition_template_recipes').insert(detailsInserts);
      if (dError) throw dError;

      alert("¡Plantilla nutricional creada con éxito!");
      setIsTemplateModalOpen(false);
      setTemplateForm({ name: "" });
      setSelectedTemplateRecipes([]);
      fetchData();
    } catch (err: any) {
      alert("Error al guardar la plantilla: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (window.confirm(`¿Seguro que quieres borrar la plantilla "${name}"?`)) {
      await supabase.from('nutrition_templates').delete().eq('id', id);
      fetchData();
    }
  };

  const openTemplateAssignModal = (template: any) => {
    setTemplateToAssign(template);
    setAssignData({ user_id: '', assigned_date: new Date().toISOString().split('T')[0], meal_type: '' });
    setClientSearch('');
    setShowClientDropdown(false);
    setIsTemplateAssignModalOpen(true);
  };

  const handleAssignTemplateExec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignData.user_id) return alert("Selecciona un atleta primero.");
    setIsSubmitting(true);

    try {
      const inserts = templateToAssign.nutrition_template_recipes.map((tr: any) => ({
        user_id: assignData.user_id,
        recipe_id: tr.recipe.id,
        assigned_date: assignData.assigned_date,
        meal_type: tr.meal_type 
      }));

      const { error } = await supabase.from('assigned_meals').insert(inserts);
      if (error) throw error;

      alert("¡Plantilla asignada correctamente al atleta!");
      setIsTemplateAssignModalOpen(false);
    } catch (err: any) {
      alert("Error al asignar la plantilla: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  // ==========================================
  // FILTROS Y AGRUPACIONES
  // ==========================================
  const processedRecipes = recipes
    .filter(recipe => filterCategory === 'Todas' || recipe.category === filterCategory)
    .filter(recipe => recipe.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'asc') return a.calories - b.calories;
      if (sortOrder === 'desc') return b.calories - a.calories;
      return 0; 
    });

  const filteredClients = clients.filter(client => 
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredHistoryClients = clients.filter(client => 
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(historyClientSearch.toLowerCase())
  );

  const availableMonths = Array.from(
    new Set(
      appointments.map((appt: any) => {
        const d = new Date(appt.appointment_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })
    )
  ).sort();

  const filteredAppointmentsByMonth = appointmentMonthFilter === 'all'
    ? appointments
    : appointments.filter((appt: any) => {
        const d = new Date(appt.appointment_date);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === appointmentMonthFilter;
      });

  const groupedAppointments = filteredAppointmentsByMonth.reduce((acc: any, appt: any) => {
    const dateObj = new Date(appt.appointment_date);
    const dateKey = dateObj.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(appt);
    return acc;
  }, {});

  const templateFilteredRecipes = recipes.filter(r => r.name.toLowerCase().includes(templateSearchTerm.toLowerCase())).slice(0,10);

  // ==========================================
  // RENDERIZADO
  // ==========================================
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Gestor de Nutrición</h1>
          <p className="text-gray-400 mt-1">Base de datos de recetas maestras y asignaciones.</p>
        </div>
        {activeTab === 'recipes' && (
          <button onClick={handleOpenCreate} className="bg-[#E31C25] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] shrink-0">
            <Plus size={20} /> Añadir Receta
          </button>
        )}
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-6 border-b border-[#2a2a2a]">
        <button 
          onClick={() => setActiveTab('recipes')} 
          className={`pb-4 font-bold flex items-center gap-2 transition-colors ${activeTab === 'recipes' ? 'text-white border-b-2 border-[#E31C25]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Apple size={18} /> Recetas
        </button>
        <button 
          onClick={() => setActiveTab('templates')} 
          className={`pb-4 font-bold flex items-center gap-2 transition-colors ${activeTab === 'templates' ? 'text-white border-b-2 border-[#E31C25]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <FileText size={18} /> Plantillas
        </button>
        <button 
          onClick={() => setActiveTab('nutrition_appointments')} 
          className={`pb-4 font-bold flex items-center gap-2 transition-colors ${activeTab === 'nutrition_appointments' ? 'text-white border-b-2 border-[#E31C25]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Calendar size={18} /> Citas
        </button>
        <button 
          onClick={() => setActiveTab('client_history')} 
          className={`pb-4 font-bold flex items-center gap-2 transition-colors ${activeTab === 'client_history' ? 'text-white border-b-2 border-[#E31C25]' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <User size={18} /> Historial Atletas
        </button>
      </div>

      {/* ======================================= */}
      {/* VISTA 1: RECETAS                        */}
      {/* ======================================= */}
      {activeTab === 'recipes' && (
        <div className="space-y-6">
          <div className="flex flex-col xl:flex-row gap-4 bg-[#1a1a1a] p-4 rounded-2xl border border-[#2a2a2a] shadow-lg">
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
                  <option value="Media mañana">Media mañana</option>
                  <option value="Almuerzo">Almuerzo</option>
                  <option value="Comida">Comida</option>
                  <option value="Cena">Cena</option>
                  <option value="Pre-Entreno">Pre-Entreno</option>
                  <option value="Intra-Entreno">Intra-Entreno</option>
                  <option value="Post-Entreno">Post-Entreno</option>
                  <option value="Merienda">Merienda</option>
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
                        <button 
                          onClick={() => handleDeleteRecipe(recipe.id, recipe.name)}
                          className="text-gray-500 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-colors" 
                          title="Eliminar Receta"
                        >
                          <Trash2 size={18} />
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
        </div>
      )}

      {/* ======================================= */}
      {/* VISTA 2: PLANTILLAS                     */}
      {/* ======================================= */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Plantillas Nutricionales</h2>
              <p className="text-sm text-gray-400 mt-1">Crea estructuras de menús diarios reutilizables para tus atletas.</p>
            </div>
            <button 
              onClick={() => {
                setTemplateForm({ name: "" });
                setSelectedTemplateRecipes([]);
                setIsTemplateModalOpen(true);
              }}
              className="bg-[#E31C25] text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-[#A6151B] transition-colors shadow-[0_0_15px_rgba(227,28,37,0.2)]"
            >
              <Plus size={18} /> Nueva Plantilla
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a]">
              No hay plantillas creadas todavía. Haz clic en "Nueva Plantilla" para empezar.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => (
                <div key={template.id} className="bg-[#1a1a1a] border border-[#2a2a2a] p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-white font-bold text-lg">{template.name}</h3>
                      <button onClick={() => handleDeleteTemplate(template.id, template.name)} className="text-gray-500 hover:text-red-500 p-1"><Trash2 size={16}/></button>
                    </div>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                      {template.nutrition_template_recipes?.map((tr: any) => (
                        <div key={tr.id} className="text-xs flex justify-between items-center bg-[#121212] p-2.5 rounded-xl border border-[#2a2a2a]">
                          <span className="text-gray-300 font-medium truncate max-w-[150px]">{tr.recipe?.name}</span>
                          <span className="text-orange-400 font-bold uppercase text-[9px] bg-orange-500/10 px-2 py-0.5 rounded">
                            {tr.meal_type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => openTemplateAssignModal(template)}
                    className="w-full mt-5 bg-[#121212] border border-[#2a2a2a] hover:border-gray-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex justify-center items-center gap-2"
                  >
                    <CalendarPlus size={16} /> Asignar a Atleta
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================= */}
      {/* VISTA 3: CITAS                          */}
      {/* ======================================= */}
      {activeTab === 'nutrition_appointments' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center bg-[#1a1a1a] p-4 rounded-2xl border border-[#2a2a2a] shadow-lg gap-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 shrink-0">
              <Calendar className="text-[#E31C25]" /> Gestión de Citas
            </h2>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              <div className="relative w-full sm:w-auto">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <select 
                  className="w-full sm:w-auto bg-[#121212] border border-[#2a2a2a] pl-10 pr-8 py-2.5 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none capitalize"
                  value={appointmentMonthFilter}
                  onChange={(e) => setAppointmentMonthFilter(e.target.value)}
                >
                  <option value="all">Todos los meses</option>
                  {availableMonths.map(month => {
                    const [year, m] = month.split('-');
                    const date = new Date(parseInt(year), parseInt(m) - 1, 1);
                    const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                    return <option key={month} value={month}>{label}</option>;
                  })}
                </select>
              </div>

              <button onClick={() => setIsAppointmentModalOpen(true)} className="bg-[#E31C25] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center justify-center gap-2 text-sm shadow-[0_0_15px_rgba(227,28,37,0.3)] w-full sm:w-auto shrink-0">
                <Plus size={18} /> Agendar Cita
              </button>
            </div>
          </div>

          <div className="space-y-8">
            {Object.keys(groupedAppointments).length > 0 ? (
              Object.entries(groupedAppointments).map(([date, dayAppointments]: [string, any]) => (
                <div key={date} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3 mb-6 border-b border-[#2a2a2a] pb-4">
                    <div className="bg-[#E31C25]/10 p-3 rounded-xl text-[#E31C25]">
                      <Calendar size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-white capitalize">{date}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {dayAppointments.map((appt: any) => {
                      const time = new Date(appt.appointment_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={appt.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5 hover:border-[#E31C25] transition-colors group flex flex-col justify-between h-full relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E31C25]"></div>
                          
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-1.5 rounded-lg border border-[#2a2a2a]">
                              <Clock size={16} className="text-[#E31C25]" />
                              <span className="text-white font-bold tracking-wider">{time}</span>
                            </div>
                            <button 
                              onClick={() => handleDeleteAppointment(appt.id)} 
                              className="text-gray-500 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-colors" 
                              title="Cancelar Cita"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-xl font-bold text-[#E31C25] shadow-inner shrink-0">
                              {appt.profiles?.first_name?.[0] || 'C'}
                            </div>
                            <div className="truncate">
                              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Atleta</p>
                              <p className="text-lg font-bold text-white leading-tight truncate">
                                {appt.profiles?.first_name} {appt.profiles?.last_name}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-[#1a1a1a] border border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center flex flex-col items-center justify-center text-gray-500">
                <Calendar size={48} className="mb-4 opacity-50 text-[#E31C25]" />
                <p className="text-lg font-bold text-white mb-2">
                  {appointmentMonthFilter === 'all' ? 'No hay citas programadas' : 'No hay citas para este mes'}
                </p>
                <p className="max-w-sm">
                  {appointmentMonthFilter === 'all' 
                    ? 'Haz clic en "Agendar Cita" para empezar a organizar tus sesiones de nutrición.' 
                    : 'Prueba a seleccionar otro mes en el filtro superior.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* VISTA 4: HISTORIAL DE ATLETAS           */}
      {/* ======================================= */}
      {activeTab === 'client_history' && (
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#2a2a2a] shadow-lg">
            <h2 className="text-xl font-bold text-white mb-4">Seleccionar Atleta</h2>
            <div className="relative z-40 max-w-md">
              <Search className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar atleta por nombre..."
                className="w-full bg-[#121212] border border-[#2a2a2a] py-3 pl-10 pr-4 rounded-xl text-white focus:border-[#E31C25] outline-none"
                value={historyClientSearch}
                onChange={(e) => {
                  setHistoryClientSearch(e.target.value);
                  setShowHistoryClientDropdown(true);
                  setSelectedHistoryClientId(null);
                }}
                onFocus={() => setShowHistoryClientDropdown(true)}
              />
              {showHistoryClientDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowHistoryClientDropdown(false)}></div>
                  <div className="absolute z-40 w-full mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredHistoryClients.length > 0 ? (
                      filteredHistoryClients.map(client => (
                        <button
                          key={client.id}
                          type="button"
                          className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#E31C25] hover:text-white transition-colors border-b border-[#2a2a2a] flex items-center gap-3"
                          onClick={() => {
                            setSelectedHistoryClientId(client.id);
                            setSelectedHistoryClientName(`${client.first_name} ${client.last_name}`);
                            setHistoryClientSearch(`${client.first_name} ${client.last_name}`);
                            setShowHistoryClientDropdown(false);
                          }}
                        >
                          <div className="w-6 h-6 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[#E31C25]">{client.first_name[0]}</div>
                          {client.first_name} {client.last_name}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-gray-500 text-center">No se encontraron atletas</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedHistoryClientId ? (
            <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-6 shadow-lg">
              <h3 className="text-lg font-bold text-white mb-6 pb-4 border-b border-[#2a2a2a]">
                Visualizando consumo de: <span className="text-[#E31C25]">{selectedHistoryClientName}</span>
              </h3>
              <div className="max-w-2xl mx-auto">
                <ClientNutritionHistory clientId={selectedHistoryClientId} />
              </div>
            </div>
          ) : (
            <div className="bg-[#1a1a1a] rounded-2xl border border-dashed border-[#2a2a2a] p-12 text-center text-gray-500">
              <User size={48} className="mx-auto mb-4 opacity-50 text-[#E31C25]" />
              <p className="text-lg font-bold text-white mb-2">Ningún atleta seleccionado</p>
              <p className="max-w-sm mx-auto">Busca y selecciona un atleta en el recuadro superior para ver su registro diario de comidas igual que lo ven ellos en la app.</p>
            </div>
          )}
        </div>
      )}


      {/* =======================================================
          MODALES LATERALES Y VENTANAS EMERGENTES
          ======================================================= */}

      {/* 1. DRAWER LATERAL: CREAR / EDITAR RECETA */}
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

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Ingredientes</label>
                <textarea 
                  className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none min-h-[100px]" 
                  value={newRecipe.ingredients} 
                  onChange={e => setNewRecipe({...newRecipe, ingredients: e.target.value})} 
                  placeholder="- 100g de avena&#10;- 1 cazo de proteína..." 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Momento ideal</label>
                  <select className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none" value={newRecipe.category} onChange={e => setNewRecipe({...newRecipe, category: e.target.value})}>
                    <option>Desayuno</option>
                    <option>Media mañana</option>
                    <option>Almuerzo</option>
                    <option>Comida</option>
                    <option>Cena</option>
                    <option>Pre-Entreno</option>
                    <option>Intra-Entreno</option>
                    <option>Post-Entreno</option>
                    <option>Merienda</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">URL de Imagen</label>
                  <input type="url" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.image_url} onChange={e => setNewRecipe({...newRecipe, image_url: e.target.value})} placeholder="https://..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-[#2a2a2a] pt-5 mt-5">
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Calorías</label><input type="number" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.calories} onChange={e => setNewRecipe({...newRecipe, calories: e.target.value})} placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Proteína (g)</label><input type="number" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.protein} onChange={e => setNewRecipe({...newRecipe, protein: e.target.value})} placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Carbs (g)</label><input type="number" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.carbs} onChange={e => setNewRecipe({...newRecipe, carbs: e.target.value})} placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Grasas (g)</label><input type="number" className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" value={newRecipe.fat} onChange={e => setNewRecipe({...newRecipe, fat: e.target.value})} placeholder="0" /></div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-8 hover:bg-[#A6151B] transition-colors flex items-center justify-center shadow-[0_0_15px_rgba(227,28,37,0.2)]">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingRecipeId ? 'Actualizar Receta' : 'Guardar en Base de Datos')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. MODAL: ASIGNAR RECETA INDIVIDUAL */}
      {isAssignModalOpen && recipeToAssign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsAssignModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
            <h2 className="text-2xl font-bold mb-2 text-white flex items-center gap-2"><CalendarPlus className="text-[#E31C25]" /> Asignar Plato</h2>
            <p className="text-sm text-gray-400 mb-6">Enviando: <span className="font-bold text-[#E31C25]">{recipeToAssign.name}</span></p>
            
            <form onSubmit={handleAssignMeal} className="space-y-5">
              <div className="relative">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Buscar Atleta</label>
                <div className="relative z-50">
                  <Search className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Escribe el nombre..." 
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] py-3 pl-10 pr-4 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setShowClientDropdown(true);
                      setAssignData({...assignData, user_id: ''}); 
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                  />
                  {showClientDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowClientDropdown(false)}></div>
                      <div className="absolute z-50 w-full mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredClients.length > 0 ? (
                          filteredClients.map(client => (
                            <button
                              key={client.id}
                              type="button"
                              className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#E31C25] hover:text-white transition-colors border-b border-[#2a2a2a] last:border-b-0 flex items-center gap-3"
                              onClick={() => {
                                setAssignData({...assignData, user_id: client.id});
                                setClientSearch(`${client.first_name} ${client.last_name}`);
                                setShowClientDropdown(false);
                              }}
                            >
                              <div className="w-6 h-6 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[#E31C25]">{client.first_name[0]}</div>
                              {client.first_name} {client.last_name}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-4 text-sm text-gray-500 text-center">No se encontraron atletas</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha</label>
                  <input type="date" required className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" value={assignData.assigned_date} onChange={e => setAssignData({...assignData, assigned_date: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Tipo de Comida</label>
                  <select className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none appearance-none" value={assignData.meal_type} onChange={e => setAssignData({...assignData, meal_type: e.target.value})}>
                    <option>Desayuno</option>
                    <option>Media mañana</option>
                    <option>Almuerzo</option>
                    <option>Comida</option>
                    <option>Cena</option>
                    <option>Pre-Entreno</option>
                    <option>Intra-Entreno</option>
                    <option>Post-Entreno</option>
                    <option>Merienda</option>
                  </select>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting || !assignData.user_id} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-6 hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Confirmar Asignación'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. MODAL: AGENDAR CITA */}
      {isAppointmentModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsAppointmentModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><Calendar className="text-[#E31C25]" /> Nueva Cita</h2>
            
            <form onSubmit={handleCreateAppointment} className="space-y-5">              
              <div className="relative">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Buscar Atleta</label>
                <div className="relative z-50">
                  <Search className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Escribe el nombre..." 
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] py-3 pl-10 pr-4 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setShowClientDropdown(true);
                      setAppointmentData({...appointmentData, user_id: ''}); 
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                  />
                  {showClientDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowClientDropdown(false)}></div>
                      <div className="absolute z-50 w-full mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredClients.length > 0 ? (
                          filteredClients.map(client => (
                            <button
                              key={client.id}
                              type="button"
                              className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#E31C25] hover:text-white transition-colors border-b border-[#2a2a2a] last:border-b-0 flex items-center gap-3"
                              onClick={() => {
                                setAppointmentData({...appointmentData, user_id: client.id});
                                setClientSearch(`${client.first_name} ${client.last_name}`);
                                setShowClientDropdown(false);
                              }}
                            >
                              <div className="w-6 h-6 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[#E31C25]">{client.first_name[0]}</div>
                              {client.first_name} {client.last_name}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-4 text-sm text-gray-500 text-center">No se encontraron atletas</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha y Hora</label>
                <input type="datetime-local" required className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none [color-scheme:dark]" value={appointmentData.appointment_date} onChange={e => setAppointmentData({...appointmentData, appointment_date: e.target.value})} />
              </div>

              <button type="submit" disabled={!appointmentData.user_id || !appointmentData.appointment_date} className="w-full bg-[#E31C25] text-white font-bold py-4 rounded-xl mt-6 hover:bg-[#A6151B] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                Confirmar Cita
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: CREAR NUEVA PLANTILLA NUTRICIONAL */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-4xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><FileText className="text-[#E31C25]" /> Configurar Plantilla</h2>
              <button onClick={() => setIsTemplateModalOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2a2a2a]"><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveTemplate} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 custom-scrollbar">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Nombre de la Plantilla</label>
                  <input type="text" required placeholder="Ej. Definición - Día de Descanso" value={templateForm.name} onChange={e => setTemplateForm({...templateForm, name: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" />
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Comidas incluidas ({selectedTemplateRecipes.length})</label>
                  {selectedTemplateRecipes.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-[#2a2a2a] text-gray-500 rounded-xl text-sm">Selecciona recetas del panel derecho para añadirlas.</div>
                  ) : (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                      {selectedTemplateRecipes.map((item, index) => (
                        <div key={index} className="bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0 w-full">
                            <p className="text-white font-bold text-sm truncate">{item.recipe.name}</p>
                            <p className="text-gray-500 text-xs">{item.recipe.calories} kcal</p>
                          </div>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <select 
                              value={item.meal_type} 
                              onChange={e => handleTemplateMealTypeChange(index, e.target.value)}
                              className="bg-[#121212] border border-[#2a2a2a] text-xs text-orange-400 font-bold rounded-lg p-2 outline-none cursor-pointer flex-1 sm:flex-none"
                            >
                              <option value="Desayuno">Desayuno</option>
                              <option value="Media mañana">Media mañana</option>
                              <option value="Almuerzo">Almuerzo</option>
                              <option value="Comida">Comida</option>
                              <option value="Cena">Cena</option>
                              <option value="Pre-Entreno">Pre-Entreno</option>
                              <option value="Intra-Entreno">Intra-Entreno</option>
                              <option value="Post-Entreno">Post-Entreno</option>
                              <option value="Merienda">Merienda</option>
                            </select>
                            <button type="button" onClick={() => handleRemoveRecipeFromTemplate(index)} className="text-gray-500 hover:text-red-500 p-2 bg-[#121212] rounded-lg border border-[#2a2a2a]"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-[#2a2a2a] pt-4 lg:pt-0 lg:pl-6">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Buscador de Recetas</label>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-3 text-gray-500" size={16} />
                  <input type="text" placeholder="Filtrar por nombre..." value={templateSearchTerm} onChange={e => setTemplateSearchTerm(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] pl-9 pr-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-[#E31C25]" />
                </div>

                <div className="flex-1 h-[250px] lg:h-[350px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {templateFilteredRecipes.map((recipe) => (
                    <div key={recipe.id} className="flex justify-between items-center bg-[#1a1a1a] hover:bg-[#2a2a2a] p-3 rounded-xl border border-[#2a2a2a] transition-colors text-sm">
                      <div className="pr-2 truncate">
                        <p className="text-white font-bold truncate">{recipe.name}</p>
                        <p className="text-gray-500 text-xs">{recipe.calories} kcal</p>
                      </div>
                      <button type="button" onClick={() => handleAddRecipeToTemplate(recipe)} className="bg-[#E31C25]/10 hover:bg-[#E31C25] text-[#E31C25] hover:text-white px-3 py-2 rounded-lg font-bold transition-all shrink-0"><Plus size={16} /></button>
                    </div>
                  ))}
                  {templateFilteredRecipes.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">No se han encontrado recetas.</div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 border-t border-[#2a2a2a] pt-4 mt-2">
                <button type="submit" disabled={isSubmitting || selectedTemplateRecipes.length === 0} className="w-full bg-[#E31C25] text-white font-bold py-3.5 rounded-xl hover:bg-[#A6151B] transition-colors flex justify-center items-center gap-2 disabled:opacity-50 shadow-[0_0_15px_rgba(227,28,37,0.3)]">
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : "Guardar Estructura de Plantilla"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: ASIGNAR PLANTILLA A ATLETA */}
      {isTemplateAssignModalOpen && templateToAssign && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-[#2a2a2a] w-full max-w-md rounded-2xl p-6 relative shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsTemplateAssignModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white"><X size={20} /></button>
            <h3 className="text-white font-bold text-xl flex items-center gap-2 mb-2"><CheckCircle className="text-[#E31C25]" size={20} /> Inyectar Plantilla</h3>
            
            <form onSubmit={handleAssignTemplateExec} className="space-y-4">
              <div className="mb-6">
                <p className="text-xs text-gray-400">Vas a asignar las comidas de la plantilla:</p>
                <p className="text-white font-bold mt-1 bg-[#1a1a1a] px-3 py-2 rounded-lg border border-[#2a2a2a]">{templateToAssign.name}</p>
              </div>

              <div className="relative">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Atleta</label>
                <div className="relative z-50">
                  <Search className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
                  <input 
                    type="text" 
                    placeholder="Escribe el nombre..." 
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] py-3 pl-10 pr-4 rounded-xl text-white focus:border-[#E31C25] outline-none transition-colors"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setShowClientDropdown(true);
                      setAssignData({...assignData, user_id: ''}); 
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                  />
                  {showClientDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowClientDropdown(false)}></div>
                      <div className="absolute z-50 w-full mt-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredClients.length > 0 ? (
                          filteredClients.map(client => (
                            <button
                              key={client.id}
                              type="button"
                              className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#E31C25] hover:text-white transition-colors border-b border-[#2a2a2a] last:border-b-0 flex items-center gap-3"
                              onClick={() => {
                                setAssignData({...assignData, user_id: client.id});
                                setClientSearch(`${client.first_name} ${client.last_name}`);
                                setShowClientDropdown(false);
                              }}
                            >
                              <div className="w-6 h-6 rounded-full bg-[#121212] border border-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[#E31C25]">{client.first_name[0]}</div>
                              {client.first_name} {client.last_name}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-4 text-sm text-gray-500 text-center">No se encontraron atletas</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Fecha Objetivo</label>
                <input type="date" required value={assignData.assigned_date} onChange={e => setAssignData({...assignData, assigned_date: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-xl text-white outline-none focus:border-[#E31C25] [color-scheme:dark]" />
              </div>

              <button type="submit" disabled={isSubmitting || !assignData.user_id} className="w-full bg-[#E31C25] text-white font-bold py-3.5 rounded-xl hover:bg-[#A6151B] transition-colors flex justify-center items-center gap-2 disabled:opacity-50 mt-4">
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : "Inyectar Comidas en Historial"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}