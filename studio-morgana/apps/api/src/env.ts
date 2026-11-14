export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI?: Ai;
  ASSETS: Fetcher;
  AI_MODE?: string;            // live (default; a model answers) | local (no model: a small built-in generator, for offline work)
  AI_MODEL?: string;           // the writer; default @cf/openai/gpt-oss-120b
  AI_READER?: string;          // the reader (sees images); default @cf/meta/llama-4-scout-17b-16e-instruct
  AI_PROVIDER?: string;        // workers-ai (default) | openai: any OpenAI-compatible chat endpoint (OpenAI, Together, Groq, a vLLM of your own …)
  AI_BASE_URL?: string;        // openai provider: e.g. https://api.openai.com/v1
  AI_API_KEY?: string;         // openai provider: secret (wrangler secret put AI_API_KEY)
  // each role can have its own provider; anything unset falls back to the AI_* settings above
  READER_PROVIDER?: string; READER_BASE_URL?: string; READER_API_KEY?: string; READER_MODEL?: string;   // the reader (sees images)
  WRITER_PROVIDER?: string; WRITER_BASE_URL?: string; WRITER_API_KEY?: string; WRITER_MODEL?: string;   // the writer (godtongue)
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
