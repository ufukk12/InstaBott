"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IgUser } from "@/lib/instagramApi";
import { getAuthData } from "@/lib/idb";
import {
  startAnalysis,
  loadStoredAnalysis,
  startGhostAnalysis,
  loadStoredGhostAnalysis,
  pingSessionAlive,
  verifyGtList,
  saveIgnoredIds,
  GT_VERIFY_COOLDOWN_MS,
  type AnalysisProgress,
} from "@/lib/instagramClient";
import { detectUnfollowers } from "@/lib/unfollowerDetector";
import { useUser } from "@/context/UserContext";
import { useUnfollowerNotification } from "@/components/analysis/UnfollowerNotification";
import { type LogEntry } from "@/components/analysis/LiveLogTerminal";
import {
  getUnfollowersHistory,
  initDB,
  type UnfollowerHistoryRecord,
} from "@/lib/indexedDbManager";
import { clientLogger, clientErrorMeta } from "@/lib/clientLogger";

// NOT: "unfollowing" ("Hayran Takipçiler") sekmesi arayüzden kaldırıldı.
// Veri katmanı KORUNUYOR — liste hâlâ hesaplanıyor, IndexedDB'ye yazılıyor ve
// hook'tan dönülüyor; yalnızca sekme/istatistik gösterimi kaldırıldı.
export type TabId = "notfollowers" | "ghost" | "history";

