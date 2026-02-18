
export type PriorityLevel = 'Critical' | 'Standard' | 'Low';
export type ExpenseCategory = 'Food' | 'Rent' | 'Travel' | 'Health' | 'Tech' | 'Other';
export type TaskType = 'Main' | 'Daily';

export interface Task {
  id: string;
  title: string;
  startTime: string; // ISO string 
  endTime: string;   // ISO string
  priority: PriorityLevel;
  completed: boolean;
  type: TaskType;
  lastNotified?: string; // ISO string to prevent double emails (legacy/fallback)
  lastNotifiedMilestone?: number | null; // Tracks the specific hour milestone triggered (e.g. 24, 12, 1)
  notes?: string;           // Tactical notes
  recurring?: boolean;      // Recurring flag
  lastCompletedDate?: string; // Tracking for daily reset
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  label: string;
  date: string;
}

export interface BudgetConfig {
  limit: number;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  operatorEmail: string;
  alertThresholdHours: number;
}

export interface NotificationLog {
  id: string;
  timestamp: string;
  type: 'Email' | 'System';
  title: string;
  content: string;
  status: 'Dispatched' | 'Failed';
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  image?: string; // base64
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string; // ISO string
}

export interface DashboardState {
  tasks: Task[];
  expenses: Expense[];
  budgetConfig: BudgetConfig;
  notificationSettings: NotificationSettings;
  notificationLogs: NotificationLog[];
}

export interface PerformanceReport {
  summary: string;
  score: number;
  timestamp: string;
}

export interface PriorityTask {
  title: string;
  time: string;
}

export interface Budget {
  total: string;
  trend: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  sub: string;
  time: string;
  color: string;
}

export interface FinanceItem {
  icon: string;
  label: string;
  val: string;
}
