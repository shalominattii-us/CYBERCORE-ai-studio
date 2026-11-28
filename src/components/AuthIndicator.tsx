import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock,
  Shield,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldOff,
  Clock,
} from 'lucide-react';

interface AuthIndicatorProps {
  className?: string;
}

interface StoredSessionV2 {
  token: string;
  jti: string;
  expiresAt: string;
}

type SessionStateLabel = 'AUTHENTICATED' | 'REVOKED' | 'UNAUTHENTICATED';

const SESSION_STORAGE_KEY = 'aegentix_session_v2';
const AUTH_COOKIE_NAME = '__SECURE-aistudio_auth_flow_may_set_cookies';
const DEFAULT_SCOPES = ['studio:operator', 'stardust:read', 'stardust:control'];

function describeSessionIssueBlock(status: number, errorCode: unknown): string | null {
  if (errorCode === 'SESSION_ISSUE_LOCKED' || errorCode === 'CLOUDFLARE_ACCESS_UNAVAILABLE' || status === 503) {
    return 'Studio session minting is locked. Cloudflare Access must sit in front of /api/auth/session, with CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD set on the server.';
  }
  if (errorCode === 'CLOUDFLARE_ACCESS_REQUIRED' || errorCode === 'CLOUDFLARE_ACCESS_INVALID') {
    return 'Cloudflare Access did not authorize this browser. Sign in through Access, then retry.';
  }
  return null;
}

function truncateJti(jti: string | null): string {
  if (!jti) return '—';
  if (jti.length <= 16) return jti;
  return `${jti.slice(0, 8)}…${jti.slice(-4)}`;
}

