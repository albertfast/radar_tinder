const LOGS_ENABLED = process.env.EXPO_PUBLIC_ENABLE_LOGS !== 'false';

const formatMessage = (message: string) => `[RadarTinder] ${message}`;

export const logInfo = (message: string, data?: Record<string, any>): void => {
  if (!LOGS_ENABLED) return;
  if (data) {
    console.info(formatMessage(message), data);
    return;
  }
  console.info(formatMessage(message));
};

export const logWarn = (message: string, data?: Record<string, any>): void => {
  if (!LOGS_ENABLED) return;
  if (data) {
    console.warn(formatMessage(message), data);
    return;
  }
  console.warn(formatMessage(message));
};

export const logError = (message: string, data?: Record<string, any>): void => {
  if (!LOGS_ENABLED) return;
  if (data) {
    console.error(formatMessage(message), data);
    return;
  }
  console.error(formatMessage(message));
};
