import React, { useEffect, useState } from 'react';
import { db } from '../store/db';
import { SmallOrder } from '../types';

export default function SmallOrders() {
  const [orders, setOrders] = useState<SmallOrder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [item, setItem] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [filter, setFilter] = useState<'Všetky' | 'Čakajúce'>('Všetky');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = () => {
    db.getSmallOrders().then(setOrders);
  };

  const handleEdit = (order: SmallOrder) => {
    setEditingId(order.id);
    setItem(order.item);
    setCustomer(order.customer);
    setPhone(order.phone);
    setNotes(order.notes || '');
    setPrice(order.price ? order.price.toString() : '');
    setCost(order.cost ? order.cost.toString() : '');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setItem('');
    setCustomer('');
    setPhone('');
    setNotes('');
    setPrice('');
    setCost('');
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderData = {
      item,
      customer,
      phone,
      notes,
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
    };

    if (editingId) {
      await db.updateSmallOrder(editingId, orderData);
      setEditingId(null);
    } else {
      await db.addSmallOrder({
        ...orderData,
        status: 'Neobjednané'
      });
    }
    setItem('');
    setCustomer('');
    setPhone('');
    setNotes('');
    setPrice('');
    setCost('');
    setShowForm(false);
    loadOrders();
  };

  const toggleStatus = async (order: SmallOrder) => {
    const newStatus = order.status === 'Neobjednané' ? 'Objednané' : 'Neobjednané';
    await db.updateSmallOrder(order.id, { status: newStatus });
    loadOrders();
  };

  const deleteOrder = async (id: string) => {
    await db.deleteSmallOrder(id);
    loadOrders();
  };

  const filteredOrders = orders.filter(o => filter === 'Všetky' || o.status === 'Neobjednané');

  return (
    <div className="layout-content-container flex flex-col w-full max-w-[1200px] flex-1 gap-8">
      {/* Page Title */}
      <div className="flex flex-col gap-2">
        <h1 className="text-slate-900 dark:text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">Malé objednávky (Príslušenstvo)</h1>
        <p className="text-slate-500 dark:text-text-secondary text-base font-normal leading-normal max-w-2xl">
          Rýchla správa objednávok pre kryty, ochranné sklá, nabíjačky a iné drobné príslušenstvo. Sledujte stav doručenia tovaru.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Mobile Add Button */}
        {!showForm && (
          <div className="xl:hidden">
            <button onClick={() => setShowForm(true)} className="w-full h-12 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined">add_circle</span>
              Pridať novú objednávku
            </button>
          </div>
        )}

        {/* Left Column: New Order Form */}
        <div className={`xl:col-span-4 flex-col gap-6 sticky top-24 ${showForm ? 'flex' : 'hidden xl:flex'}`}>
          <div className="bg-white dark:bg-[#192633] border border-slate-200 dark:border-surface-dark rounded-xl p-6 shadow-sm relative">
            <button onClick={() => setShowForm(false)} className="xl:hidden absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">{editingId ? 'edit' : 'add_circle'}</span>
              {editingId ? 'Upraviť objednávku' : 'Nová objednávka'}
            </h3>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">Meno zákazníka</span>
                <input required value={customer} onChange={e => setCustomer(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400" placeholder="Zadajte meno"/>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">Telefónne číslo</span>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-[18px]">call</span>
                  </div>
                  <input required value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 pl-10 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400" placeholder="09XX XXX XXX"/>
                </div>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">Položka</span>
                <input required value={item} onChange={e => setItem(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400" placeholder="napr. Ochranný kryt iPhone 13"/>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">Poznámka <span className="text-slate-400 font-normal">(Voliteľné)</span></span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 min-h-[80px] resize-y" placeholder="Farba, typ, špecifikácia..."></textarea>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 relative">
                  <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">Cena pre zákazníka</span>
                  <div className="relative">
                    <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400" placeholder="0.00"/>
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                  </div>
                </label>
                <label className="flex flex-col gap-2 relative">
                  <span className="text-slate-700 dark:text-slate-200 text-sm font-medium">Náklady</span>
                  <div className="relative">
                    <input type="number" value={cost} onChange={e => setCost(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400" placeholder="0.00"/>
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                  </div>
                </label>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button type="submit" className="w-full cursor-pointer rounded-lg h-12 bg-primary hover:bg-blue-600 text-white text-base font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary/20">
                  <span className="material-symbols-outlined">save</span>
                  {editingId ? 'Uložiť zmeny' : 'Uložiť objednávku'}
                </button>
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="w-full cursor-pointer rounded-lg h-12 bg-slate-100 dark:bg-surface-dark hover:bg-slate-200 dark:hover:bg-[#324d67] text-slate-700 dark:text-white text-base font-bold flex items-center justify-center gap-2 transition-colors">
                    Zrušiť
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: List of Orders */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">Nedávne objednávky</h3>
            <div className="flex gap-2">
              <button onClick={() => setFilter('Všetky')} className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${filter === 'Všetky' ? 'bg-slate-200 dark:bg-surface-dark text-slate-700 dark:text-text-secondary' : 'bg-slate-100 dark:bg-transparent border border-slate-200 dark:border-[#324d67] text-slate-500 dark:text-text-secondary'}`}>Všetky</button>
              <button onClick={() => setFilter('Čakajúce')} className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${filter === 'Čakajúce' ? 'bg-slate-200 dark:bg-surface-dark text-slate-700 dark:text-text-secondary' : 'bg-slate-100 dark:bg-transparent border border-slate-200 dark:border-[#324d67] text-slate-500 dark:text-text-secondary'}`}>Čakajúce</button>
            </div>
          </div>

          {filteredOrders.map(order => (
            <div key={order.id} className="bg-white dark:bg-[#192633] border border-slate-200 dark:border-surface-dark rounded-xl p-5 flex flex-col md:flex-row gap-5 items-start md:items-center hover:border-slate-300 dark:hover:border-[#324d67] transition-all shadow-sm">
              <div className={`flex items-center justify-center size-12 rounded-lg shrink-0 ${
                order.item.toLowerCase().includes('sklo') || order.item.toLowerCase().includes('display') ? 'bg-orange-500/10 text-orange-500' :
                order.item.toLowerCase().includes('kábel') ? 'bg-purple-500/10 text-purple-500' :
                order.item.toLowerCase().includes('airpods') ? 'bg-blue-500/10 text-blue-500' :
                'bg-teal-500/10 text-teal-500'
              }`}>
                <span className="material-symbols-outlined">
                  {order.item.toLowerCase().includes('sklo') || order.item.toLowerCase().includes('display') ? 'phone_iphone' :
                   order.item.toLowerCase().includes('kábel') ? 'cable' :
                   order.item.toLowerCase().includes('airpods') ? 'headphones' : 'smartphone'}
                </span>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-slate-900 dark:text-white font-bold text-base truncate">{order.item}</h4>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                    order.status === 'Neobjednané' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'
                  }`}>
                    <span className={`size-1.5 rounded-full ${order.status === 'Neobjednané' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                    {order.status}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-slate-500 dark:text-text-secondary">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                    {order.customer}
                  </span>
                  <span className="hidden sm:inline w-1 h-1 rounded-full bg-slate-300 dark:bg-[#324d67]"></span>
                  <span className="flex items-center gap-1 font-mono">
                    <span className="material-symbols-outlined text-[16px]">call</span>
                    {order.phone}
                  </span>
                  {(order.price || order.cost) && (
                    <>
                      <span className="hidden sm:inline w-1 h-1 rounded-full bg-slate-300 dark:bg-[#324d67]"></span>
                      <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                        {order.price ? `${order.price} €` : '-'} / {order.cost ? `${order.cost} €` : '-'}
                      </span>
                    </>
                  )}
                </div>
                {order.notes && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 italic">Poznámka: {order.notes}</p>
                )}
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                <button onClick={() => handleEdit(order)} className="flex-1 md:flex-initial h-10 px-4 rounded-lg bg-slate-100 dark:bg-surface-dark hover:bg-slate-200 dark:hover:bg-[#324d67] text-slate-700 dark:text-white text-sm font-medium transition-colors border border-transparent dark:border-[#324d67]">
                  Upraviť
                </button>
                <button 
                  onClick={() => toggleStatus(order)} 
                  className={`h-10 w-10 flex items-center justify-center rounded-lg transition-colors ${
                    order.status === 'Neobjednané' 
                      ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' 
                      : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                  }`} 
                  title={order.status === 'Neobjednané' ? "Označiť ako objednané" : "Označiť ako neobjednané"}
                >
                  <span className="material-symbols-outlined">{order.status === 'Neobjednané' ? 'check_circle' : 'undo'}</span>
                </button>
                <button onClick={() => deleteOrder(order.id)} className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-200 dark:bg-surface-dark text-slate-400 hover:text-red-500 transition-colors" title="Zmazať">
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
