import React from 'react';
import { Apple, Play, Download } from 'lucide-react';

export function AppDownload() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-5 text-center font-sans">
      <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full">
        
        {/* Cambia logo.png por el nombre exacto de tu archivo en la carpeta public */}
        <img 
          src="/logo.png" 
          alt="Logo DM Movimiento" 
          className="w-28 h-28 mx-auto rounded-3xl object-cover mb-6 shadow-sm"
        />
        
        <h1 className="text-2xl font-extrabold text-gray-900 mb-3">DM Movimiento</h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Tu app de gestión y entrenamiento. Descárgala ahora y lleva tu rutina al siguiente nivel.
        </p>

        {/* BOTÓN APP STORE */}
        <a 
          href="https://apps.apple.com/us/app/metodo-dm/id6763732909" 
          className="flex items-center justify-center w-full p-4 mb-4 rounded-xl font-semibold text-white bg-black hover:bg-gray-800 transition-transform active:scale-95"
        >
          <Apple className="w-6 h-6 mr-3 fill-current" />
          Descargar en App Store
        </a>

        {/* BOTÓN PLAY STORE (Deshabilitado / Próximamente) */}
        <div 
          className="flex items-center justify-center w-full p-4 mb-6 rounded-xl font-semibold text-gray-400 bg-gray-100 cursor-not-allowed select-none"
        >
          <Play className="w-6 h-6 mr-3 fill-current" />
          Google Play (Próximamente)
        </div>

        <div className="w-full h-px bg-gray-200 my-6"></div>

        <p className="text-xs text-gray-400 mb-4 font-medium uppercase tracking-wider">
          ¿Tienes Android? Descarga el instalador directo
        </p>

        <a 
          href="https://drive.google.com/file/d/1PvqzdpYdJgTq7z5NNSPgQ1KzRh-rnLnz/view?usp=sharing" 
          className="flex items-center justify-center w-full p-4 rounded-xl font-bold text-black bg-[#3DDC84] border-2 border-[#3DDC84] hover:bg-opacity-80 transition-all active:scale-95 shadow-md shadow-green-200"
        >
          <Download className="w-6 h-6 mr-3" />
          Descargar APK para Android
        </a>
      </div>
    </div>
  );
}