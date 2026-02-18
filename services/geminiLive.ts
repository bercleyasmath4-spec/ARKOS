
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';
import { DashboardState, PriorityLevel, ExpenseCategory, TaskType } from '../types';

export interface VoiceActionCallbacks {
  onMessage?: (text: string) => void;
  onAddTask?: (title: string, priority: PriorityLevel, target: TaskType, completed: boolean, startTime?: string, endTime?: string) => void;
  onAddExpense?: (label: string, amount: number, category: ExpenseCategory) => void;
  onGenerateReport?: () => void;
  onDispatchEmail?: () => void;
  onTranscript?: (role: 'user' | 'model', text: string) => void;
  onError?: (error: string) => void;
  onDisconnect?: () => void;
}

const addTaskTool: FunctionDeclaration = {
  name: 'addTask',
  parameters: {
    type: Type.OBJECT,
    description: 'Add a new scheduled task to the user\'s list.',
    properties: {
      title: { type: Type.STRING, description: 'The name of the task.' },
      priority: { 
        type: Type.STRING, 
        description: 'How important the task is.',
        enum: ['Critical', 'Standard', 'Low']
      },
      target: {
        type: Type.STRING,
        description: 'Where to put the task (Daily list or General list).',
        enum: ['Main', 'Daily']
      },
      completed: {
        type: Type.BOOLEAN,
        description: 'Whether the task is already finished. Set to true if the user says they "completed" or "finished" something they are just now adding.'
      },
      startTime: {
        type: Type.STRING,
        description: 'The ISO string representing when the task starts.'
      },
      endTime: {
        type: Type.STRING,
        description: 'The ISO string representing when the task ends.'
      }
    },
    required: ['title', 'priority', 'target'],
  },
};

const emailBriefingTool: FunctionDeclaration = {
  name: 'emailBriefing',
  parameters: {
    type: Type.OBJECT,
    description: 'Email a summary of today\'s tasks to the user.',
    properties: {},
  },
};

const generateReportTool: FunctionDeclaration = {
  name: 'generateDailyReport',
  parameters: {
    type: Type.OBJECT,
    description: 'Generate and display a visual performance report for today.',
    properties: {},
  },
};

export class GeminiVoiceService {
  private ai: GoogleGenAI | null = null;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private active = false;
  private stream: MediaStream | null = null;
  
  // Transcription State
  private currentInputTranscription = '';
  private currentOutputTranscription = '';

  constructor() {}

  async start(context: DashboardState, callbacks: VoiceActionCallbacks) {
    if (this.active) return;
    this.active = true;

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("Security Protocol Error: API Key missing.");

      this.ai = new GoogleGenAI({ apiKey });
      
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AudioContextClass) throw new Error("Hardware Compatibility Error: Audio system unavailable.");

      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
      
