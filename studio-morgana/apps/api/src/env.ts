export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI?: Ai;
  ASSETS: Fetcher;
  AI_MODE?: string;            // workers-ai (default) | local (no model: a small built-in generator, for offline work)
  AI_MODEL?: string;           // the writer; default @cf/openai/gpt-oss-120b
  AI_READER?: string;          // the reader (sees images); default @cf/meta/llama-4-scout-17b-16e-instruct
  AI_ROUNDS?: string;          // how many times the writer may fix what the compiler rejects (default 3)
  APP_URL?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;     // secret; email is off until it is set
  ANON_DAILY_GENERATIONS?: string;
  USER_DAILY_GENERATIONS?: string;
  ANON_DAILY_COMMANDS?: string;
  USER_DAILY_COMMANDS?: string;
}

export interface Who {
  userId: string | null;
  email: string | null;
  role: 'user' | 'admin' | null;
  visitor: string;
  owner: string;               // u:<id> or a:<visitor>
}

export type App = { Bindings: Env; Variables: { who: Who } };
