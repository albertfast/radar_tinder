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
      const loadedSession = await this.loadDashboardModel();
      
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

      // 1. Resize image to model input size (default 224x224)
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: inputSize[0], height: inputSize[1] } }],
        { format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      // 2. Convert base64 image data to Float32 tensor
      // Model expects: [1, 3, H, W] (Batch, Channel, Height, Width) - RGB
      const tensorData = this.imageToFloat32ArrayRGB(
        manipResult.base64!,
        inputSize[0],
        inputSize[1],
        mean,
        std
      );
      const inputTensor = new Tensor('float32', tensorData, [1, 3, inputSize[1], inputSize[0]]);
      
      // 3. Run inference
      const feeds: Record<string, Tensor> = {};
      feeds[loadedSession.inputNames[0]] = inputTensor;
      
      const outputMap = await loadedSession.run(feeds);
      const outputTensor = outputMap[loadedSession.outputNames[0]];
      const outputData = outputTensor.data as Float32Array;
      
      // 4. Get prediction (Argmax)
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let i = 0; i < outputData.length; i++) {
        if (outputData[i] > maxVal) {
          maxVal = outputData[i];
          maxIdx = i;
        }
      }
      
      // Calculate confidence using Softmax
      // exp(x_i) / sum(exp(x_j))
      const expValues = new Float32Array(outputData.length);
      let sumExp = 0;
      for (let i = 0; i < outputData.length; i++) {
        expValues[i] = Math.exp(outputData[i]);
        sumExp += expValues[i];
      }
      
      const confidence = Math.max(0.01, expValues[maxIdx] / sumExp);
      
      // Map to class label
      const detectedClass = classes[maxIdx] || `class_${maxIdx}`;
      
      // Get diagnostic information
      const diagInfo = (diagnosticKb as any)[detectedClass] || {
        name: `Unknown Symbol (${detectedClass})`,
        severity: "Low",
        action: "Symbol not recognized in database."
      };

      return {
        issue: diagInfo.name,
        confidence: confidence,
        recommendations: [
          diagInfo.action,
          `Detected Class: ${detectedClass}`
        ],
        category: diagInfo.severity,
        details: { 
          model_output: detectedClass,
          raw_confidence: confidence.toFixed(2)
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
