"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export function useLoginForm() {
  const t      = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();

  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Always pass an explicit callbackUrl so that any ?error= param already
    // in window.location.href never poisons the result URL that NextAuth returns.
    const result = await signIn("credentials", {
      identifier,
      password,
      redirect:    false,
      callbackUrl: `/${locale}/auth/me`,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("invalidCredentials"));
      return;
    }

    router.push(`/${locale}/auth/me`);
  }

  return {
    identifier, setIdentifier,
    password, setPassword,
    showPassword, setShowPassword,
    error,
    loading,
    handleSubmit,
    t,
  };
}
