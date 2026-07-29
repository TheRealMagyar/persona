import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { useVrmLoader } from '../hooks/useVrmLoader';
import { useVrmAnimation } from '../hooks/useVrmAnimation';
import { useAmplitudeLipSync } from '../hooks/useAmplitudeLipSync';
import { useBlink } from '../hooks/useBlink';
import type { AnimationType } from '../animation-catalog';

interface AvatarProps {
  animation: AnimationType;
  animationRequest: number;
  audioLevel: number;
  onAnimationComplete: () => void;
  playback: 'loop' | 'once';
  speaking: boolean;
  onReady?: (scene: THREE.Object3D) => void;
}

function AvatarModel({
  animation,
  animationRequest,
  audioLevel,
  onAnimationComplete,
  playback,
  speaking,
  onReady,
}: AvatarProps) {
  const vrm = useVrmLoader('./assets/model.vrm');
  const { play, update: updateAnimation } = useVrmAnimation(vrm);
  const updateLipSync = useAmplitudeLipSync(vrm);
  const updateBlink = useBlink(vrm);

  // Keep latest completion handler without re-triggering play().
  const completeRef = useRef(onAnimationComplete);
  completeRef.current = onAnimationComplete;

  useEffect(() => {
    void play(animation, {
      playback,
      // One-shots must restart when the user presses the same button again.
      force: playback === 'once',
      onComplete: () => completeRef.current(),
    });
    // Intentionally NOT depending on onAnimationComplete identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, animationRequest, playback, play]);

  useLayoutEffect(() => {
    if (vrm) onReady?.(vrm.scene);
  }, [onReady, vrm]);

  useFrame((_, delta) => {
    if (!vrm) return;
    const safeDelta = Math.min(delta, 1 / 30);
    updateAnimation(safeDelta);
    updateBlink(safeDelta);
    updateLipSync(safeDelta, audioLevel, speaking);
    vrm.update(safeDelta);
  });

  return vrm ? <primitive object={vrm.scene} /> : null;
}

export function Avatar(props: AvatarProps) {
  return (
    <Suspense fallback={null}>
      <AvatarModel {...props} />
    </Suspense>
  );
}
