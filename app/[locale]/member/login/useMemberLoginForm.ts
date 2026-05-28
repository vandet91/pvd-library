"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export function useMemberLoginForm() {
  const locale = useLocale();
  const router  = useRouter();
  const t = useTranslations("memberPortal");

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
      // next-auth/react extracts ?error= from the redirect URL into result.error directly
      if (result.error === "PendingApproval") {
        setError(t("errorPendingApproval"));
      } else if (result.error === "AccountInactive") {
        setError(t("errorAccountInactive"));
      } else if (result.error === "AccountBlocked") {
        setError(t("errorAccountBlocked"));
      } else {
        setError(t("invalidCredentials"));
      }
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
