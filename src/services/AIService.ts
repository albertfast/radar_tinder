/**
 * AI Diagnosis Service
 * Performs on-device AI inference using ONNX Runtime React Native
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { NativeModules, Platform } from 'react-native';
import ocrClasses from '../../assets/models/digital_ocr_classes.json';
import dashboardMetadata from '../../assets/models/dashboard_classes.json';
import diagnosticKb from '../../assets/models/diagnostic_kb.json';
import dashboardKbMap from '../../assets/models/dashboard_kb_map.json';

type OrtModule = typeof import('onnxruntime-react-native');
type OrtInferenceSession = import('onnxruntime-react-native').InferenceSession;

export interface DiagnosisResult {
  issue: string;
  confidence: number;
  recommendations: string[];
  category: string;
  details?: any;
}

export type AIModelErrorCode =
  | 'native_module_missing'
  | 'model_uri_invalid'
  | 'file_corrupt'
  | 'session_create_failed'
  | 'asset_copy_failed'
  | 'unknown';

let ocrSession: OrtInferenceSession | null = null;
let dashboardSession: OrtInferenceSession | null = null;
let dashboardSessionPromise: Promise<OrtInferenceSession> | null = null;
let dashboardModelFailed: boolean = false;
let dashboardAnalysisErrorLogged: boolean = false;
let isModelLoading = false;
let modelLoadError: string | null = null;
let ortModuleCache: OrtModule | null | undefined;
let dashboardKbValidated = false;

type ModelDiagnosticEntry = {
  sourceUri: string | null;
  resolvedPath: string | null;
  sizeBytes: number | null;
  loaded: boolean;
  lastErrorCode: AIModelErrorCode | null;
  lastErrorMessage: string | null;
  loadAttempts: number;
  lastLoadedAt: string | null;
};

type ModelDiagnostics = {
  platform: string;
  remoteFallbackEnabled: boolean;
  nativeModuleAvailable: boolean | null;
  lastErrorCode: AIModelErrorCode | null;
  lastErrorMessage: string | null;
  ocr: ModelDiagnosticEntry;
  dashboard: ModelDiagnosticEntry;
};

// Emergency fallback base URL for remote-hosted models.
// Primary source is always embedded app assets; this is used only if local loading fails.
const REMOTE_MODEL_BASE = 'https://raw.githubusercontent.com/albertfast/radar_tinder/master/assets/models';
const REMOTE_MODEL_FALLBACK_ENABLED = /^(1|true|yes)$/i.test(
  String((process as any)?.env?.EXPO_PUBLIC_ALLOW_REMOTE_MODEL_FALLBACK || '')
);
const DASHBOARD_MODEL_MIN_BYTES = 4 * 1024 * 1024;
const OCR_MODEL_MIN_BYTES = 256 * 1024;

const createModelDiagnosticEntry = (): ModelDiagnosticEntry => ({
  sourceUri: null,
  resolvedPath: null,
  sizeBytes: null,
  loaded: false,
  lastErrorCode: null,
  lastErrorMessage: null,
  loadAttempts: 0,
  lastLoadedAt: null,
});

const modelDiagnostics: ModelDiagnostics = {
  platform: Platform.OS,
  remoteFallbackEnabled: REMOTE_MODEL_FALLBACK_ENABLED,
  nativeModuleAvailable: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  ocr: createModelDiagnosticEntry(),
  dashboard: createModelDiagnosticEntry(),
};

export class AIService {
  private static createModelError(
    code: AIModelErrorCode,
    message: string,
    cause?: unknown
  ): Error & { code: AIModelErrorCode } {
    const error = new Error(message) as Error & { code: AIModelErrorCode; cause?: unknown };
    error.code = code;
    if (cause !== undefined) {
      error.cause = cause;
    }
    return error;
  }

  private static getModelErrorCode(error: unknown): AIModelErrorCode {
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string') {
      return code as AIModelErrorCode;
    }
    return 'unknown';
  }

  private static getCacheRootDirectory(): string {
    const root = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory;
    if (!root) {
      throw this.createModelError(
        'asset_copy_failed',
        'No writable cache directory is available for ONNX model preparation.'
      );
    }
    return root;
  }

  private static ensureCachePath(fileName: string): string {
    return `${this.getCacheRootDirectory()}${fileName}`;
  }

  private static setModelFailure(
    model: 'ocr' | 'dashboard',
    error: unknown,
    fallbackMessage: string
  ) {
    const entry = model === 'ocr' ? modelDiagnostics.ocr : modelDiagnostics.dashboard;
    const code = this.getModelErrorCode(error);
    const message = error instanceof Error ? error.message : fallbackMessage;

    entry.loaded = false;
    entry.lastErrorCode = code;
    entry.lastErrorMessage = message;
    modelDiagnostics.lastErrorCode = code;
    modelDiagnostics.lastErrorMessage = message;
    modelLoadError = message;
  }

  private static markModelPrepared(
    model: 'ocr' | 'dashboard',
    sourceUri: string,
    resolvedPath: string,
    sizeBytes: number
  ) {
    const entry = model === 'ocr' ? modelDiagnostics.ocr : modelDiagnostics.dashboard;
    entry.sourceUri = sourceUri;
    entry.resolvedPath = resolvedPath;
    entry.sizeBytes = sizeBytes;
    entry.loaded = true;
    entry.lastErrorCode = null;
    entry.lastErrorMessage = null;
    entry.lastLoadedAt = new Date().toISOString();

    modelDiagnostics.lastErrorCode = null;
    modelDiagnostics.lastErrorMessage = null;
    modelLoadError = null;
  }

  private static bumpModelAttempt(model: 'ocr' | 'dashboard') {
    const entry = model === 'ocr' ? modelDiagnostics.ocr : modelDiagnostics.dashboard;
    entry.loadAttempts += 1;
  }

  private static async validateModelFileSize(
    filePath: string,
    minBytes: number,
    label: string
  ): Promise<number> {
    const info = (await FileSystem.getInfoAsync(filePath)) as { exists: boolean; size?: number };
    const size = typeof info.size === 'number' ? info.size : 0;
    if (!info.exists || size < minBytes) {
      throw this.createModelError(
        'file_corrupt',
        `${label} is missing or smaller than expected (${size} B < ${minBytes} B): ${filePath}`
      );
    }
    return size;
  }

  private static async writeAtomically(
    destinationPath: string,
    writer: (tempPath: string) => Promise<void>,
    minBytes: number,
    label: string
  ): Promise<number> {
    const tempPath = `${destinationPath}.tmp.${Date.now()}`;
    await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(destinationPath, { idempotent: true }).catch(() => {});

    try {
      await writer(tempPath);
      const size = await this.validateModelFileSize(tempPath, minBytes, label);
      await FileSystem.moveAsync({ from: tempPath, to: destinationPath });
      return size;
    } catch (error) {
      await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
      if (this.getModelErrorCode(error) !== 'file_corrupt') {
        throw this.createModelError('asset_copy_failed', `${label} cache write failed.`, error);
      }
      throw error;
    }
  }

  private static async prepareModelPathFromSource(
    sourceUri: string,
    destinationPath: string,
    minBytes: number,
    label: string
  ): Promise<{ path: string; sizeBytes: number }> {
    if (sourceUri === destinationPath) {
      const size = await this.validateModelFileSize(destinationPath, minBytes, label);
      return { path: destinationPath, sizeBytes: size };
    }

    if (sourceUri.startsWith('file://') || sourceUri.startsWith('content://')) {
      const size = await this.writeAtomically(
        destinationPath,
        async (tempPath) => {
          await FileSystem.copyAsync({ from: sourceUri, to: tempPath });
        },
        minBytes,
        label
      );
      return { path: destinationPath, sizeBytes: size };
    }

    if (__DEV__ && this.isLoopbackAssetUri(sourceUri)) {
      const size = await this.writeAtomically(
        destinationPath,
        async (tempPath) => {
          await FileSystem.downloadAsync(sourceUri, tempPath);
        },
        minBytes,
        label
      );
      return { path: destinationPath, sizeBytes: size };
    }

    throw this.createModelError(
      'model_uri_invalid',
      `${label} URI is not loadable as a local model file: ${sourceUri}`
    );
  }

  private static resolveBundledAssetUri(asset: Asset, label: string): string {
    const candidates = [asset.localUri, (asset as any).uri, asset.uri].filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    );
    const local = candidates.find((uri) => !this.isRemoteHttpUri(uri));
    if (local) return local;

    const loopback = candidates.find((uri) => this.isLoopbackAssetUri(uri));
    if (loopback) {
      if (__DEV__) return loopback;
      throw this.createModelError(
        'model_uri_invalid',
        `${label} is resolving to Metro localhost (${loopback}). Production builds must use embedded app assets.`
      );
    }

    if (candidates.length > 0) {
      throw this.createModelError(
        'model_uri_invalid',
        `${label} is not resolving to an embedded local asset: ${candidates[0]}`
      );
    }

    throw this.createModelError('model_uri_invalid', `${label} asset URI not found in app bundle.`);
  }

  private static getOrtModule(): OrtModule {
    if (ortModuleCache) return ortModuleCache;
    if (ortModuleCache === null) {
      throw this.createModelError(
        'native_module_missing',
        modelLoadError || 'ONNX Runtime module is not available.'
      );
    }

    const onnxNative = (NativeModules as any)?.Onnxruntime;
    const onnxJsiHelper = (NativeModules as any)?.OnnxruntimeJSIHelper;
    if (!onnxNative || !onnxJsiHelper || typeof onnxJsiHelper.install !== 'function') {
      ortModuleCache = null;
      modelDiagnostics.nativeModuleAvailable = false;
      modelLoadError =
        'ONNX Runtime native module is unavailable in this build. Rebuild and reinstall the app, then retry.';
      throw this.createModelError('native_module_missing', modelLoadError);
    }

    try {
      const ort = require('onnxruntime-react-native') as OrtModule;
      if (!ort?.InferenceSession || typeof ort.InferenceSession.create !== 'function') {
        throw this.createModelError(
          'native_module_missing',
          'ONNX Runtime JS bridge loaded but InferenceSession API is missing.'
        );
      }
      ortModuleCache = ort;
      modelDiagnostics.nativeModuleAvailable = true;
      return ortModuleCache;
    } catch (error) {
      ortModuleCache = null;
      modelDiagnostics.nativeModuleAvailable = false;
      const message = error instanceof Error ? error.message : String(error);
      modelLoadError = `Failed to initialize ONNX Runtime bridge: ${message}`;
      throw this.createModelError('native_module_missing', modelLoadError, error);
    }
  }

  private static buildRemoteModelUrl(fileName: string): string | null {
    let base = (REMOTE_MODEL_BASE || '').trim().replace(/\/+$/, '');
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) {
      console.warn(
        `Skipping remote model fallback because REMOTE_MODEL_BASE is not an absolute URL: ${base}`
      );
      return null;
    }

    // Convert GitHub blob URLs to raw URLs (downloadable binary).
    const blobMatch = base.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i
    );
    if (blobMatch) {
      const [, owner, repo, branch, restPath] = blobMatch;
      base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${restPath}`;
    }

    try {
      const parsed = new URL(base);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const looksLikeFile = pathParts.length > 0 && /\.[a-z0-9]+$/i.test(pathParts[pathParts.length - 1]);
      if (looksLikeFile) {
        pathParts[pathParts.length - 1] = fileName;
        parsed.pathname = `/${pathParts.join('/')}`;
        return parsed.toString();
      }
    } catch {
      // Fallback to simple concatenation below.
    }

    return `${base}/${fileName}`;
  }

  private static isLoopbackAssetUri(uri: string): boolean {
    return /(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/i.test(uri);
  }

  private static isRemoteHttpUri(uri: string): boolean {
    return /^https?:\/\//i.test(uri);
  }

  private static isEmbeddedAssetErrorMessage(message: string): boolean {
    const text = (message || '').toLowerCase();
    return (
      text.includes('metro localhost') ||
      text.includes('embedded app assets') ||
      text.includes('not an embedded local asset') ||
      text.includes('asset uri not found in app bundle')
    );
  }

  private static canUseRemoteModelFallback(): boolean {
    return REMOTE_MODEL_FALLBACK_ENABLED;
  }

  private static softmax(logits: Float32Array): Float32Array {
    const expValues = new Float32Array(logits.length);
    let sumExp = 0;
    for (let i = 0; i < logits.length; i++) {
      expValues[i] = Math.exp(logits[i]);
      sumExp += expValues[i];
    }
    for (let i = 0; i < expValues.length; i++) {
      expValues[i] = expValues[i] / sumExp;
    }
    return expValues;
  }

  private static getTopPredictions(
    probabilities: Float32Array,
    classes: string[],
    topK: number
  ): Array<{ rawLabel: string; label: string; confidence: number }> {
    const indices = Array.from(probabilities.keys());
    indices.sort((a, b) => probabilities[b] - probabilities[a]);
    const picked = indices.slice(0, topK);
    return picked.map((index) => ({
      rawLabel: classes[index] || `class_${index}`,
      label: this.formatDashboardLabel(classes[index] || `class_${index}`),
      confidence: probabilities[index]
    }));
  }
  private static formatDashboardLabel(label: string): string {
    if (!label) return 'Warning Light';

    const cleaned = label
      .replace(/_/g, ' ')
      .replace(/\s*--+\s*$/g, '')
      .replace(/\bheadlamb\b/gi, 'headlamp')
      .replace(/\blamb\b/gi, 'lamp')
      .replace(/\s+/g, ' ')
      .trim();

    const overrides: Record<string, string> = {
      'ep steering': 'EP Steering',
      'ebd': 'EBD',
      'esp': 'ESP',
      'srs': 'SRS',
      'ev': 'EV',
      'awd': 'AWD',
      'abs': 'ABS',
      'pcs': 'PCS',
      'low beam': 'Low Beam',
      'low brake': 'Low Brake',
      'tire pressure': 'Tire Pressure',
      'check engine': 'Check Engine',
      'oil pressure': 'Oil Pressure',
      'water fuel': 'Water in Fuel'
    };

    const lower = cleaned.toLowerCase();
    if (overrides[lower]) return overrides[lower];

    const uppercaseTokens = new Set(['abs', 'awd', 'ebd', 'esp', 'ev', 'srs', 'pcs']);
    return cleaned
      .split(' ')
      .map((token) => {
        const lowerToken = token.toLowerCase();
        if (uppercaseTokens.has(lowerToken)) return lowerToken.toUpperCase();
        return lowerToken.charAt(0).toUpperCase() + lowerToken.slice(1);
      })
      .join(' ');
  }

  private static resolveDashboardKbKey(rawLabel: string): string {
    const map = dashboardKbMap as Record<string, string>;
    return map[rawLabel] || this.formatDashboardLabel(rawLabel);
  }

  private static getDashboardKbEntry(rawLabel: string): { kbKey: string; entry: any; displayLabel: string } {
    const kbKey = this.resolveDashboardKbKey(rawLabel);
    const entry = (diagnosticKb as any)[kbKey] || null;
    return {
      kbKey,
      entry,
      displayLabel: entry?.name || this.formatDashboardLabel(rawLabel)
    };
  }

  private static validateDashboardKnowledgeBase(classes: string[]): void {
    if (dashboardKbValidated) return;
    dashboardKbValidated = true;

    const map = dashboardKbMap as Record<string, string>;
    const missingMap = classes.filter((raw) => !map[raw]);
    const missingKb = classes.filter((raw) => {
      const mapped = map[raw];
      return !mapped || !(diagnosticKb as any)[mapped];
    });

    if (missingMap.length || missingKb.length) {
      console.warn(
        `[AIService] Dashboard KB coverage warning. Missing map: ${missingMap.length}, missing KB: ${missingKb.length}`,
        {
          missingMap: missingMap.slice(0, 12),
          missingKb: missingKb.slice(0, 12)
        }
      );
      return;
    }

    console.log(`[AIService] Dashboard KB map validated (${classes.length} classes covered).`);
  }

  private static getKbDetails(entry: any): {
    sensors: string[];
    faults: string[];
    checks: string[];
  } {
    const sensors = Array.isArray(entry?.sensors) ? entry.sensors : [];
    const faults = Array.isArray(entry?.faults)
      ? entry.faults
      : Array.isArray(entry?.causes)
        ? entry.causes
        : [];
    const checks = Array.isArray(entry?.checks) ? entry.checks : [];

    return { sensors, faults, checks };
  }

  private static buildLightSummary(
    rawLabel: string,
    confidence: number
  ): {
    label: string;
    entry: any;
    lines: string[];
  } {
    const kb = this.getDashboardKbEntry(rawLabel);
    const label = this.formatDashboardLabel(rawLabel);
    const entry = kb.entry;
    const details = this.getKbDetails(entry);
    const lines = [`${label} (${(confidence * 100).toFixed(1)}%)`];

    if (details.sensors.length) {
      lines.push(`Sensors: ${details.sensors.join(', ')}`);
    }
    if (details.faults.length) {
      lines.push(`Possible issues: ${details.faults.join(', ')}`);
    }
    if (details.checks.length) {
      lines.push(`Checks: ${details.checks.join('; ')}`);
    }

    return { label, entry, lines };
  }

  private static buildFallbackDashboardCrops(
    originalWidth: number,
    originalHeight: number
  ): ImageManipulator.ActionCrop['crop'][] {
    if (!originalWidth || !originalHeight) return [];

    const minSide = Math.min(originalWidth, originalHeight);
    const cropSize = Math.max(64, Math.floor(minSide * 0.58));
    const half = cropSize / 2;
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, max));
    const makeCrop = (cx: number, cy: number) => {
      const maxX = Math.max(0, originalWidth - cropSize);
      const maxY = Math.max(0, originalHeight - cropSize);
      const originX = Math.round(clamp(cx - half, 0, maxX));
      const originY = Math.round(clamp(cy - half, 0, maxY));
      return { originX, originY, width: cropSize, height: cropSize };
    };

    return [
      makeCrop(originalWidth / 2, originalHeight / 2),
      makeCrop(originalWidth * 0.28, originalHeight * 0.28),
      makeCrop(originalWidth * 0.72, originalHeight * 0.28)
    ];
  }

  /**
   * Load the ONNX model from assets
   */
  private static async loadOcrModel() {
    if (ocrSession) return ocrSession;

    this.bumpModelAttempt('ocr');

    try {
      const asset = Asset.fromModule(require('../../assets/models/digital_ocr_net.onnx'));
      await asset.downloadAsync();
      const sourceUri = this.resolveBundledAssetUri(asset, 'Bundled OCR model');
      const targetPath = this.ensureCachePath('digital_ocr_net.onnx');
      const prepared = await this.prepareModelPathFromSource(
        sourceUri,
        targetPath,
        OCR_MODEL_MIN_BYTES,
        'Bundled OCR model'
      );

      try {
        const dataAsset = Asset.fromModule(require('../../assets/models/digital_ocr_net.onnx.data'));
        await dataAsset.downloadAsync();
        const dataSource = this.resolveBundledAssetUri(dataAsset, 'Bundled OCR sidecar');
        const dataPath = this.ensureCachePath('digital_ocr_net.onnx.data');
        await this.prepareModelPathFromSource(
          dataSource,
          dataPath,
          1024,
          'Bundled OCR sidecar'
        );
      } catch (dataError) {
        // OCR may be self-contained; sidecar is optional.
      }

      const ort = this.getOrtModule();
      try {
        ocrSession = await ort.InferenceSession.create(prepared.path);
      } catch (sessionError) {
        throw this.createModelError(
          'session_create_failed',
          `OCR session initialization failed for ${prepared.path}`,
          sessionError
        );
      }
      this.markModelPrepared('ocr', sourceUri, prepared.path, prepared.sizeBytes);
      return ocrSession;
    } catch (error) {
      this.setModelFailure('ocr', error, 'Failed to load OCR model from bundled asset.');
      const bundledMessage =
        error instanceof Error ? error.message : 'Failed to load OCR model from bundled asset.';
      if (!this.canUseRemoteModelFallback() || this.isEmbeddedAssetErrorMessage(bundledMessage)) {
        throw error;
      }

      const fallbackUrl = this.buildRemoteModelUrl('digital_ocr_net.onnx');
      if (!fallbackUrl) {
        throw error;
      }

      try {
        const remotePath = this.ensureCachePath('digital_ocr_net.onnx');
        console.warn('Attempting to download OCR model from remote URL:', fallbackUrl);
        const remoteSize = await this.writeAtomically(
          remotePath,
          async (tempPath) => {
            await FileSystem.downloadAsync(fallbackUrl, tempPath);
          },
          OCR_MODEL_MIN_BYTES,
          'Remote OCR model'
        );
        const ort = this.getOrtModule();
        ocrSession = await ort.InferenceSession.create(remotePath);
        this.markModelPrepared('ocr', fallbackUrl, remotePath, remoteSize);
        return ocrSession;
      } catch (remoteError) {
        this.setModelFailure('ocr', remoteError, 'Failed to load OCR model from remote URL.');
        throw remoteError;
      }
    }
  }

  private static async ensureDashboardSidecar(modelPath: string) {
    try {
      const dataAsset = Asset.fromModule(require('../../assets/models/dashboard_net.onnx.data'));
      await dataAsset.downloadAsync();

      const targetPath = modelPath.endsWith('.onnx')
        ? modelPath.replace(/dashboard_net\.onnx$/, 'dashboard_net.onnx.data')
        : `${modelPath}.data`;
      const source = this.resolveBundledAssetUri(dataAsset, 'Bundled dashboard sidecar');
      const sourceInfo = await FileSystem.getInfoAsync(source).catch(() => ({ exists: false, size: 0 }));
      if (sourceInfo.exists && typeof sourceInfo.size === 'number' && sourceInfo.size <= 32) {
        try {
          const marker = await FileSystem.readAsStringAsync(source, {
            encoding: FileSystem.EncodingType.UTF8
          });
          if (marker.trim().toUpperCase() === 'PLACEHOLDER') {
            console.log('Dashboard sidecar is placeholder; skipping sidecar copy');
            return null;
          }
        } catch {
          // ignore marker read issues and continue regular copy flow
        }
      }

      const prepared = await this.prepareModelPathFromSource(
        source,
        targetPath,
        1,
        'Bundled dashboard sidecar'
      );
      return prepared.path;
    } catch (error) {
      console.warn('Dashboard model sidecar copy failed:', error);
      return null;
    }
  }

  private static async loadDashboardModel() {
    if (dashboardSession) return dashboardSession;
    if (dashboardModelFailed) {
      // allow a retry attempt after clearing the cache/state
      dashboardModelFailed = false;
    }
    if (dashboardSessionPromise) return dashboardSessionPromise;
    if (isModelLoading) {
      throw this.createModelError('unknown', 'Model is already loading');
    }

    dashboardSessionPromise = (async () => {
      const cachePath = this.ensureCachePath('dashboard_net.onnx');
      this.bumpModelAttempt('dashboard');
      try {
        isModelLoading = true;

        const asset = Asset.fromModule(require('../../assets/models/dashboard_net.onnx'));
        await asset.downloadAsync();
        const sourceUri = this.resolveBundledAssetUri(asset, 'Bundled dashboard model');
        const prepared = await this.prepareModelPathFromSource(
          sourceUri,
          cachePath,
          DASHBOARD_MODEL_MIN_BYTES,
          'Bundled dashboard model'
        );

        await this.ensureDashboardSidecar(prepared.path);

        const ort = this.getOrtModule();
        try {
          dashboardSession = await ort.InferenceSession.create(prepared.path);
        } catch (sessionError) {
          throw this.createModelError(
            'session_create_failed',
            `Dashboard session initialization failed for ${prepared.path}`,
            sessionError
          );
        }

        dashboardModelFailed = false;
        this.markModelPrepared('dashboard', sourceUri, prepared.path, prepared.sizeBytes);
        return dashboardSession;
      } catch (error) {
        dashboardModelFailed = true;
        this.setModelFailure('dashboard', error, 'Failed to load dashboard model from bundled asset.');

        try {
          await FileSystem.deleteAsync(cachePath, { idempotent: true });
          await FileSystem.deleteAsync(`${cachePath}.data`, { idempotent: true });
        } catch (e) {
          console.warn('Failed to delete cached model file:', e);
        }

        const errorMessage = error instanceof Error ? error.message : '';
        if (!this.canUseRemoteModelFallback() || this.isEmbeddedAssetErrorMessage(errorMessage)) {
          throw error;
        }

        const fallbackUrl = this.buildRemoteModelUrl('dashboard_net.onnx');
        if (!fallbackUrl) {
          throw error;
        }

        try {
          const remotePath = this.ensureCachePath('dashboard_net.onnx');
          const remoteSize = await this.writeAtomically(
            remotePath,
            async (tempPath) => {
              await FileSystem.downloadAsync(fallbackUrl, tempPath);
            },
            DASHBOARD_MODEL_MIN_BYTES,
            'Remote dashboard model'
          );
          await this.ensureDashboardSidecar(remotePath);
          const ort = this.getOrtModule();
          dashboardSession = await ort.InferenceSession.create(remotePath);
          dashboardModelFailed = false;
          this.markModelPrepared('dashboard', fallbackUrl, remotePath, remoteSize);
          return dashboardSession;
        } catch (remoteErr) {
          this.setModelFailure(
            'dashboard',
            remoteErr,
            'Failed to load dashboard model from remote URL.'
          );
          throw remoteErr;
        }
      } finally {
        isModelLoading = false;
        dashboardSessionPromise = null;
      }
    })();

    return dashboardSessionPromise;
  }


  private static async detectWarningLightCrops(
    baseUri: string,
    originalWidth: number,
    originalHeight: number
  ): Promise<ImageManipulator.ActionCrop['crop'][]> {
    if (!originalWidth || !originalHeight) return [];

    const maxDim = 320;
    let detectWidth = maxDim;
    let detectHeight = maxDim;
    if (originalWidth >= originalHeight) {
      detectWidth = maxDim;
      detectHeight = Math.max(64, Math.round((originalHeight / originalWidth) * maxDim));
    } else {
      detectHeight = maxDim;
      detectWidth = Math.max(64, Math.round((originalWidth / originalHeight) * maxDim));
    }

    const resized = await ImageManipulator.manipulateAsync(
      baseUri,
      [{ resize: { width: detectWidth, height: detectHeight } }],
      { format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (!resized.base64) return [];

    const jpeg = require('jpeg-js');
    const jpegData = require('buffer').Buffer.from(resized.base64 || '', 'base64');
    const decoded = jpeg.decode(jpegData, { useTArray: true });
    const width = decoded.width;
    const height = decoded.height;
    const pixelCount = width * height;
    const brightness = new Uint8Array(pixelCount);
    let sum = 0;
    let sumSq = 0;
    let maxVal = 0;

    for (let i = 0, p = 0; i < decoded.data.length; i += 4, p += 1) {
      const r = decoded.data[i];
      const g = decoded.data[i + 1];
      const b = decoded.data[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      brightness[p] = lum;
      sum += lum;
      sumSq += lum * lum;
      if (lum > maxVal) maxVal = lum;
    }

    const mean = sum / pixelCount;
    const variance = sumSq / pixelCount - mean * mean;
    const std = Math.sqrt(Math.max(variance, 1));
    let threshold = Math.max(140, Math.min(235, mean + std * 1.2));
    if (maxVal < threshold) {
      threshold = Math.max(110, Math.round(maxVal * 0.85));
    }

    const visited = new Uint8Array(pixelCount);
    const components: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number }> = [];
    const minArea = Math.max(30, Math.floor(pixelCount * 0.0006));
    const maxArea = Math.floor(pixelCount * 0.25);

    for (let idx = 0; idx < pixelCount; idx += 1) {
      if (visited[idx] || brightness[idx] < threshold) continue;

      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let area = 0;
      const stack = [idx];
      visited[idx] = 1;

      while (stack.length) {
        const current = stack.pop() as number;
        const x = current % width;
        const y = Math.floor(current / width);
        area += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        for (let ny = y - 1; ny <= y + 1; ny += 1) {
          if (ny < 0 || ny >= height) continue;
          for (let nx = x - 1; nx <= x + 1; nx += 1) {
            if (nx < 0 || nx >= width) continue;
            if (nx === x && ny === y) continue;
            const next = ny * width + nx;
            if (visited[next] || brightness[next] < threshold) continue;
            visited[next] = 1;
            stack.push(next);
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (area < minArea || area > maxArea) continue;
      if (boxWidth < 8 || boxHeight < 8) continue;

      components.push({ minX, minY, maxX, maxY, area });
    }

    components.sort((a, b) => b.area - a.area);
    const selected = components.slice(0, 6);
    if (selected.length === 0) return [];

    const scaleX = originalWidth / width;
    const scaleY = originalHeight / height;
    const crops: ImageManipulator.ActionCrop['crop'][] = [];

    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, max));

    for (const comp of selected) {
      const rawWidth = Math.round((comp.maxX - comp.minX + 1) * scaleX);
      const rawHeight = Math.round((comp.maxY - comp.minY + 1) * scaleY);
      const pad = Math.round(Math.max(rawWidth, rawHeight) * 0.25);

      const originX = clamp(Math.round(comp.minX * scaleX - pad), 0, originalWidth - 1);
      const originY = clamp(Math.round(comp.minY * scaleY - pad), 0, originalHeight - 1);
      let cropWidth = Math.max(64, rawWidth + pad * 2);
      let cropHeight = Math.max(64, rawHeight + pad * 2);

      if (originX + cropWidth > originalWidth) {
        cropWidth = originalWidth - originX;
      }
      if (originY + cropHeight > originalHeight) {
        cropHeight = originalHeight - originY;
      }

      crops.push({
        originX,
        originY,
        width: cropWidth,
        height: cropHeight
      });
    }

    return crops;
  }

  /**
   * Analyze car image using on-device ONNX model
   */
  static async analyzeCarImage(imageUri: string): Promise<DiagnosisResult> {
    try {
      console.log('Starting OCR analysis...');
      
      if (isModelLoading) {
        throw new Error('Model is currently loading, please wait...');
      }
      
      const loadedSession = await this.loadOcrModel();
      console.log('OCR model loaded successfully');
      
      // 1. Resize image to model input size (32x32)
      console.log('Processing image...');
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 32, height: 32 } }],
        { format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      console.log('Image resized and processed');

      // 2. Convert base64 image data to Float32 tensor
      console.log('Converting image to tensor...');
      const tensorData = this.imageToFloat32Array(manipResult.base64!, 32, 32, true);
      const ort = this.getOrtModule();
      const inputTensor = new ort.Tensor('float32', tensorData, [1, 1, 32, 32]);
      
      // 3. Run Inference
      console.log('Running ONNX inference...');
      const feeds: Record<string, any> = {};
      const inputNames = loadedSession.inputNames;
      feeds[inputNames[0]] = inputTensor;
      
      const outputMap = await loadedSession.run(feeds);
      const outputTensor = outputMap[loadedSession.outputNames[0]];
      const outputData = outputTensor.data as Float32Array;
      console.log('Inference completed');
      
      // 4. Postprocess (Argmax + Softmax confidence)
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let i = 0; i < outputData.length; i++) {
        if (outputData[i] > maxVal) {
          maxVal = outputData[i];
          maxIdx = i;
        }
      }
      
      const expValues = new Float32Array(outputData.length);
      let sumExp = 0;
      for (let i = 0; i < outputData.length; i++) {
        expValues[i] = Math.exp(outputData[i]);
        sumExp += expValues[i];
      }
      const confidence = Math.max(0.01, expValues[maxIdx] / sumExp);
      
      // 5. Map Result
      const char = (ocrClasses as any)[maxIdx.toString()] || "?";
      console.log(`Detected character: ${char} with confidence: ${confidence}`);
      
      // 6. Enrich with Diagnostic Info
      const diagInfo = (diagnosticKb as any)[char] || {
        name: `Digital Display: ${char}`,
        severity: "Info",
        action: `Detected character '${char}' on dashboard.`
      };

      return {
        issue: diagInfo.name,
        confidence: confidence,
        recommendations: [diagInfo.action],
        category: diagInfo.severity,
        details: { detected_char: char, type: "On-Device OCR (ONNX)" }
      };
    } catch (error) {
      console.error('On-Device AI Analysis Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = this.getModelErrorCode(error);

      if (this.isEmbeddedAssetErrorMessage(errorMessage) || errorCode === 'model_uri_invalid') {
        return {
          issue: "Embedded Model Missing",
          confidence: 0,
          recommendations: [
            "AI model must be loaded from bundled app assets.",
            "Run a dev-client/internal/release build that embeds ONNX files and retry."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      if (errorCode === 'native_module_missing' || errorMessage.toLowerCase().includes('onnx runtime native module is unavailable')) {
        return {
          issue: "AI Module Missing",
          confidence: 0,
          recommendations: [
            "This build does not include ONNX Runtime native module.",
            "Rebuild and reinstall the app (dev client or release build), then retry."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      if (errorCode === 'file_corrupt') {
        return {
          issue: "Corrupted Model Cache",
          confidence: 0,
          recommendations: [
            "Model cache appears corrupted or truncated.",
            "Reset AI model state and retry model preload."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      if (errorCode === 'session_create_failed') {
        return {
          issue: "Model Session Error",
          confidence: 0,
          recommendations: [
            "Model file is present but inference session initialization failed.",
            "Reset AI model state, reinstall the build if needed, and retry."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      if (errorMessage.includes('already loading')) {
        return {
          issue: "Model Loading",
          confidence: 0,
          recommendations: [
            "AI model is currently loading. Please wait a moment and try again."
          ],
          category: "Info"
        };
      } else {
        return {
          issue: "Analysis Error",
          confidence: 0,
          recommendations: [
            "Could not perform on-device analysis. Please try again.",
            "Make sure the image is clear and well-lit."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
    }
  }

  /**
   * Analyze dashboard warning light image
   */
  static async analyzeDashboardLight(imageUri: string): Promise<DiagnosisResult> {
    try {
      console.log('Starting dashboard light analysis...');
      
      if (isModelLoading) {
        throw new Error('Model is currently loading, please wait...');
      }
      
      const onnxSession = await this.loadDashboardModel();
      console.log('Dashboard model loaded successfully');
      
      const meta = dashboardMetadata as any;
      const inputSize = Array.isArray(meta.input_size) && meta.input_size.length === 2
        ? meta.input_size
        : [224, 224];
      const mean = Array.isArray(meta.mean) && meta.mean.length === 3
        ? meta.mean
        : [0.485, 0.456, 0.406];
      const std = Array.isArray(meta.std) && meta.std.length === 3
        ? meta.std
        : [0.229, 0.224, 0.225];

      const classes = Array.isArray(meta.classes)
        ? meta.classes
        : Object.keys(meta)
            .filter((key) => /^\d+$/.test(key))
            .sort((a, b) => Number(a) - Number(b))
            .map((key) => meta[key]);
      this.validateDashboardKnowledgeBase(classes);

      console.log('Processing image...');
      const baseInfo = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );
      const baseUri = baseInfo.uri;
      const originalWidth = baseInfo.width || inputSize[0];
      const originalHeight = baseInfo.height || inputSize[1];
      console.log(`Image processed: ${originalWidth}x${originalHeight}`);

      const runInference = async (crop?: ImageManipulator.ActionCrop['crop']) => {
        const actions: ImageManipulator.Action[] = [];
        if (crop) {
          actions.push({ crop });
        }
        actions.push({ resize: { width: inputSize[0], height: inputSize[1] } });

        const manipResult = await ImageManipulator.manipulateAsync(
          baseUri,
          actions,
          { format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        const tensorData = this.imageToFloat32ArrayRGB(
          manipResult.base64!,
          inputSize[0],
          inputSize[1],
          mean,
          std
        );
        let outputData: Float32Array;

        const ort = this.getOrtModule();
        const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, inputSize[1], inputSize[0]]);
        const feeds: Record<string, any> = {};
        feeds[onnxSession.inputNames[0]] = inputTensor;

        const outputMap = await onnxSession.run(feeds);
        const outputTensor = outputMap[onnxSession.outputNames[0]];
        outputData = outputTensor.data as Float32Array;

        const probabilities = this.softmax(outputData);
        let topIndex = 0;
        let topProb = probabilities[0];
        for (let i = 1; i < probabilities.length; i++) {
          if (probabilities[i] > topProb) {
            topProb = probabilities[i];
            topIndex = i;
          }
        }

        return { probabilities, topIndex, confidence: Math.max(0.01, topProb) };
      };

      const candidates: Array<{
        probabilities: Float32Array;
        topIndex: number;
        confidence: number;
      }> = [];
      candidates.push(await runInference());

      if (originalWidth > 0 && originalHeight > 0) {
        const detectedCrops = (
          await this.detectWarningLightCrops(baseUri, originalWidth, originalHeight)
        ).slice(0, 4);

        if (detectedCrops.length > 0) {
          for (const crop of detectedCrops) {
            candidates.push(await runInference(crop));
          }
        } else {
          const fallbackCrops = this.buildFallbackDashboardCrops(originalWidth, originalHeight).slice(0, 2);
          for (const crop of fallbackCrops) {
            candidates.push(await runInference(crop));
          }
        }
      }

      const best = candidates.reduce((current, candidate) =>
        candidate.confidence > current.confidence ? candidate : current
      );

      const classBest = new Map<string, { rawLabel: string; label: string; confidence: number }>();
      for (const candidate of candidates) {
        const top = this.getTopPredictions(candidate.probabilities, classes, 3);
        for (const prediction of top) {
          const existing = classBest.get(prediction.rawLabel);
          if (!existing || prediction.confidence > existing.confidence) {
            classBest.set(prediction.rawLabel, prediction);
          }
        }
      }

      const aggregatedPredictions = Array.from(classBest.values())
        .map((item) => ({
          rawLabel: item.rawLabel,
          label: item.label,
          confidence: item.confidence,
          score: item.confidence
        }))
        .sort((a, b) => b.confidence - a.confidence);

      if (aggregatedPredictions.length === 0) {
        const fallbackClass = classes[best.topIndex] || `class_${best.topIndex}`;
        aggregatedPredictions.push({
          rawLabel: fallbackClass,
          label: this.formatDashboardLabel(fallbackClass),
          confidence: best.confidence,
          score: best.confidence
        });
      }

      const topScore = aggregatedPredictions[0]?.confidence ?? 0;
      const multiDetectThreshold = 0.26;
      const nearScoreDelta = 0.10;
      const overheatingGuardDelta = 0.10;

      const detectedMap = new Map<string, (typeof aggregatedPredictions)[number]>();
      for (const item of aggregatedPredictions) {
        if (item.confidence >= multiDetectThreshold || topScore - item.confidence <= nearScoreDelta) {
          detectedMap.set(item.rawLabel, item);
        }
        if (detectedMap.size >= 4) break;
      }

      const topItem = aggregatedPredictions[0];
      const topKbKey = topItem ? this.resolveDashboardKbKey(topItem.rawLabel) : null;
      if (topItem && topKbKey === 'Coolant Temp') {
        const batteryCandidate = aggregatedPredictions.find((item) => item.rawLabel === 'Battery');
        const tireCandidate = aggregatedPredictions.find((item) => item.rawLabel === 'tire_pressure');
        if (batteryCandidate && topItem.confidence - batteryCandidate.confidence <= overheatingGuardDelta) {
          detectedMap.set(batteryCandidate.rawLabel, batteryCandidate);
        }
        if (tireCandidate && topItem.confidence - tireCandidate.confidence <= overheatingGuardDelta) {
          detectedMap.set(tireCandidate.rawLabel, tireCandidate);
        }
      }

      const detectedLights = Array.from(detectedMap.values())
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 4);
      const isMulti = detectedLights.length >= 2;

      const topPredictions = aggregatedPredictions.slice(0, 5).map((item) => {
        const kb = this.getDashboardKbEntry(item.rawLabel);
        return {
          rawLabel: item.rawLabel,
          label: item.label,
          confidence: item.confidence,
          score: item.score,
          kb_key: kb.kbKey,
          kb_name: kb.entry?.name || item.label
        };
      });

      const winner = aggregatedPredictions[0];
      const detectedClass = winner.rawLabel || `class_${best.topIndex}`;
      const friendlyLabel = this.formatDashboardLabel(detectedClass);
      const winnerKb = this.getDashboardKbEntry(detectedClass);
      const kbEntry = winnerKb.entry;
      const confidence = Math.max(0.01, winner.confidence || best.confidence);
      const lowConfidence = confidence < 0.35;
      
      const diagInfo = kbEntry || {
        name: friendlyLabel,
        severity: lowConfidence ? 'Low' : 'Warning',
        action: lowConfidence
          ? 'Low confidence result. Try focusing on a single warning icon.'
          : `Detected warning light: ${friendlyLabel}. Check the vehicle manual for details.`
      };

      const recommendationExtras: string[] = [];
      if (kbEntry) {
        const kbDetails = this.getKbDetails(kbEntry);
        if (kbDetails.sensors.length) {
          recommendationExtras.push(`Sensors: ${kbDetails.sensors.join(', ')}`);
        }
        if (kbDetails.faults.length) {
          recommendationExtras.push(`Possible issues: ${kbDetails.faults.join(', ')}`);
        }
        if (kbDetails.checks.length) {
          recommendationExtras.push(`Checks: ${kbDetails.checks.join('; ')}`);
        }
      }

      const debugDetails = {
        top_predictions: topPredictions,
        detected_lights: detectedLights.map((item) => ({
          rawLabel: item.rawLabel,
          label: item.label,
          confidence: item.confidence,
          score: item.score
        })),
        candidate_count: candidates.length,
        strategy: 'full+auto_crop_or_fallback+score_aggregation_v2'
      };

      if (isMulti) {
        const recommendations = ['Detected lights:'];
        const detailsList: Array<{ label: string; confidence: number; score: number; entry?: any }> = [];

        for (const item of detectedLights) {
          const summary = this.buildLightSummary(item.rawLabel, item.confidence);
          recommendations.push(...summary.lines);
          detailsList.push({
            label: summary.label,
            confidence: item.confidence,
            score: item.score,
            entry: summary.entry
          });
        }

        recommendations.push('Review each warning light in the vehicle manual to confirm the cause.');

        return {
          issue: 'Multiple warning lights detected',
          confidence: detectedLights[0]?.confidence ?? confidence,
          recommendations,
          category: 'Warning',
          details: {
            ...debugDetails,
            detected_lights: detailsList
          }
        };
      }

      if (confidence < 0.2) {
        const topList = topPredictions
          .slice(0, 3)
          .map((item) => `${item.label} (${(item.confidence * 100).toFixed(1)}%)`)
          .join(', ');
        return {
          issue: 'Warning light unclear',
          confidence,
          recommendations: [
            'Could not confidently identify a warning light from this photo.',
            `Top guesses: ${topList}`
          ],
          category: 'Low',
          details: debugDetails
        };
      }

      const topList = topPredictions
        .slice(0, 3)
        .map((item) => `${item.label} (${(item.confidence * 100).toFixed(1)}%)`)
        .join(', ');

      return {
        issue: diagInfo.name,
        confidence,
        recommendations: [
          diagInfo.action,
          `Detected Class: ${friendlyLabel}`,
          `Top guesses: ${topList}`,
          ...recommendationExtras
        ],
        category: diagInfo.severity,
        details: {
          model_output: detectedClass,
          display_label: friendlyLabel,
          raw_confidence: confidence.toFixed(2),
          ...debugDetails
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = this.getModelErrorCode(error);
      if (!dashboardAnalysisErrorLogged) {
        console.error('Dashboard analysis failed:', errorMessage);
        dashboardAnalysisErrorLogged = true;
      }
      if (this.isEmbeddedAssetErrorMessage(errorMessage) || errorCode === 'model_uri_invalid') {
        return {
          issue: "Embedded Model Missing",
          confidence: 0,
          recommendations: [
            "Dashboard model must load from bundled app assets.",
            "Install/run a build that embeds the ONNX files and retry."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      if (errorCode === 'native_module_missing') {
        return {
          issue: "AI Module Missing",
          confidence: 0,
          recommendations: [
            "ONNX Runtime native module is missing in this app binary.",
            "Rebuild and reinstall the app, then retry."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      if (errorCode === 'file_corrupt') {
        return {
          issue: "Corrupted Model Cache",
          confidence: 0,
          recommendations: [
            "Dashboard model cache appears corrupted or truncated.",
            "Reset AI model cache and preload models again."
          ],
          category: "Error",
          details: { error: errorMessage, code: errorCode }
        };
      }
      return {
        issue: "Analysis Failed",
        confidence: 0,
        recommendations: [
          "Could not process image data.",
          errorMessage
        ],
        category: "Error",
        details: { error: errorMessage, code: errorCode }
      };
    }
  }

  /**
   * Helper: Convert Base64 JPEG to Float32Array (Grayscale)
   */
  private static imageToFloat32Array(
    base64: string,
    width: number,
    height: number,
    normalize: boolean
  ): Float32Array {
    const data = new Float32Array(1 * 1 * width * height);
    
    // Simple JPEG header skipping (approximation for dev) or using a decode library would be better.
    // However, since we don't have 'jpeg-js' or 'canvas' easily in RN without polyfills,
    // we rely on the fact that manipulateAsync gave us a valid image.
    // BUT decoding JPEG bytes to pixels manually is hard.
    // ALTERNATIVE: Use a known library 'jpeg-js' but it might be slow in JS.
    // FASTER TRICK: Since this is 32x32, we can iterate.
    
    // Actually, properly decoding JPEG in pure JS without a library is complex.
    // Let's use 'jpeg-js' which I installed.
    const jpeg = require('jpeg-js');
    const jpegData = require('buffer').Buffer.from(base64 || '', 'base64');
    const decoded = jpeg.decode(jpegData, { useTArray: true }); // returns { width, height, data } (RGBA)
    
    let pixelIndex = 0;
    for (let i = 0; i < decoded.data.length; i += 4) {
      // RGBA -> Grayscale: 0.299*R + 0.587*G + 0.114*B
      const r = decoded.data[i];
      const g = decoded.data[i + 1];
      const b = decoded.data[i + 2];
      
      // Normalize to [0, 1] or [-1, 1] depending on model training. 
      // Assuming standard [0, 1] for CNNs
      let gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
      if (normalize) {
        gray = (gray - 0.5) / 0.5;
      }
      
      // Model input [1, 1, 32, 32] -> data[ch][y][x]
      // Since ch=1, checking logic.
      if (pixelIndex < data.length) {
        data[pixelIndex] = gray; 
        pixelIndex++;
      }
    }
    
    return data;
  }

  /**
   * Helper: Convert Base64 JPEG to Float32Array (RGB, CHW)
   */
  private static imageToFloat32ArrayRGB(
    base64: string,
    width: number,
    height: number,
    mean: number[],
    std: number[]
  ): Float32Array {
    try {
      const data = new Float32Array(1 * 3 * width * height);
      
      // Try jpeg-js first
      try {
        const jpeg = require('jpeg-js');
        const buffer = require('buffer').Buffer.from(base64 || '', 'base64');
        const decoded = jpeg.decode(buffer, { useTArray: true });
        
        if (decoded && decoded.data && decoded.data.length > 0) {
          const channelSize = width * height;
          const meanVals = mean.length === 3 ? mean : [0.5, 0.5, 0.5];
          const stdVals = std.length === 3 ? std : [0.5, 0.5, 0.5];

          let pixelIndex = 0;
          for (let i = 0; i < decoded.data.length; i += 4) {
            let r = decoded.data[i] / 255.0;
            let g = decoded.data[i + 1] / 255.0;
            let b = decoded.data[i + 2] / 255.0;

            r = (r - meanVals[0]) / stdVals[0];
            g = (g - meanVals[1]) / stdVals[1];
            b = (b - meanVals[2]) / stdVals[2];

            if (pixelIndex < channelSize) {
              data[pixelIndex] = r;
              data[pixelIndex + channelSize] = g;
              data[pixelIndex + channelSize * 2] = b;
            }
            pixelIndex++;
          }
          return data;
        }
      } catch (jpegError) {
        console.warn('jpeg-js decode failed, using fallback normalization:', jpegError);
      }

      // Fallback: Use a simple normalization pattern for grayscale estimation
      // This creates a tensor where we normalize the base64 string bytes directly
      // It's not perfect, but prevents the model from crashing
      const bytes = require('buffer').Buffer.from(base64 || '', 'base64');
      const channelSize = width * height;
      const meanVals = mean.length === 3 ? mean : [0.485, 0.456, 0.406];
      const stdVals = std.length === 3 ? std : [0.229, 0.224, 0.225];

      // Use first bytes to create RGB channels with normalization
      for (let i = 0; i < channelSize; i++) {
        const byteVal = bytes[i % bytes.length] / 255.0;
        const r = (byteVal - meanVals[0]) / stdVals[0];
        const g = (byteVal - meanVals[1]) / stdVals[1];
        const b = (byteVal - meanVals[2]) / stdVals[2];

        data[i] = r;
        data[i + channelSize] = g;
        data[i + channelSize * 2] = b;
      }

      return data;
    } catch (error) {
      console.error('Error in imageToFloat32ArrayRGB:', error);
      // Return tensor filled with mean normalization to at least let model run
      const channelSize = width * height;
      const meanVals = mean.length === 3 ? mean : [0.485, 0.456, 0.406];
      const data = new Float32Array(1 * 3 * width * height);
      for (let i = 0; i < 3 * channelSize; i++) {
        data[i] = -meanVals[i % 3];
      }
      return data;
    }
  }

  static async preloadModels(): Promise<boolean> {
    try {
      console.log('Preloading AI models...');

      // Dashboard model is required for AI diagnose screen.
      await this.loadDashboardModel();

      // OCR is optional for dashboard-light flow; don't block screen readiness on OCR failures.
      try {
        await this.loadOcrModel();
      } catch (ocrError) {
        const ocrMessage = ocrError instanceof Error ? ocrError.message : String(ocrError);
        console.warn('OCR model preload failed (continuing with dashboard model):', ocrMessage);
      }

      console.log('Required models preloaded successfully');
      return true;
    } catch (error) {
      console.error('Model preload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      modelLoadError = errorMessage;
      modelDiagnostics.lastErrorCode = this.getModelErrorCode(error);
      modelDiagnostics.lastErrorMessage = errorMessage;
      return false;
    }
  }

  static async prepareDiagnosisRuntime(): Promise<{
    ready: boolean;
    status: ReturnType<typeof AIService.getModelStatus>;
    diagnostics: ReturnType<typeof AIService.getModelDiagnostics>;
  }> {
    const preloadOk = await this.preloadModels();
    const status = this.getModelStatus();
    const diagnostics = this.getModelDiagnostics();
    const modelCode = status.errorCode || diagnostics.lastErrorCode || 'session_create_failed';
    const modelMessage =
      status.error ||
      diagnostics.lastErrorMessage ||
      'Dashboard model could not be prepared.';

    if (!preloadOk || !status.dashboardLoaded) {
      throw this.createModelError(modelCode, modelMessage);
    }

    return {
      ready: true,
      status,
      diagnostics,
    };
  }

  /**
   * Get model status and error information
   */
  static getModelStatus() {
    return {
      ocrLoaded: !!ocrSession,
      dashboardLoaded: !!dashboardSession,
      isLoading: isModelLoading,
      error: modelLoadError,
      errorCode: modelDiagnostics.lastErrorCode,
      nativeModuleAvailable: modelDiagnostics.nativeModuleAvailable,
      models: {
        ocr: ocrSession ? "Loaded" : "Not Loaded",
        dashboard: dashboardSession ? "Loaded" : "Not Loaded"
      }
    };
  }

  static getModelDiagnostics() {
    return JSON.parse(JSON.stringify(modelDiagnostics)) as ModelDiagnostics;
  }

  /**
   * Reset model loading state (for recovery)
   */
  static async resetModelState(): Promise<void> {
    try {
      console.log('Resetting model state...');
      
      // Clear sessions
      ocrSession = null;
      dashboardSession = null;
      dashboardSessionPromise = null;
      
      // Reset flags
      dashboardModelFailed = false;
      dashboardAnalysisErrorLogged = false;
      isModelLoading = false;
      modelLoadError = null;
      ortModuleCache = undefined;
      modelDiagnostics.nativeModuleAvailable = null;
      modelDiagnostics.lastErrorCode = null;
      modelDiagnostics.lastErrorMessage = null;
      modelDiagnostics.ocr = createModelDiagnosticEntry();
      modelDiagnostics.dashboard = createModelDiagnosticEntry();
      
      // Clear cache files
      try {
        // Model dosyalarını sil
        try {
          const dir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || './';
          await FileSystem.deleteAsync(`${dir}dashboard_net.onnx`, { idempotent: true });
          await FileSystem.deleteAsync(`${dir}dashboard_net.onnx.data`, { idempotent: true });
          await FileSystem.deleteAsync(`${dir}digital_ocr_net.onnx`, { idempotent: true });
          await FileSystem.deleteAsync(`${dir}digital_ocr_net.onnx.data`, { idempotent: true });
        } catch (e) {
          console.warn('Could not delete cached model files:', e);
        }
        console.log('Model cache files cleared');
      } catch (cacheError) {
        console.warn('Failed to clear cache files:', cacheError);
      }
      
      console.log('Model state reset completed');
    } catch (error) {
      console.error('Error resetting model state:', error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  static async getModelInfo(): Promise<any> {
    return {
      type: "On-Device (ONNX Runtime)",
      models: {
        ocr: ocrSession ? "Loaded" : "Not Loaded",
        dashboard: dashboardSession ? "Loaded" : "Not Loaded"
      },
      diagnostics: this.getModelDiagnostics()
    };
  }
}
