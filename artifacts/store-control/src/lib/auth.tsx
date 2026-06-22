import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db, type User } from "./db";
import { verifyPassword, ensureDefaultAdmin } from "./auth-users";

const SESSION_KEY = "store_control_session";

interface AuthCtx {
  user: Omit<User, "passwordHash"> | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "passwordHash"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      await ensureDefaultAdmin();
      const sessionJson = localStorage.getItem(SESSION_KEY);
      if (sessionJson) {
        try {
          const session = JSON.parse(sessionJson);
          const dbUser = await db.users.get(session.id);
          if (dbUser) {
            const { passwordHash: _ph, ...safeUser } = dbUser;
            setUser(safeUser);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  const signIn = async (username: string, password: string) => {
    const dbUser = await db.users.where("username").equals(username.toLowerCase().trim()).first();
    if (!dbUser) return { error: "Invalid username or password" };
    const valid = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) return { error: "Invalid username or password" };
    const { passwordHash: _ph, ...safeUser } = dbUser;
    setUser(safeUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: dbUser.id }));
    return { error: null };
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
