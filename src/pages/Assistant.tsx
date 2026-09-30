import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks';
import { useAuth } from '@/features/auth';
import { AssistantChat } from '@/features/assistant/AssistantChat';
import { Button, IconButton, cx } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { fmtAgo } from '@/lib/format';
import type { Timestamp } from 'firebase/firestore';

interface Thread {
  id: string;
  title: string;
  updatedAt?: Timestamp;
}

export default function AssistantPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { run, confirm } = useFeedback();
  const prompt = (location.state as { prompt?: string } | null)?.prompt;
  const threads = useLiveQuery<Thread>(
    () => (user ? query(collection(db, 'agentThreads'), where('uid', '==', user.uid), orderBy('updatedAt', 'desc'), limit(40)) : null),
    `threads-${user?.uid}`,
  );

  return (
    <div className="-mt-2 flex h-[calc(100dvh-10.5rem)] gap-5 lg:h-[calc(100dvh-8.5rem)]">
      <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:flex">
        <div className="border-b border-line p-3">
          <Button variant="primary" className="w-full" icon={<MessageSquarePlus className="size-4" />} onClick={() => navigate('/asistent')}>
            Nová konverzácia
          </Button>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {threads.data.map((t) => (
            <li key={t.id} className="group relative">
              <button
                onClick={() => navigate(`/asistent/${t.id}`)}
                className={cx('w-full rounded-xl px-3 py-2 pr-9 text-left', t.id === threadId ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2')}
              >
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="text-xs text-muted">{fmtAgo(t.updatedAt)}</span>
              </button>
              <IconButton
                label="Vymazať konverzáciu"
                size="sm"
                className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  if (await confirm({ title: 'Vymazať konverzáciu?', danger: true, confirmLabel: 'Vymazať' })) {
                    await run(() => deleteDoc(doc(db, 'agentThreads', t.id)));
                    if (t.id === threadId) navigate('/asistent');
                  }
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
          {threads.data.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Zatiaľ žiadne konverzácie.</p>}
        </ul>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between lg:hidden">
          <h1 className="text-xl font-bold">AI asistent</h1>
          <Button size="sm" icon={<MessageSquarePlus className="size-4" />} onClick={() => navigate('/asistent')}>
            Nová
          </Button>
        </div>
        <AssistantChat
          threadId={threadId}
          initialPrompt={prompt}
          onThread={(id) => navigate(`/asistent/${id}`, { replace: true, state: null })}
        />
      </div>
    </div>
  );
}
