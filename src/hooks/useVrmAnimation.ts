import { useCallback, useEffect, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { ANIMATION_MAP, type AnimationType } from '../animation-catalog';
import {
  configureAnimationAction,
  crossFadeAnimationActions,
  type AnimationPlayback,
} from '../animation-action';

interface PlayOptions {
  onComplete?: () => void;
  playback?: AnimationPlayback;
  /** Restart even if the same semantic type is already playing (one-shots). */
  force?: boolean;
}

interface PendingCompletion {
  action: THREE.AnimationAction;
  callback: () => void;
  generation: number;
}

function transitionSeconds(previous: AnimationType | null, next: AnimationType): number {
  if (previous == null) return 0.45;
  if (previous === next) return 0.9;
  if (previous === 'TALK' && next === 'IDLE') return 1.2;
  if (previous === 'IDLE' && next === 'TALK') return 0.9;
  return 0.8;
}

/**
 * Prefer the primary clip for each type. No timed multi-clip rotation —
 * that looked like the animation "replaying" while idle.
 */
function primaryClip(type: AnimationType): string {
  return ANIMATION_MAP[type][0]!;
}

export function useVrmAnimation(vrm: VRM | null) {
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const current = useRef<THREE.AnimationAction | null>(null);
  const currentType = useRef<AnimationType | null>(null);
  const currentPath = useRef<string | null>(null);
  const currentPlayback = useRef<AnimationPlayback | null>(null);
  const vrmAnimCache = useRef(new Map<string, VRMAnimation>());
  const clipCache = useRef(new Map<string, THREE.AnimationClip>());
  const requestGeneration = useRef(0);
  const pendingCompletion = useRef<PendingCompletion | null>(null);
  const fadeCleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!vrm) return;
    const animationMixer = new THREE.AnimationMixer(vrm.scene);
    const handleFinished = ({ action }: { action: THREE.AnimationAction }) => {
      const pending = pendingCompletion.current;
      if (
        pending?.action !== action ||
        pending.generation !== requestGeneration.current
      ) {
        return;
      }
      pendingCompletion.current = null;
      pending.callback();
    };
    animationMixer.addEventListener('finished', handleFinished);
    mixer.current = animationMixer;
    return () => {
      animationMixer.removeEventListener('finished', handleFinished);
      animationMixer.stopAllAction();
      if (fadeCleanupTimer.current) clearTimeout(fadeCleanupTimer.current);
      mixer.current = null;
      current.current = null;
      currentType.current = null;
      currentPath.current = null;
      currentPlayback.current = null;
      pendingCompletion.current = null;
      clipCache.current.clear();
    };
  }, [vrm]);

  const loadVrmAnimation = useCallback(async (path: string) => {
    const cached = vrmAnimCache.current.get(path);
    if (cached) return cached;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(`./assets/animations/${path}`);
    const animation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined;
    if (!animation) throw new Error(`No VRM animation found in ${path}`);
    vrmAnimCache.current.set(path, animation);
    return animation;
  }, []);

  const getClip = useCallback(
    (path: string, animation: VRMAnimation) => {
      if (!vrm) throw new Error('VRM missing');
      const cached = clipCache.current.get(path);
      if (cached) return cached;
      const clip = createVRMAnimationClip(animation, vrm);
      clip.name = `persona:${path}`;
      clipCache.current.set(path, clip);
      return clip;
    },
    [vrm],
  );

  const play = useCallback(
    async (
      type: AnimationType,
      { onComplete, playback = 'loop', force = false }: PlayOptions = {},
    ) => {
      onCompleteRef.current = onComplete;

      if (!vrm || !mixer.current) {
        if (playback === 'once') onComplete?.();
        return;
      }

      const path = primaryClip(type);

      // Already on this clip + mode → leave the mixer alone (critical for idle).
      if (
        !force &&
        currentType.current === type &&
        currentPath.current === path &&
        currentPlayback.current === playback &&
        current.current?.isRunning()
      ) {
        return;
      }

      const generation = ++requestGeneration.current;
      pendingCompletion.current = null;

      try {
        const vrmAnimation = await loadVrmAnimation(path);
        if (generation !== requestGeneration.current || !mixer.current) return;

        const clip = getClip(path, vrmAnimation);
        const previous = current.current;
        const action = mixer.current.clipAction(clip, vrm.scene);

        // Same action already active (e.g. loop idle): never reset/time=0.
        if (
          !force &&
          previous === action &&
          currentPath.current === path &&
          currentPlayback.current === playback
        ) {
          action.paused = false;
          if (!action.isRunning()) action.play();
          return;
        }

        action.enabled = true;
        action.setEffectiveTimeScale(1);
        configureAnimationAction(action, playback);

        if (playback === 'once') {
          pendingCompletion.current = {
            action,
            callback: () => onCompleteRef.current?.(),
            generation,
          };
        }

        const fadeSeconds = transitionSeconds(currentType.current, type);
        crossFadeAnimationActions(previous, action, fadeSeconds);

        if (previous && previous !== action) {
          if (fadeCleanupTimer.current) clearTimeout(fadeCleanupTimer.current);
          const fadeMs = Math.ceil(fadeSeconds * 1000) + 100;
          fadeCleanupTimer.current = setTimeout(() => {
            if (previous !== current.current && previous.getEffectiveWeight() < 0.05) {
              previous.stop();
            }
          }, fadeMs);
        }

        current.current = action;
        currentType.current = type;
        currentPath.current = path;
        currentPlayback.current = playback;
      } catch (error) {
        console.warn('[persona] animation load failed', type, error);
        if (generation === requestGeneration.current && playback === 'once') {
          onComplete?.();
        }
      }
    },
    [getClip, loadVrmAnimation, vrm],
  );

  const update = useCallback((delta: number) => {
    const safe = Math.min(1 / 30, Math.max(0, delta));
    mixer.current?.update(safe);
  }, []);

  return { play, update };
}
