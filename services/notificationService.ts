
import { GoogleGenAI } from "@google/genai";
import { Task, NotificationSettings, NotificationLog, PriorityLevel } from "../types";

const PRIORITY_MILESTONES: Record<PriorityLevel, number[]> = {
  Low: [24, 1],
  Standard: [24, 6, 2],
  Critical: [24, 12, 6, 2, 1]
};

export class NotificationService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async checkDeadlines(tasks: Task[], settings: NotificationSettings): Promise<{ notifiedTasks: { id: string, milestone: number }[], logs: NotificationLog[] }> {
    if (!settings.emailEnabled || !settings.operatorEmail) return { notifiedTasks: [], logs: [] };

    const now = new Date();
    const notificationsToSend: { task: Task, milestone: number }[] = [];
    const logs: NotificationLog[] = [];

    tasks.forEach(task => {
      if (task.completed) return;

      const startDate = new Date(task.startTime);
      const diffMs = startDate.getTime() - now.getTime();
      const hoursUntilStart = diffMs / (1000 * 60 * 60);

      // Only care about tasks in the future
      if (hoursUntilStart <= 0) return;

      const milestones = PRIORITY_MILESTONES[task.priority];
      
      /**
       * Find the highest milestone that is >= current hoursUntilStart
       * But we want to send the notification when we CROSS the milestone.
       * So we look for milestones where hoursUntilStart <= M.
       * We pick the smallest M that satisfies this and hasn't been notified yet.
       */
      const milestoneHit = [...milestones]
        .sort((a, b) => a - b) // Check 1h, then 2h, then 6h...
        .find(m => {
          const isWithinWindow = hoursUntilStart <= m;
          const alreadyNotifiedThisMilestone = task.lastNotifiedMilestone !== undefined && task.lastNotifiedMilestone !== null && task.lastNotifiedMilestone <= m;
          return isWithinWindow && !alreadyNotifiedThisMilestone;
        });

      if (milestoneHit !== undefined) {
        notificationsToSend.push({ task, milestone: milestoneHit });
      }
    });

    const notifiedTasks: { id: string, milestone: number }[] = [];

    for (const item of notificationsToSend) {
      const { task, milestone } = item;
      const emailContent = await this.dispatchEmailAlert(task, milestone, settings.operatorEmail);
      
      logs.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: now.toISOString(),
        type: 'Email',
        title: `${task.priority} Priority Reminder`,
        content: emailContent,
        status: 'Dispatched'
      });

      notifiedTasks.push({ id: task.id, milestone });
    }

    return { notifiedTasks, logs };
  }

  async dispatchTestEmail(email: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a short "Notification Test" email from a helpful digital assistant.
        RECIPIENT: ${email}
        SUBJECT: Email Notification Link Active
        TONE: Clean, friendly, professional. 
        CONTENT: Confirm that the user's dashboard notifications are now working.`
      });
      const body = response.text || "This is a test email. Your notification link is active.";
      return body;
    } catch (err) {
      console.error("Failed to send test email", err);
      throw new Error("Dispatch failed");
    }
  }

  async dispatchEmailAlert(task: Task, milestone: number, email: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a helpful email reminder for a user about an upcoming task.
        
        RECIPIENT: ${email}
        SUBJECT: Reminder: ${task.title} starting in ${milestone} hour(s)
        
        TASK DETAIL:
        - Title: ${task.title}
        - Priority: ${task.priority}
        - Start Time: ${task.startTime}
        - Current Milestone: ${milestone} hours before start.
        
        TONE: Friendly, clear, and professional. 
        FORMAT: Plain text email body.`
      });

      return response.text || `Reminder: Your task "${task.title}" starts in approximately ${milestone} hour(s).`;
    } catch (err) {
      console.error("Failed to generate email content", err);
      return `Reminder: Your task "${task.title}" starts in ${milestone} hour(s).`;
    }
  }
}
