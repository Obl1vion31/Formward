export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export type ManualAiIdentity = { userId: string; permission: "read" | "write"; tokenId: string; oauthConnectionId?: never };
export type AiIdentity = ManualAiIdentity | { userId: string; permission: "read" | "write"; oauthConnectionId: string; tokenId?: never };
