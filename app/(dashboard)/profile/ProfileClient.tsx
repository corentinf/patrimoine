'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountsPanel, AccountModal, type SidebarAccount } from '@/app/components/AccountsPanel';
import PlaidLinkButton from '@/app/components/PlaidLink';
import SimpleFINLinkButton from '@/app/components/SimpleFINLink';
import { usePrivacy } from '@/app/lib/privacy';
import { createBrowserClient } from '@/app/lib/supabase';

interface Props {
  accounts: SidebarAccount[];
  netWorth: number;
}

function SyncButton() {
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSync = async () => {
    setPhase('syncing');
    setErrorMsg('');
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      if (!res.ok || !res.body) { setPhase('error'); setErrorMsg(`Error ${res.status}`); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.done) {
              if (event.ok) { setPhase('done'); setTimeout(() => window.location.reload(), 1500); }
              else { setPhase('error'); setErrorMsg(event.error || 'Sync failed'); }
              return;
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'Sync failed');
    }
  };

  return (
    <div>
      <button
        onClick={handleSync}
        disabled={phase === 'syncing'}
        className="w-full flex items-center justify-between px-0 py-3.5 text-ink-700 hover:text-ink-900 transition-colors disabled:opacity-50 group"
      >
        <span className="flex items-center gap-3 text-sm">
          <span className={`w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center text-base group-hover:bg-sand-200 transition-colors ${phase === 'syncing' ? 'animate-spin' : ''}`}>↻</span>
          Sync now
        </span>
        {phase === 'done' && <span className="text-xs text-green-600 font-medium">Done ✓</span>}
        {phase === 'syncing' && <span className="text-xs text-ink-400">Syncing…</span>}
        {phase === 'error' && <span className="text-xs text-red-500">{errorMsg}</span>}
      </button>
    </div>
  );
}

export default function ProfileClient({ accounts, netWorth }: Props) {
  const router = useRouter();
  const { blurred, toggle: togglePrivacy } = usePrivacy();
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <>
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={() => setModalAccount(undefined)}
          onSuccess={() => { router.refresh(); setModalAccount(undefined); }}
        />
      )}

      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Profile</h2>
          <p className="text-sm text-ink-400 mt-1">Your accounts and settings</p>
        </div>

        {/* Accounts */}
        <div className="card">
          <AccountsPanel
            accounts={accounts}
            onEdit={(a) => setModalAccount(a)}
            onAdd={() => setModalAccount(null)}
          />
        </div>

        {/* Settings */}
        <div className="card divide-y divide-sand-100 p-0">
          {/* Privacy */}
          <button
            onClick={togglePrivacy}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-sand-50 transition-colors rounded-t-xl"
          >
            <span className="flex items-center gap-3 text-sm text-ink-700">
              <span className="w-8 h-8 rounded-full bg-sand-100 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {blurred
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </span>
              Privacy mode
            </span>
            <span className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${blurred ? 'bg-ink-700' : 'bg-sand-300'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${blurred ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
          </button>

          {/* Sync */}
          <div className="px-5">
            <SyncButton />
          </div>
        </div>

        {/* Connections */}
        <div className="card p-0 divide-y divide-sand-100">
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Connections</p>
          </div>
          <div className="px-4 py-2 space-y-1">
            <PlaidLinkButton />
            <SimpleFINLinkButton />
          </div>
        </div>

        {/* Sign out */}
        <div className="card p-0">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-5 py-4 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors rounded-xl"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
