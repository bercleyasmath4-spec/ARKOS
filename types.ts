
export type PriorityLevel = 'Critical' | 'Standard' | 'Low';
export type ExpenseCategory = 'Food' | 'Rent' | 'Travel' | 'Health' | 'Tech' | 'Other';

export interface Task {
  id: string;
  title: string;
  deadline: string;
  priority: PriorityLevel;
  completed: boolean;
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

export interface DashboardState {
  tasks: Task[];
  expenses: Expense[];
  budgetConfig: BudgetConfig;
}

/**
 * Interface used by DashboardGrid component.
 */
export interface PriorityTask {
  title: string;
  time: string;
}

/**
 * Interface used by DashboardGrid component.
 */
export interface Budget {
  total: string;
  trend: string;
}

/**
 * Interface used by Timeline component.
 */
export interface TimelineItem {
  id: string;
  title: string;
  sub: string;
  time: string;
  color: string;
}

/**
 * Interface used by FinanceOverview component.
 */
export interface FinanceItem {
  icon: string;
  label: string;
  val: string;
}
