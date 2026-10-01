"use client";

/**
 * UserContext — Kullanıcı bilgileri için global React Context.
 *
 * /api/auth/me endpoint'ini yalnızca BİR KEZ çağırır.
 * Tüm dashboard sayfaları bu context'i okur, her sekme değiştirişinde
 * yeniden fetch yapılmaz → displayId ve token sayısı sabit kalır.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface UserInfo {
  displayId: string;
  email: string;
  followerTokens: number;
  createdAt: string;
  todayUsage: number;
  monthUsage: number;
  dailyFreeRemaining: number;
  monthlyFreeRemaining: number;
  isVip: boolean;
}

interface UserContextValue {
  user: UserInfo | null;
  loading: boolean;
  /** Analiz sonrası token sayısını güncellemek için çağrılır */
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const token =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("auth_token")
          : null;

      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        // Cache'i devre dışı bırak — her refresh'te taze veri al
        cache: "no-store",
      });

      if (res.ok) {
        const data: UserInfo = await res.json();
        setUser(data);
      }
    } catch {
      // Sessiz hata — kullanıcı null kalır
    } finally {
      setLoading(false);
    }
  }, []);

  // Yalnızca ilk mount'ta çağrılır
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <UserContext.Provider value={{ user, loading, refresh: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

/** Dashboard bileşenlerinde kullanılacak hook */
export function useUser(): UserContextValue {
  return useContext(UserContext);
}
