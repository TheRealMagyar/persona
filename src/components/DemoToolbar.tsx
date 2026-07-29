import type { AnimationType } from '../animation-catalog';

const PRESETS: { label: string; animation: AnimationType }[] = [
  { label: 'Idle', animation: 'IDLE' },
  { label: 'Hi', animation: 'GREETING' },
  { label: 'Talk', animation: 'TALK' },
  { label: 'Happy', animation: 'HAPPY' },
  { label: 'Dance', animation: 'DANCE' },
];

interface DemoToolbarProps {
  onAnimation: (animation: AnimationType) => void;
  onSpeaking: (speaking: boolean) => void;
  speaking: boolean;
}

/**
 * Lightweight local controls. The stock Persona window is intentionally chrome-
 * free (tray + MCP only); this toolbar makes the character usable while
 * developing with Grok Build / without a tray hunt.
 */
export function DemoToolbar({
  onAnimation,
  onSpeaking,
  speaking,
}: DemoToolbarProps) {
  return (
    <div className="demo-toolbar" onPointerDown={(event) => event.stopPropagation()}>
      <div className="demo-toolbar__row">
        {PRESETS.map((preset) => (
          <button
            key={preset.animation}
            type="button"
            className="demo-toolbar__btn"
            onClick={() => onAnimation(preset.animation)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`demo-toolbar__btn${speaking ? ' is-active' : ''}`}
          onClick={() => onSpeaking(!speaking)}
        >
          {speaking ? 'Mute lips' : 'Speak'}
        </button>
      </div>
      <p className="demo-toolbar__hint">
        Scroll zoom · drag orbit · tray or MCP also work
      </p>
    </div>
  );
}
