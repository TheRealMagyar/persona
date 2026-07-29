const REQUIRED = [
  'model.vrm',
  'animations/idle.vrma',
  'animations/talk1.vrma',
  'animations/talk2.vrma',
  'animations/talk3.vrma',
  'animations/greeting.vrma',
  'animations/happy.vrma',
  'animations/finger-gun.vrma',
  'animations/dance.vrma',
];

interface MissingMediaProps {
  detail?: string | null;
}

export function MissingMedia({ detail }: MissingMediaProps) {
  return (
    <div className="missing-media" role="alert">
      <div className="missing-media__card">
        <h1>Persona needs character media</h1>
        <p>
          The VRM model and animations are intentionally not in git. Without them
          the window stays empty and WebGL may spin for nothing.
        </p>
        {detail ? <p className="missing-media__detail">{detail}</p> : null}
        <p>Place files under <code>public/assets/</code>:</p>
        <ul>
          {REQUIRED.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
        <p className="missing-media__hint">
          Quick start (free local-dev model + animations):
          <br />
          <code>npm run assets:dev-pack</code>
          <br />
          then rebuild and launch again (<code>npm run demo</code>).
        </p>
        <p className="missing-media__hint">
          Tray icon → <strong>Show Persona</strong> · shortcut{' '}
          <kbd>Ctrl/⌘+Shift+A</kbd>
        </p>
      </div>
    </div>
  );
}
