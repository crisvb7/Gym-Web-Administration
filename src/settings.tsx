import React, { useState } from "react";
import { Settings as SettingsIcon, Building2, Clock, CalendarX, CreditCard, Save, MapPin, Phone, Mail, Info, Loader2 } from "lucide-react";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);

  // Estados simulados (Aquí luego conectarías con Supabase)
  const [generalData, setGeneralData] = useState({
    name: 'Iron Fitness Box',
    email: 'contacto@ironfitness.com',
    phone: '+34 600 000 000',
    address: 'Calle del Deporte 123, Madrid'
  });

  const [bookingRules, setBookingRules] = useState({
    cancelWindow: '2',
    bookAhead: '48',
    maxClassesPerDay: '1'
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // Simulación de guardado
    setTimeout(() => {
      setIsSaving(false);
      alert("Ajustes guardados correctamente.");
    }, 1000);
  };

  const tabs = [
    { id: 'general', label: 'Centro Deportivo', icon: Building2 },
    { id: 'horarios', label: 'Horario de Apertura', icon: Clock },
    { id: 'reservas', label: 'Reglas de Clases', icon: CalendarX },
    { id: 'pagos', label: 'Facturación', icon: CreditCard },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Cabecera */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Ajustes</h1>
        <p className="text-gray-400 mt-1">Preferencias del sistema y gestión del centro.</p>
      </div>

      {/* Contenedor Principal (Layout de 2 columnas) */}
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Menú Lateral */}
        <div className="w-full lg:w-64 shrink-0 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                  isActive 
                    ? 'bg-[#E31C25] text-white shadow-[0_0_15px_rgba(227,28,37,0.2)]' 
                    : 'bg-transparent text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                <Icon size={20} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Área de Contenido */}
        <div className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 lg:p-8 shadow-xl relative overflow-hidden">
          
          <form onSubmit={handleSave}>
            
            {/* TABS CONTENT */}
            {activeTab === 'general' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Building2 className="text-[#E31C25]" /> Información del Centro
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">Estos datos aparecerán en la app de los clientes y en los correos electrónicos automatizados.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Nombre del Gimnasio / Box</label>
                    <input 
                      type="text" 
                      value={generalData.name} 
                      onChange={(e) => setGeneralData({...generalData, name: e.target.value})}
                      className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 flex items-center gap-2"><Mail size={14}/> Correo de Contacto</label>
                      <input 
                        type="email" 
                        value={generalData.email} 
                        onChange={(e) => setGeneralData({...generalData, email: e.target.value})}
                        className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 flex items-center gap-2"><Phone size={14}/> Teléfono</label>
                      <input 
                        type="text" 
                        value={generalData.phone} 
                        onChange={(e) => setGeneralData({...generalData, phone: e.target.value})}
                        className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 flex items-center gap-2"><MapPin size={14}/> Dirección Física</label>
                    <input 
                      type="text" 
                      value={generalData.address} 
                      onChange={(e) => setGeneralData({...generalData, address: e.target.value})}
                      className="w-full bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white focus:border-[#E31C25] outline-none" 
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'horarios' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Clock className="text-[#E31C25]" /> Horarios Estándar
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">Define los horarios generales de apertura. Esto afectará a la visualización del calendario en la app.</p>
                </div>

                <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                  <Clock className="w-12 h-12 text-[#E31C25] opacity-50 mb-4" />
                  <h3 className="text-white font-bold text-lg">Módulo en construcción</h3>
                  <p className="text-gray-400 text-sm max-w-sm mt-2">Próximamente podrás definir horarios específicos por día, bloqueos por festivos y vacaciones.</p>
                </div>
              </div>
            )}

            {activeTab === 'reservas' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <CalendarX className="text-[#E31C25]" /> Reglas de Reservas
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">Configura las restricciones para que los clientes reserven clases grupales.</p>
                </div>

                <div className="space-y-5">
                  <div className="bg-[#121212] p-5 rounded-xl border border-[#2a2a2a] flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-white font-bold">Límite de Cancelación</h4>
                      <p className="text-xs text-gray-400 mt-1">Horas antes del inicio de la clase en las que el cliente ya no podrá cancelar su plaza.</p>
                    </div>
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <input type="number" value={bookingRules.cancelWindow} onChange={(e) => setBookingRules({...bookingRules, cancelWindow: e.target.value})} className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-lg text-center text-white focus:border-[#E31C25] outline-none" />
                      <span className="text-gray-500 font-bold text-sm">Horas</span>
                    </div>
                  </div>

                  <div className="bg-[#121212] p-5 rounded-xl border border-[#2a2a2a] flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-white font-bold">Apertura de Reservas</h4>
                      <p className="text-xs text-gray-400 mt-1">Con cuántas horas de antelación se abren las plazas de una clase para los atletas.</p>
                    </div>
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <input type="number" value={bookingRules.bookAhead} onChange={(e) => setBookingRules({...bookingRules, bookAhead: e.target.value})} className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-lg text-center text-white focus:border-[#E31C25] outline-none" />
                      <span className="text-gray-500 font-bold text-sm">Horas</span>
                    </div>
                  </div>

                  <div className="bg-[#121212] p-5 rounded-xl border border-[#2a2a2a] flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-white font-bold">Límite Diario</h4>
                      <p className="text-xs text-gray-400 mt-1">Número máximo de clases a las que un cliente puede asistir en un mismo día.</p>
                    </div>
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <input type="number" value={bookingRules.maxClassesPerDay} onChange={(e) => setBookingRules({...bookingRules, maxClassesPerDay: e.target.value})} className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] p-2 rounded-lg text-center text-white focus:border-[#E31C25] outline-none" />
                      <span className="text-gray-500 font-bold text-sm">Clases</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'pagos' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <CreditCard className="text-[#E31C25]" /> Pagos y Facturación
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">Gestiona la moneda del centro y las integraciones con pasarelas de pago.</p>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-start gap-3">
                  <Info className="text-yellow-500 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="text-yellow-500 font-bold">Pagos Manuales Activos</h4>
                    <p className="text-sm text-yellow-500/80 mt-1">
                      Actualmente la gestión de cuotas se realiza de forma manual fuera de la plataforma. Para integrar pagos automáticos, contacta con soporte para habilitar Stripe.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2 block">Moneda Principal</label>
                  <select className="w-full md:w-1/2 bg-[#121212] border border-[#2a2a2a] p-3 rounded-xl text-white outline-none focus:border-[#E31C25]">
                    <option value="EUR">Euro (€)</option>
                    <option value="USD">Dólar Estadounidense ($)</option>
                    <option value="MXN">Peso Mexicano (MXN)</option>
                    <option value="COP">Peso Colombiano (COP)</option>
                  </select>
                </div>
              </div>
            )}

            {/* BOTÓN DE GUARDADO GENERAL */}
            <div className="mt-10 pt-6 border-t border-[#2a2a2a] flex justify-end">
              <button 
                type="submit"
                disabled={isSaving}
                className="bg-[#E31C25] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#A6151B] transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(227,28,37,0.3)] disabled:opacity-70"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>

          </form>
        </div>
      </div>
      
    </div>
  );
}