import React, { useState } from 'react';

export default function Settings() {
  const [darkMode, setDarkMode] = useState(true);
  
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-8 gap-8 bg-background-light dark:bg-background-dark overflow-y-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-[-0.033em] text-slate-900 dark:text-white">
          Nastavenia
        </h1>
        <p className="text-sm text-slate-500 dark:text-text-secondary">
          Správa vášho účtu a nastavení aplikácie.
        </p>
      </div>

      <div className="max-w-3xl w-full">
        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-6 md:p-8 shadow-sm flex flex-col gap-8">
          
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person</span>
              Profil používateľa
            </h3>
            <div className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-[#324d67] bg-slate-50 dark:bg-[#1a2632]">
               <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-16 ring-2 ring-primary/20" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZOUzJkFVON4Uo6urSJCAIuvJm1XCnb0QKBj7sHVSvOAPfF_TLhWEZIrDCWpyjjsjdPcsWWDXkbFM9jNXy34juXGKgQcsbp9qPC4xiUteimD60HhL3UILti6QstVXl8Wn5UtZD-O8_RCYqAxC1Y8JVpPgcJVoKD6liTupF6TA4WvfMCKa_IY_I0LDzqMHBi4cEaR2TjyVYjkLbhaAoKwU4g_gAQTDseq72f0pNXui1Syofs23qyf_x01ASm1CdNAL6Ef8uVyjlQWmB")'}}></div>
               <div className="flex flex-col">
                 <span className="text-lg font-bold text-slate-900 dark:text-white">ChrisStop Servis</span>
                 <span className="text-sm text-slate-500 dark:text-text-secondary">admin@chrisstop.sk</span>
               </div>
               <button className="ml-auto px-4 py-2 rounded-lg bg-slate-200 dark:bg-[#233648] text-slate-700 dark:text-white text-sm font-medium hover:bg-slate-300 dark:hover:bg-[#324d67] transition-colors">
                 Upraviť profil
               </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-6 border-t border-slate-200 dark:border-[#324d67]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">palette</span>
              Vzhľad
            </h3>
            <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-[#324d67] bg-slate-50 dark:bg-[#1a2632]">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Tmavý režim (Dark Mode)</span>
                <span className="text-xs text-slate-500 dark:text-text-secondary">Prepnutie medzi svetlým a tmavým vzhľadom aplikácie.</span>
              </div>
              <button 
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-6 border-t border-slate-200 dark:border-[#324d67]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">database</span>
              Dáta
            </h3>
            <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-[#324d67] bg-slate-50 dark:bg-[#1a2632]">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Lokálne úložisko</span>
                <span className="text-xs text-slate-500 dark:text-text-secondary">Aplikácia momentálne beží na LocalStorage.</span>
              </div>
              <button onClick={() => {
                if(window.confirm('Naozaj chcete vymazať všetky lokálne dáta?')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }} className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 text-sm font-medium hover:bg-red-500/20 transition-colors">
                Vymazať dáta
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
