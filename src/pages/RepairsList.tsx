import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../store/db';
import { Repair, RepairStatus, PartsStatus } from '../types';

export default function RepairsList() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'Všetky'>('Všetky');
  const [partsFilter, setPartsFilter] = useState<PartsStatus | 'Všetky'>('Všetky');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    loadRepairs();
  }, []);

  const loadRepairs = () => {
    db.getRepairs().then(setRepairs);
  };

  const updateRepairStatus = async (id: string, status: RepairStatus) => {
    await db.updateRepair(id, { status });
    loadRepairs();
  };

  const updatePartsStatus = async (id: string, partsStatus: PartsStatus) => {
    await db.updateRepair(id, { partsStatus });
    loadRepairs();
  };

  const filteredRepairs = repairs.filter(repair => {
    const matchesSearch = 
      repair.displayId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repair.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repair.device.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'Všetky' || repair.status === statusFilter;
    const matchesParts = partsFilter === 'Všetky' || repair.partsStatus === partsFilter;
    const matchesDate = !dateFilter || repair.date === dateFilter;

    return matchesSearch && matchesStatus && matchesParts && matchesDate;
  });

  return (
    <div className="flex flex-col flex-1 p-4 md:p-8 gap-8 bg-background-light dark:bg-background-dark overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-[-0.033em] text-slate-900 dark:text-white">
            Zoznam opráv
          </h1>
          <p className="text-sm text-slate-500 dark:text-text-secondary">
            Prehľad všetkých servisných zákaziek a ich aktuálny stav.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-slate-500 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-dark rounded-lg transition-colors">
            <span className="material-symbols-outlined">download</span>
          </button>
          <button className="p-2 text-slate-500 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-dark rounded-lg transition-colors">
            <span className="material-symbols-outlined">print</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-white dark:bg-surface-dark p-4 rounded-xl border border-slate-200 dark:border-surface-dark shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="flex w-full lg:w-auto flex-1 items-stretch rounded-lg h-10 bg-slate-50 dark:bg-[#1a2632] border border-slate-200 dark:border-[#324d67]">
            <div className="text-slate-400 flex items-center justify-center pl-3">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </div>
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-sm px-3 text-slate-900 dark:text-white placeholder:text-slate-400" 
              placeholder="Vyhľadať podľa ID, zákazníka alebo zariadenia..." 
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-[#324d67] bg-slate-50 dark:bg-[#1a2632] text-sm text-slate-600 dark:text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RepairStatus | 'Všetky')}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-[#324d67] bg-slate-50 dark:bg-[#1a2632] text-sm text-slate-600 dark:text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="Všetky">Stav opravy: Všetky</option>
              <option value="Diagnostika">Diagnostika</option>
              <option value="Čaká sa">Čaká sa</option>
              <option value="Prebieha">Prebieha</option>
              <option value="Hotovo">Hotovo</option>
            </select>
            <select 
              value={partsFilter}
              onChange={(e) => setPartsFilter(e.target.value as PartsStatus | 'Všetky')}
              className="h-10 px-3 rounded-lg border border-slate-200 dark:border-[#324d67] bg-slate-50 dark:bg-[#1a2632] text-sm text-slate-600 dark:text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="Všetky">Stav dielov: Všetky</option>
              <option value="Dostupné skladom">Dostupné skladom</option>
              <option value="Chýbajú (Objednané)">Chýbajú (Objednané)</option>
              <option value="Na overenie">Na overenie</option>
              <option value="Neobjednané">Neobjednané</option>
              <option value="Objednané">Objednané</option>
            </select>
            <button 
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('Všetky');
                setPartsFilter('Všetky');
                setDateFilter('');
              }}
              className="h-10 px-4 bg-slate-100 dark:bg-[#1a2632] text-slate-600 dark:text-text-secondary border border-slate-200 dark:border-[#324d67] text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-[#233648] transition-colors"
            >
              Zrušiť filtre
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#324d67] bg-slate-50/50 dark:bg-[#1a2632]/50">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">ID / Dátum</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Zariadenie / Zákazník</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Typ opravy</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Stav opravy</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Stav dielov</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider text-right">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#324d67]">
              {filteredRepairs.map(repair => (
                <tr key={repair.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2632] transition-colors">
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-primary">{repair.displayId}</span>
                      <span className="text-xs text-slate-500 dark:text-text-secondary">{repair.date}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{repair.device}</span>
                      <span className="text-xs text-slate-500 dark:text-text-secondary">{repair.customer}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600 dark:text-text-secondary">{repair.type}</td>
                  <td className="p-4">
                    <select 
                      value={repair.status}
                      onChange={(e) => updateRepairStatus(repair.id, e.target.value as RepairStatus)}
                      className={`text-xs font-bold rounded-full px-2.5 py-1 border focus:ring-0 cursor-pointer ${
                        repair.status === 'Hotovo' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                        repair.status === 'Prebieha' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                        'bg-slate-100 dark:bg-surface-dark text-slate-700 dark:text-slate-300 border-slate-200 dark:border-surface-dark'
                      }`}
                    >
                      <option value="Diagnostika">Diagnostika</option>
                      <option value="Čaká sa">Čaká sa</option>
                      <option value="Prebieha">Prebieha</option>
                      <option value="Hotovo">Hotovo</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <select 
                      value={repair.partsStatus}
                      onChange={(e) => updatePartsStatus(repair.id, e.target.value as PartsStatus)}
                      className={`text-xs font-bold rounded-full px-2.5 py-1 border focus:ring-0 cursor-pointer ${
                        repair.partsStatus === 'Dostupné skladom' || repair.partsStatus === 'Objednané' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                        repair.partsStatus === 'Chýbajú (Objednané)' || repair.partsStatus === 'Neobjednané' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' :
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      }`}
                    >
                      <option value="Dostupné skladom">Dostupné skladom</option>
                      <option value="Chýbajú (Objednané)">Chýbajú (Objednané)</option>
                      <option value="Na overenie">Na overenie</option>
                      <option value="Neobjednané">Neobjednané</option>
                      <option value="Objednané">Objednané</option>
                    </select>
                  </td>
                  <td className="p-4 text-right">
                    <Link to={`/repairs/${repair.id}`} className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-surface-dark inline-block" title="Upraviť">
                      <span className="material-symbols-outlined text-[20px]">edit_square</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredRepairs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-text-secondary">
                    Nenašli sa žiadne opravy zodpovedajúce filtrom.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-[#324d67] flex items-center justify-between text-sm text-slate-500 dark:text-text-secondary">
          <span>Zobrazuje sa {filteredRepairs.length} z {repairs.length} výsledkov</span>
        </div>
      </div>
    </div>
  );
}
