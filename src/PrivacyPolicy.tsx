import React from 'react';
import { Shield, Activity } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300 font-sans p-6 md:p-12 selection:bg-[#E31C25] selection:text-white">
      <div className="max-w-3xl mx-auto bg-[#121212] border border-[#2a2a2a] rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
        
        {/* Brillo de fondo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#E31C25]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          {/* Cabecera */}
          <div className="flex flex-col items-center text-center mb-12">
            <div className="w-16 h-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(227,28,37,0.15)]">
              <Shield className="w-8 h-8 text-[#E31C25]" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Política de Privacidad</h1>
            <div className="flex items-center justify-center gap-2 text-gray-400 font-medium">
              <Activity className="w-4 h-4 text-[#E31C25]" />
              <span>Daniel Miranda | En Movimiento</span>
            </div>
            <p className="mt-4 text-sm text-gray-500">Última actualización: Mayo 2026</p>
          </div>

          {/* Contenido Legal */}
          <div className="space-y-8 text-sm md:text-base leading-relaxed">
            
            <section>
              <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E31C25]"></span>
                1. Información que recopilamos
              </h2>
              <p>Para proporcionar nuestros servicios de entrenamiento y gestión deportiva a través de la aplicación "Daniel Miranda | En Movimiento", recopilamos la siguiente información personal:</p>
              <ul className="list-disc pl-5 mt-3 space-y-1 text-gray-400">
                <li>Nombre y apellidos.</li>
                <li>Dirección de correo electrónico.</li>
                <li>Contraseña (almacenada de forma encriptada y segura).</li>
                <li>Datos físicos y métricas relevantes para la planificación de entrenamientos y nutrición.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E31C25]"></span>
                2. Uso de la información
              </h2>
              <p>La información recopilada se utiliza exclusivamente para los siguientes fines:</p>
              <ul className="list-disc pl-5 mt-3 space-y-1 text-gray-400">
                <li>Crear y gestionar tu cuenta de usuario.</li>
                <li>Proporcionarte acceso seguro a la plataforma.</li>
                <li>Personalizar tus rutinas de entrenamiento y planes nutricionales.</li>
                <li>Gestionar las reservas de horarios y pagos asociados a tu tarifa.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E31C25]"></span>
                3. Protección de datos y Terceros
              </h2>
              <p>
                Tus datos están almacenados de forma segura utilizando la infraestructura de <strong className="text-gray-300">Supabase</strong>, que cumple con los más altos estándares de seguridad y encriptación de bases de datos. No vendemos, alquilamos ni compartimos tu información personal con terceros para fines comerciales o de marketing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E31C25]"></span>
                4. Retención y Eliminación de Datos
              </h2>
              <p>
                Mantenemos tu información personal mientras tu cuenta esté activa. Tienes derecho a solicitar la eliminación completa de tu cuenta y todos tus datos asociados en cualquier momento. Si un administrador elimina tu acceso al centro, todos tus perfiles e historiales se eliminarán permanentemente de nuestra base de datos mediante un proceso de borrado en cascada automatizado.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E31C25]"></span>
                5. Contacto
              </h2>
              <p>
                Si tienes alguna pregunta sobre esta Política de Privacidad o deseas ejercer tus derechos sobre tus datos, puedes contactarnos a través de los canales oficiales del centro de entrenamiento.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}