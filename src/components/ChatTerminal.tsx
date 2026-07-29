import { FormEvent, useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'persona' | 'system';
  text: string;
}

interface ChatTerminalProps {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
}

export function ChatTerminal({
  messages,
  busy,
  onSend,
  onStop,
}: ChatTerminalProps) {
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    onSend(text);
  };

  return (
    <section className="chat-terminal" aria-label="Persona terminal">
      <header className="chat-terminal__header">
        <span className="chat-terminal__title">persona · terminal</span>
        <span className="chat-terminal__status">
          {busy ? 'thinking…' : 'ready'}
        </span>
      </header>
      <div className="chat-terminal__log" ref={scroller}>
        {messages.length === 0 ? (
          <p className="chat-terminal__empty">
            Írj ide — a Persona válaszol és el is mondja hangosan.
          </p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-terminal__line chat-terminal__line--${message.role}`}
          >
            <span className="chat-terminal__role">
              {message.role === 'user'
                ? 'you'
                : message.role === 'persona'
                  ? 'persona'
                  : 'sys'}
            </span>
            <span className="chat-terminal__text">{message.text}</span>
          </div>
        ))}
        {busy ? (
          <div className="chat-terminal__line chat-terminal__line--system">
            <span className="chat-terminal__role">sys</span>
            <span className="chat-terminal__text">…</span>
          </div>
        ) : null}
      </div>
      <form className="chat-terminal__form" onSubmit={submit}>
        <span className="chat-terminal__prompt">›</span>
        <input
          className="chat-terminal__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="üzenet a Personának…"
          disabled={busy}
          autoComplete="off"
          spellCheck
        />
        {busy ? (
          <button
            type="button"
            className="chat-terminal__send"
            onClick={() => onStop?.()}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="chat-terminal__send" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  );
}