export function useAnalysisState({
  targetUsername,
  onSessionExpired,
  onRequireNewSession,
}: {
  targetUsername: string;
  onSessionExpired?: () => void;
  onRequireNewSession?: () => void;
}) {
  // Kesinti sonrası sidebar'daki token sayacını backend ile senkronize etmek için.
  // UserContext bu fonksiyonu "analiz sonrası çağrılır" notuyla tanımlamıştı ama
  // hiçbir yerden çağrılmıyordu — sayaç sayfa yenilenene kadar eskimiş kalıyordu.
  const { refresh: refreshUser } = useUser();

  const [auth, setAuth] = useState<{ sessionId: string; targetId: string; targetUsername: string } | null>(null);
  const [followers, setFollowers] = useState<IgUser[]>([]);
  const [following, setFollowing] = useState<IgUser[]>([]);
  const [notFollowers, setNotFollowers] = useState<IgUser[]>([]);
  const [unfollowing, setUnfollowing] = useState<IgUser[]>([]);
  const [ghostFollowers, setGhostFollowers] = useState<IgUser[]>([]);
  const [secretAdmirers, setSecretAdmirers] = useState<IgUser[]>([]);
  const [profileStats, setProfileStats] = useState<{ followersCount: number; followingCount: number } | null>(null);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("notfollowers");
  const [isRunning, setIsRunning] = useState(false);
  const [isGhostRunning, setIsGhostRunning] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { notify: notifyUnfollower, toastContainer, modal: unfollowerModal } = useUnfollowerNotification();
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [historyRecords, setHistoryRecords] = useState<UnfollowerHistoryRecord[]>([]);
  const analysisStartTime = useRef<number>(0);
  // Son başarılı kredi tüketiminin künyesi. Adım 5'te (Graceful Shutdown) analiz
  // hiç veri çekemeden düştüğünde iade (refund) için kullanılacak.
  const consumedCreditRef = useRef<{ usageLogId: string; consumedToken: boolean } | null>(null);
  const [tokenConfirmConfig, setTokenConfirmConfig] = useState<{ isOpen: boolean; action: () => void } | null>(null);
  const [cooldownConfirmConfig, setCooldownConfirmConfig] = useState<{ isOpen: boolean; action: () => void } | null>(null);
  const [nextAvailableTime, setNextAvailableTime] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);

  // ─── Yok Sayılanlar ────────────────────────────────────────────────────────
  // Kullanıcının GT listesinden elle çıkardığı kişiler (işletme hesapları vb.).
  // Kalıcı olarak saklanır ve sonraki analizlerde de geçerli kalır.
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);

  // ─── GT Doğrulama ──────────────────────────────────────────────────────────
  const [gtMissingCount, setGtMissingCount] = useState(0);
  const [isVerifyingGt, setIsVerifyingGt] = useState(false);
  const [gtVerifyMessage, setGtVerifyMessage] = useState<string | null>(null);
  const [gtVerifyReadyAt, setGtVerifyReadyAt] = useState<number | null>(null);
  const [gtVerifyCountdown, setGtVerifyCountdown] = useState<string | null>(null);

  // Doğrulama butonu, hesabın dinlenmesi için analizden sonra bir süre kilitli kalır.
  useEffect(() => {
    if (!gtVerifyReadyAt) {
      setGtVerifyCountdown(null);
      return;
    }
    const tick = () => {
      const diff = gtVerifyReadyAt - Date.now();
      if (diff <= 0) {
        setGtVerifyCountdown(null);
        setGtVerifyReadyAt(null);
        return;
      }
      const m = Math.floor(diff / 60000).toString().padStart(2, "0");
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
      setGtVerifyCountdown(`${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [gtVerifyReadyAt]);

  useEffect(() => {
    if (!nextAvailableTime) {
      setCooldownRemaining(null);
      return;
    }
    const interval = setInterval(() => {
      const diff = nextAvailableTime - Date.now();
      if (diff <= 0) {
        setCooldownRemaining(null);
        setNextAvailableTime(null);
      } else {
        const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
        setCooldownRemaining(`${h}:${m}:${s}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nextAvailableTime]);

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLiveLogs((prev) => [...prev, { timestamp, type, message }]);
  }, []);

  const handleProgress = useCallback(
    (p: AnalysisProgress) => {
      setProgress(p);

      // "pause-tick": uzun molanın saniyelik geri sayımı. SADECE ilerleme güncellenir —
      // log satırı eklenmez, aksi halde 38 saniyelik bir mola terminale 38 satır yazardı.
      if (p.step === "pause-tick") return;

      // "done": finally bloğundan BOŞ mesajla geliyor. Eskiden else dalına düşüp
      // her analizin sonunda terminale boş bir satır ekliyordu.
      if (p.step === "done") return;

      if (p.step === "precheck") addLog("info", p.message);
      else if (p.step === "fetching") addLog("progress", p.message);
      else if (p.step === "repair") addLog("progress", p.message);
      else if (p.step === "deficit-retry") addLog("progress", p.message);
      else if (p.step === "cooldown") addLog("warning", p.message);
      else if (p.step === "human-sim") addLog("info", "🎬 " + p.message);
      else if (p.step === "analyzing") addLog("info", p.message);
      else if (p.step === "ghost-precheck") addLog("info", p.message);
      else if (p.step === "complete") addLog("success", p.message);
      else if (p.step === "error") addLog("error", p.message);
      else addLog("info", p.message);
    },
    [addLog]
  );

  const loadHistory = useCallback(async () => {
    try {
      const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!jwtToken) return;
      const payload = JSON.parse(atob(jwtToken.split(".")[1]));
      const email = payload.email ?? payload.sub ?? "";
      if (!email) return;
      await initDB(email);
      const records = await getUnfollowersHistory(email);
      setHistoryRecords(records);
    } catch {
      // Sessiz hata
    }
  }, []);

  useEffect(() => {
    async function init() {
      const authData = await getAuthData();
      if (authData) setAuth(authData);

      const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      let email = "";
      if (jwtToken) {
        try {
          const payload = JSON.parse(atob(jwtToken.split(".")[1]));
          email = payload.email ?? payload.sub ?? "";
        } catch (e) {}
      }

      const activeTarget = authData?.targetUsername || targetUsername;

      if (email && activeTarget) {
        const stored = await loadStoredAnalysis(email, activeTarget);
        setFollowers(stored.followers);
        setFollowing(stored.following);
        setNotFollowers(stored.notFollowers);
        setUnfollowing(stored.unfollowing);
        setLastAnalysisAt(stored.lastAnalysisAt);
        setIgnoredIds(stored.ignoredIds);
        setGtMissingCount(stored.gtMissingCount);

        // Son analizin üzerinden bekleme süresi geçmediyse buton kilitli başlar
        if (stored.gtMissingCount > 0 && stored.lastAnalysisAt) {
          const readyAt = new Date(stored.lastAnalysisAt).getTime() + GT_VERIFY_COOLDOWN_MS;
          if (readyAt > Date.now()) setGtVerifyReadyAt(readyAt);
        }

        if (stored.profileStats) {
          setProfileStats({
            followersCount: stored.profileStats.followersCount,
            followingCount: stored.profileStats.followingCount,
          });
        }

        const ghostStored = await loadStoredGhostAnalysis(email, activeTarget);
        setGhostFollowers(ghostStored.ghostFollowers);
        setSecretAdmirers(ghostStored.secretAdmirers);
      }

      await loadHistory();

      if (jwtToken) {
        try {
          const checkRes = await fetch("/api/tokens/check", {
            method: "POST",
            headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "normal" }),
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.nextAvailableAt) {
              setNextAvailableTime(new Date(checkData.nextAvailableAt).getTime());
            }
          }
        } catch {}
      }
    }
    init();
  }, [loadHistory, targetUsername]);

  useEffect(() => {
    const running = isRunning || isGhostRunning;
    const event = new CustomEvent("analysisStateChange", { detail: running });
    window.dispatchEvent(event);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (running) {
        e.preventDefault();
        e.returnValue = "Analiz devam ediyor. Sayfadan ayrılırsanız analiz kesilebilir.";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.dispatchEvent(new CustomEvent("analysisStateChange", { detail: false }));
    };
  }, [isRunning, isGhostRunning]);

  
  const runAnalysisRef = useRef<((watcherUsername?: string) => Promise<void>) | undefined>(undefined);

  const handleStartAnalysis = useCallback(async () => {
    if (!auth?.sessionId || !auth?.targetId) {
      setError("Oturum veya hedef hesap bilgisi bulunamadı. Lütfen kurulumu yeniden yapın.");
      return;
    }

    setTokenError(null);
    let willConsumeToken = false;
    try {
      const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (jwtToken) {
        const checkRes = await fetch("/api/tokens/check", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "normal" }),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.allowed) {
            if (checkData.reason === "COOLDOWN") {
              setTokenError("Analiz 3 saatlik bekleme süresinde.");
              if (checkData.nextAvailableAt) {
                setNextAvailableTime(new Date(checkData.nextAvailableAt).getTime());
              }
            } else {
              setTokenError("Analiz hakkınız kalmadı. Devam etmek için FollowerToken satın alın.");
            }
            return;
          }
          willConsumeToken = checkData.willConsumeToken;
        }
      }
    } catch {}

    runAnalysisRef.current = async (watcherUsername?: string) => {
      setIsRunning(true);
      setError(null);
      setLiveLogs([]);
      analysisStartTime.current = Date.now();
      handleProgress({ step: "precheck", message: "Analiz başlatılıyor..." });
      addLog("success", "Bağlantı kuruldu");

      // try DIŞINDA: catch bloğu, duraklatılan analizin kurtarılan verisini
      // IndexedDB'den geri yüklerken bu değere ihtiyaç duyuyor.
      let email = "";

      try {
        const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
        if (jwtToken) {
          try {
            const payload = JSON.parse(atob(jwtToken.split(".")[1]));
            email = payload.email ?? payload.sub ?? "";
          } catch (e) {}
        }

        consumedCreditRef.current = null;

        if (jwtToken) {
            // TEK kesinti noktası — IG'ye hiçbir istek atılmadan ÖNCE çalışır.
            // Hata verirse catch bloğuna düşer ve analiz hiç başlamaz.
            const deductRes = await fetch("/api/tokens/deduct", {
                method: "POST",
                headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ type: "normal" })
            });

            const deductData = await deductRes.json().catch(() => ({}));

            if (!deductRes.ok) {
                throw new Error(deductData.error || "Bakiye işlemi başarısız. Lütfen token miktarınızı kontrol edin.");
            }

            // Sidebar'daki token sayacını anında güncelle
            void refreshUser();

            if (deductData.usageLogId) {
                consumedCreditRef.current = {
                    usageLogId: deductData.usageLogId,
                    consumedToken: !!deductData.consumedToken,
                };
            }

            // Ardından gözcü (watcher) hesabını nadasa bırak.
            // Bu route artık token KESMİYOR — sadece cooldown kaydı açıyor.
            if (watcherUsername) {
                await fetch("/api/analysis/start-cooldown", {
                   method: "POST",
                   headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
                   body: JSON.stringify({ username: watcherUsername })
                });
            }
        }
        
        const result = await startAnalysis(
          auth.sessionId,
          auth.targetId,
          auth.targetUsername || targetUsername,
          email,
          handleProgress
        );

        setFollowers(result.followers);
        setFollowing(result.following);
        setNotFollowers(result.notFollowers);
        setUnfollowing(result.unfollowing);
                        
        if (result.profileStats) {
          setProfileStats(result.profileStats);
        }

        setLastAnalysisAt(new Date().toISOString());
        setActiveTab("notfollowers");
        addLog("success", "Tüm analiz işlemleri başarıyla tamamlandı.");
        addLog("info", "ÖNERİ: Daha sonraki analizlerinizi, eğer sizi takipten çıkan bir kullanıcı olduğunu fark ederseniz gerçekleştirmeniz önerilmektedir.");
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : "";

        if (msg === "PAUSED_RATE_LIMIT") {
            // GRACEFUL SHUTDOWN: startAnalysis o ana kadarki veriyi diske yazdı.
            // Kurtarılanı ekrana geri yükle ki kullanıcı emeğinin karşılığını görsün.
            let recovered = 0;
            try {
              const stored = await loadStoredAnalysis(email, auth.targetUsername || targetUsername);
              setFollowers(stored.followers);
              setFollowing(stored.following);
              setNotFollowers(stored.notFollowers);
              setUnfollowing(stored.unfollowing);
              recovered = stored.followers.length + stored.following.length;
            } catch {
              // Yükleme başarısız olsa bile veri diskte duruyor — akışı bozma
            }

            setError(
              `Instagram hız sınırı (429) nedeniyle analiz duraklatıldı. ${recovered} kayıt kaybedilmeden saklandı. Bir süre bekleyip analizi yeniden başlattığınızda kaldığı yerden devam edecektir.`
            );
            addLog("warning", `Rate limit tespit edildi, analiz duraklatıldı. ${recovered} kayıt korundu.`);
        } else if (msg.includes("SESSION_INVALID") || msg === "SESSION_DEAD") {
            // Analiz ORTASINDA oturum öldü — normal akışta bu dal daha önce yoktu,
            // kullanıcı ham "SESSION_INVALID" metnini görüyordu.
            setError("Instagram oturumunuz analiz sırasında geçersiz hale geldi. Çekilen veriler korundu. Lütfen yeni bir Session ID girin.");
            addLog("error", "Oturum analiz sırasında geçersiz hale geldi.");
            onRequireNewSession?.();
        } else {
            setError(msg || "Analiz sırasında bir hata oluştu.");
            addLog("error", `Analiz hatası: ${msg || "Bilinmeyen hata"}`);
        }
      } finally {
        setIsRunning(false);
        handleProgress({ step: "done", message: "" });
      }
    };
    const runAnalysis = runAnalysisRef.current;

    const checkWatcherAndRun = async () => {
      const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      let watcherUsername: string | undefined = undefined;
      
      if (jwtToken && auth?.sessionId) {
        try {
          const checkWatcherRes = await fetch("/api/analysis/check-watcher", {
             method: "POST",
             headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
             body: JSON.stringify({ sessionId: auth.sessionId })
          });
          
          if (checkWatcherRes.ok) {
             const watcherData = await checkWatcherRes.json();

             // ÖLÜ SESSION ERKEN UYARI — token KESİLMEDEN ve analiz döngüsü
             // BAŞLAMADAN önce dur. Bu kontrol ek bir IG isteği maliyeti getirmez;
             // check-watcher'ın zaten attığı isteğin yanıtını kullanır.
             if (watcherData.sessionValid === false) {
               setError("Instagram oturumunuz (Session ID) geçersiz veya süresi dolmuş. Analiz başlatılmadı, hakkınızdan/token'ınızdan hiçbir şey düşülmedi. Lütfen yeni bir Session ID girin.");
               addLog("error", "Session ID geçersiz — analiz başlatılmadı, token kesilmedi.");
               onRequireNewSession?.();
               return;
             }

             watcherUsername = watcherData.username;
             if (watcherData.cooldownActive) {
               setCooldownConfirmConfig({
                 isOpen: true,
                 action: () => {
                   if (runAnalysis) runAnalysis(watcherUsername);
                 }
               });
               return; // pause for user interaction
             }
          }
        } catch (e) {
           clientLogger.warn("analiz", "Gözcü kontrolü başarısız — analiz yine de sürdürülüyor", clientErrorMeta(e));
        }
      }
      
      // If no cooldown or error, just run
      if (runAnalysis) runAnalysis(watcherUsername);
    };

    if (willConsumeToken) {
      setTokenConfirmConfig({
        isOpen: true,
        action: checkWatcherAndRun
      });
    } else {
      checkWatcherAndRun();
    }
  }, [auth, targetUsername, addLog, handleProgress, notifyUnfollower, onSessionExpired, loadHistory, onRequireNewSession, refreshUser]);

  const handleStartGhostAnalysis = useCallback(async () => {
    if (!auth?.sessionId || !auth?.targetId) {
      setError("Oturum bilgisi bulunamadı.");
      return;
    }
    if (followers.length === 0) {
      setError("Önce ana analizi çalıştırmalısınız (Takipçi verisi gerekli).");
      return;
    }

    setTokenError(null);
    let willConsumeToken = false;
    try {
      const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (jwtToken) {
        const checkRes = await fetch("/api/tokens/check", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ghost" }),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.allowed) {
            setTokenError("Hayalet Takipçi analizi için FollowerToken'ınız bulunmuyor.");
            return;
          }
          willConsumeToken = checkData.willConsumeToken;
        }
      }
    } catch {}

    const runGhost = async () => {
      setIsGhostRunning(true);
      setError(null);
      setProgress({ step: "ghost-precheck", message: "Hayalet takipçi analizi başlatılıyor..." });

      try {
        let email = "";
        const jwtToken = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
        if (jwtToken) {
          try {
            const payload = JSON.parse(atob(jwtToken.split(".")[1]));
            email = payload.email ?? payload.sub ?? "";
          } catch (e) {}
        }

        consumedCreditRef.current = null;

        // ÖLÜ SESSION ERKEN UYARI — token kesilmeden ve asıl IG istekleri
        // (latest-media, likers sayfalama) başlamadan önce oturumu doğrula.
        // Normal akışta bu bilgi check-watcher'dan bedavaya geliyor; ghost akışında
        // öyle bir istek olmadığı için tek bir hafif ping atılıyor.
        setProgress({ step: "ghost-precheck", message: "Instagram oturumu doğrulanıyor..." });
        const ping = await pingSessionAlive(auth.sessionId);
        if (ping === "dead") {
          throw new Error("SESSION_DEAD");
        }

        // DÜZELTME: Kesinti eskiden analiz BİTTİKTEN sonra yapılıyor ve hatası
        // boş bir catch ile yutuluyordu. Artık normal akışla aynı kural geçerli:
        // IG'ye istek atılmadan ÖNCE düşer, başarısız olursa analiz hiç başlamaz.
        if (jwtToken) {
          const deductRes = await fetch("/api/tokens/deduct", {
            method: "POST",
            headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "ghost" }),
          });

          const deductData = await deductRes.json().catch(() => ({}));

          if (!deductRes.ok) {
            throw new Error(deductData.error || "Bakiye işlemi başarısız. Lütfen token miktarınızı kontrol edin.");
          }

          if (deductData.usageLogId) {
            consumedCreditRef.current = {
              usageLogId: deductData.usageLogId,
              consumedToken: !!deductData.consumedToken,
            };
          }
        }

        const result = await startGhostAnalysis(
          auth.sessionId,
          auth.targetId,
          followers,
          email,
          auth.targetUsername || targetUsername,
          setProgress
        );

        setGhostFollowers(result.ghostFollowers);
        setSecretAdmirers(result.secretAdmirers);
        setActiveTab("ghost");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "SESSION_DEAD") {
          setError("Instagram oturumunuz (Session ID) geçersiz veya süresi dolmuş. Hayalet analizi başlatılmadı, token'ınızdan hiçbir şey düşülmedi. Lütfen yeni bir Session ID girin.");
          onRequireNewSession?.();
          setProgress({ step: "error", message: "Hata" });
          return;
        }
        if (msg === "ANALYSIS_ALREADY_RUNNING") {
          setError("Hayalet takipçi analizi zaten devam ediyor. Lütfen bekleyin.");
          setProgress({ step: "error", message: "Hata" });
          return;
        }
        if ((msg.includes("SESSION_INVALID") || msg.includes("Session")) && onSessionExpired) {
          onSessionExpired();
        }
        if (msg === "GHOST_NO_POSTS") {
          setError("Hedef hesapta hiç paylaşım bulunamadı. Hayalet takipçi analizi yapılamaz.");
        } else {
          setError(msg || "Hayalet takipçi analizi sırasında hata oluştu.");
        }
        setProgress({ step: "error", message: "Hata" });
      } finally {
        setIsGhostRunning(false);
      }
    };

    if (willConsumeToken) {
      setTokenConfirmConfig({ isOpen: true, action: runGhost });
    } else {
      runGhost();
    }
  }, [auth, followers, targetUsername, onSessionExpired, onRequireNewSession, refreshUser]);

  // ─── Yok Sayma Aksiyonları ─────────────────────────────────────────────────

  const currentEmail = useCallback((): string => {
    try {
      const jwt = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!jwt) return "";
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      return payload.email ?? payload.sub ?? "";
    } catch {
      return "";
    }
  }, []);

  const persistIgnored = useCallback(
    async (next: string[]) => {
      setIgnoredIds(next);
      const email = currentEmail();
      const target = auth?.targetUsername || targetUsername;
      if (!email || !target) return;
      try {
        await saveIgnoredIds(email, target, next);
      } catch (e) {
        clientLogger.warn("yok-say", "Yok sayılanlar kaydedilemedi", clientErrorMeta(e));
      }
    },
    [auth, targetUsername, currentEmail]
  );

  const ignoreUser = useCallback(
    (user: IgUser) => {
      if (ignoredIds.includes(user.id)) return;
      void persistIgnored([...ignoredIds, user.id]);
    },
    [ignoredIds, persistIgnored]
  );

  const unignoreUser = useCallback(
    (userId: string) => {
      void persistIgnored(ignoredIds.filter((id) => id !== userId));
    },
    [ignoredIds, persistIgnored]
  );

  // ─── GT Listesi Doğrulama (kullanıcı tetikli) ──────────────────────────────

  const handleVerifyGtList = useCallback(async () => {
    if (!auth?.sessionId || !auth?.targetId) {
      setError("Oturum bilgisi bulunamadı.");
      return;
    }

    const email = currentEmail();
    const target = auth.targetUsername || targetUsername;
    if (!email || !target) return;

    setIsVerifyingGt(true);
    setGtVerifyMessage(null);
    setError(null);
    setLiveLogs([]);

    try {
      const outcome = await verifyGtList(auth.sessionId, auth.targetId, email, target, handleProgress);

      if (outcome.status === "no_data") {
        setGtVerifyMessage("Doğrulanacak veri bulunamadı. Önce bir analiz çalıştırın.");
      } else if (outcome.status === "no_deficit") {
        setGtVerifyMessage("Doğrulanacak eksik kayıt yok — liste zaten eksiksiz.");
        setGtMissingCount(0);
      } else {
        // Güncellenen listeleri diskten geri yükle
        const stored = await loadStoredAnalysis(email, target);
        setFollowers(stored.followers);
        setNotFollowers(stored.notFollowers);
        setUnfollowing(stored.unfollowing);
        setGtMissingCount(stored.gtMissingCount);

        setGtVerifyMessage(
          outcome.remaining > 0
            ? `${outcome.corrected} yanlış kayıt kesin doğrulamayla listeden çıkarıldı. ${outcome.remaining} kayıt doğrulanamadı — listede en fazla ${outcome.remaining} hatalı kayıt kalmış olabilir.`
            : `${outcome.corrected} yanlış kayıt listeden çıkarıldı. Doğrulanmamış kayıt kalmadı ✓`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "ANALYSIS_ALREADY_RUNNING") {
        setError("Şu anda başka bir işlem çalışıyor. Lütfen bitmesini bekleyin.");
      } else {
        setError(msg || "Doğrulama sırasında bir hata oluştu.");
      }
    } finally {
      setIsVerifyingGt(false);
      handleProgress({ step: "done", message: "" });
    }
  }, [auth, targetUsername, currentEmail, handleProgress]);

  // ─── Türetilen Listeler ────────────────────────────────────────────────────
  // Yok sayılanlar GT listesinden düşülür, ayrı bir pencerede gösterilir.
  const ignoredSet = new Set(ignoredIds);
  const visibleNotFollowers = notFollowers.filter((u) => !ignoredSet.has(u.id));
  const ignoredUsers = notFollowers.filter((u) => ignoredSet.has(u.id));

  let activeList: IgUser[] = [];
  if (activeTab === "notfollowers") activeList = visibleNotFollowers;

  const anyRunning = isRunning || isGhostRunning;
  const pct = progress?.total && progress.total > 0 && progress.current != null
    ? Math.min(Math.round((progress.current / progress.total) * 100), 100)
    : 0;

  return {
    auth,
    followers,
    following,
    notFollowers,
    unfollowing,
    ghostFollowers,
    secretAdmirers,
    profileStats,
    lastAnalysisAt,
    activeTab,
    setActiveTab,
    isRunning,
    isGhostRunning,
    progress,
    error,
    toastContainer,
    unfollowerModal,
    liveLogs,
    tokenError,
    historyRecords,
    tokenConfirmConfig,
    setTokenConfirmConfig,
    cooldownConfirmConfig,
    setCooldownConfirmConfig,
    nextAvailableTime,
    cooldownRemaining,
    handleStartAnalysis,
    runAnalysis: (username?: string) => runAnalysisRef.current?.(username),
    handleStartGhostAnalysis,
    activeList,
    anyRunning,
    pct,
    // Yok sayma
    /** Yok sayılanlar düşülmüş GT listesi — istatistik ve sekme sayaçları bunu kullanmalı */
    visibleNotFollowers,
    ignoredUsers,
    ignoreUser,
    unignoreUser,
    // GT doğrulama
    gtMissingCount,
    isVerifyingGt,
    gtVerifyMessage,
    gtVerifyCountdown,
    /** Buton, bekleme süresi dolana kadar kilitli kalır */
    canVerifyGt: gtMissingCount > 0 && !gtVerifyCountdown && !anyRunning && !isVerifyingGt,
    handleVerifyGtList,
  };
}
