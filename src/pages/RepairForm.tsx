import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../store/db';
import { PartsStatus, RepairStatus, Urgency } from '../types';

export default function RepairForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  
  const [device, setDevice] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState<RepairStatus>('Diagnostika');
  const [partsStatus, setPartsStatus] = useState<PartsStatus>('Neobjednané');
  const [urgency, setUrgency] = useState<Urgency>('Stredná');
  const [date, setDate] = useState(searchParams.get('date') || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(searchParams.get('time') || '09:00 - 10:00');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  useEffect(() => {
    if (id) {
      db.getRepairById(id).then(repair => {
        if (repair) {
          setDevice(repair.device);
          setCustomer(repair.customer);
          setPhone(repair.phone || '');
          setType(repair.type);
          setStatus(repair.status);
          setPartsStatus(repair.partsStatus);
          setUrgency(repair.urgency || 'Stredná');
          setDate(repair.date);
          setTime(repair.time);
          setCost(repair.cost.toString());
          setPrice(repair.price.toString());
          setNotes(repair.notes);
          setInternalNotes(repair.internalNotes || '');
        }
      });
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const repairData = {
      device,
      customer,
      phone,
      status,
      partsStatus,
      urgency,
      date,
      time,
      type,
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
      profit: (parseFloat(price) || 0) - (parseFloat(cost) || 0),
      notes,
      internalNotes
    };

    if (id) {
      await db.updateRepair(id, repairData);
    } else {
      await db.addRepair(repairData);
    }

    navigate(-1);
  };

  const handleDelete = async () => {
    if (id && window.confirm('Naozaj chcete vymazať túto opravu?')) {
      await db.deleteRepair(id);
      navigate('/repairs');
    }
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-8 gap-8 bg-background-light dark:bg-background-dark overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-500 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-dark rounded-lg transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-[-0.033em] text-slate-900 dark:text-white">
              {id ? 'Upraviť Opravu' : 'Nová Objednávka Opravy'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-text-secondary">
              {id ? 'Upravte údaje o servisnej zákazke.' : 'Vyplňte údaje o novej servisnej zákazke pre zaradenie do systému.'}
            </p>
          </div>
        </div>
        {id && (
          <button onClick={handleDelete} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Vymazať opravu">
            <span className="material-symbols-outlined">delete</span>
          </button>
        )}
      </div>

      <div className="max-w-4xl w-full mx-auto">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-surface-dark rounded-xl p-6 md:p-8 shadow-sm flex flex-col gap-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Zákazník */}
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person</span>
                Zákazník
              </h3>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Meno zákazníka</span>
                <input required value={customer} onChange={e => setCustomer(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="Zadajte meno" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Telefón</span>
                <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="09XX XXX XXX" />
              </label>
            </div>

            {/* Zariadenie */}
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">smartphone</span>
                Zariadenie
              </h3>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Značka a model</span>
                <input required value={device} onChange={e => setDevice(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="napr. iPhone 13" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Typ opravy</span>
                <input required value={type} onChange={e => setType(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="Výmena displeja" />
              </label>
            </div>
          </div>

          {/* Plánovanie a Stav */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-200 dark:border-[#324d67]">
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">calendar_month</span>
                Plánovanie
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Dátum</span>
                  <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Čas (od - do)</span>
                  <input required value={time} onChange={e => setTime(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="09:00 - 10:00" />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">info</span>
                Stav
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Stav opravy</span>
                  <select value={status} onChange={e => setStatus(e.target.value as RepairStatus)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="Diagnostika">Diagnostika</option>
                    <option value="Čaká sa">Čaká sa</option>
                    <option value="Prebieha">Prebieha</option>
                    <option value="Hotovo">Hotovo</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Stav dielov</span>
                  <select value={partsStatus} onChange={e => setPartsStatus(e.target.value as PartsStatus)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="Dostupné skladom">Dostupné skladom</option>
                    <option value="Chýbajú (Objednané)">Chýbajú (Objednané)</option>
                    <option value="Na overenie">Na overenie</option>
                    <option value="Neobjednané">Neobjednané</option>
                    <option value="Objednané">Objednané</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Urgentnosť</span>
                  <select value={urgency} onChange={e => setUrgency(e.target.value as Urgency)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="Nízka">Nízka (Sivá)</option>
                    <option value="Stredná">Stredná (Modrá)</option>
                    <option value="Vysoká">Vysoká (Oranžová)</option>
                    <option value="Kritická">Kritická (Červená)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Financie */}
          <div className="flex flex-col gap-4 pt-6 border-t border-slate-200 dark:border-[#324d67]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">payments</span>
              Financie
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2 relative">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Náklady na opravu (€)</span>
                <div className="relative">
                  <input type="number" value={cost} onChange={e => setCost(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="0.00" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                </div>
              </label>
              <label className="flex flex-col gap-2 relative">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Celková cena pre zákazníka (€)</span>
                <div className="relative">
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary" placeholder="0.00" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                </div>
              </label>
            </div>
          </div>

          {/* Poznámky */}
          <div className="flex flex-col gap-4 pt-6 border-t border-slate-200 dark:border-[#324d67]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">speaker_notes</span>
              Poznámky
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Pre zákazníka</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary min-h-[80px] resize-y" placeholder="Viditeľné pre zákazníka..." />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Interná poznámka</span>
                <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-[#324d67] bg-slate-50 dark:bg-[#101922] text-slate-900 dark:text-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400 dark:placeholder:text-text-secondary min-h-[80px] resize-y" placeholder="Poznámky pre technika..." />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200 dark:border-[#324d67]">
            <button type="button" onClick={() => navigate(-1)} className="px-6 py-2.5 rounded-lg border border-slate-300 dark:border-[#324d67] text-slate-700 dark:text-white text-sm font-bold hover:bg-slate-50 dark:hover:bg-[#1a2632] transition-colors">
              Zrušiť
            </button>
            <button type="submit" className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-bold shadow-sm shadow-primary/20 transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">save</span>
              Uložiť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
