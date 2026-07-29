import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Pause the WebGL loop while the Persona window is hidden/minimized so an
 * always-on-top transparent canvas does not burn CPU/GPU in the background.
 */
export function RenderLoopControl() {
  const setFrameloop = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const apply = () => {
      const hidden =
        document.visibilityState === 'hidden' ||
        document.body.dataset.personaVisible === '0';
      setFrameloop({ frameloop: hidden ? 'never' : 'always' });
      if (!hidden) invalidate();
    };

    apply();
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('persona-visibility', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      window.removeEventListener('persona-visibility', apply);
    };
  }, [invalidate, setFrameloop]);

  return null;
}
