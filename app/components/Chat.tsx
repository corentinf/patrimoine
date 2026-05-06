'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef, useState } from 'react';

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function submit(text: string) {
    if (!text.trim() || isLoading) return;
    setInput('');
    sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className="fixed sm:static bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto w-full sm:w-96 flex flex-col bg-white sm:rounded-2xl shadow-2xl border-t sm:border border-sand-200 overflow-hidden z-40"
          style={{ height: '75dvh', maxHeight: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sand-100 bg-ink-800">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm">✦</span>
              <p className="text-sm font-medium text-white">Finance Advisor</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-sand-50">
            {messages.length === 0 && (
              <div className="text-center pt-8 space-y-2">
                <p className="text-2xl">✦</p>
                <p className="text-sm text-ink-500">Ask me anything about your finances.</p>
                <div className="flex flex-col gap-1.5 mt-4">
                  {[
                    'How am I doing this month?',
                    'Where am I overspending?',
                    'Should I pay off debt or invest?',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => submit(q)}
                      className="text-xs text-ink-500 bg-white border border-sand-200 rounded-lg px-3 py-1.5 hover:border-sand-300 hover:text-ink-700 transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-ink-800 text-white rounded-br-sm'
                      : 'bg-white border border-sand-200 text-ink-700 rounded-bl-sm'
                  }`}
                >
                  {m.parts?.map((part, i) =>
                    part.type === 'text' ? <span key={i}>{part.text}</span> : null,
                  ) ?? m.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-sand-200 rounded-2xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-sand-100 bg-white">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances…"
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-sand-200 focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
              disabled={isLoading}
            />
            <button
              onClick={() => submit(input)}
              disabled={isLoading || !input.trim()}
              className="w-8 h-8 rounded-xl bg-ink-800 text-white flex items-center justify-center disabled:opacity-40 hover:bg-ink-700 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-12 h-12 rounded-full bg-ink-800 text-white shadow-lg flex items-center justify-center hover:bg-ink-700 transition-colors text-xl"
        aria-label="Open finance advisor"
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9L12 16L5 9" />
          </svg>
        ) : (
          <span>✦</span>
        )}
      </button>
    </div>
  );
}
