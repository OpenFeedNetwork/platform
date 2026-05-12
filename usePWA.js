/**
 * usePWA — React hook for Progressive Web App features
 * Handles: install prompt, service worker, offline status,
 *          push notifications, background sync, update detection
 */

import { useState, useEffect, useCallback, useRef } from "react";

export function usePWA() {
  const [installPrompt, setInstallPrompt]   = useState(null);
  const [isInstalled, setIsInstalled]       = useState(false);
  const [isOffline, setIsOffline]           = useState(!navigator.onLine);
  const [swReady, setSwReady]               = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [pushEnabled, setPushEnabled]       = useState(false);
  const [offlineQueue, setOfflineQueue]     = useState(0);
  const swReg = useRef(null);

  // ── Service Worker Registration ──────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(reg => {
        swReg.current = reg;
        setSwReady(true);
        console.log("[PWA] Service Worker registered:", reg.scope);

        // Check for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
              console.log("[PWA] Update available");
            }
          });
        });
      })
      .catch(err => console.warn("[PWA] SW registration failed:", err));

    // Listen for SW controller change (after update)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  // ── Install Prompt ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      e.preventDefault();
      setInstallPrompt(e);
      console.log("[PWA] Install prompt captured");
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ── Online/Offline Detection ──────────────────────────────────────────────
  useEffect(() => {
    const goOnline  = () => { setIsOffline(false); syncOfflineQueue(); };
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
    return outcome === "accepted";
  }, [installPrompt]);

  const applyUpdate = useCallback(() => {
    swReg.current?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const requestPushPermission = useCallback(async () => {
    if (!("Notification" in window) || !swReg.current) return false;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    try {
      const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY ||
        "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDkBNFFoeyPpibbhAhOmHkjOFolTeDxqrTh7Y-DIZ";
      const sub = await swReg.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      // Register subscription with backend
      await fetch("/api/v1/users/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      }).catch(() => {}); // Graceful fail in demo
      setPushEnabled(true);
      return true;
    } catch (err) {
      console.warn("[PWA] Push subscription failed:", err);
      return false;
    }
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (!swReg.current?.sync) return;
    try {
      await swReg.current.sync.register("ofa-post-sync");
      console.log("[PWA] Background sync registered");
    } catch (err) {
      console.warn("[PWA] Background sync not supported:", err);
    }
  }, []);

  const clearCache = useCallback(async () => {
    if (!swReg.current?.active) return;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = e => resolve(e.data.cleared);
      swReg.current.active.postMessage({ type: "CLEAR_CACHE" }, [channel.port2]);
    });
  }, []);

  return {
    // State
    canInstall:      !!installPrompt && !isInstalled,
    isInstalled,
    isOffline,
    swReady,
    updateAvailable,
    pushEnabled,
    offlineQueue,

    // Actions
    promptInstall,
    applyUpdate,
    requestPushPermission,
    syncOfflineQueue,
    clearCache,
  };
}

// Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default usePWA;
