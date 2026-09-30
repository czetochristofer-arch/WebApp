import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import VoiceAssistant from './VoiceAssistant';

export default function Layout() {
  const location = useLocation();
  const isSmallOrders = location.pathname === '/small-orders';
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background-light dark:bg-background-dark pb-16 lg:pb-0">
      {/* Header */}
      <header className="flex flex-none items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-surface-dark px-6 lg:px-10 py-3 bg-white dark:bg-background-dark z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4 text-slate-900 dark:text-white">
            <div className="size-8 flex items-center justify-center rounded bg-primary/10 text-primary">
              <span className="material-symbols-outlined">handyman</span>
            </div>
            <h2 className="text-lg font-bold leading-tight tracking-[-0.015em]">ChrisStop Servis</h2>
          </div>
          
          {/* Top Nav for Small Orders view */}
          {isSmallOrders && (
            <nav className="hidden lg:flex items-center gap-9">
              <NavLink to="/repairs" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Opravy</NavLink>
              <NavLink to="/planner" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Plánovanie</NavLink>
              <NavLink to="/small-orders" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Malé objednávky</NavLink>
            </nav>
          )}

          {/* Top Nav for other views (from Dashboard HTML) */}
          {!isSmallOrders && (
             <label className="hidden md:flex flex-col min-w-40 !h-10 max-w-64">
              <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-slate-100 dark:bg-surface-dark">
                <div className="text-slate-500 dark:text-text-secondary flex border-none items-center justify-center pl-4 rounded-l-lg border-r-0">
                  <span className="material-symbols-outlined text-[20px]">search</span>
                </div>
                <input className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg focus:outline-0 focus:ring-0 border-none bg-transparent focus:border-none h-full placeholder:text-slate-400 dark:placeholder:text-text-secondary px-4 rounded-l-none border-l-0 pl-2 text-sm font-normal leading-normal text-slate-900 dark:text-white" placeholder="Hľadať..." />
              </div>
            </label>
          )}
        </div>

        <div className="flex flex-1 justify-end gap-6 items-center">
          {!isSmallOrders && (
            <nav className="hidden lg:flex items-center gap-6">
              <NavLink to="/" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Dashboard</NavLink>
              <NavLink to="/repairs" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Opravy</NavLink>
              <NavLink to="/customers" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Zákazníci</NavLink>
              <NavLink to="/planner" className={({isActive}) => `text-sm font-medium leading-normal transition-colors ${isActive ? 'text-primary dark:text-white border-b-2 border-primary pb-0.5' : 'text-slate-600 dark:text-text-secondary hover:text-primary dark:hover:text-white'}`}>Kalendár</NavLink>
            </nav>
          )}
          
          {isSmallOrders && (
             <label className="hidden md:flex flex-col min-w-40 !h-10 max-w-64">
              <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-slate-100 dark:bg-surface-dark">
                <div className="text-slate-500 dark:text-text-secondary flex border-none items-center justify-center pl-4 rounded-l-lg border-r-0">
                  <span className="material-symbols-outlined text-[20px]">search</span>
                </div>
                <input className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg focus:outline-0 focus:ring-0 border-none bg-transparent focus:border-none h-full placeholder:text-slate-400 dark:placeholder:text-text-secondary px-4 rounded-l-none border-l-0 pl-2 text-sm font-normal leading-normal text-slate-900 dark:text-white" placeholder="Hľadať..." />
              </div>
            </label>
          )}

          <div className="flex gap-2">
            {!isSmallOrders && (
              <NavLink to="/repairs/new" className="hidden sm:flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-9 px-4 bg-primary hover:bg-primary/90 text-white text-sm font-bold leading-normal tracking-[0.015em] transition-colors shadow-sm">
                <span className="truncate">Nová oprava</span>
              </NavLink>
            )}
            {!isSmallOrders && (
              <NavLink to="/settings" className="flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-surface-dark text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-[#2d465e] transition-colors">
                <span className="material-symbols-outlined text-[20px]">settings</span>
              </NavLink>
            )}
            
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-surface-dark text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-[#2d465e] transition-colors relative">
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-surface-dark"></span>
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#324d67] rounded-xl shadow-lg z-50 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#324d67] pb-2">
                    <h3 className="font-bold text-slate-900 dark:text-white">Notifikácie</h3>
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <NavLink to="/repairs" onClick={() => setShowNotifications(false)} className="flex gap-3 items-start p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1a2632] transition-colors cursor-pointer">
                      <div className="size-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">Urgentná oprava</span>
                        <span className="text-xs text-slate-500 dark:text-text-secondary">iPhone 13 Pro mešká s opravou.</span>
                      </div>
                    </NavLink>
                    <NavLink to="/small-orders" onClick={() => setShowNotifications(false)} className="flex gap-3 items-start p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1a2632] transition-colors cursor-pointer">
                      <div className="size-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">Diely doručené</span>
                        <span className="text-xs text-slate-500 dark:text-text-secondary">Súčiastky pre Samsung S21 dorazili.</span>
                      </div>
                    </NavLink>
                  </div>
                </div>
              )}
            </div>

            {isSmallOrders && (
               <NavLink to="/settings" className="flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-surface-dark text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-[#2d465e] transition-colors">
                <span className="material-symbols-outlined text-[20px]">account_circle</span>
              </NavLink>
            )}
          </div>
          {!isSmallOrders && (
            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-9 ring-2 ring-slate-200 dark:ring-surface-dark" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZOUzJkFVON4Uo6urSJCAIuvJm1XCnb0QKBj7sHVSvOAPfF_TLhWEZIrDCWpyjjsjdPcsWWDXkbFM9jNXy34juXGKgQcsbp9qPC4xiUteimD60HhL3UILti6QstVXl8Wn5UtZD-O8_RCYqAxC1Y8JVpPgcJVoKD6liTupF6TA4WvfMCKa_IY_I0LDzqMHBi4cEaR2TjyVYjkLbhaAoKwU4g_gAQTDseq72f0pNXui1Syofs23qyf_x01ASm1CdNAL6Ef8uVyjlQWmB")'}}></div>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar for Dashboard */}
        {!isSmallOrders && location.pathname === '/' && (
          <aside className="hidden xl:flex w-64 flex-col border-r border-slate-200 dark:border-surface-dark bg-white dark:bg-[#111a22] p-4 gap-4 justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 px-4 py-3 mb-4">
                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 ring-2 ring-primary/20" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZOUzJkFVON4Uo6urSJCAIuvJm1XCnb0QKBj7sHVSvOAPfF_TLhWEZIrDCWpyjjsjdPcsWWDXkbFM9jNXy34juXGKgQcsbp9qPC4xiUteimD60HhL3UILti6QstVXl8Wn5UtZD-O8_RCYqAxC1Y8JVpPgcJVoKD6liTupF6TA4WvfMCKa_IY_I0LDzqMHBi4cEaR2TjyVYjkLbhaAoKwU4g_gAQTDseq72f0pNXui1Syofs23qyf_x01ASm1CdNAL6Ef8uVyjlQWmB")'}}></div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">ChrisStop Servis</span>
                  <span className="text-xs text-slate-500 dark:text-text-secondary">Admin Panel</span>
                </div>
              </div>

              <NavLink to="/" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 dark:text-text-secondary hover:bg-slate-50 dark:hover:bg-surface-dark hover:text-slate-900 dark:hover:text-white'}`}>
                <span className="material-symbols-outlined">dashboard</span>
                <span className="text-sm font-medium">Prehľad</span>
              </NavLink>
              <NavLink to="/repairs" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 dark:text-text-secondary hover:bg-slate-50 dark:hover:bg-surface-dark hover:text-slate-900 dark:hover:text-white'}`}>
                <span className="material-symbols-outlined">build</span>
                <span className="text-sm font-medium">Opravy</span>
              </NavLink>
              <NavLink to="/planner" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 dark:text-text-secondary hover:bg-slate-50 dark:hover:bg-surface-dark hover:text-slate-900 dark:hover:text-white'}`}>
                <span className="material-symbols-outlined">calendar_month</span>
                <span className="text-sm font-medium">Kalendár</span>
              </NavLink>
              <NavLink to="/small-orders" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 dark:text-text-secondary hover:bg-slate-50 dark:hover:bg-surface-dark hover:text-slate-900 dark:hover:text-white'}`}>
                <span className="material-symbols-outlined">inventory_2</span>
                <span className="text-sm font-medium">Malé objednávky</span>
              </NavLink>
              <NavLink to="/settings" className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 dark:text-text-secondary hover:bg-slate-50 dark:hover:bg-surface-dark hover:text-slate-900 dark:hover:text-white'}`}>
                <span className="material-symbols-outlined">settings</span>
                <span className="text-sm font-medium">Nastavenia</span>
              </NavLink>
            </div>
            
            <button className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 dark:text-text-secondary hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all mt-auto">
              <span className="material-symbols-outlined">logout</span>
              <span className="text-sm font-medium">Odhlásiť sa</span>
            </button>
          </aside>
        )}

        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto ${isSmallOrders ? 'flex justify-center py-8 px-4 md:px-10 lg:px-40' : ''}`}>
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-[#324d67] flex items-center justify-around z-40 pb-safe">
        <NavLink to="/" className={({isActive}) => `flex flex-col items-center gap-1 py-2 px-3 ${isActive ? 'text-primary dark:text-white' : 'text-slate-500 dark:text-text-secondary'}`}>
          <span className="material-symbols-outlined text-[24px]">dashboard</span>
          <span className="text-[10px] font-medium">Prehľad</span>
        </NavLink>
        <NavLink to="/repairs" className={({isActive}) => `flex flex-col items-center gap-1 py-2 px-3 ${isActive ? 'text-primary dark:text-white' : 'text-slate-500 dark:text-text-secondary'}`}>
          <span className="material-symbols-outlined text-[24px]">build</span>
          <span className="text-[10px] font-medium">Opravy</span>
        </NavLink>
        <NavLink to="/planner" className={({isActive}) => `flex flex-col items-center gap-1 py-2 px-3 ${isActive ? 'text-primary dark:text-white' : 'text-slate-500 dark:text-text-secondary'}`}>
          <span className="material-symbols-outlined text-[24px]">calendar_month</span>
          <span className="text-[10px] font-medium">Kalendár</span>
        </NavLink>
        <NavLink to="/small-orders" className={({isActive}) => `flex flex-col items-center gap-1 py-2 px-3 ${isActive ? 'text-primary dark:text-white' : 'text-slate-500 dark:text-text-secondary'}`}>
          <span className="material-symbols-outlined text-[24px]">inventory_2</span>
          <span className="text-[10px] font-medium">Objednávky</span>
        </NavLink>
      </nav>

      <VoiceAssistant />
    </div>
  );
}
