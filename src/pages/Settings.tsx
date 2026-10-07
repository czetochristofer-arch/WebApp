import { useEffect, useState, type ReactNode } from 'react';
import { getDocs, query } from 'firebase/firestore';
import { Building2, Download, FileText, LogOut, Palette, Smartphone, Sparkles, Trash2, UserPlus, Users, Volume2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useData } from '@/features/data';
import { useTheme, type ThemePref } from '@/features/theme';
import { Badge, Button, Card, IconButton, Input, PageHeader, Segmented, Select, Textarea, Toggle } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { col, getCounter, type CounterKind, inviteMember, removeInvite, removeMember, saveSettings, setCounter } from '@/lib/db';
import { useLiveQuery } from '@/lib/hooks';
import { fmtDateTime, toDate } from '@/lib/format';
import type { AgentModel, BusinessSettings, Member } from '@/lib/types';
import { loadVoicePrefs, saveVoicePrefs, Speaker, ttsSupported, unlockSpeech, useVoices, type VoicePrefs } from '@/features/assistant/tts';

export default function SettingsPage() {
  const { isOwner } = useAuth();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nastavenia" subtitle={isOwner ? 'Údaje o firme, doklady, tím a vzhľad' : 'Niektoré nastavenia môže meniť iba majiteľ'} />
      <div className="space-y-5">
        <BusinessSection />
        <DocumentsSection />
        <AssistantSection />
        <TeamSection />
        <AppearanceSection />
        <DataSection />
        <AccountSection />
      </div>
    </div>
  );
}

function useSettingsDraft() {
  const { settings } = useData();
  const [draft, setDraft] = useState<BusinessSettings>(settings);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);
  const set = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  return { draft, set, dirty, reset: () => setDirty(false) };
}

function SaveBar({ dirty, onSave, disabled }: { dirty: boolean; onSave: () => void; disabled?: boolean }) {
  if (!dirty) return null;
  return (
    <div className="mt-4 flex justify-end">
      <Button variant="primary" onClick={onSave} disabled={disabled}>
        Uložiť zmeny
      </Button>
    </div>
  );
}

function BusinessSection() {
  const { isOwner } = useAuth();
  const { draft, set, dirty, reset } = useSettingsDraft();
  const { run } = useFeedback();
  const save = async () => {
    await run(() => saveSettings(draft), 'Uložené');
    reset();
  };
  return (
    <Card title="Firma" icon={<Building2 className="size-4" />}>
      <fieldset disabled={!isOwner} className="grid gap-3 sm:grid-cols-2">
        <Input label="Názov prevádzky" value={draft.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Obchodné meno (na dokladoch)" value={draft.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} placeholder="ChrisStop s.r.o." />
        <Input label="Adresa" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} wrapClass="sm:col-span-2" />
        <Input label="IČO" value={draft.ico ?? ''} onChange={(e) => set('ico', e.target.value)} />
        <Input label="DIČ" value={draft.dic ?? ''} onChange={(e) => set('dic', e.target.value)} />
        <Input label="Telefón" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        <Input label="E-mail" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        <Input label="Web" value={draft.web ?? ''} onChange={(e) => set('web', e.target.value)} />
        <Input label="IBAN" value={draft.iban ?? ''} onChange={(e) => set('iban', e.target.value)} />
        <div className="sm:col-span-2">
          <Toggle
            checked={draft.vatPayer}
            onChange={(v) => set('vatPayer', v)}
            label="Platiteľ DPH"
            hint="Ovplyvňuje texty na dokladoch. Ceny v aplikácii sú vždy konečné ceny pre zákazníka."
          />
        </div>
        {draft.vatPayer && <Input label="IČ DPH" value={draft.icdph ?? ''} onChange={(e) => set('icdph', e.target.value)} />}
      </fieldset>
      <SaveBar dirty={dirty} onSave={save} />
    </Card>
  );
}

