import * as THREE from 'three';

export type AnimationPlayback = 'loop' | 'once';

export function configureAnimationAction(
  action: THREE.AnimationAction,
  playback: AnimationPlayback,
): THREE.AnimationAction {
  if (playback === 'once') {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  } else {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  }
  return action;
}

/**
 * Soft blend between clips. Never hard-stop the previous action here — that
 * caused sticky / uneven motion. The mixer keeps both weighted during fade.
 */
export function crossFadeAnimationActions(
  previous: THREE.AnimationAction | null,
  next: THREE.AnimationAction,
  duration: number,
): void {
  const fade = Math.max(0.12, duration);
  next.enabled = true;
  next.setEffectiveTimeScale(1);
  next.reset();
  next.setEffectiveWeight(1);

  if (previous && previous !== next) {
    previous.enabled = true;
    previous.fadeOut(fade);
  }

  next.fadeIn(fade).play();
}
