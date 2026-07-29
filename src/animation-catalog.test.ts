import { describe, expect, it, vi } from 'vitest';
import {
  ANIMATION_CATALOG,
  ANIMATION_MAP,
  nextAnimation,
  pickAnimationAvoidingRecent,
  randomAnimation,
} from './animation-catalog';

describe('Persona animation contract', () => {
  it('lists every catalog file', () => {
    expect(Object.values(ANIMATION_CATALOG).sort()).toEqual([
      'dance.vrma',
      'finger-gun.vrma',
      'greeting.vrma',
      'happy.vrma',
      'idle.vrma',
      'idle2.vrma',
      'talk1.vrma',
      'talk2.vrma',
      'talk3.vrma',
    ]);
  });

  it('uses a single primary clip per type for stable looping', () => {
    expect(ANIMATION_MAP.IDLE).toEqual(['idle.vrma']);
    expect(ANIMATION_MAP.TALK).toEqual(['talk1.vrma']);
    expect(ANIMATION_MAP.DANCE).toEqual(['dance.vrma']);
  });

  it('can select a talking clip', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomAnimation('TALK')).toBe('talk1.vrma');
    vi.restoreAllMocks();
  });

  it('nextAnimation stays on the sole primary talk clip', () => {
    expect(nextAnimation('TALK')).toBe('talk1.vrma');
    expect(nextAnimation('TALK', 'talk1.vrma')).toBe('talk1.vrma');
  });

  it('pickAnimationAvoidingRecent returns the primary when only one exists', () => {
    expect(pickAnimationAvoidingRecent('IDLE', ['idle.vrma'], 'idle.vrma')).toBe(
      'idle.vrma',
    );
  });
});
