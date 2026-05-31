import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Surface, ProgressBar, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getQuestionsForState, getAllStates } from '../services/PermitTestService';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { useAuthStore } from '../store/authStore';
import { hasProAccess } from '../utils/access';
import ProGate from '../components/ProGate';

// Questions loaded from service

const PermitTestScreen = ({ navigation }: any) => {
  const { user } = useAuthStore();
  const canUse = hasProAccess(user);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const STATES = getAllStates();

  // Load questions when state is selected
  React.useEffect(() => {
    if (selectedState) {
        const q = getQuestionsForState(selectedState);
        setQuestions(q);
        setCurrentQuestion(0);
        setScore(0);
        setShowResult(false);
        setSelectedOption(null);
    }
  }, [selectedState]);

  if (!canUse) {
      return (
          <ProGate
            title="Permit Test"
            subtitle="Upgrade to Pro to access permit test practice."
            onUpgrade={() => navigation.navigate('Subscription')}
          />
      );
  }

  if (!selectedState) {
      return (
          <View style={styles.container}>
             <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
             <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                  <MaterialCommunityIcons name="chevron-left" size={30} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Select State</Text>
                <View style={{width: 30}} />
             </View>
             <ScrollView
               contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_HEIGHT + 24 }}
               onScroll={onScroll}
               onScrollBeginDrag={onScrollBeginDrag}
               onScrollEndDrag={onScrollEndDrag}
               scrollEventThrottle={16}
             >
                 <Text style={{color:'#94A3B8', marginBottom: 20}}>Choose your state to load specific practice questions.</Text>
                 {STATES.map((state) => (
                     <TouchableOpacity 
                        key={state} 
                        style={styles.stateCard}
                        onPress={() => setSelectedState(state)}
                     >
                         <Text style={styles.stateText}>{state}</Text>
                         <MaterialCommunityIcons name="chevron-right" size={24} color="#64748B" />
                     </TouchableOpacity>
                 ))}
             </ScrollView>
          </View>
      );
  }

  const handleAnswer = (index: number) => {
    setSelectedOption(index);
    // In PermitTestService, options are strings. We need to check if the selected text matches correctly.
    // Or we update service to store index? Service stores correct answer text.
    const selectedText = questions[currentQuestion].options[index];
    const correctText = questions[currentQuestion].correctAnswer;
    const isCorrect = selectedText === correctText;

    if (isCorrect) setScore(score + 1);

    setTimeout(() => {
        if (currentQuestion < questions.length - 1) {
            setCurrentQuestion(currentQuestion + 1);
            setSelectedOption(null);
        } else {
            setShowResult(true);
        }
    }, 1200);
  };

  const restart = () => {
      setScore(0);
      setCurrentQuestion(0);
      setShowResult(false);
      setSelectedOption(null);
      // Optional: keep selected state or reset? Let's keep it.
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSelectedState(null)} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{selectedState} Test</Text>
        <View style={{width: 30}} />
      </View>

      <View style={styles.content}>
          {!showResult && questions.length > 0 ? (
              <>
                <View style={styles.progressContainer}>
                    <Text style={styles.progressText}>Question {currentQuestion + 1} / {questions.length}</Text>
                    <ProgressBar progress={(currentQuestion + 1) / questions.length} color="#4ECDC4" style={{height: 6, borderRadius: 3}} />
                </View>

                <Surface style={styles.questionCard}>
                    <Text style={styles.questionText}>{questions[currentQuestion].question}</Text>
                </Surface>

                <View style={styles.optionsContainer}>
                    {questions[currentQuestion].options.map((opt: string, i: number) => {
                        const isSelected = selectedOption === i;
                        const isCorrect = opt === questions[currentQuestion].correctAnswer;
                        const isWrong = isSelected && !isCorrect;
                        
                        // Show correct answer if user selected wrong
                        const showCorrect = selectedOption !== null && isCorrect;

                        return (
                        <TouchableOpacity 
                            key={i} 
                            style={[
                                styles.optionButton, 
                                isSelected && isCorrect ? styles.correctOption : {},
                                isWrong ? styles.wrongOption : {},
                                showCorrect && !isSelected ? styles.correctOption : {}
                            ]}
                            onPress={() => !selectedOption && handleAnswer(i)}
                            disabled={selectedOption !== null}
                        >
                            <Text style={styles.optionText}>{opt}</Text>
                            {(isSelected || showCorrect) && (
                                <MaterialCommunityIcons 
                                    name={isCorrect ? "check-circle" : "close-circle"} 
                                    size={24} 
                                    color="white" 
                                />
                            )}
                        </TouchableOpacity>
                    )})}
                </View>
                
                {questions[currentQuestion].explanation && selectedOption !== null && (
                    <View style={{marginTop: 20, padding: 15, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10}}>
                         <Text style={{color:'#FFD700', fontWeight:'bold'}}>Explanation:</Text>
                         <Text style={{color:'white'}}>{questions[currentQuestion].explanation}</Text>
                    </View>
                )}
              </>
          ) : (
              <View style={styles.resultContainer}>
                  <MaterialCommunityIcons name="trophy" size={80} color="#FFD700" />
                  <Text style={styles.scoreTitle}>Test Completed!</Text>
                  <Text style={styles.scoreText}>You scored {score} out of {questions.length}</Text>
                  
                  <TouchableOpacity style={styles.restartButton} onPress={restart}>
                      <Text style={styles.restartText}>Try Again</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.homeButton} onPress={() => navigation.goBack()}>
                      <Text style={styles.homeText}>Back to Dashboard</Text>
                  </TouchableOpacity>
              </View>
          )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 30 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  backBtn: { padding: 5 },
  content: { flex: 1, paddingHorizontal: 20 },
  
  progressContainer: { marginBottom: 30 },
  progressText: { color: '#94A3B8', marginBottom: 10, fontWeight: 'bold' },
  
  questionCard: { backgroundColor: '#1E293B', padding: 25, borderRadius: 20, marginBottom: 30, borderWidth: 1, borderColor: '#334155' },
  questionText: { color: 'white', fontSize: 20, fontWeight: '600', lineHeight: 30 },
  
  optionsContainer: { gap: 15 },
  optionButton: { backgroundColor: '#334155', padding: 20, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  correctOption: { backgroundColor: '#10B981' },
  wrongOption: { backgroundColor: '#EF4444' },
  optionText: { color: 'white', fontSize: 16, fontWeight: '500' },
  
  resultContainer: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingBottom: 100 },
  scoreTitle: { color: 'white', fontSize: 32, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  scoreText: { color: '#94A3B8', fontSize: 18, marginBottom: 40 },
  restartButton: { backgroundColor: '#4ECDC4', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, marginBottom: 15, width: '100%', alignItems: 'center' },
  restartText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  homeButton: { padding: 15 },
  homeText: { color: '#64748B', fontWeight: 'bold' },
  stateCard: { backgroundColor: '#1E293B', padding: 20, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  stateText: { color: 'white', fontSize: 18, fontWeight: '600' }
});

export default PermitTestScreen;
