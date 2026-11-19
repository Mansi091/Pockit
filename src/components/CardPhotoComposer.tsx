import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Image, NativeModules, StyleSheet, TurboModuleRegistry, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Turns a (landscape) business card image into a SQUARE photo with the whole
 * card centred on white, for the phone's Contacts app. Android crops contact
 * photos to fill a square/circle, which otherwise cuts off the card's edges.
 *
 * Renders an off-screen view and snapshots it with react-native-view-shot.
 * If that native module isn't in the build yet, `compose` resolves null and the
 * caller falls back to the plain photo.
 */
export interface CardPhotoComposerHandle {
  compose(cardUri: string): Promise<string | null>;
}

const SIZE = 720; // Android's contact display photo size

export const isComposerAvailable = () =>
  TurboModuleRegistry.get('RNViewShot') != null || NativeModules.RNViewShot != null;

const CardPhotoComposer = forwardRef<CardPhotoComposerHandle>(function CardPhotoComposer(_props, ref) {
  const viewRef = useRef<React.ComponentRef<typeof View>>(null);
  const [uri, setUri] = useState<string | null>(null);
  const loaded = useRef<((ok: boolean) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    async compose(cardUri: string) {
      if (!isComposerAvailable()) return null;
      try {
        const ready = new Promise<boolean>((resolve) => {
          loaded.current = resolve;
          setTimeout(() => resolve(false), 5000); // never hang the save
        });
        setUri(cardUri);
        if (!(await ready)) return null;
        // one more frame so the image is actually drawn before the snapshot
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        return await captureRef(viewRef, { format: 'jpg', quality: 0.9, result: 'tmpfile', width: SIZE, height: SIZE });
      } catch {
        return null;
      } finally {
        loaded.current = null;
      }
    },
  }));

  return (
    <View ref={viewRef} collapsable={false} style={styles.canvas} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri && (
        <Image
          source={{ uri }}
          style={styles.card}
          resizeMode="contain"
          onLoad={() => loaded.current?.(true)}
          onError={() => loaded.current?.(false)}
        />
      )}
    </View>
  );
});

export default CardPhotoComposer;

const styles = StyleSheet.create({
  // Laid out normally (so it can be drawn) but positioned far off-screen.
  canvas: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: SIZE,
    height: SIZE,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { width: SIZE * 0.92, height: SIZE * 0.92 },
});
