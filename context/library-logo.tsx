"use client";

import { createContext, useContext } from "react";

/**
 * Holds the library logo URL fetched server-side from the DB setting LIBRARY_LOGO.
 * Empty string means no logo has been uploaded yet — components should fall back
 * to the default BookOpen icon in that case.
 */
const LibraryLogoContext = createContext<string>("");

export function LibraryLogoProvider({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <LibraryLogoContext.Provider value={url}>
      {children}
    </LibraryLogoContext.Provider>
  );
}

/** Returns the logo URL or "" if none has been uploaded. */
export function useLibraryLogo(): string {
  return useContext(LibraryLogoContext);
}
