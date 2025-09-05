/**
 * URL Health Checker stub for v1.4
 */

export interface URLHealthData {
  url: string;
  status: number;
  issues: string[];
  recommendations: string[];
}