export const ANIMATION_CATALOG = {
  idle: 'idle.vrma',
  idle2: 'idle2.vrma',
  talk1: 'talk1.vrma',
  talk2: 'talk2.vrma',
  talk3: 'talk3.vrma',
  greeting: 'greeting.vrma',
  happy: 'happy.vrma',
  fingerGun: 'finger-gun.vrma',
  dance: 'dance.vrma',
} as const;

export type AnimationType =
  | 'IDLE'
  | 'GREETING'
  | 'TALK'
  | 'HAPPY'
  | 'FINGER_GUN'
  | 'DANCE';

/**
 * Keep semantic maps tight: talk stays on talk clips (smooth speech loops),
 * one-shots keep their hero motions. Cross-category reuse made motion feel
 * random and sticky when interrupted mid-blend.
 */
/**
 * One primary clip per type. Multiple idle/talk files were rotated on a timer
 * and looked like the same animation "restarting" even when nobody was talking.
 */
export const ANIMATION_MAP: Record<AnimationType, readonly string[]> = {
  IDLE: [ANIMATION_CATALOG.idle],
  GREETING: [ANIMATION_CATALOG.greeting],
  TALK: [ANIMATION_CATALOG.talk1],
  HAPPY: [ANIMATION_CATALOG.happy],
  FINGER_GUN: [ANIMATION_CATALOG.fingerGun],
  DANCE: [ANIMATION_CATALOG.dance],
};

export function randomAnimation(type: AnimationType): string {
  const choices = ANIMATION_MAP[type];
  return choices[Math.floor(Math.random() * choices.length)]!;
}

export function nextAnimation(
  type: AnimationType,
  previous: string | null = null,
): string {
  const choices = ANIMATION_MAP[type];
  const previousIndex = previous == null ? -1 : choices.indexOf(previous);
  return choices[(previousIndex + 1) % choices.length]!;
}

/**
 * Pick the next clip for `type`, avoiding recently played files when possible
 * so consecutive speaks/idles do not look identical.
 */
export function pickAnimationAvoidingRecent(
  type: AnimationType,
  recent: readonly string[],
  previousForType: string | null = null,
): string {
  const choices = ANIMATION_MAP[type];
  if (choices.length === 1) return choices[0]!;

  const recentSet = new Set(recent.slice(-4));
  const fresh = choices.filter(
    (clip) => clip !== previousForType && !recentSet.has(clip),
  );
  if (fresh.length > 0) {
    return fresh[Math.floor(Math.random() * fresh.length)]!;
  }

  const notPrevious = choices.filter((clip) => clip !== previousForType);
  if (notPrevious.length > 0) {
    return notPrevious[Math.floor(Math.random() * notPrevious.length)]!;
  }

  return nextAnimation(type, previousForType);
}
