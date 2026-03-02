const isTruthy = (value?: string) => /^(1|true|yes)$/i.test(String(value || ''));

export const readBooleanFlag = (name: string, defaultValue: boolean): boolean => {
  const env = (process.env as Record<string, string | undefined>)[name];
  if (env === undefined || env === null || env === '') return defaultValue;
  return isTruthy(env);
};

export const readNumberFlag = (name: string, defaultValue: number): number => {
  const env = (process.env as Record<string, string | undefined>)[name];
  if (env === undefined || env === null || env === '') return defaultValue;
  const parsed = Number(env);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};
