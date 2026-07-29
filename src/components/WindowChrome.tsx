interface WindowChromeProps {
  onHide?: () => void;
}

/**
 * Frameless window chrome: drag region so the user can grab and move Persona.
 * Interactive buttons use no-drag so clicks still work.
 */
export function WindowChrome({ onHide }: WindowChromeProps) {
  return (
    <div className="window-chrome" aria-label="Move Persona">
      <div className="window-chrome__drag">
        <span className="window-chrome__grip" aria-hidden>
          ⋮⋮
        </span>
        <span className="window-chrome__label">Persona — fogd és vidd</span>
      </div>
      <div className="window-chrome__actions">
        <button
          type="button"
          className="window-chrome__btn"
          title="Hide"
          onClick={() => onHide?.()}
        >
          –
        </button>
      </div>
    </div>
  );
}
