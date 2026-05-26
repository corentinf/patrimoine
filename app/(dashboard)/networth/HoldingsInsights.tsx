'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

interface Insight {
  title: string;
  body: string;
  severity: 'warning' | 'info' | 'positive' | 'tip';
}

const SEVERITY_CONFIG = {
  warning: {
    icon: '⚠',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    iconColor: 'text-amber-500',
    titleColor: 'text-amber-800',
  },
  info: {
    icon: 'ℹ',
    bg: 'bg-sand-50',
    border: 'border-sand-200',
    iconColor: 'text-ink-400',
    titleColor: 'text-ink-700',
  },
  positive: {
    icon: '↑',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    iconColor: 'text-accent-green',
    titleColor: 'text-emerald-800',
  },
  tip: {
    icon: '✦',
    bg: 'bg-sand-50',
    border: 'border-sand-200',
    iconColor: 'text-ink-500',
    titleColor: 'text-ink-700',
  },
};

const SUGGESTED_QUESTIONS = [
  'Should I rebalance anything?',
  'Which positions have the most risk?',
  'Am I over-exposed to any sector?',
];

function InsightSkeleton() {
  return (
    <div className="rounded-xl border border-sand-100 p-4 space-y-2 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-sand-200" />
        <div className="h-3.5 w-32 rounded bg-sand-200" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 rounded bg-sand-100 w-full" />
        <div className="h-3 rounded bg-sand-100 w-5/6" />
        <div className="h-3 rounded bg-sand-100 w-4/6" />
      </div>
    </div>
  );
}

export default function HoldingsInsights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/holdings/chat' }),
  });
  const isStreaming = status === 'streaming' || status === 'submitted';

  async function fetchInsights() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/holdings/insights');
      const data = await res.json();
      if (res.ok) setInsights(data.insights ?? []);
      else setError('Failed to load insights');
    } catch {
      setError('Failed to load insights');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInsights(); }, []);

  useEffect(() => {
    if (chatOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  function handleSend(text: string) {
    if (!text.trim() || isStreaming) return;
    setChatOpen(true);
    sendMessage({ text });
  }

  function handleSuggest(q: string) {
    setChatOpen(true);
    sendMessage({ text: q });
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-sand-100">
        <div className="flex items-center gap-2">
          <span className="text-ink-600 text-sm">✦</span>
          <h4 className="text-sm font-semibold text-ink-700">Portfolio Insights</h4>
          <span className="text-[10px] text-ink-300 font-medium uppercase tracking-wider">Claude</span>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          title="Regenerate insights"
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 hover:text-ink-600 transition-colors disabled:opacity-40"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Insights grid */}
      <div className="p-5">
        {error ? (
          <p className="text-sm text-ink-400 text-center py-4">{error}</p>
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InsightSkeleton />
            <InsightSkeleton />
            <InsightSkeleton />
            <InsightSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.map((insight, i) => {
              const cfg = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
              return (
                <div key={i} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-1.5`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-medium leading-none ${cfg.iconColor}`}>{cfg.icon}</span>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${cfg.titleColor}`}>{insight.title}</p>
                  </div>
                  <p className="text-xs text-ink-600 leading-relaxed">{insight.body}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat section */}
      <div className="border-t border-sand-100">
        {/* Suggested questions (before any chat) */}
        {!chatOpen && messages.length === 0 && (
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSuggest(q)}
                className="text-xs text-ink-500 bg-sand-50 border border-sand-200 rounded-lg px-3 py-1.5 hover:border-sand-300 hover:bg-sand-100 hover:text-ink-700 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Chat messages */}
        {chatOpen && messages.length > 0 && (
          <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto bg-sand-50/50">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-ink-800 text-white rounded-br-sm'
                    : 'bg-white border border-sand-200 text-ink-700 rounded-bl-sm'
                }`}>
                  {m.parts?.map((part, i) =>
                    part.type === 'text' ? <span key={i}>{part.text}</span> : null,
                  )}
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-white border border-sand-200 rounded-2xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        <ChatInput
          ref={inputRef}
          onSend={handleSend}
          disabled={isStreaming}
          placeholder="Ask about your portfolio…"
        />
      </div>
    </div>
  );
}

import { forwardRef } from 'react';

const ChatInput = forwardRef<HTMLInputElement, {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
}>(function ChatInput({ onSend, disabled, placeholder }, ref) {
  const [value, setValueState] = useState('');

  function submit() {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValueState('');
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => setValueState(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 text-sm px-3 py-2 rounded-xl border border-sand-200 focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300 disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="w-8 h-8 rounded-xl bg-ink-800 text-white flex items-center justify-center disabled:opacity-40 hover:bg-ink-700 transition-colors shrink-0"
      >
        <svg className="w-3.5 h-3.5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
});
