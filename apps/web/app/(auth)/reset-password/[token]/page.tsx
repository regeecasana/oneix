"use client"

import { useParams } from "next/navigation"
import { SetPasswordForm } from "@/features/auth/set-password-form"

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  return <SetPasswordForm token={token} purpose="password_reset" />
}
