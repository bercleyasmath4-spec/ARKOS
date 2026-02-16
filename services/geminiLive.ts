
import { GoogleGenAI, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';
import { DashboardState, PriorityLevel, ExpenseCategory } from '../types';

export interface VoiceActionCallbacks {
  onMessage?: (text: string) => void;
  onAddTask?: (title: string, priority: PriorityLevel) => void;
  onAddExpense?: (label: string, amount: number, category: ExpenseCategory) => void;
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
    },
    required: ['title', 'priority'],
  },
};

const addExpenseTool: FunctionDeclaration = {
  name: 'addExpense',
  parameters: {
    type: Type.OBJECT,
    description: 'Record a new financial transaction or expense.',
    properties: {
      label: { type: Type.STRING, description: 'What the expense was for.' },
      amount: { type: Type.NUMBER, description: 'The cost/value of the transaction.' },
      category: { 
        type: Type.STRING, 
        description: 'The category of the expense.',
        enum: ['Food', 'Rent', 'Travel', 'Health', 'Tech', 'Other']
      },
    },
    required: ['label', 'amount', 'category'],
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

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const totalSpent = context.expenses.reduce((acc, curr) => acc + curr.amount, 0);
    const pendingTasks = context.tasks.filter(t => !t.completed).length;
    
    const systemInstruction = `You are A.R.K.O.S., Tony Stark's advanced assistant. 
    Current System Load: ${pendingTasks} pending protocols.
    Current Financial Burn: $${totalSpent} out of $${context.budgetConfig.limit}.
    
    Your MANDATE:
    1. If the user mentions a new task, tasking, or protocol, IMMEDIATELY call 'addTask'.
    2. If the user mentions a purchase, cost, or expense, IMMEDIATELY call 'addExpense'.
    3. Confirm actions with a professional, slightly witty tone.
    4. Keep spoken responses concise.
    Always use tools for data modification.`;

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

          // Process Tool Calls (Function Calling)
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              let executionResult = "Action complete.";
              
              if (fc.name === 'addTask') {
                const title = String(fc.args.title || "Untitled Task");
                const priority = (fc.args.priority as PriorityLevel) || 'Standard';
                callbacks.onAddTask?.(title, priority);
                executionResult = `Protocol ${title} has been initialized.`;
              } else if (fc.name === 'addExpense') {
                const label = String(fc.args.label || "Miscellaneous");
                const amount = Number(fc.args.amount) || 0;
                const category = (fc.args.category as ExpenseCategory) || 'Other';
                callbacks.onAddExpense?.(label, amount, category);
                executionResult = `Transaction for ${label} of $${amount} logged to secure ledger.`;
              }
              
              // Corrected: Using single object structure as per prompt instructions
              this.sessionPromise?.then((session) => {
                session.sendToolResponse({
                  functionResponses: { 
                    id: fc.id, 
                    name: fc.name, 
                    response: { result: executionResult } 
                  }
                });
              });
            }
          }

          // Handle audio transcription from the model
          if (message.serverContent?.outputTranscription) {
            callbacks.onMessage?.(message.serverContent.outputTranscription.text);
          }

          // Handle audio stream from the model
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
                source.addEventListener('ended', () => { this.sources.delete(source); });
                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
                this.sources.add(source);
              }
            }
          }

          if (message.serverContent?.interrupted) {
            this.sources.forEach(s => { try { s.stop(); } catch(e){} });
            this.sources.clear();
            this.nextStartTime = 0;
          }
        },
        onerror: (e) => {
          console.error('Gemini Live Error:', e);
          this.stop();
        },
        onclose: () => this.stop(),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        tools: [{ functionDeclarations: [addTaskTool, addExpenseTool] }],
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
    this.sessionPromise?.then(session => { try { session.close(); } catch (e) {} });
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      try { this.inputAudioContext.close(); } catch (e) {}
    }
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
      try { this.outputAudioContext.close(); } catch (e) {}
    }
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.sessionPromise = null;
    this.ai = null;
    this.nextStartTime = 0;
  }

  private createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: this.encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private decode(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private encode(bytes: Uint8Array) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}
