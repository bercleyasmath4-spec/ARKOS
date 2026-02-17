
import { DashboardState } from './types';

export const THEME = {
  cyan: '#00F2FF',
  cyanDim: 'rgba(0, 242, 255, 0.3)',
  bg: '#050505',
  glass: 'rgba(20, 20, 20, 0.6)',
  textWhite: '#FFFFFF',
  textDim: 'rgba(255, 255, 255, 0.5)',
  success: '#4ADE80',
  warning: '#FACC15',
  danger: '#EF4444',
};

export const PRIORITY_COLORS = {
  Critical: THEME.danger,
  Standard: THEME.warning,
  Low: '#3B82F6',
};

export const INITIAL_STATE: DashboardState = {
  tasks: [],
  expenses: [],
  budgetConfig: {
    limit: 0
  },
  notificationSettings: {
    emailEnabled: false,
    operatorEmail: '',
    alertThresholdHours: 24
  },
  notificationLogs: []
};
