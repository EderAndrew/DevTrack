import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { configureApiSession } from "../api/instance";
import { clearSessionToken, readSessionToken, saveSessionToken } from "./secure-session";

export interface SessionStore {
  read(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

const secureStore: SessionStore = { read: readSessionToken, save: saveSessionToken, clear: clearSessionToken };

export type SessionStatus = "loading" | "signedOut" | "signedIn";

export interface Session {
  status: SessionStatus;
  /** The session ended by itself (expired or revoked): "Entrar" says so (024/US1-5, US1-6). */
  expired: boolean;
  signIn(token: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * The app's session on the device (024/FR-003, research Y3): the secret lives only in the secure store and
 * in memory; a `401` from any request means the server ended it (revocation, expiry), so it is cleared with
 * the query cache and the app returns to "Entrar" with the expired message.
 */
export function SessionProvider({ children, store = secureStore }: { children: ReactNode; store?: SessionStore }) {
  const queryClient = useQueryClient();
  const token = useRef<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [expired, setExpired] = useState(false);

  const end = useCallback(
    async (byServer: boolean) => {
      token.current = null;
      setStatus("signedOut");
      setExpired(byServer);
      queryClient.clear();
      await store.clear();
    },
    [queryClient, store],
  );

  useEffect(() => {
    configureApiSession({
      getToken: async () => token.current,
      onUnauthorized: () => {
        if (token.current !== null) void end(true);
      },
    });
    let active = true;
    void store.read().then((saved) => {
      if (!active) return;
      token.current = saved;
      setStatus(saved ? "signedIn" : "signedOut");
    });
    return () => {
      active = false;
    };
  }, [end, store]);

  const value = useMemo<Session>(
    () => ({
      status,
      expired,
      signIn: async (secret) => {
        await store.save(secret);
        token.current = secret;
        setExpired(false);
        setStatus("signedIn");
      },
      signOut: () => end(false),
    }),
    [status, expired, store, end],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession fora do SessionProvider");
  return session;
}
