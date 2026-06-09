import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SubscriptionService } from '../services/SubscriptionService';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  LogBox,
  useWindowDimensions
} from 'react-native';
import { Text, Surface, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { useAuthStore } from '../store/authStore';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AdService } from '../services/AdService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIService, AIModelErrorCode } from '../services/AIService';

// Suppress specific warnings that might cause crashes
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'AsyncStorage has been extracted from react-native core',
  'Remote debugger is in a background tab',
]);

type DiagnosisPrediction = {
  rawLabel?: string;
  label: string;
  confidence: number;
  score?: number;
};

type DiagnosisOutput = {
  issue: string;
  confidence: number;
  recommendations: string[];
  category: string;
  details?: {
    top_predictions?: DiagnosisPrediction[];
    detected_lights?: Array<DiagnosisPrediction & { entry?: any }>;
    candidate_count?: number;
    strategy?: string;
  };
};

const AIDiagnoseScreen = ({ navigation }: any) => {
  const { user, normalizeAccessState } = useAuthStore();
  const canUse = true; // Unlocked for free users
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Show interstitial ad for free users when screen mounts
    AdService.showInterstitial('open_ai_diagnose').catch((err) => {
      console.warn('[AIDiagnose] Interstitial ad failed/skipped:', err);
    });
  }, []);
  const { width } = useWindowDimensions();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>(''); // 'uploading' | 'scanning' | 'analyzing'
  const [recording, setRecording] = useState<import('expo-av').Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceDescription, setVoiceDescription] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelErrorCode, setModelErrorCode] = useState<AIModelErrorCode | null>(null);
  const [modelDiagnostics, setModelDiagnostics] = useState<any | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const isMounted = useRef(true);
  const contentPadding = Math.max(16, Math.min(24, Math.round(width * 0.05)));
  const imageHeight = Math.max(220, Math.min(360, Math.round(width * 0.62)));
  const headerTitleSize = Math.max(22, Math.min(30, Math.round(width * 0.068)));
  const iconSize = Math.max(28, Math.min(34, Math.round(width * 0.08)));

  const formatPredictionLine = (item: DiagnosisPrediction) =>
    `${item.label} (${(item.confidence * 100).toFixed(1)}%)`;

  const buildSpeechSummary = (result: DiagnosisOutput) => {
    const confidencePct = (result.confidence * 100).toFixed(1);
    return `I've analyzed your dashboard image. Result is ${result.issue} with ${confidencePct} percent confidence.`;
  };

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  useFocusEffect(
    useCallback(() => {
      SubscriptionService.syncAccessState()
        .then(() => normalizeAccessState())
        .catch(() => {});
    }, [normalizeAccessState])
  );

  useEffect(() => {
    if (!canUse) return;

    const loadTimeout = setTimeout(() => {
      loadModels();
    }, Platform.OS === 'ios' ? 2000 : 500);

    return () => clearTimeout(loadTimeout);
  }, [canUse]);

  const loadModels = async () => {
    if (!isMounted.current || isModelLoading) return;
    
    setIsModelLoading(true);
    setModelError(null);
    setModelErrorCode(null);
    
    try {
      console.log('Loading AI models...');
      const runtime = await AIService.prepareDiagnosisRuntime();
      
      if (isMounted.current) {
        setModelDiagnostics(runtime.diagnostics || null);
        const dashboardReady = !!runtime.status.dashboardLoaded;
        setModelReady(Boolean(dashboardReady && runtime.ready));
        setModelError(
          dashboardReady
            ? null
            : (runtime.status.error || 'AI model could not be prepared. Please rebuild the app and try again.')
        );
      }
    } catch (error) {
      console.error('AI preload failed', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as any)?.code as AIModelErrorCode | undefined;
      
      if (isMounted.current) {
        setModelReady(false);
        setModelErrorCode(errorCode || null);
        setModelDiagnostics(AIService.getModelDiagnostics?.() || null);
        setModelError(`AI model could not be prepared: ${errorMessage}`);
      }
    } finally {
      if (isMounted.current) {
        setIsModelLoading(false);
      }
    }
  };

  const retryLoading = async () => {
    if (retryCount >= 3) {
      Alert.alert(
        'Model Loading Failed',
        'The AI model could not be loaded after multiple attempts. Please restart the app or contact support.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }
    
    setRetryCount(prev => prev + 1);
    await loadModels();
  };

  const startRecording = async () => {
    try {
      const { Audio } = await import('expo-av');
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(recording);
        setIsRecording(true);
      }
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Audio module unavailable. Rebuild the dev client to enable voice recording.');
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    
    // In a real app, we'd send this to a Whisper API or similar
    // For this "Wow" demo, we'll simulate transcription
    setVoiceDescription("Simulated transcription: 'My engine is making a clicking sound when I accelerate.'");
  };

  const speakDiagnosis = async (text: string) => {
    try {
      const Speech = await import('expo-speech');
      Speech.speak(text, {
        language: 'en',
        pitch: 1.0,
        rate: 0.9,
      });
    } catch (error) {
      console.warn('Speech module unavailable:', error);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setDiagnosis(null);
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Please allow access to your camera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setDiagnosis(null);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage) return;

    setIsAnalyzing(true);
    setLoadingStep('uploading');
    setModelError(null);
    setModelErrorCode(null);
    
    try {
      // Simulate steps for premium feel
      await new Promise(r => setTimeout(r, 1000));
      setLoadingStep('scanning');
      
      await new Promise(r => setTimeout(r, 1500));
      setLoadingStep('analyzing');
      
      await new Promise(r => setTimeout(r, 1500));

      // Model durumunu kontrol et - iOS için daha güvenli kontrol
      let modelStatus;
      try {
        modelStatus = AIService.getModelStatus();
        setModelDiagnostics(AIService.getModelDiagnostics?.() || null);
      } catch (statusError) {
        console.warn('Could not get model status, proceeding with analysis:', statusError);
        modelStatus = { ocrLoaded: true, dashboardLoaded: true };
      }
      
      if (!modelStatus.dashboardLoaded) {
        throw new Error('AI models are not ready. Please wait and try again.');
      }
      
      console.log('Starting analysis...');
      const result = (await AIService.analyzeDashboardLight(selectedImage)) as DiagnosisOutput;
      if (!isMounted.current) return;
      setModelDiagnostics(AIService.getModelDiagnostics?.() || null);

      const issueLabel = (result.issue || '').toLowerCase();
      if (result.category === 'Error' || issueLabel.includes('fail')) {
        const modelErrorCode = (result.details as any)?.code;
        const message =
          modelErrorCode === 'native_module_missing'
            ? 'This build is missing ONNX Runtime native module. Rebuild and reinstall the app.'
            : modelErrorCode === 'file_corrupt'
              ? 'Model cache appears corrupted. Use reset/retry and preload models again.'
              : modelErrorCode === 'model_uri_invalid'
                ? 'Model is not resolving from embedded app assets. Install an internal/release build and retry.'
                : 'AI model could not be prepared from local app assets.';
        setModelErrorCode((modelErrorCode as AIModelErrorCode) || null);
        setModelError(message);
        Alert.alert('Model failed to load', message);
        return;
      }
      setModelReady(true);
      
      if (!isMounted.current) return;
      setDiagnosis(result);
      speakDiagnosis(buildSpeechSummary(result));
    } catch (error) {
      if (!isMounted.current) return;
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as any)?.code as AIModelErrorCode | undefined;
      setModelErrorCode(errorCode || null);
      
      // Daha iyi hata yönetimi
      if (errorMessage.includes('already loading')) {
        setModelError('AI model is currently loading. Please wait a moment and try again.');
      } else {
        setModelError(`Analysis failed: ${errorMessage}`);
      }
      
      // iOS için daha az agresif hata gösterimi
      if (Platform.OS === 'ios') {
        console.log('iOS analysis error handled gracefully:', errorMessage);
      }
      
      Alert.alert(
        'Analysis Failed',
        errorMessage.includes('already loading')
          ? 'AI model is currently loading. Please wait and try again.'
          : 'Failed to analyze image. Please try again.'
      );
    } finally {
      setIsAnalyzing(false);
      setLoadingStep('');
    }
  };



  return (
    <ErrorBoundary>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: contentPadding }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={iconSize} color="white" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>AI Car Diagnose</Text>
        <IconButton 
          icon="volume-high" 
          iconColor="white" 
          onPress={() => diagnosis && speakDiagnosis(buildSpeechSummary(diagnosis))}
          disabled={!diagnosis}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: contentPadding,
            paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24
          }
        ]}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
      >
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.subtitle}>Upload a photo and describe the issue</Text>
          <Text style={[styles.modelStatus, { color: modelReady ? '#22c55e' : (isModelLoading ? '#F59E0B' : '#94A3B8') }]}>
            {modelReady ? '✓ On-device model ready' :
             isModelLoading ? '⏳ Loading AI models...' :
             '⏳ Preparing on-device model...'}
          </Text>
          {modelDiagnostics ? (
            <Text style={styles.modelDebugText}>
              native module: {modelDiagnostics?.nativeModuleAvailable === true ? 'available' : modelDiagnostics?.nativeModuleAvailable === false ? 'missing' : 'unknown'}
            </Text>
          ) : null}
          {modelDiagnostics?.lastErrorCode ? (
            <Text style={styles.modelDebugText}>
              Last model error: {modelDiagnostics.lastErrorCode}
            </Text>
          ) : null}
        </View>
        {modelError && (
          <Surface style={[styles.infoBox, { borderColor: '#FF6B6B', marginBottom: 14 }]} elevation={1}>
            <MaterialCommunityIcons name="alert" size={24} color="#FF6B6B" />
            <Text style={[styles.infoText, { color: '#FCA5A5' }]}>{modelError}</Text>
            {modelErrorCode ? (
              <Text style={styles.modelDebugText}>
                error code: {modelErrorCode}
              </Text>
            ) : null}
            {modelDiagnostics ? (
              <Text style={styles.modelDebugText}>
                dashboard: {modelDiagnostics?.dashboard?.loaded ? 'loaded' : 'not-loaded'} ({modelDiagnostics?.dashboard?.sizeBytes || 0} B) | ocr: {modelDiagnostics?.ocr?.loaded ? 'loaded' : 'not-loaded'} ({modelDiagnostics?.ocr?.sizeBytes || 0} B)
              </Text>
            ) : null}
            <TouchableOpacity onPress={retryLoading} style={{ marginTop: 10 }}>
              <Text style={{ color: '#2196F3', fontWeight: '600' }}>Try Again</Text>
            </TouchableOpacity>
          </Surface>
        )}

        {/* Voice Recording Section */}
        <Surface style={styles.voiceContainer} elevation={2}>
          <TouchableOpacity 
            style={[styles.micButton, isRecording && styles.micButtonActive]} 
            onPressIn={startRecording}
            onPressOut={stopRecording}
          >
            <MaterialCommunityIcons 
              name={isRecording ? "microphone" : "microphone-outline"} 
              size={40} 
              color="white" 
            />
          </TouchableOpacity>
          <Text style={styles.voiceHint}>
            {isRecording ? "Listening..." : "Hold to describe the issue"}
          </Text>
          {voiceDescription && (
            <Text style={styles.transcriptionText}>{voiceDescription}</Text>
          )}
        </Surface>

        {/* Image Selection Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
            <MaterialCommunityIcons name="camera" size={32} color="#2196F3" />
            <Text style={styles.actionButtonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={pickImage}>
            <MaterialCommunityIcons name="image" size={32} color="#2196F3" />
            <Text style={styles.actionButtonText}>Choose Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Image Preview */}
        {selectedImage && (
          <Surface style={styles.imageContainer} elevation={2}>
            <Image source={{ uri: selectedImage }} style={[styles.image, { height: imageHeight }]} />
          </Surface>
        )}

        {/* Analyze Button */}
        {selectedImage && !diagnosis && (
          <TouchableOpacity
            style={[styles.analyzeButton, (isAnalyzing || !modelReady) && styles.analyzeButtonDisabled]}
            onPress={analyzeImage}
            disabled={isAnalyzing || !modelReady}
          >
            {isAnalyzing ? (
              <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                  <ActivityIndicator color="white" />
                  <Text style={{color:'white', fontWeight:'600'}}>
                      {loadingStep === 'uploading' && "Uploading Image..."}
                      {loadingStep === 'scanning' && "Scanning Components..."}
                      {loadingStep === 'analyzing' && "Diagnosing Issue..."}
                  </Text>
              </View>
            ) : (
              <>
                <MaterialCommunityIcons name="brain" size={24} color="white" />
                <Text style={styles.analyzeButtonText}>
                  {modelReady ? "Analyze with AI" : "Loading AI..."}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Diagnosis Result */}
        {diagnosis && (
          <Surface style={styles.diagnosisContainer} elevation={3}>
            <View style={styles.diagnosisHeader}>
              <MaterialCommunityIcons name="check-circle" size={32} color="#4CAF50" />
              <Text style={styles.diagnosisTitle}>Analysis Complete</Text>
            </View>
            <Text style={styles.diagnosisText}>
              🔍 Detected Issue: {diagnosis.issue}{'\n'}
              📊 Confidence: {(diagnosis.confidence * 100).toFixed(1)}%
            </Text>
            {(diagnosis.details?.detected_lights || []).length >= 2 && (
              <View style={styles.resultBlock}>
                <Text style={styles.resultBlockTitle}>Detected lights</Text>
                {(diagnosis.details?.detected_lights || []).slice(0, 4).map((item, idx) => (
                  <Text key={`${item.label}-${idx}`} style={styles.resultLine}>
                    • {formatPredictionLine(item)}
                  </Text>
                ))}
              </View>
            )}
            {(diagnosis.details?.top_predictions || []).length > 0 && (
              <View style={styles.resultBlock}>
                <Text style={styles.resultBlockTitle}>Top predictions</Text>
                {(diagnosis.details?.top_predictions || []).slice(0, 3).map((item, idx) => (
                  <Text key={`${item.label}-${idx}`} style={styles.resultLine}>
                    • {formatPredictionLine(item)}
                  </Text>
                ))}
              </View>
            )}
            {diagnosis.recommendations?.length > 0 && (
              <View style={styles.resultBlock}>
                <Text style={styles.resultBlockTitle}>Recommendations</Text>
                {diagnosis.recommendations.map((line, idx) => (
                  <Text key={`rec-${idx}`} style={styles.resultLine}>• {line}</Text>
                ))}
              </View>
            )}
            <Text style={[styles.resultLine, { marginTop: 12 }]}>
              This is a preliminary diagnosis. Please consult a professional mechanic for accurate assessment.
            </Text>
          </Surface>
        )}

        {/* Info Box */}
        <Surface style={styles.infoBox} elevation={1}>
          <MaterialCommunityIcons name="information" size={24} color="#2196F3" />
          <Text style={styles.infoText}>
            Our AI model can detect common car issues like oil leaks, tire damage, brake problems, and more. 
            For best results, take clear photos in good lighting.
          </Text>
        </Surface>

        {/* Warning Disclaimer Box */}
        <Surface style={[styles.infoBox, { borderColor: '#EAB308', marginTop: 14, borderWidth: 1 }]} elevation={1}>
          <MaterialCommunityIcons name="alert-circle" size={24} color="#EAB308" />
          <Text style={[styles.infoText, { color: '#FADF7F' }]}>
            AI can make mistakes. Please verify important information and consult a professional mechanic.
          </Text>
        </Surface>

      </ScrollView>
    </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontWeight: 'bold', color: 'white' },
  content: { paddingBottom: 40 },
  subtitle: { color: '#8E8E93', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  modelStatus: { textAlign: 'center', fontSize: 13, fontWeight: '600' },
  modelDebugText: { color: '#94A3B8', fontSize: 12, marginTop: 6, textAlign: 'center' },
  voiceContainer: { backgroundColor: '#1C1C1E', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  micButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', marginBottom: 10, elevation: 5 },
  micButtonActive: { backgroundColor: '#FF5252', transform: [{ scale: 1.1 }] },
  voiceHint: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
  transcriptionText: { color: '#2196F3', fontSize: 14, fontStyle: 'italic', marginTop: 15, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  actionButton: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, alignItems: 'center', marginHorizontal: 5, borderWidth: 1, borderColor: '#333', minHeight: 100, justifyContent: 'center' },
  actionButtonText: { color: 'white', marginTop: 10, fontWeight: '600' },
  imageContainer: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 10, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  image: { width: '100%', borderRadius: 12 },
  analyzeButton: { backgroundColor: '#2196F3', borderRadius: 16, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, minHeight: 56 },
  analyzeButtonDisabled: { backgroundColor: '#666', opacity: 0.7 },
  analyzeButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  diagnosisContainer: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4CAF50', minHeight: 150 },
  diagnosisHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  diagnosisTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  diagnosisText: { color: '#E0E0E0', fontSize: 16, lineHeight: 24, marginBottom: 10 },
  resultBlock: { marginTop: 8 },
  resultBlockTitle: { color: '#F8FAFC', fontWeight: '700', marginBottom: 4 },
  resultLine: { color: '#CBD5E1', fontSize: 14, lineHeight: 21 },
  infoBox: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#333', minHeight: 80 },
  infoText: { color: '#8E8E93', fontSize: 14, flex: 1, marginLeft: 10, lineHeight: 20 },
  adContainer: {
    marginTop: 14,
    marginBottom: 4,
    alignItems: 'center',
  },
});

export default AIDiagnoseScreen;
