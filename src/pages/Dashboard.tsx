import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startOfMonth, endOfMonth, format, isWithinInterval, parseISO } from 'date-fns';
import { db } from '../store/db';
import { Repair, SmallOrder } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [smallOrders, setSmallOrders] = useState<SmallOrder[]>([]);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [unfinishedFilter, setUnfinishedFilter] = useState<'Všetky' | 'Diagnostika' | 'Čaká sa' | 'Prebieha'>('Všetky');

  useEffect(() => {
    db.getRepairs().then(setRepairs);
    db.getSmallOrders().then(setSmallOrders);
  }, []);

  // Stats calculation based on date range
  const filteredStatsRepairs = repairs.filter(r => {
    if (!r.date) return false;
    try {
      const repairDate = parseISO(r.date);
      const start = parseISO(dateRange.start);
      const end = parseISO(dateRange.end);
      return isWithinInterval(repairDate, { start, end });
    } catch (e) {
      return false;
    }
  });

  const repairsToday = repairs.filter(r => r.date === format(new Date(), 'yyyy-MM-dd')).length;
  const totalProfit = filteredStatsRepairs.reduce((sum, r) => sum + (r.profit || 0), 0);
  const totalCost = filteredStatsRepairs.reduce((sum, r) => sum + (r.cost || 0), 0);
  const pendingRepairs = filteredStatsRepairs.filter(r => r.status !== 'Hotovo').length;

  // Unfinished repairs filter
  const unfinishedRepairs = repairs.filter(r => r.status !== 'Hotovo' && (unfinishedFilter === 'Všetky' || r.status === unfinishedFilter));

  // Reminders (Upomienky)
  const unorderedRepairs = repairs.filter(r => r.partsStatus === 'Neobjednané' && r.status !== 'Hotovo');
  const unorderedSmallOrders = smallOrders.filter(o => o.status === 'Neobjednané');

  return (
    <div className="flex flex-col flex-1 p-4 md:p-8 gap-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 order-1">
        <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-[-0.033em] text-slate-900 dark:text-white">
          Vitajte späť, Chris
        </h1>
        <div className="flex items-center gap-2 bg-white dark:bg-surface-dark p-2 rounded-xl border border-slate-200 dark:border-surface-dark shadow-sm">
          <input 
            type="date" 
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="text-sm bg-slate-50 dark:bg-[#1a2632] border border-slate-200 dark:border-[#324d67] rounded-lg px-3 py-1.5 text-slate-700 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <span className="text-slate-400">-</span>
          <input 
            type="date" 
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="text-sm bg-slate-50 dark:bg-[#1a2632] border border-slate-200 dark:border-[#324d67] rounded-lg px-3 py-1.5 text-slate-700 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary"
          />
        </div>
      </div>

      {/* Upomienky */}
      {(unorderedRepairs.length > 0 || unorderedSmallOrders.length > 0) && (
        <div className="flex flex-col gap-4 order-2 md:order-4 mt-0 md:mt-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500">warning</span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Upomienky (Neobjednané diely)</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unorderedRepairs.map(repair => (
              <div key={repair.id} className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-red-700 dark:text-red-400">Servis: {repair.displayId} - {repair.device}</span>
                  <span className="text-xs text-red-600/80 dark:text-red-400/80">Zákazník: {repair.customer}</span>
                </div>
                <Link to={`/repairs/${repair.id}`} className="px-3 py-1.5 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-bold rounded-lg hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors">
                  Objednať diel
                </Link>
              </div>
            ))}
            {unorderedSmallOrders.map(order => (
              <div key={order.id} className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-orange-700 dark:text-orange-400">Malá obj.: {order.item}</span>
                  <span className="text-xs text-orange-600/80 dark:text-orange-400/80">Zákazník: {order.customer}</span>
                </div>
                <Link to="/small-orders" className="px-3 py-1.5 bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 text-xs font-bold rounded-lg hover:bg-orange-200 dark:hover:bg-orange-500/30 transition-colors">
                  Objednať
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 order-3 md:order-2">
        {/* Stats Cards */}
        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-text-secondary">Opravy dnes</h3>
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">build</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{repairsToday}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-text-secondary">Celkový zisk</h3>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{totalProfit} €</span>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-text-secondary">Náklady</h3>
            <div className="size-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{totalCost} €</span>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-text-secondary">Čakajúce v období</h3>
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">assignment</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{pendingRepairs}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 order-4 md:order-3">
        {/* Dnešný plán */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dnešný plán</h2>
            <Link to="/planner" className="text-sm font-medium text-primary hover:underline">Zobraziť všetko</Link>
          </div>
          
          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-6 shadow-sm relative">
            <div className="absolute left-[39px] top-8 bottom-8 w-px bg-slate-200 dark:bg-[#324d67]"></div>
            
            <div className="flex flex-col gap-8">
              {repairs.filter(r => r.date === format(new Date(), 'yyyy-MM-dd')).slice(0, 4).map((repair, idx) => (
                <div key={repair.id} className="flex gap-4 relative z-10 group" onClick={() => navigate(`/repairs/${repair.id}`)}>
                  <div className="size-10 rounded-full bg-slate-100 dark:bg-[#1a2632] border-2 border-white dark:border-surface-dark flex items-center justify-center text-slate-500 dark:text-text-secondary group-hover:bg-primary group-hover:text-white transition-colors shrink-0 cursor-pointer">
                    <span className="material-symbols-outlined text-[20px]">
                      {repair.device.includes('TV') ? 'tv' : repair.device.includes('MacBook') || repair.device.includes('Dell') ? 'laptop_mac' : 'smartphone'}
                    </span>
                  </div>
                  <div className="flex flex-col pt-1 cursor-pointer">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{repair.type} {repair.device}</h4>
                      {repair.status === 'Prebieha' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-sm">Prebieha</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-text-secondary mb-1">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {repair.time}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-text-secondary">Zákazník: {repair.customer}</p>
                  </div>
                </div>
              ))}
              {repairs.filter(r => r.date === format(new Date(), 'yyyy-MM-dd')).length === 0 && (
                <div className="text-sm text-slate-500 dark:text-text-secondary text-center py-4">
                  Žiadne opravy naplánované na dnes.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nedokončené objednávky */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nedokončené objednávky</h2>
            <select 
              value={unfinishedFilter}
              onChange={(e) => setUnfinishedFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-surface-dark bg-white dark:bg-surface-dark text-sm font-medium text-slate-600 dark:text-text-secondary focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="Všetky">Všetky stavy</option>
              <option value="Diagnostika">Diagnostika</option>
              <option value="Čaká sa">Čaká sa</option>
              <option value="Prebieha">Prebieha</option>
            </select>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#324d67]">
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">ID & Zariadenie</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Zákazník</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Stav</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider">Náhradné diely</th>
                    <th className="p-4 text-xs font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wider text-right">Akcia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#324d67]">
                  {unfinishedRepairs.map(repair => (
                    <tr key={repair.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2632] transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-lg bg-slate-100 dark:bg-[#1a2632] flex items-center justify-center text-slate-500 dark:text-text-secondary">
                             <span className="material-symbols-outlined">
                                {repair.device.includes('TV') ? 'tv' : repair.device.includes('MacBook') || repair.device.includes('Dell') ? 'laptop_mac' : 'smartphone'}
                             </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{repair.displayId} {repair.device}</span>
                            <span className="text-xs text-slate-500 dark:text-text-secondary">{repair.type}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600 dark:text-white">{repair.customer}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          repair.status === 'Diagnostika' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                          repair.status === 'Čaká sa' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                          repair.status === 'Prebieha' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' :
                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        }`}>
                          <span className={`size-1.5 rounded-full ${
                            repair.status === 'Diagnostika' ? 'bg-blue-500' :
                            repair.status === 'Čaká sa' ? 'bg-amber-500' :
                            repair.status === 'Prebieha' ? 'bg-purple-500' :
                            'bg-emerald-500'
                          }`}></span>
                          {repair.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-white">
                          <span className={`size-2 rounded-full ${
                            repair.partsStatus === 'Dostupné skladom' ? 'bg-emerald-500' :
                            repair.partsStatus === 'Chýbajú (Objednané)' ? 'bg-red-500' :
                            repair.partsStatus === 'Na overenie' ? 'bg-amber-500' :
                            repair.partsStatus === 'Neobjednané' ? 'bg-red-500' :
                            'bg-slate-500'
                          }`}></span>
                          {repair.partsStatus}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <Link to={`/repairs/${repair.id}`} className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-surface-dark">
                          <span className="material-symbols-outlined text-[20px]">edit_square</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {unfinishedRepairs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-text-secondary">
                        Žiadne nedokončené objednávky.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-[#324d67] flex items-center justify-between text-sm text-slate-500 dark:text-text-secondary">
              <span>Zobrazených {unfinishedRepairs.length} objednávok</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
