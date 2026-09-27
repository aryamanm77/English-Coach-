import Dexie, { Table } from 'dexie';

export interface Persona {
  id?: number;
  name: string;
  icon: string;
  systemPrompt: string;
  defaultVoiceURI?: string;
  isCustom: boolean;
}

export interface Topic {
  id?: number;
  name: string;
  context: string;
}

export interface Message {
  id?: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface Session {
  id?: number;
  personaId?: number;
  topicId?: number;
  createdAt: Date;
}

export class AppDB extends Dexie {
  personas!: Table<Persona, number>;
  topics!: Table<Topic, number>;
  messages!: Table<Message, number>;
  sessions!: Table<Session, number>;

  constructor() {
    super('VoiceAssistantDB');
    this.version(1).stores({
      personas: '++id, name, isCustom',
      topics: '++id, name',
      messages: '++id, sessionId, role, createdAt',
      sessions: '++id, personaId, topicId, createdAt'
    });
  }
}

export const db = new AppDB();

// Seed initial data
export async function seedDatabase() {
  const count = await db.personas.count();
  if (count === 0) {
    await db.personas.bulkAdd([
      {
        name: 'Assistant',
        icon: '🤖',
        systemPrompt: 'You are a helpful, concise AI assistant. Respond with short, natural conversational sentences suitable for speech.',
        isCustom: false
      },
      {
        name: 'English Coach',
        icon: '📚',
        systemPrompt: 'You are an English language coach. Correct my grammar gently, encourage practice, and speak in a clear, supportive tone.',
        isCustom: false
      },
      {
        name: 'Debate Partner',
        icon: '⚖️',
        systemPrompt: 'You are a debate partner. Take an opposing viewpoint to whatever I say. Push back constructively and challenge my reasoning in short, punchy responses.',
        isCustom: false
      }
    ]);
  }
}
