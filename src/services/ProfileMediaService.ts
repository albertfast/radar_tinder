import * as FileSystem from 'expo-file-system/legacy';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';

type ProfileMediaType = 'profile' | 'car';

type SaveProfileMediaResult = {
  localUri: string;
  remoteUrl?: string;
  storagePath?: string;
};

const PROFILE_MEDIA_BUCKET = 'profile-media';
const LOCAL_PROFILE_MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

const getFileExtension = (sourceUri: string) => {
  const match = sourceUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const extension = match?.[1]?.toLowerCase();
  return extension && extension.length <= 5 ? extension : 'jpg';
};

const isRemoteUri = (value: string) => /^https?:\/\//i.test(value);
const isFileUri = (value: string) => /^file:\/\//i.test(value);

export class ProfileMediaService {
  private static async ensureLocalDirectory(): Promise<string> {
    const root =
      (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || null;
    if (!root) {
      throw new Error('Profile media directory is unavailable on this device.');
    }

    const directory = `${root}profile-media/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => {});
    return directory;
  }

  private static async persistLocalCopy(
    userId: string,
    type: ProfileMediaType,
    sourceUri: string
  ): Promise<string> {
    const directory = await this.ensureLocalDirectory();
    const extension = getFileExtension(sourceUri);
    const destination = `${directory}${userId}-${type}.${extension}`;

    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    return destination;
  }

  private static async findPersistedLocalCopy(
    userId: string,
    type: ProfileMediaType
  ): Promise<string | null> {
    const directory = await this.ensureLocalDirectory();

    for (const extension of LOCAL_PROFILE_MEDIA_EXTENSIONS) {
      const candidate = `${directory}${userId}-${type}.${extension}`;
      try {
        const info = await FileSystem.getInfoAsync(candidate);
        if (info.exists) {
          return candidate;
        }
      } catch {}
    }

    return null;
  }

  private static async uploadToSupabase(
    userId: string,
    type: ProfileMediaType,
    localUri: string
  ): Promise<{ remoteUrl?: string; storagePath?: string }> {
    if (!isSupabaseConfigured) return {};

    const response = await fetch(localUri);
    if (!response.ok) {
      throw new Error(`Profile media read failed with HTTP ${response.status}.`);
    }

    const blob = await response.blob();
    const extension = getFileExtension(localUri);
    const storagePath = `${userId}/${type}`;
    const contentType = MIME_BY_EXTENSION[extension] || 'image/jpeg';

    const { error } = await supabase.storage
      .from(PROFILE_MEDIA_BUCKET)
      .upload(storagePath, blob, {
        upsert: true,
        contentType,
        cacheControl: '3600',
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(storagePath);
    return {
      remoteUrl: data?.publicUrl,
      storagePath,
    };
  }

  static async saveMedia(params: {
    userId: string;
    type: ProfileMediaType;
    sourceUri: string;
  }): Promise<SaveProfileMediaResult> {
    const localUri = await this.persistLocalCopy(params.userId, params.type, params.sourceUri);

    try {
      const upload = await this.uploadToSupabase(params.userId, params.type, localUri);
      return {
        localUri,
        remoteUrl: upload.remoteUrl,
        storagePath: upload.storagePath,
      };
    } catch (error) {
      console.warn('Profile media upload fallback to local copy:', error);
      return { localUri };
    }
  }

  static async resolveDisplayUri(params: {
    userId?: string | null;
    type: ProfileMediaType;
    primaryUri?: string | null;
    preferLocal?: boolean;
  }): Promise<string | null> {
    const normalizedPrimary = params.primaryUri?.trim() || null;
    const localFallback = params.userId
      ? await this.findPersistedLocalCopy(params.userId, params.type).catch(() => null)
      : null;
    const candidates = params.preferLocal
      ? [localFallback, normalizedPrimary]
      : [normalizedPrimary, localFallback];

    for (const candidate of candidates) {
      if (!candidate) continue;

      if (isRemoteUri(candidate)) {
        return candidate;
      }

      if (isFileUri(candidate)) {
        try {
          const info = await FileSystem.getInfoAsync(candidate);
          if (info.exists) {
            return candidate;
          }
        } catch {}
        continue;
      }

      return candidate;
    }

    return null;
  }
}
