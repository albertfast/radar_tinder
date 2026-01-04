import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text, Surface, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

const AIDiagnoseScreen = ({ navigation }: any) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>(''); // 'uploading' | 'scanning' | 'analyzing'
  const [recording, setRecording] = useState<import('expo-av').Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceDescription, setVoiceDescription] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
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
      quality: 1,
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
    
    try {
      // Simulate steps for premium feel
      await new Promise(r => setTimeout(r, 1000));
      setLoadingStep('scanning');
      
      await new Promise(r => setTimeout(r, 1500));
      setLoadingStep('analyzing');
      
      await new Promise(r => setTimeout(r, 1500));

      // Lazy-load AI service to avoid native module crashes at app startup.
      const { AIService } = await import('../services/AIService');
      const result = await AIService.analyzeDashboardLight(selectedImage);
      
      const diagnosisText = `Based on the image analysis:
      
🔍 Detected Issue: ${result.issue}
📊 Confidence: ${result.confidence}%

Recommendations:
${result.recommendations.map(rec => `• ${rec}`).join('\n')}

This is a preliminary diagnosis. Please consult a professional mechanic for accurate assessment.`;
      
      setDiagnosis(diagnosisText);
      speakDiagnosis(`I've analyzed your car issue. It looks like ${result.issue} with ${result.confidence} percent confidence.`);
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert(
        'Error',
        'Failed to analyze image on-device. If this is your first run, rebuild the dev client so the AI module is included.'
      );
    } finally {
      setIsAnalyzing(false);
      setLoadingStep('');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Car Diagnose</Text>
        <IconButton 
          icon="volume-high" 
          iconColor="white" 
          onPress={() => diagnosis && speakDiagnosis(diagnosis)} 
          disabled={!diagnosis}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Upload a photo and describe the issue</Text>

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
            <Image source={{ uri: selectedImage }} style={styles.image} />
          </Surface>
        )}

        {/* Analyze Button */}
        {selectedImage && !diagnosis && (
          <TouchableOpacity 
            style={styles.analyzeButton} 
            onPress={analyzeImage}
            disabled={isAnalyzing}
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
                <Text style={styles.analyzeButtonText}>Analyze with AI</Text>
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
            <Text style={styles.diagnosisText}>{diagnosis}</Text>
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  subtitle: { color: '#8E8E93', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  voiceContainer: { backgroundColor: '#1C1C1E', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  micButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', marginBottom: 10, elevation: 5, shadowColor: '#2196F3', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10 },
  micButtonActive: { backgroundColor: '#FF5252', shadowColor: '#FF5252', transform: [{ scale: 1.1 }] },
  voiceHint: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
  transcriptionText: { color: '#2196F3', fontSize: 14, fontStyle: 'italic', marginTop: 15, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  actionButton: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, alignItems: 'center', marginHorizontal: 5, borderWidth: 1, borderColor: '#333' },
  actionButtonText: { color: 'white', marginTop: 10, fontWeight: '600' },
  imageContainer: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 10, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  image: { width: '100%', height: 300, borderRadius: 12 },
  analyzeButton: { backgroundColor: '#2196F3', borderRadius: 16, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  analyzeButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  diagnosisContainer: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#4CAF50' },
  diagnosisHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  diagnosisTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  diagnosisText: { color: '#E0E0E0', fontSize: 16, lineHeight: 24 },
  infoBox: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#333' },
  infoText: { color: '#8E8E93', fontSize: 14, flex: 1, marginLeft: 10, lineHeight: 20 }
});

export default AIDiagnoseScreen;
