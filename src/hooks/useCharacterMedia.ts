import { useEffect, useState } from 'react';

export type CharacterMediaStatus =
  | { state: 'checking' }
  | { state: 'ready' }
  | { state: 'missing'; detail: string };

/**
 * Probe the runtime model before mounting WebGL. Missing media previously
 * left R3F's useLoader suspended forever on a transparent always-on-top
 * window, which looked broken and could thrash the GPU.
 */
export function useCharacterMedia(
  modelUrl = './assets/model.vrm',
): CharacterMediaStatus {
  const [status, setStatus] = useState<CharacterMediaStatus>({
    state: 'checking',
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function probe() {
      try {
        const response = await fetch(modelUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          headers: { Range: 'bytes=0-0' },
        });
        if (cancelled) return;
        if (!response.ok) {
          setStatus({
            state: 'missing',
            detail: `Could not load ${modelUrl} (HTTP ${response.status}).`,
          });
          return;
        }
        setStatus({ state: 'ready' });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setStatus({
          state: 'missing',
          detail:
            error instanceof Error
              ? error.message
              : `Could not load ${modelUrl}.`,
        });
      }
    }

    void probe();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [modelUrl]);

  return status;
}
