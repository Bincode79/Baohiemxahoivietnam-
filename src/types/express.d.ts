// Extend Express Request to carry authenticated session data.
// All real types live here as a global declaration so it works without
// requiring an explicit import across the codebase.

interface AdminSession {
  id: number;
  username: string;
  role: string;
}

interface UserSession {
  role: string;
  userId: number;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminSession;
      user?: UserSession;
    }
  }
}

export {};
