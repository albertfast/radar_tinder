import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, ProgressBar, Surface, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getPermitCategories,
  getPermitCategoryCounts,
  getPermitQuestionOptions,
  getPermitQuestions,
  getPermitStates,
  getRandomPermitQuestions,
  getUserPermitTestHistory,
  saveCompletedPermitTest,
} from '../services/PermitTestService';
import { useAutoHideTabBar } from '../hooks/use-auto-hide-tab-bar';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { useAuthStore } from '../store/authStore';
import { hasProAccess } from '../utils/access';
import ProGate from '../components/ProGate';
import {
  PermitAnswerKey,
  PermitCategory,
  PermitQuestion,
  PermitQuizMode,
  PermitQuizResult,
  PermitState,
  PermitTestAttempt,
  VehicleCategory,
} from '../types/permit';

const TEST_QUESTION_COUNT = 20;
const PASSING_PERCENT = 80;

const MODE_OPTIONS: Array<{
  key: PermitQuizMode;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  {
    key: 'practice',
    label: 'Practice',
    description: 'Instant feedback after each answer',
    icon: 'lightbulb-on-outline',
  },
  {
    key: 'exam',
    label: 'Exam',
    description: 'Answers reviewed at the end',
    icon: 'clipboard-check-outline',
  },
  {
    key: 'study',
    label: 'Study',
    description: 'Read questions with answers',
    icon: 'book-open-page-variant',
  },
];

const CATEGORY_COPY: Record<VehicleCategory, { label: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  car: {
    label: 'Car',
    subtitle: 'Standard DMV permit questions',
    icon: 'car',
  },
  motorcycle: {
    label: 'Motorcycle',
    subtitle: 'Rider permit practice',
    icon: 'motorbike',
  },
  cdl: {
    label: 'CDL / Truck',
    subtitle: 'Commercial driver questions',
    icon: 'truck',
  },
};

const formatSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
};

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getCategoryMeta = (category: PermitCategory) =>
  CATEGORY_COPY[category.code] || {
    label: category.name,
    subtitle: category.description || 'Permit practice questions',
    icon: 'clipboard-text-outline' as keyof typeof MaterialCommunityIcons.glyphMap,
  };

const calculateResult = (
  questions: PermitQuestion[],
  answers: Record<string, PermitAnswerKey>,
  startTime: number,
): PermitQuizResult => {
  const resultAnswers = questions.map((question) => {
    const selectedAnswer = answers[question.id] || null;
    return {
      question,
      selectedAnswer,
      isCorrect: selectedAnswer === question.correct_answer,
    };
  });
  const correctCount = resultAnswers.filter((answer) => answer.isCorrect).length;
  const total = questions.length;

  return {
    score: total > 0 ? Math.round((correctCount / total) * 100) : 0,
    total,
    correctCount,
    timeTakenSeconds: Math.max(0, Math.round((Date.now() - startTime) / 1000)),
    answers: resultAnswers,
  };
};

