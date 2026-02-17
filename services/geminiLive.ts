
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';
import { DashboardState, PriorityLevel, ExpenseCategory, TaskType } from '../types';

export interface VoiceActionCallbacks {
  onMessage?: (text: string) => void;
  onAddTask?: (title: string, priority: PriorityLevel, target: TaskType) => void;
  onAddExpense?: (label: string, amount: number, category: ExpenseCategory) => void;
  onGenerateReport?: () => void;
  onDispatchEmail?: () => void;
}

const addTaskTool: FunctionDeclaration = {
  name: 'addTask',
  parameters: {
    type: Type.OBJECT,
    description: 'Add a new task or protocol to the system.',
    properties: {
      title: { type: Type.STRING, description: 'The title or identifier of the task.' },
      priority: { 
        type: Type.STRING, 
        description: 'Priority level of the task.',
        enum: ['Critical', 'Standard', 'Low']
      },
      target: {
        type: Type.STRING,
        description: 'Whether this is a long-term Main task or a Daily action item.',
        enum: ['Main', 'Daily']
      }
    },
    required: ['title', 'priority', 'target'],
  },
};

const emailBriefingTool: FunctionDeclaration = {
  name: 'emailBriefing',
  parameters: {
    type: Type.OBJECT,
    description: 'Email the daily operations briefing to the operator.',
    properties: {},
  },
};

const generateReportTool: FunctionDeclaration = {
  name: 'generateDailyReport',
  parameters: {
    type: Type.OBJECT,
    description: 'Analyze today\'s achievements and generate a performance report.',
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

  constructor() {}

  async start(context: DashboardState, callbacks: VoiceActionCallbacks) {
    if (this.active) return;
    this.active = true;

    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    if (this.outputAudioContext.state === 'suspended') {
      await this.outputAudioContext.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const dailyTasks = context.tasks.filter(t => t.type === 'Daily');
    const completedDaily = dailyTasks.filter(t => t.completed).length;
    
    const systemInstruction = `You are A.R.K.O.S., Tony Stark's advanced assistant. 
    Status: ${completedDaily}/${dailyTasks.length} daily objectives secured.
    Operator Email: ${context.notificationSettings.operatorEmail || 'Unconfigured'}
    
    MANDATE:
    1. For new tasks, call 'addTask'.
    2. Use 'emailBriefing' if user wants an email summary.
    3. Use 'generateDailyReport' for an on-screen summary.
    4. Confirm actions with a professional tone. Brief and sharp.`;

    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          if (!this.inputAudioContext) return;
          const source = this.inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            if (!this.active) return;
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = this.createBlob(inputData);
            this.sessionPromise?.then((session) => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(this.inputAudioContext.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          if (!this.active) return;

          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              let executionResult = "Action complete.";
              if (fc.name === 'addTask') {
                const title = String(fc.args.title || "Untitled Task");
                const priority = (fc.args.priority as PriorityLevel) || 'Standard';
                const target = (fc.args.target as TaskType) || 'Daily';
                callbacks.onAddTask?.(title, priority, target);
                executionResult = `Task ${title} added.`;
              } else if (fc.name === 'emailBriefing') {
                callbacks.onDispatchEmail?.();
                executionResult = `Email briefing dispatched to your terminal, Sir.`;
              } else if (fc.name === 'generateDailyReport') {
                callbacks.onGenerateReport?.();
                executionResult = `Analyzing achievements...`;
              }
              
              this.sessionPromise?.then((session) => {
                session.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: executionResult } }
                });
              });
            }
          }

          if (message.serverContent?.outputTranscription) {
            callbacks.onMessage?.(message.serverContent.outputTranscription.text);
          }

          if (this.outputAudioContext) {
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                const base64Audio = part.inlineData.data;
                this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
                const audioBuffer = await this.decodeAudioData(this.decode(base64Audio), this.outputAudioContext, 24000, 1);
                const source = this.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.outputAudioContext.destination);
                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
                this.sources.add(source);
              }
            }
          }
        },
        onerror: (e) => this.stop(),
        onclose: () => this.stop(),
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
  }

  stop() {
    this.active = false;
    this.sources.forEach(s => { try { s.stop(); } catch (e) {} });
    this.sources.clear();
    this.sessionPromise?.then(session => session.close());
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
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
