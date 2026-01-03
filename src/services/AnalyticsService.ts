export class AnalyticsService {
  private static events: Array<{
    name: string;
    properties: Record<string, any>;
    timestamp: Date;
  }> = [];
  private static isOnline: boolean = true;

  static async init(): Promise<void> {
    try {
      // Initialize analytics service
      // console.log('Analytics service initialized');
      
      // Load any cached events
      await this.loadCachedEvents();
      
      // Try to send cached events
      await this.flushEvents();
    } catch (error) {
      console.error('Error initializing analytics service:', error);
    }
  }

  static async trackEvent(name: string, properties: Record<string, any> = {}): Promise<void> {
    try {
      const event = {
        name,
        properties: {
          ...properties,
          timestamp: new Date().toISOString(),
          platform: 'mobile',
          app_version: '1.0.0',
        },
        timestamp: new Date(),
      };

      // Add to events array
      this.events.push(event);

      // Try to send immediately if online
      if (this.isOnline) {
        await this.sendEvent(event);
      } else {
        // Cache for later
        await this.cacheEvent(event);
      }

      // Keep only last 1000 events locally
      if (this.events.length > 1000) {
        this.events = this.events.slice(-1000);
      }
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  static async trackScreenView(screenName: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('screen_view', {
      screen_name: screenName,
      ...properties,
    });
  }

  static async trackUserAction(action: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('user_action', {
      action,
      ...properties,
    });
  }

  static async trackRadarDetection(properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('radar_detection', {
      detection_type: 'automatic',
      ...properties,
    });
  }

  static async trackRadarReport(properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('radar_report', {
      report_type: 'user',
      ...properties,
    });
  }

  static async trackSubscriptionAction(action: string, properties: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('subscription_action', {
      action,
      ...properties,
    });
  }

  static async trackError(error: Error, context: Record<string, any> = {}): Promise<void> {
    await this.trackEvent('error', {
      error_message: error.message,
      error_stack: error.stack,
      ...context,
    });
  }

  static async setUserProperties(properties: Record<string, any>): Promise<void> {
    try {
      await this.trackEvent('user_properties_update', properties);
    } catch (error) {
      console.error('Error setting user properties:', error);
    }
  }

  private static async sendEvent(event: any): Promise<void> {
    try {
      // TODO: Replace with actual analytics API call
      // console.log('Sending analytics event:', event);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Remove from local events if successfully sent
      this.events = this.events.filter(e => e !== event);
    } catch (error) {
      console.error('Error sending analytics event:', error);
      throw error;
    }
  }

  private static async cacheEvent(event: any): Promise<void> {
    try {
      // TODO: Implement actual caching (e.g., using AsyncStorage)
      console.log('Caching analytics event:', event);
    } catch (error) {
      console.error('Error caching analytics event:', error);
    }
  }

  private static async loadCachedEvents(): Promise<void> {
    try {
      // TODO: Implement actual loading from cache
      // console.log('Loading cached analytics events');
    } catch (error) {
      console.error('Error loading cached analytics events:', error);
    }
  }

  static async flushEvents(): Promise<void> {
    try {
      if (!this.isOnline || this.events.length === 0) {
        return;
      }

      const eventsToSend = [...this.events];
      
      for (const event of eventsToSend) {
        try {
          await this.sendEvent(event);
        } catch (error) {
          console.error('Error flushing event:', error);
          // Stop flushing on first error to avoid losing events
          break;
        }
      }
    } catch (error) {
      console.error('Error flushing analytics events:', error);
    }
  }

  static setOnlineStatus(online: boolean): void {
    this.isOnline = online;
    
    // If coming back online, try to flush cached events
    if (online) {
      this.flushEvents().catch(console.error);
    }
  }

  static getEventCount(): number {
    return this.events.length;
  }

  static getRecentEvents(count: number = 10): Array<any> {
    return this.events.slice(-count);
  }

  static async clearEvents(): Promise<void> {
    this.events = [];
    // TODO: Clear cached events as well
  }

  static async getAnalyticsSummary(): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    recentEvents: Array<any>;
  }> {
    const eventsByType = this.events.reduce((acc, event) => {
      acc[event.name] = (acc[event.name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEvents: this.events.length,
      eventsByType,
      recentEvents: this.getRecentEvents(20),
    };
  }
}