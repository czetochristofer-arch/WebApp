import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, addDays, startOfWeek, subWeeks, addWeeks, isSameDay, parseISO, setHours, setMinutes, startOfDay } from 'date-fns';
import { sk } from 'date-fns/locale';
import { db } from '../store/db';
import { Repair, Urgency } from '../types';

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 to 18:00

const URGENCY_COLORS: Record<Urgency, string> = {
  'Nízka': 'bg-slate-500/10 border-slate-500 text-slate-600 dark:text-slate-400',
  'Stredná': 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400',
  'Vysoká': 'bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400',
  'Kritická': 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400',
};

export default function Planner() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'Deň' | 'Týždeň' | 'Mesiac'>('Týždeň');
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [draggedRepair, setDraggedRepair] = useState<Repair | null>(null);

  useEffect(() => {
    loadRepairs();
  }, []);

  const loadRepairs = async () => {
    const data = await db.getRepairs();
    setRepairs(data);
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handlePrev = () => {
    if (view === 'Týždeň') setCurrentDate(subWeeks(currentDate, 1));
    else if (view === 'Deň') setCurrentDate(addDays(currentDate, -1));
    else if (view === 'Mesiac') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNext = () => {
    if (view === 'Týždeň') setCurrentDate(addWeeks(currentDate, 1));
    else if (view === 'Deň') setCurrentDate(addDays(currentDate, 1));
    else if (view === 'Mesiac') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => setCurrentDate(new Date());

  const handleDragStart = (e: React.DragEvent, repair: Repair) => {
    setDraggedRepair(repair);
    e.dataTransfer.effectAllowed = 'move';
    // Small delay to allow drag image to generate before hiding original
    setTimeout(() => {
      const el = document.getElementById(`repair-${repair.id}`);
      if (el) el.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent, repair: Repair) => {
    setDraggedRepair(null);
    const el = document.getElementById(`repair-${repair.id}`);
    if (el) el.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, date: Date, hour: number) => {
    e.preventDefault();
    if (!draggedRepair) return;

    const newDateStr = format(date, 'yyyy-MM-dd');
    const newTimeStr = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;

    // Optimistic update
    const updatedRepair = { ...draggedRepair, date: newDateStr, time: newTimeStr };
    setRepairs(prev => prev.map(r => r.id === updatedRepair.id ? updatedRepair : r));

    await db.updateRepair(updatedRepair.id, { date: newDateStr, time: newTimeStr });
    loadRepairs();
  };

  const changeUrgency = async (e: React.MouseEvent, repair: Repair) => {
    e.stopPropagation();
    e.preventDefault();
    const urgencies: Urgency[] = ['Nízka', 'Stredná', 'Vysoká', 'Kritická'];
    const currentIndex = urgencies.indexOf(repair.urgency || 'Stredná');
    const nextUrgency = urgencies[(currentIndex + 1) % urgencies.length];
    
    const updatedRepair = { ...repair, urgency: nextUrgency };
    setRepairs(prev => prev.map(r => r.id === updatedRepair.id ? updatedRepair : r));
    
    await db.updateRepair(repair.id, { urgency: nextUrgency });
  };

  const renderWeekView = () => {
    return (
      <div className="overflow-x-auto w-full">
        <div className="min-w-[800px]">
          {/* Calendar Week Header */}
          <div className="grid grid-cols-8 border-b border-slate-200 dark:border-surface-dark bg-white dark:bg-background-dark">
            <div className="border-r border-slate-200 dark:border-surface-dark p-2 flex items-end justify-center pb-4 text-xs font-medium text-slate-400 dark:text-slate-500 w-16 md:w-20">
              Čas
            </div>
            {weekDays.map((day, idx) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div key={idx} className={`border-r border-slate-200 dark:border-surface-dark p-2 text-center py-4 ${isToday ? 'bg-primary/5 dark:bg-[#1a2632]' : 'bg-slate-50/30 dark:bg-transparent'}`}>
                  <span className={`block text-xs uppercase font-bold ${isToday ? 'text-primary dark:text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
                    {format(day, 'EEE', { locale: sk })}
                  </span>
                  <div className={`mt-1 size-8 mx-auto flex items-center justify-center rounded-full font-medium ${isToday ? 'bg-primary text-white font-bold shadow-md shadow-primary/30' : 'text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-surface-dark'}`}>
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calendar Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            <div className="relative min-h-[600px] grid grid-cols-8">
              {HOURS.map(hour => (
                <React.Fragment key={hour}>
                  {/* Time Label */}
                  <div className="w-16 md:w-20 text-xs text-slate-400 dark:text-slate-500 text-right pr-2 pt-2 border-b border-slate-100 dark:border-surface-dark/50 bg-white dark:bg-background-dark sticky left-0 z-20">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  
                  {/* Days Cells */}
                  {weekDays.map((day, dayIdx) => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const cellRepairs = repairs.filter(r => {
                      if (r.date !== dayStr) return false;
                      const repairHour = parseInt(r.time.split(':')[0], 10);
                      return repairHour === hour;
                    });

                    return (
                      <div 
                        key={`${dayIdx}-${hour}`} 
                        className="border-b border-r border-slate-100 dark:border-surface-dark/50 relative min-h-[80px] hover:bg-slate-50 dark:hover:bg-[#1a2632]/50 transition-colors"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, day, hour)}
                        onClick={() => navigate(`/repairs/new?date=${dayStr}&time=${hour.toString().padStart(2, '0')}:00 - ${(hour+1).toString().padStart(2, '0')}:00`)}
                      >
                        {cellRepairs.map((repair, i) => {
                          const urgency = repair.urgency || 'Stredná';
                        const colorClass = URGENCY_COLORS[urgency];
                        
                        return (
                          <div 
                            key={repair.id}
                            id={`repair-${repair.id}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, repair)}
                            onDragEnd={(e) => handleDragEnd(e, repair)}
                            onClick={(e) => { e.stopPropagation(); navigate(`/repairs/${repair.id}`); }}
                            className={`absolute left-1 right-1 rounded-md border-l-4 p-2 cursor-move z-10 shadow-sm hover:brightness-95 transition-all ${colorClass}`}
                            style={{ top: `${(i * 40) + 4}px`, minHeight: '36px' }}
                            title="Potiahnite pre presun. Kliknite pre úpravu."
                          >
                            <div className="flex justify-between items-start">
                              <p className="text-[10px] font-bold truncate pr-4">{repair.device}</p>
                              <button 
                                onClick={(e) => changeUrgency(e, repair)}
                                className="absolute top-1 right-1 size-4 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center"
                                title="Zmeniť farbu (urgentnosť)"
                              >
                                <span className="size-2.5 rounded-full bg-current opacity-50"></span>
                              </button>
                            </div>
                            <p className="text-[10px] opacity-80 line-clamp-1 leading-tight mt-0.5">{repair.type}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayStr = format(currentDate, 'yyyy-MM-dd');
    
    return (
      <>
        {/* Calendar Day Header */}
        <div className="flex border-b border-slate-200 dark:border-surface-dark bg-white dark:bg-background-dark">
          <div className="border-r border-slate-200 dark:border-surface-dark p-2 flex items-end justify-center pb-4 text-xs font-medium text-slate-400 dark:text-slate-500 w-16 md:w-20 shrink-0">
            Čas
          </div>
          <div className="flex-1 p-2 text-center py-4 bg-primary/5 dark:bg-[#1a2632]">
            <span className="block text-xs uppercase font-bold text-primary dark:text-primary">
              {format(currentDate, 'EEEE', { locale: sk })}
            </span>
            <div className="mt-1 size-8 mx-auto flex items-center justify-center rounded-full font-medium bg-primary text-white font-bold shadow-md shadow-primary/30">
              {format(currentDate, 'd')}
            </div>
          </div>
        </div>

        {/* Calendar Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          <div className="relative min-h-[600px] flex flex-col">
            {HOURS.map(hour => {
              const cellRepairs = repairs.filter(r => {
                if (r.date !== dayStr) return false;
                const repairHour = parseInt(r.time.split(':')[0], 10);
                return repairHour === hour;
              });

              return (
                <div key={hour} className="flex border-b border-slate-100 dark:border-surface-dark/50 min-h-[100px]">
                  {/* Time Label */}
                  <div className="w-16 md:w-20 text-xs text-slate-400 dark:text-slate-500 text-right pr-2 pt-2 border-r border-slate-100 dark:border-surface-dark/50 bg-white dark:bg-background-dark shrink-0">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  
                  {/* Day Cell */}
                  <div 
                    className="flex-1 relative hover:bg-slate-50 dark:hover:bg-[#1a2632]/50 transition-colors p-2 flex flex-col gap-2"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, currentDate, hour)}
                    onClick={() => navigate(`/repairs/new?date=${dayStr}&time=${hour.toString().padStart(2, '0')}:00 - ${(hour+1).toString().padStart(2, '0')}:00`)}
                  >
                    {cellRepairs.map((repair) => {
                      const urgency = repair.urgency || 'Stredná';
                      const colorClass = URGENCY_COLORS[urgency];
                      
                      return (
                        <div 
                          key={repair.id}
                          id={`repair-${repair.id}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, repair)}
                          onDragEnd={(e) => handleDragEnd(e, repair)}
                          onClick={(e) => { e.stopPropagation(); navigate(`/repairs/${repair.id}`); }}
                          className={`rounded-md border-l-4 p-3 cursor-move shadow-sm hover:brightness-95 transition-all ${colorClass}`}
                          title="Potiahnite pre presun. Kliknite pre úpravu."
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                              <p className="text-sm font-bold">{repair.device}</p>
                              <p className="text-xs opacity-80 mt-0.5">{repair.type}</p>
                              <p className="text-xs opacity-70 mt-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">person</span>
                                {repair.customer}
                              </p>
                            </div>
                            <button 
                              onClick={(e) => changeUrgency(e, repair)}
                              className="size-6 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center"
                              title="Zmeniť farbu (urgentnosť)"
                            >
                              <span className="size-3 rounded-full bg-current opacity-50"></span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  const renderMonthView = () => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = startOfWeek(start, { weekStartsOn: 1 });
    const endDate = addDays(startOfWeek(end, { weekStartsOn: 1 }), 6);
    
    const days = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }

    return (
      <div className="flex flex-col flex-1 overflow-hidden w-full overflow-x-auto">
        <div className="min-w-[800px] flex flex-col flex-1 h-full">
          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-surface-dark bg-white dark:bg-background-dark shrink-0">
            {['Pon', 'Uto', 'Str', 'Štv', 'Pia', 'Sob', 'Ned'].map((d, i) => (
              <div key={i} className="p-2 text-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto custom-scrollbar">
            {days.map((day, idx) => {
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, new Date());
              const dayStr = format(day, 'yyyy-MM-dd');
              
              const dayRepairs = repairs.filter(r => r.date === dayStr);

              return (
                <div 
                  key={idx} 
                  className={`min-h-[100px] border-b border-r border-slate-100 dark:border-surface-dark/50 p-1 flex flex-col gap-1 transition-colors hover:bg-slate-50 dark:hover:bg-[#1a2632]/50 cursor-pointer ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-[#162029]/30' : 'bg-white dark:bg-transparent'}`}
                  onClick={() => navigate(`/repairs/new?date=${dayStr}`)}
                >
                  <div className="flex justify-end p-1">
                    <span className={`size-6 flex items-center justify-center rounded-full text-xs font-medium ${isToday ? 'bg-primary text-white font-bold shadow-md shadow-primary/30' : isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1">
                    {dayRepairs.map(repair => {
                      const urgency = repair.urgency || 'Stredná';
                      const colorClass = URGENCY_COLORS[urgency];
                      
                      return (
                        <div 
                          key={repair.id}
                          onClick={(e) => { e.stopPropagation(); navigate(`/repairs/${repair.id}`); }}
                          className={`text-[10px] p-1 rounded border-l-2 truncate cursor-pointer hover:brightness-95 transition-all ${colorClass}`}
                          title={`${repair.device} - ${repair.customer}`}
                        >
                          <span className="font-bold">{repair.time.split(' ')[0]}</span> {repair.device}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-white dark:bg-background-dark">
      {/* Calendar Controls Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 lg:px-8 border-b border-slate-200 dark:border-surface-dark">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black leading-tight tracking-[-0.033em] dark:text-white text-slate-900">Plánovač opráv</h1>
            <p className="text-sm dark:text-text-secondary text-slate-500">Prehľad naplánovaných servisných úkonov (Drag & Drop pre presun)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-[#1a2632] p-1 rounded-lg border border-slate-200 dark:border-surface-dark">
            <button onClick={() => setView('Deň')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'Deň' ? 'bg-white dark:bg-surface-dark text-primary dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-slate-600 dark:text-text-secondary hover:bg-white dark:hover:bg-surface-dark hover:shadow-sm'}`}>Deň</button>
            <button onClick={() => setView('Týždeň')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'Týždeň' ? 'bg-white dark:bg-surface-dark text-primary dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-slate-600 dark:text-text-secondary hover:bg-white dark:hover:bg-surface-dark hover:shadow-sm'}`}>Týždeň</button>
            <button onClick={() => setView('Mesiac')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'Mesiac' ? 'bg-white dark:bg-surface-dark text-primary dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-slate-600 dark:text-text-secondary hover:bg-white dark:hover:bg-surface-dark hover:shadow-sm'}`}>Mesiac</button>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-surface-dark mx-1"></div>
          <Link to="/repairs/new" className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg shadow-sm shadow-primary/20 transition-all">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Pridať do plánu
          </Link>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-8 py-4 bg-slate-50/50 dark:bg-background-dark">
          <div className="flex items-center gap-4">
            <button onClick={handlePrev} className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-surface-dark text-slate-600 dark:text-white transition-colors">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {view === 'Týždeň' && `${format(weekDays[0], 'd. MMM', { locale: sk })} - ${format(weekDays[6], 'd. MMM yyyy', { locale: sk })}`}
              {view === 'Deň' && format(currentDate, 'd. MMMM yyyy', { locale: sk })}
              {view === 'Mesiac' && format(currentDate, 'MMMM yyyy', { locale: sk })}
              {view === 'Týždeň' && <span className="text-xs font-normal text-slate-500 dark:text-text-secondary bg-slate-200 dark:bg-surface-dark px-2 py-0.5 rounded-full">Týždeň {format(currentDate, 'w')}</span>}
            </h2>
            <button onClick={handleNext} className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-surface-dark text-slate-600 dark:text-white transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <button onClick={handleToday} className="text-sm font-medium text-primary hover:underline">Dnes</button>
        </div>

        {view === 'Týždeň' && renderWeekView()}
        {view === 'Deň' && renderDayView()}
        {view === 'Mesiac' && renderMonthView()}
      </div>
    </div>
  );
}
