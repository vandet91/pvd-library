"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

export type ThemeName     = "ocean" | "midnight" | "emerald" | "academic";
export type AuthStyleName = "split" | "glass" | "minimal";

const VALID_THEMES:      ThemeName[]     = ["ocean", "midnight", "emerald", "academic"];
const VALID_AUTH_STYLES: AuthStyleName[] = ["split", "glass", "minimal"];

interface ThemeCtx {
  theme:        ThemeName;
  setTheme:     (t: ThemeName) => void;
  authStyle:    AuthStyleName;
  setAuthStyle: (s: AuthStyleName) => void;
}

const Ctx = createContext<ThemeCtx>({
  theme:        "ocean",
  setTheme:     () => {},
  authStyle:    "split",
  setAuthStyle: () => {},
});

export function useTheme() {
  return useContext(Ctx);
}

/** Write theme to cookie + DOM (enables SSR and avoids flash on next load). */
function persistThemeCookie(t: ThemeName) {
  localStorage.setItem("pvd-theme", t);
  document.cookie = `pvd-theme=${t}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.setAttribute("data-theme", t);
}

/** Save a single preference field to the server for the logged-in user. */
async function saveToServer(patch: { theme?: ThemeName; authStyle?: AuthStyleName }) {
  try {
    await fetch("/api/users/me", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
  } catch {
    // Non-critical — theme still works locally
  }
}

export default function ThemeProvider({
  children,
  serverTheme,
  serverAuthStyle,
}: {
  children:         React.ReactNode;
  serverTheme?:     ThemeName | null;
  serverAuthStyle?: AuthStyleName | null;
}) {
  const { data: session, status, update } = useSession();

  // Initialise from server-rendered value (no flash)
  const [theme,     setThemeState]     = useState<ThemeName>    (serverTheme     ?? "ocean");
  const [authStyle, setAuthStyleState] = useState<AuthStyleName>(serverAuthStyle ?? "split");

  /*
   * After hydration — reconcile theme priority.
   *
   * IMPORTANT: we key off `status` (not just the session values) so we can
   * distinguish "still loading" from "definitely unauthenticated".
   *
   * • loading        → do nothing. The SSR-applied data-theme is already
   *                    correct; touching localStorage here would cause a flash.
   * • unauthenticated → use serverTheme (the library admin's configured login
   *                    theme). Do NOT read localStorage — the user visiting the
   *                    login page should see the library default, not whatever
   *                    was stored from a previous browser session.
   * • authenticated  → normal priority: session DB → localStorage → serverTheme
   */
  useEffect(() => {
    if (status === "loading") return;

    const sessionTheme     = session?.user?.theme     as ThemeName     | null | undefined;
    const sessionAuthStyle = session?.user?.authStyle as AuthStyleName | null | undefined;

    if (status === "unauthenticated") {
      // Login page: just keep the SSR-correct library theme, don't touch localStorage
      const t = (serverTheme     && VALID_THEMES.includes(serverTheme))      ? serverTheme     : "ocean";
      const s = (serverAuthStyle && VALID_AUTH_STYLES.includes(serverAuthStyle)) ? serverAuthStyle : "split";
      setThemeState(t);
      setAuthStyleState(s);
      document.documentElement.setAttribute("data-theme", t);
      return;
    }

    // status === "authenticated"
    const localTheme     = (localStorage.getItem("pvd-theme")      ?? "") as ThemeName;
    const localAuthStyle = (localStorage.getItem("pvd-auth-style") ?? "") as AuthStyleName;

    const resolved = (sessionTheme && VALID_THEMES.includes(sessionTheme))
      ? sessionTheme
      : (localTheme && VALID_THEMES.includes(localTheme))
        ? localTheme
        : (serverTheme && VALID_THEMES.includes(serverTheme)) ? serverTheme : "ocean";

    const resolvedStyle = (sessionAuthStyle && VALID_AUTH_STYLES.includes(sessionAuthStyle))
      ? sessionAuthStyle
      : (localAuthStyle && VALID_AUTH_STYLES.includes(localAuthStyle))
        ? localAuthStyle
        : (serverAuthStyle && VALID_AUTH_STYLES.includes(serverAuthStyle)) ? serverAuthStyle : "split";

    setThemeState(resolved);
    setAuthStyleState(resolvedStyle);
    persistThemeCookie(resolved);
    localStorage.setItem("pvd-auth-style", resolvedStyle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.theme, session?.user?.authStyle]);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    persistThemeCookie(t);
    if (session?.user?.id) {
      // Save to DB then refresh the JWT so SSR picks it up on next page load
      saveToServer({ theme: t }).then(() => update({ theme: t }));
    }
  }, [session?.user?.id, update]);

  const setAuthStyle = useCallback((s: AuthStyleName) => {
    setAuthStyleState(s);
    localStorage.setItem("pvd-auth-style", s);
    if (session?.user?.id) {
      saveToServer({ authStyle: s }).then(() => update({ authStyle: s }));
    }
  }, [session?.user?.id, update]);

  return (
    <Ctx.Provider value={{ theme, setTheme, authStyle, setAuthStyle }}>
      {children}
    </Ctx.Provider>
  );
}
