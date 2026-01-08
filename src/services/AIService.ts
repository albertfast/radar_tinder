/**
 * AI Diagnosis Service
 * Performs on-device AI inference using PyTorch Mobile
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Buffer } from 'buffer';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import ocrClasses from '../../assets/models/digital_ocr_classes.json';
import dashboardMetadata from '../../assets/models/dashboard_classes.json';
import diagnosticKb from '../../assets/models/diagnostic_kb.json';

export interface DiagnosisResult {
  issue: string;
  confidence: number;
  recommendations: string[];
  category: string;
  details?: any;
}

let ocrSession: InferenceSession | null = null;
let dashboardSession: InferenceSession | null = null;

export class AIService {
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

  private static resolveDashboardKbKey(label: string): string | null {
    const normalized = label.toLowerCase();
    const aliases: Record<string, string> = {
      abs: 'ABS',
      airbag: 'Airbag',
      battery: 'Battery',
      brake: 'Brake',
      check_engine: 'Check Engine',
      coolant: 'Coolant Temp',
      engine_temperature: 'Coolant Temp',
      fuel: 'Low Fuel',
      seatbelt: 'Seatbelt',
      tire_pressure: 'Tire Pressure',
      traction_control: 'Traction Control',
      stability_control: 'Traction Control',
      slip: 'Traction Control',
      esp: 'Traction Control',
      electronic_stability: 'Traction Control'
    };

    return aliases[normalized] || null;
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
    const label = this.formatDashboardLabel(rawLabel);
    const kbKey = this.resolveDashboardKbKey(rawLabel);
    const entry = (diagnosticKb as any)[kbKey || label];
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

  /**
   * Load the ONNX model from assets
   */
  private static async loadOcrModel() {
    if (ocrSession) return ocrSession;
    
    try {
      const asset = Asset.fromModule(require('../../assets/models/digital_ocr_net.onnx'));
      await asset.downloadAsync();

      const modelPath = `${FileSystem.cacheDirectory}digital_ocr_net.onnx`;
      await FileSystem.copyAsync({
        from: asset.localUri || asset.uri,
        to: modelPath
      });

      try {
        const dataAsset = Asset.fromModule(require('../../assets/models/digital_ocr_net.onnx.data'));
        await dataAsset.downloadAsync();
        const dataPath = `${FileSystem.cacheDirectory}digital_ocr_net.onnx.data`;
        await FileSystem.copyAsync({
          from: dataAsset.localUri || dataAsset.uri,
          to: dataPath
        });
      } catch (dataError) {
        // Model may be self-contained without external data.
      }

      ocrSession = await InferenceSession.create(modelPath);
      return ocrSession;
    } catch (error) {
      console.error('Error loading OCR model:', error);
      throw new Error('Failed to load OCR model');
    }
  }

  private static async loadDashboardModel() {
    if (dashboardSession) return dashboardSession;

    try {
      const asset = Asset.fromModule(require('../../assets/models/dashboard_net.onnx'));
      await asset.downloadAsync();

      const modelPath = `${FileSystem.cacheDirectory}dashboard_net.onnx`;
      await FileSystem.copyAsync({
        from: asset.localUri || asset.uri,
        to: modelPath
      });

      try {
        const dataAsset = Asset.fromModule(require('../../assets/models/dashboard_net.onnx.data'));
        await dataAsset.downloadAsync();
        const dataPath = `${FileSystem.cacheDirectory}dashboard_net.onnx.data`;
        await FileSystem.copyAsync({
          from: dataAsset.localUri || dataAsset.uri,
          to: dataPath
        });
      } catch (dataError) {
        // Model may be self-contained without external data.
      }

      dashboardSession = await InferenceSession.create(modelPath);
      return dashboardSession;
    } catch (error) {
      console.error('Error loading dashboard model:', error);
      throw new Error('Failed to load dashboard model');
    }
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
    const jpegData = Buffer.from(resized.base64, 'base64');
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
      const loadedSession = await this.loadOcrModel();
      
      // 1. Resize image to model input size (32x32)
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 32, height: 32 } }],
        { format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      // 2. Convert base64 image data to Float32 tensor
      const tensorData = this.imageToFloat32Array(manipResult.base64!, 32, 32, true);
      const inputTensor = new Tensor('float32', tensorData, [1, 1, 32, 32]);
      
      // 2. Run Inference
      const feeds: Record<string, Tensor> = {};
      const inputNames = loadedSession.inputNames;
      feeds[inputNames[0]] = inputTensor;
      
      const outputMap = await loadedSession.run(feeds);
      const outputTensor = outputMap[loadedSession.outputNames[0]];
      const outputData = outputTensor.data as Float32Array;
      
      // 3. Postprocess (Argmax + Softmax confidence)
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
      
      // 4. Map Result
      const char = (ocrClasses as any)[maxIdx.toString()] || "?";
      
      // 5. Enrich with Diagnostic Info
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
      return {
        issue: "Analysis Error",
        confidence: 0,
        recommendations: ["Could not perform on-device analysis. Please check app permissions."],
        category: "Error"
      };
    }
  }

  /**
   * Analyze dashboard warning light image
   */
  static async analyzeDashboardLight(imageUri: string): Promise<DiagnosisResult> {
    try {
      const onnxSession = await this.loadDashboardModel();
      
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

      const baseInfo = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );
      const baseUri = baseInfo.uri;
      const originalWidth = baseInfo.width || inputSize[0];
      const originalHeight = baseInfo.height || inputSize[1];

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

        const inputTensor = new Tensor('float32', tensorData, [1, 3, inputSize[1], inputSize[0]]);
        const feeds: Record<string, Tensor> = {};
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

      const candidates: Array<{ probabilities: Float32Array; topIndex: number; confidence: number }> = [];
      candidates.push(await runInference());

      if (candidates[0].confidence < 0.35 && originalWidth > 0 && originalHeight > 0) {
        const detectedCrops = await this.detectWarningLightCrops(baseUri, originalWidth, originalHeight);
        for (const crop of detectedCrops) {
          candidates.push(await runInference(crop));
        }

        const minSide = Math.min(originalWidth, originalHeight);
        const cropSize = Math.max(64, Math.floor(minSide * 0.6));
        const half = cropSize / 2;
        const clamp = (value: number, min: number, max: number) =>
          Math.max(min, Math.min(value, max));
        const makeCrop = (cx: number, cy: number) => {
          const originX = Math.round(clamp(cx - half, 0, originalWidth - cropSize));
          const originY = Math.round(clamp(cy - half, 0, originalHeight - cropSize));
          return { originX, originY, width: cropSize, height: cropSize };
        };

        const centers = [
          [originalWidth / 2, originalHeight / 2],
          [half, half],
          [originalWidth - half, half],
          [half, originalHeight - half],
          [originalWidth - half, originalHeight - half]
        ];

        for (const [cx, cy] of centers) {
          candidates.push(await runInference(makeCrop(cx, cy)));
        }
      }

      const best = candidates.reduce((current, candidate) =>
        candidate.confidence > current.confidence ? candidate : current
      );

      const confidence = best.confidence;
      const maxIdx = best.topIndex;
      const topPredictions = this.getTopPredictions(best.probabilities, classes, 3);
      const aggregateMinConfidence = 0.25;
      const multiDetectThreshold = 0.3;
      const aggregatedMap = new Map<string, { rawLabel: string; label: string; confidence: number }>();

      for (const candidate of candidates) {
        const candidateTop = this.getTopPredictions(candidate.probabilities, classes, 3);
        for (const prediction of candidateTop) {
          if (prediction.confidence < aggregateMinConfidence) continue;
          const existing = aggregatedMap.get(prediction.rawLabel);
          if (!existing || prediction.confidence > existing.confidence) {
            aggregatedMap.set(prediction.rawLabel, prediction);
          }
        }
      }

      const aggregatedPredictions = Array.from(aggregatedMap.values()).sort(
        (a, b) => b.confidence - a.confidence
      );
      const detectedLights = aggregatedPredictions
        .filter((item) => item.confidence >= multiDetectThreshold)
        .slice(0, 4);
      const isMulti = detectedLights.length >= 2;
      
      // Map to class label
      const detectedClass = classes[maxIdx] || `class_${maxIdx}`;
      const friendlyLabel = this.formatDashboardLabel(detectedClass);
      const kbKey = this.resolveDashboardKbKey(detectedClass);
      const kbEntry = (diagnosticKb as any)[kbKey || friendlyLabel || detectedClass];
      const lowConfidence = confidence < 0.35;
      
      // Get diagnostic information
      const diagInfo = kbEntry || {
        name: friendlyLabel,
        severity: lowConfidence ? "Low" : "Warning",
        action: lowConfidence
          ? "Low confidence result. Try focusing on a single warning icon."
          : `Detected warning light: ${friendlyLabel}. Check the vehicle manual for details.`
      };

      const recommendationExtras: string[] = [];
      if (lowConfidence && topPredictions.length > 1) {
        const topList = topPredictions
          .map((item) => `${item.label} (${(item.confidence * 100).toFixed(1)}%)`)
          .join(', ');
        recommendationExtras.push(`Top guesses: ${topList}`);
      }

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

      if (isMulti) {
        const recommendations = ['Detected lights:'];
        const detailsList: Array<{ label: string; confidence: number; entry?: any }> = [];

        for (const item of detectedLights) {
          const summary = this.buildLightSummary(item.rawLabel, item.confidence);
          recommendations.push(...summary.lines);
          detailsList.push({ label: summary.label, confidence: item.confidence, entry: summary.entry });
        }

        recommendations.push('Review each warning light in the vehicle manual to confirm the cause.');

        return {
          issue: 'Multiple warning lights detected',
          confidence: detectedLights[0]?.confidence ?? confidence,
          recommendations,
          category: 'Warning',
          details: {
            detected_lights: detailsList,
            top_predictions: topPredictions
          }
        };
      }

      if (confidence < 0.2) {
        const topList = topPredictions
          .map((item) => `${item.label} (${(item.confidence * 100).toFixed(1)}%)`)
          .join(', ');
        return {
          issue: 'Warning light unclear',
          confidence: confidence,
          recommendations: [
            'Could not confidently identify a warning light from this photo.',
            `Top guesses: ${topList}`
          ],
          category: 'Low',
          details: {
            top_predictions: topPredictions,
            detected_lights: detectedLights
          }
        };
      }

      return {
        issue: diagInfo.name,
        confidence: confidence,
        recommendations: [
          diagInfo.action,
          `Detected Class: ${friendlyLabel}`,
          ...recommendationExtras
        ],
        category: diagInfo.severity,
        details: { 
          model_output: detectedClass,
          display_label: friendlyLabel,
          raw_confidence: confidence.toFixed(2),
          top_predictions: topPredictions,
          detected_lights: detectedLights
        }
      };
    } catch (error) {
      console.error('Dashboard analysis error:', error);
      return {
        issue: "Analysis Failed",
        confidence: 0,
        recommendations: ["Could not process image data."],
        category: "Error"
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
    const jpegData = Buffer.from(base64, 'base64');
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
    const data = new Float32Array(1 * 3 * width * height);
    const jpeg = require('jpeg-js');
    const jpegData = Buffer.from(base64, 'base64');
    const decoded = jpeg.decode(jpegData, { useTArray: true });
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

  /**
   * Get model information
   */
  static async getModelInfo(): Promise<any> {
    return {
      type: "On-Device (ONNX Runtime)",
      models: {
        ocr: ocrSession ? "Loaded" : "Not Loaded",
        dashboard: dashboardSession ? "Loaded" : "Not Loaded"
      }
    };
  }
}
