"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

export function useMemberLoginForm() {
  const locale = useLocale();
  const router  = useRouter();

  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      identifier,
      password,
      redirect:    false,
      callbackUrl: `/${locale}/discover`,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email / Member ID or password.");
      return;
    }

    router.push(`/${locale}/discover`);
  }

  return {
    identifier, setIdentifier,
    password,   setPassword,
    showPassword, setShowPassword,
    error, loading,
    handleSubmit,
  };
}
