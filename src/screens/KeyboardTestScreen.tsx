import React, { useEffect, useState, useRef } from 'react';
import { View, TextInput, StyleSheet, ScrollView, Text, Keyboard, Platform, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function KeyboardTestScreen() {
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState<string[]>([]);
  const renderCount = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Track render count on every render.
  renderCount.current += 1;

  const addLog = (msg: string) => {
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[KeyboardTest] ${msg}`);
    setLog(prev => [`${time}: ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    addLog(`MOUNTED. Initial Render Count: ${renderCount.current}`);

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', 
      (e) => addLog(`Keyboard SHOW event (Height: ${e.endCoordinates.height})`)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', 
      () => addLog('Keyboard HIDE event')
    );
    
    const appStateSub = AppState.addEventListener('change', (state) => {
        addLog(`AppState changed to: ${state}`);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      appStateSub.remove();
      addLog('UNMOUNTED');
    };
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={styles.header}>Keyboard Diagnostic Screen</Text>
      
      <View style={styles.statsBox}>
        <Text style={styles.statText}>Render Count: {renderCount.current}</Text>
        <Text style={styles.statText}>Platform: {Platform.OS}</Text>
      </View>

      <ScrollView 
        style={styles.logContainer} 
        contentContainerStyle={{ padding: 10 }}
        nestedScrollEnabled={true}
      >
        <Text style={styles.logTitle}>EVENT LOG:</Text>
        {log.map((l, i) => (
          <Text key={i} style={styles.logText}>{l}</Text>
        ))}
      </ScrollView>

      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={styles.formContainer} 
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        <Text style={styles.label}>Test 1: Standard RN TextInput</Text>
        <TextInput
          style={styles.input}
          placeholder="Tap here..."
          placeholderTextColor="#999"
          onFocus={() => addLog('Input 1 FOCUSED')}
          onBlur={() => addLog('Input 1 BLURRED (Focus Lost)')}
        />

        <Text style={styles.label}>Test 2: Lower Input in ScrollView</Text>
        <TextInput
          style={styles.input}
          placeholder="Lower input..."
          placeholderTextColor="#999"
          onFocus={() => addLog('Input 2 FOCUSED')}
          onBlur={() => addLog('Input 2 BLURRED')}
        />
        
        <View style={{ height: 300, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
            <Text>Spacer Area (for scroll testing)</Text>
        </View>

        <Text style={styles.label}>Test 3: Bottom Input</Text>
        <TextInput
          style={styles.input}
          placeholder="Bottom input..."
          placeholderTextColor="#999"
          onFocus={() => addLog('Input 3 FOCUSED')}
          onBlur={() => addLog('Input 3 BLURRED')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { fontSize: 22, fontWeight: 'bold', padding: 15, textAlign: 'center', backgroundColor: '#fff', elevation: 2 },
  statsBox: { flexDirection: 'row', justifyContent: 'space-around', padding: 10, backgroundColor: '#e0e0e0' },
  statText: { fontWeight: 'bold', color: '#333' },
  logContainer: { height: 150, backgroundColor: '#222', margin: 10, borderRadius: 8 },
  logTitle: { color: '#0f0', fontWeight: 'bold', marginBottom: 5 },
  logText: { color: '#fff', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
  formContainer: { padding: 20 },
  label: { marginTop: 15, marginBottom: 5, fontWeight: 'bold', color: '#333' },
  input: { 
    backgroundColor: 'white', 
    padding: 12, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#ccc', 
    fontSize: 16,
    color: '#000'
  },
});
