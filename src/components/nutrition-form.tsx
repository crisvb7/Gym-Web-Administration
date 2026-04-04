import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { X, Flame, Beef, Wheat, Droplet } from "lucide-react";

interface NutritionFormProps {
  user: any;
  onComplete: () => void;
}

export function NutritionForm({ user, onComplete }: NutritionFormProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    food_name: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    date: new Date().toISOString().split('T')[0] // Por defecto hoy
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("nutrition_logs").insert([
        {
          user_id: user.id,
          food_name: form.food_name,
          calories: parseInt(form.calories),
          protein: parseFloat(form.protein) || 0,
          carbs: parseFloat(form.carbs) || 0,
          fat: parseFloat(form.fat) || 0,
          is_planned: true, // Esto hace que aparezca como "Planificado" en la App
          logged_at: `${form.date}T12:00:00Z`, // Se asigna al mediodía de la fecha elegida
        },
      ]);

      if (error) throw error;

      alert(`Plato asignado correctamente a ${user.first_name}`);
      onComplete();
    } catch (error: any) {
      alert("Error al guardar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-white">
      {/* Información del Plato */}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 uppercase font-bold">Nombre del Alimento</label>
          <input
            required
            className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 focus:border-[#39FF14] outline-none"
            placeholder="Ej: Salmón con espárragos"
            value={form.food_name}
            onChange={(e) => setForm({ ...form, food_name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 uppercase font-bold text-[#39FF14]">Calorías (kcal)</label>
            <input
              type="number"
              required
              className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1"
              placeholder="0"
              value={form.calories}
              onChange={(e) => setForm({ ...form, calories: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase font-bold">Fecha de Asignación</label>
            <input
              type="date"
              required
              className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl mt-1 text-white"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Macronutrientes */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#121212] p-3 rounded-xl border border-[#2a2a2a]">
          <div className="flex items-center gap-2 mb-2 text-red-500">
            <Beef size={14} /> <span className="text-[10px] font-bold uppercase">Prot</span>
          </div>
          <input
            type="number"
            className="w-full bg-transparent text-lg font-bold outline-none"
            placeholder="0g"
            value={form.protein}
            onChange={(e) => setForm({ ...form, protein: e.target.value })}
          />
        </div>
        <div className="bg-[#121212] p-3 rounded-xl border border-[#2a2a2a]">
          <div className="flex items-center gap-2 mb-2 text-yellow-500">
            <Wheat size={14} /> <span className="text-[10px] font-bold uppercase">Carb</span>
          </div>
          <input
            type="number"
            className="w-full bg-transparent text-lg font-bold outline-none"
            placeholder="0g"
            value={form.carbs}
            onChange={(e) => setForm({ ...form, carbs: e.target.value })}
          />
        </div>
        <div className="bg-[#121212] p-3 rounded-xl border border-[#2a2a2a]">
          <div className="flex items-center gap-2 mb-2 text-blue-500">
            <Droplet size={14} /> <span className="text-[10px] font-bold uppercase">Fat</span>
          </div>
          <input
            type="number"
            className="w-full bg-transparent text-lg font-bold outline-none"
            placeholder="0g"
            value={form.fat}
            onChange={(e) => setForm({ ...form, fat: e.target.value })}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#39FF14] text-black font-extrabold py-4 rounded-2xl shadow-[0_0_20px_rgba(57,255,20,0.2)] hover:scale-[1.02] transition-transform disabled:opacity-50"
      >
        {loading ? "ASIGNANDO..." : "ASIGNAR A PLAN NUTRICIONAL"}
      </button>
    </form>
  );
}