const PermitTestScreen = ({ navigation }: any) => {
  const { user } = useAuthStore();
  const canUse = hasProAccess(user);
  const { onScroll, onScrollBeginDrag, onScrollEndDrag } = useAutoHideTabBar();

  const [states, setStates] = useState<PermitState[]>([]);
  const [categories, setCategories] = useState<PermitCategory[]>([]);
  const [history, setHistory] = useState<PermitTestAttempt[]>([]);
  const [selectedState, setSelectedState] = useState<PermitState | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PermitCategory | null>(null);
  const [mode, setMode] = useState<PermitQuizMode>('practice');
  const [questions, setQuestions] = useState<PermitQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, PermitAnswerKey>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [result, setResult] = useState<PermitQuizResult | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isCountsLoading, setIsCountsLoading] = useState(false);
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const loadInitialData = useCallback(async () => {
    setIsInitialLoading(true);
    setErrorMessage(null);
    try {
      const [nextStates, nextCategories, nextHistory] = await Promise.all([
        getPermitStates(),
        getPermitCategories(),
        user?.id ? getUserPermitTestHistory(user.id).catch(() => []) : Promise.resolve([]),
      ]);
      setStates(nextStates);
      setCategories(nextCategories);
      setHistory(nextHistory);
    } catch (error) {
      console.warn('[PermitTestScreen] Failed to load permit data:', error);
      setErrorMessage('Permit test data could not be loaded. Check Supabase configuration and RLS policies.');
    } finally {
      setIsInitialLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (canUse) {
      loadInitialData();
    }
  }, [canUse, loadInitialData]);

  useEffect(() => {
    if (!selectedCategory || result || questions.length === 0 || mode === 'study') return;

    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startTime) / 1000)));
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, questions.length, result, selectedCategory, startTime]);

  const filteredStates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return states;
    return states.filter((state) =>
      `${state.name} ${state.code}`.toLowerCase().includes(query),
    );
  }, [searchQuery, states]);

  const currentQuestionData = questions[currentQuestion] || null;
  const currentAnswer = currentQuestionData ? answers[currentQuestionData.id] || null : null;
  const answeredCount = Object.keys(answers).length;

  const loadCategoryCounts = useCallback(
    async (state: PermitState) => {
      setIsCountsLoading(true);
      setCategoryCounts({});
      try {
        const counts = await getPermitCategoryCounts(state.code, categories);
        setCategoryCounts(
          counts.reduce<Record<string, number>>((acc, item) => {
            acc[item.categoryCode] = item.count;
            return acc;
          }, {}),
        );
      } catch (error) {
        console.warn('[PermitTestScreen] Failed to load category counts:', error);
      } finally {
        setIsCountsLoading(false);
      }
    },
    [categories],
  );

  const selectState = useCallback(
    (state: PermitState) => {
      setSelectedState(state);
      setSelectedCategory(null);
      setQuestions([]);
      setAnswers({});
      setResult(null);
      setCurrentQuestion(0);
      setSaveStatus(null);
      setErrorMessage(null);
      loadCategoryCounts(state);
    },
    [loadCategoryCounts],
  );

  const resetToStates = useCallback(() => {
    setSelectedState(null);
    setSelectedCategory(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setCurrentQuestion(0);
    setSaveStatus(null);
    setErrorMessage(null);
  }, []);

  const resetToCategories = useCallback(() => {
    setSelectedCategory(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setCurrentQuestion(0);
    setSaveStatus(null);
    setErrorMessage(null);
  }, []);

  const startQuiz = useCallback(
    async (category: PermitCategory) => {
      if (!selectedState) return;

      setSelectedCategory(category);
      setIsQuestionsLoading(true);
      setQuestions([]);
      setAnswers({});
      setResult(null);
      setCurrentQuestion(0);
      setSaveStatus(null);
      setErrorMessage(null);

      try {
        const nextQuestions =
          mode === 'study'
            ? await getPermitQuestions(selectedState.code, category.code)
            : await getRandomPermitQuestions(selectedState.code, category.code, TEST_QUESTION_COUNT);

        if (nextQuestions.length === 0) {
          setSelectedCategory(null);
          setErrorMessage(`No ${getCategoryMeta(category).label} questions are available for ${selectedState.name} yet.`);
          return;
        }

        setQuestions(nextQuestions);
        setStartTime(Date.now());
        setElapsedSeconds(0);
      } catch (error) {
        console.warn('[PermitTestScreen] Failed to start quiz:', error);
        setSelectedCategory(null);
        setErrorMessage('Questions could not be loaded from Supabase.');
      } finally {
        setIsQuestionsLoading(false);
      }
    },
    [mode, selectedState],
  );

  const finishQuiz = useCallback(
    async (nextAnswers: Record<string, PermitAnswerKey> = answers) => {
      if (!selectedState || !selectedCategory || questions.length === 0) return;

      const nextResult = calculateResult(questions, nextAnswers, startTime);
      setResult(nextResult);
      setSaveStatus(null);

      if (!user?.id || mode === 'study') return;

      try {
        const saved = await saveCompletedPermitTest({
          userId: user.id,
          state: selectedState,
          category: selectedCategory,
          score: nextResult.score,
          totalQuestions: nextResult.total,
          correctCount: nextResult.correctCount,
          timeTakenSeconds: nextResult.timeTakenSeconds,
          answers: nextResult.answers.map((answer) => ({
            questionId: answer.question.id,
            selectedAnswer: answer.selectedAnswer,
            isCorrect: answer.isCorrect,
          })),
        });
        setHistory((prev) => [saved, ...prev].slice(0, 20));
        setSaveStatus('Saved to history');
      } catch (error) {
        console.warn('[PermitTestScreen] Failed to save test attempt:', error);
        setSaveStatus('Result saved locally for this session, but Supabase history write failed.');
      }
    },
    [answers, mode, questions, selectedCategory, selectedState, startTime, user?.id],
  );

  const handleAnswer = useCallback(
    (answer: PermitAnswerKey) => {
      if (!currentQuestionData || answers[currentQuestionData.id]) return;

      const nextAnswers = {
        ...answers,
        [currentQuestionData.id]: answer,
      };
      setAnswers(nextAnswers);
    },
    [answers, currentQuestionData],
  );

  const goToNextQuestion = useCallback(() => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      return;
    }
    finishQuiz();
  }, [currentQuestion, finishQuiz, questions.length]);

  const restartQuiz = useCallback(() => {
    if (selectedCategory) {
      startQuiz(selectedCategory);
    }
  }, [selectedCategory, startQuiz]);

  if (!canUse) {
    return (
      <ProGate
        title="Permit Test"
        subtitle="Upgrade to Pro to practice real DMV permit questions by state and vehicle type."
        onUpgrade={() => navigation.navigate('Subscription')}
      />
    );
  }

  const renderHeader = (title: string, subtitle: string, onBack: () => void) => (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerButton} activeOpacity={0.85}>
        <MaterialCommunityIcons name="chevron-left" size={30} color="#F8FAFC" />
      </TouchableOpacity>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <TouchableOpacity onPress={loadInitialData} style={styles.headerButton} activeOpacity={0.85}>
        <MaterialCommunityIcons name="refresh" size={22} color="#4ECDC4" />
      </TouchableOpacity>
    </View>
  );

  const renderInitialLoading = () => (
    <View style={styles.centerState}>
      <ActivityIndicator color="#4ECDC4" size="large" />
      <Text style={styles.centerTitle}>Loading permit tests</Text>
      <Text style={styles.centerText}>Fetching states, categories, and your recent attempts.</Text>
    </View>
  );

  const renderError = () =>
    errorMessage ? (
      <View style={styles.errorBox}>
        <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#FACC15" />
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    ) : null;

  const renderStateSelection = () => (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
      {renderHeader('Permit Test Prep', 'Real DMV practice by state', () => navigation.goBack())}

      {isInitialLoading ? (
        renderInitialLoading()
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {renderError()}

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            mode="outlined"
            placeholder="Search state"
            placeholderTextColor="#64748B"
            left={<TextInput.Icon icon="magnify" color="#94A3B8" />}
            outlineColor="rgba(148,163,184,0.25)"
            activeOutlineColor="#4ECDC4"
            textColor="#F8FAFC"
            style={styles.searchInput}
            theme={{ colors: { background: 'rgba(15,23,42,0.92)' } }}
          />

          {history.length > 0 ? (
            <Surface style={styles.historyPanel}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Results</Text>
                <Text style={styles.sectionHint}>{history.length}</Text>
              </View>
              {history.slice(0, 3).map((attempt) => (
                <View key={attempt.id} style={styles.historyRow}>
                  <View style={styles.historyIcon}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#4ECDC4" />
                  </View>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyTitle}>
                      {attempt.permit_states?.code || 'State'} · {attempt.permit_categories?.name || 'Permit Test'}
                    </Text>
                    <Text style={styles.historySub}>
                      {attempt.correct_count}/{attempt.total_questions} correct · {formatDate(attempt.created_at)}
                    </Text>
                  </View>
                  <Text style={[styles.historyScore, { color: Number(attempt.score || 0) >= PASSING_PERCENT ? '#4ECDC4' : '#FF6B6B' }]}>
                    {attempt.score ?? 0}%
                  </Text>
                </View>
              ))}
            </Surface>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Select State</Text>
            <Text style={styles.sectionHint}>{filteredStates.length} available</Text>
          </View>

          {filteredStates.map((state) => (
            <TouchableOpacity
              key={state.id}
              style={styles.stateCard}
              onPress={() => selectState(state)}
              activeOpacity={0.86}
            >
              <View style={styles.stateCodeBadge}>
                <Text style={styles.stateCodeText}>{state.code}</Text>
              </View>
              <View style={styles.stateCopy}>
                <Text style={styles.stateText}>{state.name}</Text>
                <Text style={styles.stateSub}>Car, motorcycle, and CDL categories</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#64748B" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderCategorySelection = () => {
    if (!selectedState) return null;

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
        {renderHeader(selectedState.name, 'Choose vehicle type and test mode', resetToStates)}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {renderError()}

          <Surface style={styles.modePanel}>
            <Text style={styles.sectionTitle}>Mode</Text>
            <View style={styles.modeGrid}>
              {MODE_OPTIONS.map((item) => {
                const isActive = mode === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.modeCard, isActive && styles.modeCardActive]}
                    onPress={() => setMode(item.key)}
                    activeOpacity={0.86}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={22}
                      color={isActive ? '#020617' : '#4ECDC4'}
                    />
                    <Text style={[styles.modeTitle, isActive && styles.modeTitleActive]}>{item.label}</Text>
                    <Text style={[styles.modeSub, isActive && styles.modeSubActive]}>{item.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Surface>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vehicle Type</Text>
            <Text style={styles.sectionHint}>{isCountsLoading ? 'Counting...' : 'Supabase live data'}</Text>
          </View>

          {categories.map((category) => {
            const meta = getCategoryMeta(category);
            const count = categoryCounts[category.code] ?? 0;
            const disabled = isCountsLoading || count === 0;
            return (
              <TouchableOpacity
                key={category.id}
                style={[styles.categoryCard, disabled && styles.cardDisabled]}
                onPress={() => !disabled && startQuiz(category)}
                disabled={disabled}
                activeOpacity={0.86}
              >
                <LinearGradient
                  colors={disabled ? ['rgba(30,41,59,0.74)', 'rgba(15,23,42,0.74)'] : ['rgba(15,118,110,0.28)', 'rgba(15,23,42,0.95)']}
                  style={styles.categoryGradient}
                >
                  <View style={styles.categoryIcon}>
                    <MaterialCommunityIcons name={meta.icon} size={28} color={disabled ? '#64748B' : '#4ECDC4'} />
                  </View>
                  <View style={styles.categoryCopy}>
                    <Text style={styles.categoryTitle}>{meta.label}</Text>
                    <Text style={styles.categorySub}>{category.description || meta.subtitle}</Text>
                  </View>
                  <View style={styles.countBadge}>
                    {isCountsLoading ? (
                      <ActivityIndicator color="#94A3B8" size="small" />
                    ) : (
                      <>
                        <Text style={styles.countValue}>{count}</Text>
                        <Text style={styles.countLabel}>questions</Text>
                      </>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderQuestionOptions = (question: PermitQuestion) => {
    const options = getPermitQuestionOptions(question);
    return (
      <View style={styles.optionsContainer}>
        {options.map((option) => {
          const isSelected = currentAnswer === option.key;
          const isCorrect = option.key === question.correct_answer;
          const revealAnswer = mode === 'practice' && currentAnswer !== null;
          const isWrong = revealAnswer && isSelected && !isCorrect;
          const showCorrect = revealAnswer && isCorrect;

          return (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionButton,
                isSelected && styles.selectedOption,
                showCorrect && styles.correctOption,
                isWrong && styles.wrongOption,
              ]}
              onPress={() => handleAnswer(option.key)}
              disabled={currentAnswer !== null}
              activeOpacity={0.86}
            >
              <View style={styles.optionKey}>
                <Text style={styles.optionKeyText}>{option.key}</Text>
              </View>
              <Text style={styles.optionText}>{option.text}</Text>
              {revealAnswer && (isSelected || showCorrect) ? (
                <MaterialCommunityIcons
                  name={isCorrect ? 'check-circle' : 'close-circle'}
                  size={22}
                  color="#F8FAFC"
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderQuiz = () => {
    if (!selectedState || !selectedCategory) return null;

    if (isQuestionsLoading) {
      return (
        <View style={styles.container}>
          <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
          {renderHeader(selectedState.name, getCategoryMeta(selectedCategory).label, resetToCategories)}
          {renderInitialLoading()}
        </View>
      );
    }

    if (mode === 'study') {
      return renderStudyMode();
    }

    if (result) {
      return renderResult();
    }

    if (!currentQuestionData) {
      return renderCategorySelection();
    }

    const progress = questions.length > 0 ? (currentQuestion + 1) / questions.length : 0;
    const canContinue = currentAnswer !== null;

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
        {renderHeader(selectedState.name, `${getCategoryMeta(selectedCategory).label} · ${mode.toUpperCase()}`, resetToCategories)}

        <ScrollView
          contentContainerStyle={styles.quizContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressContainer}>
            <View style={styles.progressTop}>
              <Text style={styles.progressText}>Question {currentQuestion + 1} / {questions.length}</Text>
              <Text style={styles.timerText}>{formatSeconds(elapsedSeconds)}</Text>
            </View>
            <ProgressBar progress={progress} color="#4ECDC4" style={styles.progressBar} />
          </View>

          <Surface style={styles.questionCard}>
            <View style={styles.questionMetaRow}>
              <Text style={styles.questionNumber}>#{currentQuestionData.question_number}</Text>
              <Text style={styles.questionDifficulty}>{currentQuestionData.difficulty || 'medium'}</Text>
            </View>
            <Text style={styles.questionText}>{currentQuestionData.question_text}</Text>
          </Surface>

          {renderQuestionOptions(currentQuestionData)}

          {mode === 'practice' && currentAnswer && currentQuestionData.explanation ? (
            <Surface style={styles.explanationBox}>
              <Text style={styles.explanationTitle}>Explanation</Text>
              <Text style={styles.explanationText}>{currentQuestionData.explanation}</Text>
            </Surface>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
            onPress={goToNextQuestion}
            disabled={!canContinue}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryButtonText}>
              {currentQuestion < questions.length - 1 ? 'Next Question' : 'Finish Test'}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#020617" />
          </TouchableOpacity>

          <Text style={styles.answeredText}>{answeredCount} of {questions.length} answered</Text>
        </ScrollView>
      </View>
    );
  };

  const renderStudyMode = () => {
    if (!selectedState || !selectedCategory) return null;
    const categoryMeta = getCategoryMeta(selectedCategory);

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
        {renderHeader(selectedState.name, `${categoryMeta.label} study cards`, resetToCategories)}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{questions.length} Study Questions</Text>
            <Text style={styles.sectionHint}>Answers visible</Text>
          </View>

          {questions.map((question, index) => (
            <Surface key={question.id} style={styles.studyCard}>
              <Text style={styles.studyIndex}>Question {index + 1}</Text>
              <Text style={styles.studyQuestion}>{question.question_text}</Text>
              <View style={styles.studyOptions}>
                {getPermitQuestionOptions(question).map((option) => {
                  const isCorrect = option.key === question.correct_answer;
                  return (
                    <View key={option.key} style={[styles.studyOption, isCorrect && styles.studyCorrectOption]}>
                      <Text style={[styles.studyOptionKey, isCorrect && styles.studyCorrectText]}>{option.key}</Text>
                      <Text style={[styles.studyOptionText, isCorrect && styles.studyCorrectText]}>{option.text}</Text>
                    </View>
                  );
                })}
              </View>
              {question.explanation ? (
                <Text style={styles.studyExplanation}>{question.explanation}</Text>
              ) : null}
            </Surface>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderResult = () => {
    if (!selectedState || !selectedCategory || !result) return null;
    const passed = result.score >= PASSING_PERCENT;

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F172A', '#020617']} style={StyleSheet.absoluteFill} />
        {renderHeader('Test Result', `${selectedState.code} · ${getCategoryMeta(selectedCategory).label}`, resetToCategories)}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <Surface style={styles.resultHero}>
            <MaterialCommunityIcons
              name={passed ? 'trophy' : 'refresh-circle'}
              size={62}
              color={passed ? '#FACC15' : '#FF6B6B'}
            />
            <Text style={styles.resultTitle}>{passed ? 'Passed' : 'Keep Practicing'}</Text>
            <Text style={[styles.resultScore, { color: passed ? '#4ECDC4' : '#FF6B6B' }]}>{result.score}%</Text>
            <Text style={styles.resultSub}>
              {result.correctCount} of {result.total} correct · {formatSeconds(result.timeTakenSeconds)}
            </Text>
            {saveStatus ? <Text style={styles.saveStatus}>{saveStatus}</Text> : null}
          </Surface>

          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={restartQuiz} activeOpacity={0.88}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
              <MaterialCommunityIcons name="refresh" size={20} color="#020617" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={resetToCategories} activeOpacity={0.88}>
              <Text style={styles.secondaryButtonText}>Change Category</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Review</Text>
            <Text style={styles.sectionHint}>{result.answers.filter((answer) => !answer.isCorrect).length} missed</Text>
          </View>

          {result.answers.map((answer, index) => {
            const selectedText =
              getPermitQuestionOptions(answer.question).find((option) => option.key === answer.selectedAnswer)?.text || 'No answer';
            const correctText =
              getPermitQuestionOptions(answer.question).find((option) => option.key === answer.question.correct_answer)?.text || '';

            return (
              <Surface key={answer.question.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewIndex}>Question {index + 1}</Text>
                  <MaterialCommunityIcons
                    name={answer.isCorrect ? 'check-circle' : 'close-circle'}
                    size={20}
                    color={answer.isCorrect ? '#4ECDC4' : '#FF6B6B'}
                  />
                </View>
                <Text style={styles.reviewQuestion}>{answer.question.question_text}</Text>
                <Text style={styles.reviewLine}>Your answer: {selectedText}</Text>
                {!answer.isCorrect ? <Text style={styles.reviewCorrect}>Correct: {correctText}</Text> : null}
                {answer.question.explanation ? (
                  <Text style={styles.reviewExplanation}>{answer.question.explanation}</Text>
                ) : null}
              </Surface>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  if (!selectedState) return renderStateSelection();
  if (!selectedCategory) return renderCategorySelection();
  return renderQuiz();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 18,
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#4ECDC4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: TAB_BAR_HEIGHT + 26,
    gap: 12,
  },
  quizContent: {
    paddingHorizontal: 16,
    paddingBottom: TAB_BAR_HEIGHT + 26,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  centerTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 16,
  },
  centerText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.28)',
    backgroundColor: 'rgba(113,63,18,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  historyPanel: {
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.16)',
    padding: 12,
    gap: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.12)',
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,205,196,0.12)',
  },
  historyCopy: {
    flex: 1,
  },
  historyTitle: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '800',
  },
  historySub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  historyScore: {
    fontSize: 18,
    fontWeight: '900',
  },
  stateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.92)',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  stateCodeBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,205,196,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.24)',
  },
  stateCodeText: {
    color: '#4ECDC4',
    fontSize: 15,
    fontWeight: '900',
  },
  stateCopy: {
    flex: 1,
  },
  stateText: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  stateSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  modePanel: {
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    padding: 12,
    gap: 12,
  },
  modeGrid: {
    gap: 9,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(2,6,23,0.48)',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  modeCardActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  modeTitle: {
    width: 72,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '900',
  },
  modeTitleActive: {
    color: '#020617',
  },
  modeSub: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  modeSubActive: {
    color: '#0F172A',
  },
  categoryCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.18)',
  },
  cardDisabled: {
    opacity: 0.66,
  },
  categoryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  categoryIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.7)',
  },
  categoryCopy: {
    flex: 1,
  },
  categoryTitle: {
    color: '#F8FAFC',
    fontSize: 19,
    fontWeight: '900',
  },
  categorySub: {
    color: '#CBD5E1',
    fontSize: 12,
    marginTop: 3,
  },
  countBadge: {
    minWidth: 76,
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.62)',
    paddingHorizontal: 8,
  },
  countValue: {
    color: '#4ECDC4',
    fontSize: 20,
    fontWeight: '900',
  },
  countLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  progressContainer: {
    marginBottom: 18,
  },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  progressText: {
    color: '#94A3B8',
    fontWeight: '800',
  },
  timerText: {
    color: '#4ECDC4',
    fontWeight: '900',
  },
  progressBar: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  questionCard: {
    backgroundColor: 'rgba(15,23,42,0.94)',
    padding: 20,
    borderRadius: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  questionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  questionNumber: {
    color: '#4ECDC4',
    fontSize: 12,
    fontWeight: '900',
  },
  questionDifficulty: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  questionText: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 29,
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(30,41,59,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  selectedOption: {
    borderColor: '#4ECDC4',
    backgroundColor: 'rgba(20,83,45,0.32)',
  },
  correctOption: {
    backgroundColor: 'rgba(16,185,129,0.72)',
    borderColor: '#10B981',
  },
  wrongOption: {
    backgroundColor: 'rgba(239,68,68,0.72)',
    borderColor: '#EF4444',
  },
  optionKey: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.58)',
  },
  optionKeyText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '900',
  },
  optionText: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  explanationBox: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(113,63,18,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.22)',
    padding: 14,
  },
  explanationTitle: {
    color: '#FACC15',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 5,
  },
  explanationText: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: 18,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#4ECDC4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primaryButtonDisabled: {
    opacity: 0.42,
  },
  primaryButtonText: {
    color: '#020617',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '900',
  },
  answeredText: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 12,
    fontWeight: '700',
  },
  studyCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 15,
    gap: 10,
  },
  studyIndex: {
    color: '#4ECDC4',
    fontSize: 12,
    fontWeight: '900',
  },
  studyQuestion: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
  },
  studyOptions: {
    gap: 8,
  },
  studyOption: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(30,41,59,0.7)',
  },
  studyCorrectOption: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.32)',
  },
  studyOptionKey: {
    width: 22,
    color: '#94A3B8',
    fontWeight: '900',
  },
  studyOptionText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20,
  },
  studyCorrectText: {
    color: '#86EFAC',
  },
  studyExplanation: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20,
  },
  resultHero: {
    borderRadius: 22,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(78,205,196,0.18)',
    padding: 22,
  },
  resultTitle: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 8,
  },
  resultScore: {
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 62,
    marginTop: 4,
  },
  resultSub: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  saveStatus: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  resultActions: {
    gap: 10,
  },
  reviewCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    padding: 14,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewIndex: {
    color: '#4ECDC4',
    fontSize: 12,
    fontWeight: '900',
  },
  reviewQuestion: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  reviewLine: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  reviewCorrect: {
    color: '#86EFAC',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewExplanation: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
});

export default PermitTestScreen;
