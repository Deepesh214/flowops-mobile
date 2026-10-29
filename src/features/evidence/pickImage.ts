import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { MAX_IMAGE_WIDTH, MAX_UPLOAD_BYTES } from '@/constants/config';

export type EvidenceSource = 'camera' | 'library';

export type PickResult =
  | { status: 'ok'; uri: string; mimeType: string; width: number; height: number }
  | { status: 'cancelled' }
  | { status: 'denied'; source: EvidenceSource }
  | { status: 'too_large' }
  | { status: 'error'; message: string };

/**
 * Permission is requested only when the user taps Camera or Gallery.
 * The chosen image is resized and recompressed before it is stored.
 */
export async function pickEvidence(source: EvidenceSource): Promise<PickResult> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: 'denied', source };

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.length) return { status: 'cancelled' };

    const asset = result.assets[0];
    // Very large originals (e.g. panoramas) are rejected rather than slowly recompressed.
    if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES * 4) return { status: 'too_large' };
    const resize = asset.width > MAX_IMAGE_WIDTH ? [{ resize: { width: MAX_IMAGE_WIDTH } }] : [];
    const compressed = await manipulateAsync(asset.uri, resize, {
      compress: 0.7,
      format: SaveFormat.JPEG,
    });

    return {
      status: 'ok',
      uri: compressed.uri,
      mimeType: 'image/jpeg',
      width: compressed.width,
      height: compressed.height,
    };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Could not open the image.',
    };
  }
}