      await this.inputAudioContext.resume();
      await this.outputAudioContext.resume();

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        throw new Error("Access Denied: Microphone permissions required.");
      }

      const dailyTasks = context.tasks.filter(t => t.type === 'Daily');
      const completedDaily = dailyTasks.filter(t => t.completed).length;
      
      const systemInstruction = `You are the core intelligence ("The Brain") of a high-tech personal dashboard. 
      
      CORE MISSION:
      - You process voice commands to manage the user's life.
      - You can handle complex, multi-step requests. Example: "Add meeting at 2, coffee at 3, I already finished the meeting, now show me my report."
      
      SPECIFIC LOGIC FOR MULTI-REQUESTS:
      1. ADDING TASKS: If a user mentions things they did but weren't on the list, call 'addTask' for each one and set 'completed: true'.
      2. SEQUENCING: If the user asks for a report after adding tasks, call 'generateDailyReport' LAST in your sequence of tool calls.
      3. BRAIN POWER: You have full access to current context: ${dailyTasks.length} tasks today, ${completedDaily} completed.
      
      TOOLS:
      - Use 'addTask' for any new item.
      - Use 'generateDailyReport' to show the visual summary modal on the screen.
      
      TONE: Professional, efficient, and proactive. Respond with a confirmation of what you've done (e.g., "Tasks added and your report is ready.")`;

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (!this.inputAudioContext || !this.stream || !this.active) return;
            const source = this.inputAudioContext.createMediaStreamSource(this.stream);
            const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              if (!this.active) return;
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = this.createBlob(inputData);
              this.sessionPromise?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(this.inputAudioContext.destination);

            this.sessionPromise?.then((session) => {
              session.sendRealtimeInput([{ text: "System connection established. Greet the user concisely and let them know you are ready to manage their dashboard." }]);
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!this.active) return;

            // Handle Transcriptions
            if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                this.currentOutputTranscription += text;
            } else if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                this.currentInputTranscription += text;
            }

            if (message.serverContent?.turnComplete) {
                if (this.currentInputTranscription.trim()) {
                    callbacks.onTranscript?.('user', this.currentInputTranscription);
                    this.currentInputTranscription = '';
                }
                if (this.currentOutputTranscription.trim()) {
                    callbacks.onTranscript?.('model', this.currentOutputTranscription);
                    this.currentOutputTranscription = '';
                }
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let executionResult = "Done.";
                if (fc.name === 'addTask') {
                  const title = String(fc.args.title || "New Task");
                  const priority = (fc.args.priority as PriorityLevel) || 'Standard';
                  const target = (fc.args.target as TaskType) || 'Daily';
                  const completed = Boolean(fc.args.completed || false);
                  const start = String(fc.args.startTime || "");
                  const end = String(fc.args.endTime || "");
                  callbacks.onAddTask?.(title, priority, target, completed, start, end);
                  executionResult = `Task "${title}" ${completed ? 'completed' : 'added'}.`;
                } else if (fc.name === 'generateDailyReport') {
                  callbacks.onGenerateReport?.();
                  executionResult = `Report generated and displayed.`;
                } else if (fc.name === 'emailBriefing') {
                  callbacks.onDispatchEmail?.();
                  executionResult = `Email sent.`;
                }
                
                this.sessionPromise?.then((session) => {
                  session.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: executionResult } }
                  });
                }).catch(() => {});
              }
            }

            if (this.outputAudioContext && this.outputAudioContext.state !== 'closed' && this.active) {
              const parts = message.serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  const base64Audio = part.inlineData.data;
                  this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
                  try {
                    const audioBuffer = await this.decodeAudioData(this.decode(base64Audio), this.outputAudioContext, 24000, 1);
                    const source = this.outputAudioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(this.outputAudioContext.destination);
                    source.start(this.nextStartTime);
                    this.nextStartTime += audioBuffer.duration;
                    this.sources.add(source);
                    source.onended = () => this.sources.delete(source);
                  } catch (e) { console.error("Audio playback error", e); }
                }
              }
            }
          },
          onerror: (e) => {
            console.error("Live session error", e);
            this.stop();
            callbacks.onError?.("Neural Link disrupted. Re-calibration recommended.");
          },
          onclose: (e) => {
            this.stop();
            callbacks.onDisconnect?.();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          tools: [{ functionDeclarations: [addTaskTool, emailBriefingTool, generateReportTool] }],
          systemInstruction: systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
      });
    } catch (error: any) {
      console.error("Voice Service Failure:", error);
      this.stop();
      throw error;
    }
  }

  stop() {
    this.active = false;
    this.sources.forEach(s => { try { s.stop(); } catch (e) {} });
    this.sources.clear();
    if (this.sessionPromise) {
      this.sessionPromise.then(session => { try { session.close(); } catch (e) {} }).catch(() => {});
      this.sessionPromise = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => { try { track.stop(); } catch (e) {} });
      this.stream = null;
    }
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      this.inputAudioContext.close().catch(() => {});
    }
    this.inputAudioContext = null;
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
      this.outputAudioContext.close().catch(() => {});
    }
    this.outputAudioContext = null;
    this.nextStartTime = 0;
  }

  private createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: this.encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private decode(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }

  private encode(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  }
}
