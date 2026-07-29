import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene } from './components/Scene';
import { MissingMedia } from './components/MissingMedia';
import { DemoToolbar } from './components/DemoToolbar';
import { ChatTerminal, type ChatMessage } from './components/ChatTerminal';
import { WindowChrome } from './components/WindowChrome';
import { useCharacterMedia } from './hooks/useCharacterMedia';
import type { AnimationType } from './animation-catalog';
import {
  finishBodyAnimationOverride,
  resolveBodyAnimation,
  type BodyAnimationOverride,
} from './animation-priority';

const INITIAL_STATE: VoiceState = {
  activity: 'idle',
  microphoneMuted: false,
  outputMuted: false,
  phase: 'inactive',
};

const BODY_IDLE_DELAY_MS = 650;

function messageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const media = useCharacterMedia();
  const [voice, setVoice] = useState<VoiceState>(INITIAL_STATE);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceAnimation, setVoiceAnimation] = useState<AnimationType>('IDLE');
  const [bodyOverride, setBodyOverride] =
    useState<BodyAnimationOverride | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      text: 'Persona terminal ready. Fogd a felső sávot a mozgatáshoz.',
    },
  ]);
  const [chatBusy, setChatBusy] = useState(false);
  const previousPhase = useRef<VoicePhase>('inactive');
  const previousSpeaking = useRef(false);
  const chatRequestId = useRef(0);

  // Start in a stable idle loop — no auto-greeting restart storm.
  useEffect(() => {
    if (media.state !== 'ready') return;
    setVoiceAnimation('IDLE');
  }, [media.state]);

  useEffect(() => {
    const bridge = window.personaBridge;
    if (!bridge) return;
    void bridge.getSnapshot().then((event) => {
      if (event?.type === 'state') setVoice(event.state);
    });
    const unsubscribeEvents = bridge.subscribe((event) => {
      if (event.type === 'state') {
        setVoice(event.state);
      } else if (event.type === 'audio-level') {
        setAudioLevel(event.level);
      } else if (event.type === 'animation') {
        if (event.source === 'mcp' && event.requestId != null) {
          setBodyOverride({
            animation: event.animation,
            requestId: event.requestId,
          });
        } else {
          setVoiceAnimation(event.animation);
        }
      }
    });
    const unsubscribeVisibility = bridge.onVisibility?.((visible) => {
      document.body.dataset.personaVisible = visible ? '1' : '0';
      window.dispatchEvent(new Event('persona-visibility'));
    });
    return () => {
      unsubscribeEvents();
      unsubscribeVisibility?.();
    };
  }, []);

  const speaking =
    voice.phase === 'active' &&
    voice.activity === 'speaking' &&
    !voice.outputMuted;

  useEffect(() => {
    previousSpeaking.current = speaking;
    previousPhase.current = voice.phase;

    // One-shot toolbar/MCP clips own the body until they finish.
    if (bodyOverride) return;

    if (speaking) {
      setVoiceAnimation((current) => (current === 'TALK' ? current : 'TALK'));
      return;
    }

    // Default: stay on idle. Do not thrash setState / restarts.
    if (voice.phase === 'inactive' || voice.outputMuted) {
      setAudioLevel(0);
    }

    const timer = window.setTimeout(() => {
      setVoiceAnimation((current) => (current === 'IDLE' ? current : 'IDLE'));
    }, speaking ? 0 : BODY_IDLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [bodyOverride, speaking, voice.activity, voice.outputMuted, voice.phase]);

  const animation = resolveBodyAnimation(voiceAnimation, bodyOverride);
  // Only one-shot overrides use requestId. Looping talk/idle must stay stable
  // so the mixer can soft-rotate clips internally.
  const isOneShotOverride =
    bodyOverride != null &&
    bodyOverride.animation !== 'TALK' &&
    bodyOverride.animation !== 'IDLE';
  const animationRequest = isOneShotOverride ? bodyOverride.requestId : 0;
  const playback: 'loop' | 'once' = isOneShotOverride ? 'once' : 'loop';
  const handleAnimationComplete = useCallback(() => {
    setBodyOverride((current) => {
      if (current == null) return null;
      return finishBodyAnimationOverride(current, current.requestId);
    });
  }, []);

  const handleToolbarAnimation = useCallback((next: AnimationType) => {
    setBodyOverride({
      animation: next,
      requestId: Date.now(),
    });
  }, []);

  const handleToolbarSpeaking = useCallback((nextSpeaking: boolean) => {
    if (nextSpeaking) {
      setVoice({
        phase: 'active',
        activity: 'speaking',
        microphoneMuted: false,
        outputMuted: false,
      });
      setAudioLevel(0.45);
      setVoiceAnimation('TALK');
      return;
    }
    setVoice(INITIAL_STATE);
    setAudioLevel(0);
    setVoiceAnimation('IDLE');
  }, []);

  const handleChatSend = useCallback(async (text: string) => {
    const requestId = ++chatRequestId.current;
    setChatMessages((current) => [
      ...current,
      { id: messageId(), role: 'user', text },
    ]);
    setChatBusy(true);
    try {
      const result = await window.personaBridge?.chat?.(text);
      if (requestId !== chatRequestId.current) return;
      const reply =
        result?.text?.trim() ||
        result?.error ||
        'Nem jött válasz — nézd, hogy fut-e a grok CLI.';
      setChatMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: result?.ok === false && !result?.text ? 'system' : 'persona',
          text: reply,
        },
      ]);
    } catch (error) {
      if (requestId !== chatRequestId.current) return;
      setChatMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: 'system',
          text: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      if (requestId === chatRequestId.current) setChatBusy(false);
    }
  }, []);

  const handleChatStop = useCallback(() => {
    chatRequestId.current += 1;
    void window.personaBridge?.stopSpeaking?.();
    setChatBusy(false);
  }, []);

  const handleHide = useCallback(() => {
    window.personaBridge?.hide();
  }, []);

  if (media.state === 'checking') {
    return (
      <main className="app app--panel">
        <div className="missing-media">
          <div className="missing-media__card">
            <p>Checking character media…</p>
          </div>
        </div>
      </main>
    );
  }

  if (media.state === 'missing') {
    return (
      <main className="app app--panel">
        <MissingMedia detail={media.detail} />
      </main>
    );
  }

  return (
    <main className="app app--shell">
      <div className="app__stage">
        <WindowChrome onHide={handleHide} />
        <div className="stage-drag-band" title="Fogd meg és vidd az ablakot" />
        <Scene
          animation={animation}
          animationRequest={animationRequest}
          audioLevel={audioLevel}
          onAnimationComplete={handleAnimationComplete}
          playback={playback}
          speaking={speaking}
        />
        <DemoToolbar
          onAnimation={handleToolbarAnimation}
          onSpeaking={handleToolbarSpeaking}
          speaking={speaking}
        />
      </div>
      <ChatTerminal
        messages={chatMessages}
        busy={chatBusy}
        onSend={handleChatSend}
        onStop={handleChatStop}
      />
    </main>
  );
}
