
export type PriorityLevel = 'Critical' | 'Standard' | 'Low';
export type ExpenseCategory = 'Food' | 'Rent' | 'Travel' | 'Health' | 'Tech' | 'Other';
export type TaskType = 'Main' | 'Daily';

export interface Task {
  id: string;
  title: string;
  deadline: string; // ISO string or human readable
  priority: PriorityLevel;
  completed: boolean;
  type: TaskType;
  lastNotified?: string; // ISO string to prevent double emails
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

export interface DashboardState {
  tasks: Task[];
  expenses: Expense[];
  budgetConfig: BudgetConfig;
  notificationSettings: NotificationSettings;
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
