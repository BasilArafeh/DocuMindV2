export type DocumentItem = {
  docId: string;
  filename: string;
  chunksCreated: number;
  fileSizeMb?: number;
};

export type Citation = {
  n: number;
  filename: string;
  chunkIndex: number;
  chunkId?: string;
  docId?: string;
  text?: string;
};

export type RetrievalStatus = {
  documentCount: number;
  chunkCount: number;
  filenames: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  retrieval?: RetrievalStatus;
  error?: string;
  gap?: string;
  streaming?: boolean;
};

export type RailDestination = "chats" | "search" | "library";