function formatExpirationCountdown(expiresAt: string | null, nowMs: number): string {
  if (!expiresAt) return '—';
  const targetMs = new Date(expiresAt).getTime();
  if (Number.isNaN(targetMs)) return '—';
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  const timeLabel = new Date(targetMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  if (diffSec <= 0) {
    return `Expired (${timeLabel})`;
  }
  return `${mins}m ${String(secs).padStart(2, '0')}s (${timeLabel})`;
}

export const AuthIndicator: React.FC<AuthIndicatorProps> = ({ className = '' }) => {
  const [sessionStatus, setSessionStatus] = useState<SessionStateLabel>('UNAUTHENTICATED');
  const [tokenJti, setTokenJti] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [authMode, setAuthMode] = useState<string>('node-hmac-v2');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('Checking...');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const memorySessionRef = useRef<StoredSessionV2 | null>(null);
  const manualRevokedRef = useRef<boolean>(false);

  const isAuthenticated = sessionStatus === 'AUTHENTICATED';
  const isRevoked = sessionStatus === 'REVOKED';

  const readStoredSession = useCallback((): StoredSessionV2 | null => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredSessionV2>;
          if (
            typeof parsed.token === 'string' &&
            parsed.token &&
            typeof parsed.jti === 'string' &&
            typeof parsed.expiresAt === 'string'
          ) {
            const session: StoredSessionV2 = {
              token: parsed.token,
              jti: parsed.jti,
              expiresAt: parsed.expiresAt,
            };
            memorySessionRef.current = session;
            return session;
          }
        }
      }
    } catch {
      // sessionStorage may be restricted in sandboxed cross-origin contexts
    }
    return memorySessionRef.current;
  }, []);

  const writeStoredSession = useCallback((session: StoredSessionV2 | null): void => {
    memorySessionRef.current = session;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (session) {
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        } else {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch {
      // Ignore storage quota / sandbox exceptions
    }
  }, []);

  const syncBrowserCookie = useCallback((tokenValue: string | null): void => {
    try {
      if (typeof document !== 'undefined') {
        if (tokenValue) {
          document.cookie = `${AUTH_COOKIE_NAME}=${tokenValue}; Path=/; Max-Age=31536000; SameSite=Lax`;
        } else {
          document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
        }
      }
    } catch {
      // Ignore cookie write errors in restricted iframes
    }
  }, []);

  const updateCheckedTimestamp = useCallback(() => {
    setLastChecked(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  }, []);

  const syncSessionLifecycle = useCallback(async () => {
    setIsChecking(true);
    try {
      let stored = readStoredSession();

      // 1. If stored token is expiring within 120 seconds, silently refresh & rotate
      if (stored?.token && stored.expiresAt && !manualRevokedRef.current) {
        const msRemaining = new Date(stored.expiresAt).getTime() - Date.now();
        if (!Number.isNaN(msRemaining) && msRemaining <= 120_000 && msRemaining > 0) {
          try {
            const refreshRes = await fetch('/api/auth/session/refresh', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${stored.token}`,
              },
              body: JSON.stringify({ token: stored.token }),
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              if (refreshData.token && refreshData.jti && refreshData.expiresAt) {
                stored = {
                  token: refreshData.token,
                  jti: refreshData.jti,
                  expiresAt: refreshData.expiresAt,
                };
                writeStoredSession(stored);
                syncBrowserCookie(stored.token);
              }
            }
          } catch {
            // Continue to status verification
          }
        }
      }

      // 2. Check GET /api/auth/session/status (passing Authorization: Bearer <token> if present)
      try {
        const headers: Record<string, string> = {};
        if (stored?.token) {
          headers.Authorization = `Bearer ${stored.token}`;
        }
        const statusRes = await fetch('/api/auth/session/status', { headers });

        if (statusRes.status === 401) {
          const errData = await statusRes.json().catch(() => ({}));
          writeStoredSession(null);
          if (errData.revoked) {
            manualRevokedRef.current = true;
            setSessionStatus('REVOKED');
            setTokenJti(errData.jti || stored?.jti || null);
            setExpiresAt(null);
            setStatusMessage('Session JTI is revoked on server.');
            updateCheckedTimestamp();
            return;
          }
          stored = null;
        } else if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.authenticated) {
            manualRevokedRef.current = false;
            const resolvedJti = statusData.jti || stored?.jti || null;
            const resolvedExp = statusData.expiresAt || stored?.expiresAt || null;
            setSessionStatus('AUTHENTICATED');
            setTokenJti(resolvedJti);
            setExpiresAt(resolvedExp);
            if (Array.isArray(statusData.scopes) && statusData.scopes.length > 0) {
              setScopes(statusData.scopes);
            }
            if (statusData.mode) {
              setAuthMode(statusData.mode);
            }
            if (stored?.token && resolvedJti && resolvedExp) {
              writeStoredSession({
                token: stored.token,
                jti: resolvedJti,
                expiresAt: resolvedExp,
              });
            }
            updateCheckedTimestamp();
            return;
          }
        }
      } catch {
        // Graceful fallback below
      }

      // Preserve explicit user revocation until Authorize Session is clicked
      if (manualRevokedRef.current) {
        setSessionStatus('REVOKED');
        updateCheckedTimestamp();
        return;
      }

      // 3. First-visit seamless fallback: issue v2 HMAC session token, with /api/auth/status fallback
      try {
        const issueRes = await fetch('/api/auth/session/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (issueRes.ok) {
          const issueData = await issueRes.json();
          if (issueData.authenticated && issueData.token && issueData.jti && issueData.expiresAt) {
            const freshSession: StoredSessionV2 = {
              token: issueData.token,
              jti: issueData.jti,
              expiresAt: issueData.expiresAt,
            };
            writeStoredSession(freshSession);
            syncBrowserCookie(issueData.token);
            setSessionStatus('AUTHENTICATED');
            setTokenJti(issueData.jti);
            setExpiresAt(issueData.expiresAt);
            if (Array.isArray(issueData.scopes) && issueData.scopes.length > 0) {
              setScopes(issueData.scopes);
            }
            if (issueData.mode) {
              setAuthMode(issueData.mode);
            }
            updateCheckedTimestamp();
            return;
          }
        } else {
          const issueError = await issueRes.json().catch(() => ({}));
          const blocked = describeSessionIssueBlock(issueRes.status, issueError.error);
          if (blocked) {
            setSessionStatus('UNAUTHENTICATED');
            setStatusMessage(blocked);
            updateCheckedTimestamp();
            return;
          }
        }
      } catch {
        // Fallback to legacy /api/auth/status if v2 endpoint unreachable
      }

      try {
        const legacyRes = await fetch('/api/auth/status');
        if (legacyRes.ok) {
          const legacyData = await legacyRes.json();
          if (legacyData.authenticated || legacyData.hasCookie || legacyData.sessionActive) {
            setSessionStatus('AUTHENTICATED');
            setAuthMode(legacyData.mode || 'legacy-cookie');
            updateCheckedTimestamp();
            return;
          }
        }
      } catch {
        // Offline
      }

      setSessionStatus('UNAUTHENTICATED');
      updateCheckedTimestamp();
    } finally {
      setIsChecking(false);
    }
  }, [readStoredSession, syncBrowserCookie, updateCheckedTimestamp, writeStoredSession]);

  const handleAuthorizeSession = async () => {
    setIsChecking(true);
    setStatusMessage(null);
    manualRevokedRef.current = false;
    try {
      const res = await fetch('/api/auth/session/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token && data.jti && data.expiresAt) {
          const nextSession: StoredSessionV2 = {
            token: data.token,
            jti: data.jti,
            expiresAt: data.expiresAt,
          };
          writeStoredSession(nextSession);
          syncBrowserCookie(data.token);
          setSessionStatus('AUTHENTICATED');
          setTokenJti(data.jti);
          setExpiresAt(data.expiresAt);
          if (Array.isArray(data.scopes) && data.scopes.length > 0) {
            setScopes(data.scopes);
          }
          if (data.mode) {
            setAuthMode(data.mode);
          }
          setStatusMessage(`Issued HMAC-SHA256 session (${truncateJti(data.jti)})`);
          updateCheckedTimestamp();
          return;
        }
      } else {
        const issueError = await res.json().catch(() => ({}));
        const blocked = describeSessionIssueBlock(res.status, issueError.error);
        if (blocked) {
          setSessionStatus('UNAUTHENTICATED');
          setStatusMessage(blocked);
          updateCheckedTimestamp();
          return;
        }
      }

      // Legacy fallback if /api/auth/session/issue unavailable
      const fallbackRes = await fetch('/api/auth/authenticate', { method: 'POST' });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        syncBrowserCookie(fallbackData.value || 'session_active_verified');
        setSessionStatus('AUTHENTICATED');
        setStatusMessage('Authorized fallback cookie session.');
      }
    } catch {
      setStatusMessage('Network error while issuing session token.');
    } finally {
      updateCheckedTimestamp();
      setIsChecking(false);
    }
  };

  const handleRotateRefreshToken = async () => {
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const stored = readStoredSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (stored?.token) {
        headers.Authorization = `Bearer ${stored.token}`;
      }

      const res = await fetch('/api/auth/session/refresh', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: stored?.token || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token && data.jti && data.expiresAt) {
          manualRevokedRef.current = false;
          const rotatedSession: StoredSessionV2 = {
            token: data.token,
            jti: data.jti,
            expiresAt: data.expiresAt,
          };
          writeStoredSession(rotatedSession);
          syncBrowserCookie(data.token);
          setSessionStatus('AUTHENTICATED');
          setTokenJti(data.jti);
          setExpiresAt(data.expiresAt);
          if (Array.isArray(data.scopes) && data.scopes.length > 0) {
            setScopes(data.scopes);
          }
          setStatusMessage(`Rotated JTI → ${truncateJti(data.jti)}`);
          updateCheckedTimestamp();
          return;
        }
      } else if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        if (errData.revoked || isRevoked) {
          setSessionStatus('REVOKED');
          setStatusMessage('Cannot refresh a revoked token — click Authorize Session.');
        } else {
          setStatusMessage('No active token to rotate — click Authorize Session.');
        }
      }
    } catch {
      setStatusMessage('Failed to rotate session token.');
    } finally {
      updateCheckedTimestamp();
      setIsChecking(false);
    }
  };

  const handleRevokeToken = async () => {
    setIsChecking(true);
    setStatusMessage(null);
    manualRevokedRef.current = true;
    try {
      const stored = readStoredSession();
      const previousJti = stored?.jti || tokenJti;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (stored?.token) {
        headers.Authorization = `Bearer ${stored.token}`;
      }

      const res = await fetch('/api/auth/session/revoke', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: stored?.token || undefined }),
      });

      let revokedJti = previousJti;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.jti) {
          revokedJti = data.jti;
        }
      }

      writeStoredSession(null);
      syncBrowserCookie(null);
      setSessionStatus('REVOKED');
      setTokenJti(revokedJti || null);
      setExpiresAt(null);
      setStatusMessage(
        revokedJti
          ? `Revoked JTI ${truncateJti(revokedJti)} (401 enforced)`
          : 'Session revoked and cleared.'
      );
    } catch {
      writeStoredSession(null);
      syncBrowserCookie(null);
      setSessionStatus('REVOKED');
      setExpiresAt(null);
      setStatusMessage('Session cleared locally.');
    } finally {
      updateCheckedTimestamp();
      setIsChecking(false);
    }
  };

  useEffect(() => {
    syncSessionLifecycle();
    const pollInterval = setInterval(syncSessionLifecycle, 15000);
    return () => clearInterval(pollInterval);
  }, [syncSessionLifecycle]);

  useEffect(() => {
    if (!expiresAt && !isOpen) return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [expiresAt, isOpen]);

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Color-coded Status Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border cursor-pointer ${
          isAuthenticated
            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
            : isRevoked
            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-500/10'
            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700/60'
        }`}
        title={`Session Auth Status: ${sessionStatus} (Click for HMAC diagnostics)`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isAuthenticated
              ? 'bg-emerald-400 animate-pulse'
              : isRevoked
              ? 'bg-rose-400'
              : 'bg-amber-400'
          }`}
        />
        <Lock
          className={`w-3 h-3 ${
            isAuthenticated
              ? 'text-emerald-400'
              : isRevoked
              ? 'text-rose-400'
              : 'text-slate-400'
          }`}
        />
        <span className="font-semibold">Auth: {sessionStatus}</span>
        <span className="text-[10px] text-slate-500 hidden xl:inline">
          {isAuthenticated
            ? `(JTI: ${truncateJti(tokenJti)})`
            : isRevoked
            ? '(REVOKED)'
            : '(__SECURE: UNSET)'}
        </span>
      </button>

      {/* Details & Diagnostics Popover Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-[410px] bg-[#070D18] border border-cyan-500/40 rounded-xl shadow-2xl p-4 z-50 font-mono text-xs space-y-3 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white text-sm">Session Auth Diagnostics</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {/* Session Status Banner */}
            <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                  Session Status
                </span>
                <span
                  className={`flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[10px] ${
                    isAuthenticated
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : isRevoked
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {isAuthenticated ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      AUTHENTICATED
                    </>
                  ) : isRevoked ? (
                    <>
                      <ShieldOff className="w-3 h-3 text-rose-400" />
                      REVOKED
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      REVOKED / INACTIVE
                    </>
                  )}
                </span>
              </div>

              <div className="pt-1.5 border-t border-slate-900 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-cyan-400" />
                  Token JTI:
                </span>
                <code
                  className="text-cyan-300 font-mono font-semibold"
                  title={tokenJti || 'No token JTI'}
                >
                  {truncateJti(tokenJti)}
                </code>
              </div>

              <div className="pt-1.5 border-t border-slate-900 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  Expiration:
                </span>
                <span className="text-slate-200 font-semibold tabular-nums">
                  {formatExpirationCountdown(expiresAt, nowMs)}
                </span>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-400 text-[10px] block">Engine / Storage</span>
                <span className="font-semibold text-slate-200 mt-0.5 block truncate">
                  {authMode} · v2
                </span>
              </div>

              <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                <span className="text-slate-400 text-[10px] block">Last Inspected</span>
                <span className="font-semibold text-slate-200 mt-0.5 block">{lastChecked}</span>
              </div>
            </div>

            <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60 text-[10px]">
              <span className="text-slate-400 block mb-1">Active Scopes &amp; Cookie Binding:</span>
              <div className="flex flex-wrap gap-1 mb-1">
                {scopes.map((scope) => (
                  <span
                    key={scope}
                    className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                  >
                    {scope}
                  </span>
                ))}
              </div>
              <code className="text-slate-400 block truncate">{AUTH_COOKIE_NAME}</code>
            </div>

            {statusMessage && (
              <div className="text-[11px] text-cyan-200 bg-cyan-950/30 border border-cyan-500/30 rounded px-2.5 py-1.5">
                {statusMessage}
              </div>
            )}
          </div>

          {/* Primary Action Controls */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleRotateRefreshToken}
              disabled={isChecking}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 rounded text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>Rotate / Refresh Token</span>
            </button>

            <button
              onClick={handleAuthorizeSession}
              disabled={isChecking}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Authorize Session</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleRevokeToken}
              disabled={isChecking}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 rounded text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <ShieldOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Revoke Token</span>
            </button>

            <button
              onClick={syncSessionLifecycle}
              disabled={isChecking}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking...' : 'Re-check'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
