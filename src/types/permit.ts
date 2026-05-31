export type VehicleCategory = 'car' | 'motorcycle' | 'cdl';
export type PermitAnswerKey = 'A' | 'B' | 'C' | 'D';
export type PermitDifficulty = 'easy' | 'medium' | 'hard';
export type PermitQuizMode = 'practice' | 'exam' | 'study';

export interface PermitState {
  id: string;
  code: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface PermitCategory {
  id: string;
  code: VehicleCategory;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active?: boolean;
}

export interface PermitQuestion {
  id: string;
  state_id: string;
  category_id: string;
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string | null;
  correct_answer: PermitAnswerKey;
  explanation: string | null;
  difficulty: PermitDifficulty;
  source: string;
  is_active: boolean;
  permit_states?: Pick<PermitState, 'code' | 'name'>;
  permit_categories?: Pick<PermitCategory, 'code' | 'name'>;
}

export interface PermitQuestionOption {
  key: PermitAnswerKey;
  text: string;
}

export interface PermitTestAttempt {
  id: string;
  user_id: string;
  state_id: string;
  category_id: string;
  score: number | null;
  total_questions: number;
  correct_count: number;
  time_taken_seconds: number | null;
  completed: boolean;
  created_at: string;
  permit_states?: Pick<PermitState, 'code' | 'name'>;
  permit_categories?: Pick<PermitCategory, 'code' | 'name'>;
}

export interface PermitTestAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_answer: PermitAnswerKey | null;
  is_correct: boolean | null;
  created_at: string;
}

export interface PermitResultAnswer {
  question: PermitQuestion;
  selectedAnswer: PermitAnswerKey | null;
  isCorrect: boolean;
}

export interface PermitQuizResult {
  score: number;
  total: number;
  correctCount: number;
  timeTakenSeconds: number;
  answers: PermitResultAnswer[];
}

export interface PermitCategoryCount {
  categoryCode: VehicleCategory;
  count: number;
}
