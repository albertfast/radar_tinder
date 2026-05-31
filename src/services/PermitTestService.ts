import { isSupabaseEnvMissingError, supabase } from '../../utils/supabase';
import {
  PermitAnswerKey,
  PermitCategory,
  PermitCategoryCount,
  PermitQuestion,
  PermitState,
  PermitTestAnswer,
  PermitTestAttempt,
  VehicleCategory,
} from '../types/permit';

const QUESTION_SELECT = `
  *,
  permit_states!inner(code,name),
  permit_categories!inner(code,name)
`;

const normalizeCode = (value: string) => value.trim().toUpperCase();
const normalizeCategoryCode = (value: string) => value.trim().toLowerCase() as VehicleCategory;

const sortCategories = (categories: PermitCategory[]) =>
  [...categories].sort((left, right) => {
    const byOrder = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    return byOrder || left.name.localeCompare(right.name);
  });

const shuffleArray = <T,>(array: T[]): T[] => {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const toPermitError = (error: unknown) => {
  if (isSupabaseEnvMissingError(error)) {
    return new Error('Supabase is not configured for permit tests.');
  }
  return error;
};

export async function getPermitStates(): Promise<PermitState[]> {
  const { data, error } = await supabase
    .from('permit_states')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw toPermitError(error);
  return (data || []) as PermitState[];
}

export async function getPermitCategories(): Promise<PermitCategory[]> {
  const query = supabase
    .from('permit_categories')
    .select('*')
    .order('sort_order');

  const { data, error } = await query.eq('is_active', true);

  if (!error) {
    return sortCategories((data || []) as PermitCategory[]);
  }

  const missingIsActive =
    typeof error.message === 'string' &&
    error.message.toLowerCase().includes('is_active');

  if (!missingIsActive) throw toPermitError(error);

  const fallback = await supabase
    .from('permit_categories')
    .select('*')
    .order('sort_order');

  if (fallback.error) throw toPermitError(fallback.error);
  return sortCategories((fallback.data || []) as PermitCategory[]);
}

export async function getPermitQuestions(
  stateCode: string,
  categoryCode: string,
): Promise<PermitQuestion[]> {
  const { data, error } = await supabase
    .from('permit_questions')
    .select(QUESTION_SELECT)
    .eq('permit_states.code', normalizeCode(stateCode))
    .eq('permit_categories.code', normalizeCategoryCode(categoryCode))
    .eq('is_active', true)
    .order('question_number', { ascending: true });

  if (error) throw toPermitError(error);
  return (data || []) as PermitQuestion[];
}

export async function getRandomPermitQuestions(
  stateCode: string,
  categoryCode: string,
  count = 20,
): Promise<PermitQuestion[]> {
  const questions = await getPermitQuestions(stateCode, categoryCode);
  return shuffleArray(questions).slice(0, count);
}

export async function getPermitQuestionCount(
  stateCode: string,
  categoryCode: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('permit_questions')
    .select(QUESTION_SELECT, { count: 'exact', head: true })
    .eq('permit_states.code', normalizeCode(stateCode))
    .eq('permit_categories.code', normalizeCategoryCode(categoryCode))
    .eq('is_active', true);

  if (error) throw toPermitError(error);
  return count || 0;
}

export async function getPermitCategoryCounts(
  stateCode: string,
  categories: PermitCategory[],
): Promise<PermitCategoryCount[]> {
  const counts = await Promise.all(
    categories.map(async (category) => ({
      categoryCode: category.code,
      count: await getPermitQuestionCount(stateCode, category.code),
    })),
  );
  return counts;
}

export async function savePermitTestAttempt(
  attempt: Omit<PermitTestAttempt, 'id' | 'created_at' | 'permit_states' | 'permit_categories'>,
): Promise<PermitTestAttempt> {
  const { data, error } = await supabase
    .from('permit_test_attempts')
    .insert(attempt)
    .select()
    .single();

  if (error) throw toPermitError(error);
  return data as PermitTestAttempt;
}

export async function savePermitTestAnswers(
  answers: Array<Omit<PermitTestAnswer, 'id' | 'created_at'>>,
): Promise<void> {
  if (!answers.length) return;

  const { error } = await supabase
    .from('permit_test_answers')
    .insert(answers);

  if (error) throw toPermitError(error);
}

export async function saveCompletedPermitTest(params: {
  userId: string;
  state: PermitState;
  category: PermitCategory;
  score: number;
  totalQuestions: number;
  correctCount: number;
  timeTakenSeconds: number;
  answers: Array<{
    questionId: string;
    selectedAnswer: PermitAnswerKey | null;
    isCorrect: boolean;
  }>;
}): Promise<PermitTestAttempt> {
  const attempt = await savePermitTestAttempt({
    user_id: params.userId,
    state_id: params.state.id,
    category_id: params.category.id,
    score: params.score,
    total_questions: params.totalQuestions,
    correct_count: params.correctCount,
    time_taken_seconds: params.timeTakenSeconds,
    completed: true,
  });

  await savePermitTestAnswers(
    params.answers.map((answer) => ({
      attempt_id: attempt.id,
      question_id: answer.questionId,
      selected_answer: answer.selectedAnswer,
      is_correct: answer.isCorrect,
    })),
  );

  return attempt;
}

export async function getUserPermitTestHistory(userId: string): Promise<PermitTestAttempt[]> {
  const { data, error } = await supabase
    .from('permit_test_attempts')
    .select('*, permit_states(code,name), permit_categories(code,name)')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw toPermitError(error);
  return (data || []) as PermitTestAttempt[];
}

export function getPermitQuestionOptions(question: PermitQuestion) {
  return [
    { key: 'A' as const, text: question.option_a },
    { key: 'B' as const, text: question.option_b },
    { key: 'C' as const, text: question.option_c },
    { key: 'D' as const, text: question.option_d },
  ].filter((option): option is { key: PermitAnswerKey; text: string } =>
    Boolean(option.text && String(option.text).trim()),
  );
}
