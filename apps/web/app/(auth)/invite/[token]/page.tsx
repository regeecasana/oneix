"use client"

import { useParams } from "next/navigation"
import { SetPasswordForm } from "@/features/auth/set-password-form"

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  return <SetPasswordForm token={token} purpose="invite" />
}
