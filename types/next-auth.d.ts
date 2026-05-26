import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id:           string;
      name?:        string | null;
      email?:       string | null;
      image?:       string | null;
      role:         string;
      theme?:       string | null;  // "ocean"|"midnight"|"emerald"
      authStyle?:   string | null;  // "split"|"glass"|"minimal"
      authMethods?: string;         // JSON: ["password","google","magic"]
    };
  }

  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?:          string;
    role?:        string;
    theme?:       string | null;
    authStyle?:   string | null;
    authMethods?: string;
  }
}