function DocumentsSection() {
  const { isOwner } = useAuth();
  const { draft, set, dirty, reset } = useSettingsDraft();
  const { run } = useFeedback();
  const [counters, setCounters] = useState<{ repairs: number; orders: number; claims: number } | null>(null);
  useEffect(() => {
    Promise.all([getCounter('repairs'), getCounter('orders'), getCounter('claims')])
      .then(([repairs, orders, claims]) => setCounters({ repairs, orders, claims }))
      .catch(() => undefined);
  }, []);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <Card title="Zákazky a doklady" icon={<FileText className="size-4" />}>
      <fieldset disabled={!isOwner} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Prefix zákaziek" value={draft.repairPrefix} onChange={(e) => set('repairPrefix', e.target.value.toUpperCase())} />
          <Input label="Prefix objednávok" value={draft.orderPrefix} onChange={(e) => set('orderPrefix', e.target.value.toUpperCase())} />
          <Input label="Prefix reklamácií" value={draft.claimPrefix ?? 'R'} onChange={(e) => set('claimPrefix', e.target.value.toUpperCase())} />
          <Input label="Záruka" suffix="mes." inputMode="numeric" value={draft.defaultWarrantyMonths} onChange={(e) => set('defaultWarrantyMonths', Number(e.target.value) || 0)} />
          <div className="grid grid-cols-2 gap-2">
            <Select label="Deň od" value={draft.workdayStart} onChange={(e) => set('workdayStart', Number(e.target.value))}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </Select>
            <Select label="do" value={draft.workdayEnd} onChange={(e) => set('workdayEnd', Number(e.target.value))}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </Select>
          </div>
        </div>
        {counters && (
          <div className="grid gap-3 sm:grid-cols-3">
            <CounterInput label="Ďalšie číslo zákazky" kind="repairs" value={counters.repairs} prefix={draft.repairPrefix} />
            <CounterInput label="Ďalšie číslo objednávky" kind="orders" value={counters.orders} prefix={draft.orderPrefix} />
            <CounterInput label="Ďalšie číslo reklamácie" kind="claims" value={counters.claims} prefix={draft.claimPrefix ?? 'R'} />
          </div>
        )}
        <Textarea label="Podmienky servisu (tlačia sa na preberací protokol)" value={draft.protocolTerms} onChange={(e) => set('protocolTerms', e.target.value)} rows={6} />
        <Textarea
          label="SMS – zariadenie je hotové"
          hint="Premenné: {zariadenie} {cislo} {cena} {firma} {odkaz} (odkaz na stav opravy)"
          value={draft.smsReadyTemplate}
          onChange={(e) => set('smsReadyTemplate', e.target.value)}
          rows={2}
        />
        <Textarea label="SMS – objednávka dorazila" hint="Premenné: {cislo} {polozky} {firma}" value={draft.smsOrderTemplate} onChange={(e) => set('smsOrderTemplate', e.target.value)} rows={2} />
      </fieldset>
      <SaveBar
        dirty={dirty}
        onSave={async () => {
          await run(() => saveSettings(draft), 'Uložené');
          reset();
        }}
      />
      {!isOwner && <p className="mt-3 text-xs text-muted">Tieto nastavenia môže meniť iba majiteľ.</p>}
      {isOwner && counters && <p className="mt-3 text-xs text-muted">Číslovanie môžete nastaviť tak, aby nadväzovalo na papierovú evidenciu.</p>}
    </Card>
  );
}

function CounterInput({ label, kind, value, prefix }: { label: string; kind: CounterKind; value: number; prefix: string }) {
  const [v, setV] = useState(String(value));
  const { run } = useFeedback();
  const changed = Number(v) !== value && Number(v) > 0;
  return (
    <div className="flex items-end gap-2">
      <Input label={label} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} hint={`Ďalšia bude ${prefix}-${v || value}`} wrapClass="flex-1" />
      {changed && (
        <Button className="mb-5" onClick={() => run(() => setCounter(kind, Number(v)), 'Číslovanie nastavené')}>
          Nastaviť
        </Button>
      )}
    </div>
  );
}

