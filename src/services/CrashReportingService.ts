export class CrashReportingService {
  private static isInitialized = false;
  private static errorQueue: Array<Error> = [];

  static async init(): Promise<void> {
    try {
      if (this.isInitialized) return;

      // Set up global error handlers
      this.setupErrorHandlers();
      
      // Load any queued errors
      await this.processErrorQueue();
      
      this.isInitialized = true;
      
      // Service ready - logging disabled to reduce noise
    } catch (error) {
      console.error('Error initializing crash reporting service:', error);
    }
  }

  private static setupErrorHandlers(): void {
    // Handle unhandled promise rejections
    process.on?.('unhandledRejection', (reason, promise) => {
      this.reportError(new Error(`Unhandled Promise Rejection: ${reason}`), {
        type: 'unhandled_rejection',
        promise: promise.toString(),
      });
    });

    // Handle uncaught exceptions
    process.on?.('uncaughtException', (error) => {
      this.reportError(error, {
        type: 'uncaught_exception',
        fatal: true,
      });
    });

    // Handle JavaScript errors in React Native
    if (typeof ErrorUtils !== 'undefined' && ErrorUtils.setGlobalHandler) {
      const originalHandler = ErrorUtils.getGlobalHandler?.();
      
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        this.reportError(error, {
          type: 'javascript_error',
          fatal: isFatal,
        });

        // Call original handler if it exists
        if (originalHandler) {
          originalHandler(error, isFatal);
        }
      });
    }
  }

  static async reportError(error: Error, context: Record<string, any> = {}): Promise<void> {
    try {
      const crashReport = {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        context: {
          ...context,
          timestamp: new Date().toISOString(),
          platform: 'mobile',
          app_version: '1.0.0',
          device_info: this.getDeviceInfo(),
        },
      };

      // Log to console for debugging
      console.error('Crash Report:', crashReport);

      // Try to send immediately
      await this.sendCrashReport(crashReport);
    } catch (reportError) {
      console.error('Error reporting crash:', reportError);
      // Queue for later if sending fails
      this.queueError(error);
    }
  }

  static async reportHandledError(error: Error, context: Record<string, any> = {}): Promise<void> {
    try {
      await this.reportError(error, {
        ...context,
        handled: true,
      });
    } catch (reportError) {
      console.error('Error reporting handled error:', reportError);
    }
  }

  static async reportMemoryWarning(): Promise<void> {
    try {
      const memoryReport = {
        type: 'memory_warning',
        timestamp: new Date().toISOString(),
        device_info: this.getDeviceInfo(),
        memory_info: this.getMemoryInfo(),
      };

      console.warn('Memory Warning:', memoryReport);
      await this.sendCrashReport(memoryReport);
    } catch (error) {
      console.error('Error reporting memory warning:', error);
    }
  }

  static async reportPerformanceIssue(metric: string, value: number, threshold: number): Promise<void> {
    try {
      const performanceReport = {
        type: 'performance_issue',
        metric,
        value,
        threshold,
        timestamp: new Date().toISOString(),
        device_info: this.getDeviceInfo(),
      };

      console.warn('Performance Issue:', performanceReport);
      await this.sendCrashReport(performanceReport);
    } catch (error) {
      console.error('Error reporting performance issue:', error);
    }
  }

  private static async sendCrashReport(report: any): Promise<void> {
    try {
      // TODO: Replace with actual crash reporting API call
      // Sending crash report - logging disabled in production
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Crash report sent - logging disabled to reduce noise
    } catch (error) {
      console.error('Error sending crash report:', error);
      throw error;
    }
  }

  private static queueError(error: Error): void {
    this.errorQueue.push(error);
    
    // Keep only last 50 errors
    if (this.errorQueue.length > 50) {
      this.errorQueue = this.errorQueue.slice(-50);
    }
  }

  private static async processErrorQueue(): Promise<void> {
    if (this.errorQueue.length === 0) return;

    const errorsToProcess = [...this.errorQueue];
    this.errorQueue = [];

    for (const error of errorsToProcess) {
      try {
        await this.reportError(error, { queued: true });
      } catch (processError) {
        console.error('Error processing queued error:', processError);
        // Re-queue if processing fails
        this.errorQueue.push(error);
        break;
      }
    }
  }

  private static getDeviceInfo(): Record<string, any> {
    try {
      return {
        platform: 'mobile',
        // TODO: Add actual device info using Expo Device module
        // device_name: Device.deviceName,
        // device_type: Device.deviceType,
        // os_version: Device.osVersion,
        // app_version: Constants.manifest?.version,
      };
    } catch (error) {
      console.error('Error getting device info:', error);
      return {};
    }
  }

  private static getMemoryInfo(): Record<string, any> {
    try {
      return {
        // TODO: Add actual memory info if available
        // memory_usage: performance.memory?.usedJSHeapSize,
        // memory_limit: performance.memory?.jsHeapSizeLimit,
      };
    } catch (error) {
      console.error('Error getting memory info:', error);
      return {};
    }
  }

  static async getCrashReports(): Promise<Array<any>> {
    try {
      // TODO: Implement fetching crash reports from storage
      return [];
    } catch (error) {
      console.error('Error getting crash reports:', error);
      return [];
    }
  }

  static async clearCrashReports(): Promise<void> {
    try {
      // TODO: Implement clearing crash reports
      this.errorQueue = [];
    } catch (error) {
      console.error('Error clearing crash reports:', error);
    }
  }

  static async testCrashReporting(): Promise<void> {
    try {
      console.log('Testing crash reporting...');
      
      // Test handled error
      await this.reportHandledError(new Error('Test handled error'), {
        test: true,
      });

      // Test performance issue
      await this.reportPerformanceIssue('test_metric', 5000, 1000);

      console.log('Crash reporting test completed');
    } catch (error) {
      console.error('Error testing crash reporting:', error);
    }
  }

  static getStatus(): {
    isInitialized: boolean;
    queuedErrors: number;
  } {
    return {
      isInitialized: this.isInitialized,
      queuedErrors: this.errorQueue.length,
    };
  }
}