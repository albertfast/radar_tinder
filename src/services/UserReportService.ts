import AsyncStorage from '@react-native-async-storage/async-storage';
import { RadarLocation } from '../types';

const STORAGE_KEY = '@user_reports';

export class UserReportService {
  static async reportRadar(
    location: { latitude: number; longitude: number },
    type: RadarLocation['type'],
    userId: string
  ): Promise<RadarLocation> {
    try {
      const newReport: RadarLocation = {
        id: `user-${Date.now()}`,
        latitude: location.latitude,
        longitude: location.longitude,
        type,
        confidence: 0.5, // Initial confidence for user report
        reports: 1,
        verified: false,
        lastReported: new Date(),
        lastConfirmed: new Date(),
        reportedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const existingReports = await this.getStoredReports();
      const updatedReports = [...existingReports, newReport];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedReports));

      return newReport;
    } catch (error) {
      console.error('Error reporting radar:', error);
      throw error;
    }
  }

  static async getNearbyReports(
    latitude: number,
    longitude: number,
    radiusKm: number = 10
  ): Promise<RadarLocation[]> {
    try {
      const reports = await this.getStoredReports();
      return reports.filter(report => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          report.latitude,
          report.longitude
        );
        return distance <= radiusKm;
      });
    } catch (error) {
      console.error('Error getting nearby reports:', error);
      return [];
    }
  }

  static async verifyReport(reportId: string, userId: string): Promise<boolean> {
    try {
      const reports = await this.getStoredReports();
      const reportIndex = reports.findIndex(r => r.id === reportId);

      if (reportIndex === -1) return false;

      const report = reports[reportIndex];
      report.reports = (report.reports || 1) + 1;
      report.confidence = Math.min(report.confidence + 0.1, 1.0);
      report.lastConfirmed = new Date();
      report.updatedAt = new Date();

      if (report.confidence > 0.8) {
        report.verified = true;
      }

      reports[reportIndex] = report;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reports));

      return true;
    } catch (error) {
      console.error('Error verifying report:', error);
      return false;
    }
  }

  private static async getStoredReports(): Promise<RadarLocation[]> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) return [];
      const data = JSON.parse(json);
      // Restore Date objects
      return data.map((item: any) => ({
        ...item,
        lastConfirmed: new Date(item.lastConfirmed),
        lastReported: item.lastReported ? new Date(item.lastReported) : undefined,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));
    } catch (error) {
      console.error('Error reading stored reports:', error);
      return [];
    }
  }

  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