const MODELS: { id: AgentModel; title: string; text: string }[] = [
  { id: 'sonnet', title: 'Claude Sonnet 5.5 – najpresnejší', text: 'Odporúčané. Spoľahlivo zapisuje zákazky a rozumie aj zložitejším požiadavkám.' },
  { id: 'haiku', title: 'Claude Haiku 4.5 – úsporný', text: 'Približne o polovicu lacnejší a rýchlejší, na zložitejšie úlohy slabší.' },
];

function AssistantSection() {
  const { isOwner } = useAuth();
  const { settings } = useData();
  const { run } = useFeedback();
  const voices = useVoices();
  const [prefs, setPrefs] = useState<VoicePrefs>(loadVoicePrefs);
  const [speaker] = useState(() => new Speaker());
  const update = (p: Partial<VoicePrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    saveVoicePrefs(next);
  };
  const model = settings.agentModel ?? 'sonnet';
  return (
    <Card title="AI asistent" icon={<Sparkles className="size-4" />}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Model pre nové konverzácie</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!isOwner}
                onClick={() => m.id !== model && run(() => saveSettings({ agentModel: m.id }), 'Model zmenený – platí pre nové konverzácie')}
                className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-default ${model === m.id ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary/40'}`}
              >
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{m.text}</span>
              </button>
            ))}
          </div>
          {!isOwner && <p className="mt-2 text-xs text-muted">Model môže meniť iba majiteľ.</p>}
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-medium text-muted">
            <Volume2 className="size-4" /> Hlasové odpovede (nastavenie tohto zariadenia)
          </p>
          {ttsSupported() ? (
            <div className="space-y-3">
              <Segmented<VoicePrefs['autoRead']>
                value={prefs.autoRead}
                onChange={(v) => update({ autoRead: v })}
                options={[
                  { id: 'voice', label: 'Keď hovorím' },
                  { id: 'always', label: 'Vždy' },
                  { id: 'off', label: 'Nikdy' },
                ]}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Hlas" value={prefs.voiceURI ?? voices[0]?.voiceURI ?? ''} onChange={(e) => update({ voiceURI: e.target.value })}>
                  {voices.length === 0 && <option value="">Predvolený hlas zariadenia</option>}
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </Select>
                <Select label="Rýchlosť reči" value={String(prefs.rate)} onChange={(e) => update({ rate: Number(e.target.value) })}>
                  {[0.9, 1, 1.05, 1.15, 1.25, 1.4].map((r) => (
                    <option key={r} value={String(r)}>
                      {r === 1 ? 'Normálna' : `${r}×`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  icon={<Volume2 className="size-4" />}
                  onClick={() => {
                    unlockSpeech();
                    speaker.say('Dobrý deň, som váš asistent. Zákazka Z 1050 je hotová, zákazník doplatí 49,90 eur.');
                  }}
                >
                  Vyskúšať hlas
                </Button>
                {voices.length > 0 && !voices.some((v) => v.lang.toLowerCase().startsWith('sk')) && (
                  <span className="text-xs text-muted">Zariadenie nemá slovenský hlas – doinštalujte ho v nastaveniach systému (Jazyk a reč).</span>
                )}
              </div>
              <p className="text-xs text-muted">
                Tip: najprirodzenejšie hlasy majú Microsoft Edge („Natural“), Android (Google) a iPhone (Nastavenia → Prístupnosť → Hovorený obsah → Hlasy → Slovenčina, stiahnuť vylepšený hlas).
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Tento prehliadač nevie čítať text nahlas.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function TeamSection() {
  const { isOwner, user } = useAuth();
  const { run, confirm } = useFeedback();
  const members = useLiveQuery<Member>(() => query(col.members()), 'members');
  const invites = useLiveQuery<{ id: string; email: string; role: string; createdAt?: import('firebase/firestore').Timestamp }>(
    () => (isOwner ? query(col.invites()) : null),
    `invites-${isOwner}`,
  );
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'owner'>('staff');

  return (
    <Card title="Tím a prístup" icon={<Users className="size-4" />}>
      <ul className="divide-y divide-line">
        {members.data.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.name || m.email}</p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>
            <Badge tone={m.role === 'owner' ? 'orange' : 'gray'}>{m.role === 'owner' ? 'Majiteľ' : 'Člen'}</Badge>
            {isOwner && m.id !== user?.uid && (
              <IconButton
                label="Odobrať prístup"
                size="sm"
                onClick={async () =>
                  (await confirm({ title: 'Odobrať prístup?', message: `${m.email} sa už nebude môcť prihlásiť do aplikácie.`, danger: true, confirmLabel: 'Odobrať' })) &&
                  run(() => removeMember(m.id), 'Prístup odobratý')
                }
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
        {invites.data.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.email}</p>
              <p className="text-xs text-muted">Pozvánka čaká na prvé prihlásenie · {fmtDateTime(toDate(i.createdAt))}</p>
            </div>
            <Badge tone="amber">Pozvaný</Badge>
            <IconButton label="Zrušiť pozvánku" size="sm" onClick={() => run(() => removeInvite(i.id))}>
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      {isOwner && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email.includes('@')) return;
            await run(() => inviteMember(email, role), 'Pozvánka vytvorená – nech sa prihlási týmto e-mailom');
            setEmail('');
          }}
        >
          <Input label="Pozvať člena tímu (e-mail)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} wrapClass="min-w-56 flex-1" placeholder="kolega@gmail.com" />
          <Select value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'owner')} className="w-auto" aria-label="Rola">
            <option value="staff">Člen tímu</option>
            <option value="owner">Majiteľ (plné práva)</option>
          </Select>
          <Button type="submit" variant="primary" icon={<UserPlus className="size-4" />}>
            Pozvať
          </Button>
        </form>
      )}
      <p className="mt-3 text-xs text-muted">Člen tímu vidí a upravuje zákazky, objednávky a kalendár. Mazať záznamy a meniť nastavenia firmy môže iba majiteľ.</p>
    </Card>
  );
}

function AppearanceSection() {
  const { pref, setPref } = useTheme();
  return (
    <Card title="Vzhľad" icon={<Palette className="size-4" />}>
      <Segmented<ThemePref>
        value={pref}
        onChange={setPref}
        options={[
          { id: 'system', label: 'Podľa zariadenia' },
          { id: 'light', label: 'Svetlý' },
          { id: 'dark', label: 'Tmavý' },
        ]}
      />
    </Card>
  );
}

function DataSection() {
  const { run } = useFeedback();
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true);
    await run(async () => {
      const names = ['repairs', 'orders', 'customers', 'events', 'priceList'] as const;
      const out: Record<string, unknown[]> = {};
      for (const n of names) {
        const snap = await getDocs(query(col[n]()));
        out[n] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(out, (_k, v) => (v && typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v ? new Date(v.seconds * 1000).toISOString() : v), 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chrisstop-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'Záloha stiahnutá');
    setBusy(false);
  };
  return (
    <Card title="Dáta a aplikácia" icon={<Download className="size-4" />}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">Stiahnite si kompletnú zálohu všetkých zákaziek, objednávok, zákazníkov, kalendára a cenníka.</p>
          <Button icon={<Download className="size-4" />} loading={busy} onClick={exportAll}>
            Stiahnuť zálohu
          </Button>
        </div>
        <div className="flex gap-3 rounded-xl bg-surface-2 p-3">
          <Smartphone className="size-5 shrink-0 text-muted" />
          <p className="text-muted">
            <b className="text-fg">Aplikácia do mobilu:</b> v Chrome otvorte menu ⋮ → „Nainštalovať aplikáciu“. Na iPhone v Safari ťuknite na „Zdieľať“ → „Pridať na plochu“. Aplikácia potom
            funguje ako bežná appka a aj pri slabom signáli.
          </p>
        </div>
      </div>
    </Card>
  );
}

function AccountSection() {
  const { user, signOut } = useAuth();
  return (
    <Card title="Účet">
      <Row label="Prihlásený ako">{user?.email}</Row>
      <div className="mt-4">
        <Button icon={<LogOut className="size-4" />} onClick={signOut}>
          Odhlásiť sa
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
