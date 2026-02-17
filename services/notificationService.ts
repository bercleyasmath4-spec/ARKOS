
import { GoogleGenAI } from "@google/genai";
import { Task, NotificationSettings } from "../types";

export class NotificationService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Scans tasks for approaching deadlines and triggers email if necessary.
   */
  async checkDeadlines(tasks: Task[], settings: NotificationSettings): Promise<string[]> {
    if (!settings.emailEnabled || !settings.operatorEmail) return [];

    const now = new Date();
    const tasksToNotify: Task[] = [];

    tasks.forEach(task => {
      // Basic check: if priority is Critical and not completed, or if it's "Today"
      // In a real app, we'd parse ISO strings and check hours
      const isUrgent = task.priority === 'Critical' && !task.completed;
      const wasAlreadyNotified = task.lastNotified && 
        (now.getTime() - new Date(task.lastNotified).getTime() < 1000 * 60 * 60 * 12);

      if (isUrgent && !wasAlreadyNotified) {
        tasksToNotify.push(task);
      }
    });

    if (tasksToNotify.length > 0) {
      await this.dispatchEmailAlert(tasksToNotify, settings.operatorEmail);
      return tasksToNotify.map(t => t.id);
    }

    return [];
  }

  /**
   * Generates a high-tech briefing and "sends" it.
   */
  async dispatchEmailAlert(tasks: Task[], email: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate an urgent A.R.K.O.S. Mission Alert email for the operator.
        Recipient: ${email}
        Subject: MISSION CRITICAL: Protocols require immediate attention.
        Tasks: ${tasks.map(t => `${t.title} (Priority: ${t.priority})`).join(', ')}
        
        Tone: Professional, urgent, high-tech assistant. Format as a clean email body.`
      });

      console.log(`[A.R.K.O.S. DISPATCH] Emailing ${email}:`, response.text);
      
      // REAL INTEGRATION POINT:
      // Here you would call fetch('https://api.resend.com/emails', ...)
      // Or use a backend endpoint to send the actual email.
      // For this prototype, we simulate successful dispatch.
      
      return true;
    } catch (err) {
      console.error("Failed to dispatch email", err);
      return false;
    }
  }

  /**
   * Manually sends a full daily briefing.
   */
  async emailDailyBriefing(tasks: Task[], email: string) {
    if (!email) throw new Error("Operator email not configured.");

    const dailyTasks = tasks.filter(t => t.type === 'Daily');
    const completed = dailyTasks.filter(t => t.completed).length;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a comprehensive "Daily Operations Briefing" email.
      Completed: ${completed}/${dailyTasks.length}
      Full List: ${dailyTasks.map(t => `${t.completed ? '[X]' : '[ ]'} ${t.title}`).join('\n')}
      Tone: Tony Stark assistant style. Sharp, encouraging, tech-focused.`
    });

    console.log(`[A.R.K.O.S. DISPATCH] Daily Briefing to ${email}:`, response.text);
    return true;
  }
}
