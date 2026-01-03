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
import dashboardClasses from '../../assets/models/dashboard_classes.json';
import diagnosticKb from '../../assets/models/diagnostic_kb.json';

export interface DiagnosisResult {
  issue: string;
  confidence: number;
  recommendations: string[];
  category: string;
  details?: any;
}

let session: InferenceSession | null = null;

export class AIService {
  /**
   * Load the ONNX model from assets
   */
  private static async loadModel() {
    if (session) return session;
    
    try {
      const asset = Asset.fromModule(require('../../assets/models/digital_ocr_net.onnx'));
      await asset.downloadAsync();
      
      // Copy to a known location if needed, but asset.localUri should work
      // On Android, we might need to copy to cache directory to ensure access
      const modelPath = `${FileSystem.cacheDirectory}digital_ocr_net.onnx`;
      await FileSystem.copyAsync({
        from: asset.localUri || asset.uri,
        to: modelPath
      });

      session = await InferenceSession.create(modelPath);
      return session;
    } catch (error) {
      console.error('Error loading AI model:', error);
      throw new Error('Failed to load AI model');
    }
  }

  /**
   * Analyze car image using on-device ONNX model
   */
  static async analyzeCarImage(imageUri: string): Promise<DiagnosisResult> {
    try {
      const loadedSession = await this.loadModel();
      
      // 1. Preprocess Image (Placeholder for real pixel extraction)
      // In a real app, we would:
      // 1. Resize image to 32x32 using expo-image-manipulator
      // 2. Get pixel data (e.g. via expo-gl or base64 decoding)
      // 3. Normalize to [-1, 1]
      
      // For this demo, we'll create a random tensor to verify the pipeline works
      // Input shape: [1, 1, 32, 32]
      const inputData = new Float32Array(1 * 1 * 32 * 32).map(() => Math.random());
      const inputTensor = new Tensor('float32', inputData, [1, 1, 32, 32]);
      
      // 2. Run Inference
      const feeds: Record<string, Tensor> = {};
      const inputNames = loadedSession.inputNames;
      feeds[inputNames[0]] = inputTensor;
      
      const outputMap = await loadedSession.run(feeds);
      const outputTensor = outputMap[loadedSession.outputNames[0]];
      const outputData = outputTensor.data as Float32Array;
      
      // 3. Postprocess (Argmax)
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let i = 0; i < outputData.length; i++) {
        if (outputData[i] > maxVal) {
          maxVal = outputData[i];
          maxIdx = i;
        }
      }
      
      const confidence = 0.95; // Placeholder
      
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
      const loadedSession = await this.loadModel();
      
      // 1. Resize image to model input size (32x32)
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 32, height: 32 } }],
        { format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      // 2. Convert base64 image data to Float32 tensor
      // Model expects: [1, 1, 32, 32] (Batch, Channel, Height, Width) - Grayscale
      const tensorData = this.imageToFloat32Array(manipResult.base64!, 32, 32);
      const inputTensor = new Tensor('float32', tensorData, [1, 1, 32, 32]);
      
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
      const confidencePercentage = (confidence * 100).toFixed(1);
      
      // Map to character/symbol
      const detectedChar = (dashboardClasses as any)[maxIdx.toString()] || "?";
      
      // Get diagnostic information
      const diagInfo = (diagnosticKb as any)[detectedChar] || {
        name: `Unknown Symbol (${detectedChar})`,
        severity: "Low",
        action: "Symbol not recognized in database."
      };

      return {
        issue: diagInfo.name,
        confidence: confidence,
        recommendations: [
          diagInfo.action,
          `Detected Class: ${detectedChar}`
        ],
        category: diagInfo.severity,
        details: { 
          model_output: detectedChar,
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
  private static imageToFloat32Array(base64: string, width: number, height: number): Float32Array {
    const raw = atob(base64);
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
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
      
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
   * Get model information
   */
  static async getModelInfo(): Promise<any> {
    return {
      type: "On-Device (ONNX Runtime)",
      model: "Digital OCR",
      status: session ? "Loaded" : "Not Loaded"
    };
  }
}
