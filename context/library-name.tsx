"use client";

import { createContext, useContext } from "react";

/**
 * Holds the library name fetched server-side from the DB setting LIBRARY_NAME.
 * Populated once in RootLayout → Providers and available to every client component.
 */
const LibraryNameContext = createContext<string>("PVD Library");

export function LibraryNameProvider({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <LibraryNameContext.Provider value={name}>
      {children}
    </LibraryNameContext.Provider>
  );
}

/** Returns the current library name from the DB setting LIBRARY_NAME. */
export function useLibraryName(): string {
  return useContext(LibraryNameContext);
}
