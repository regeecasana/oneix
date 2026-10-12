"use client"

import { PASSWORD_MIN_LENGTH } from "@oneix/contracts"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useChangePassword } from "./queries"

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const change = useChangePassword()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

  function close() {
    setCurrent("")
    setNext("")
    setConfirm("")
    setProblem(null)
    change.reset()
    onOpenChange(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (next.length < PASSWORD_MIN_LENGTH) return setProblem(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    if (next !== confirm) return setProblem("The new passwords don't match.")
    setProblem(null)
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success("Password changed. Other devices were signed out.")
          close()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Your oneix password. Other devices will be signed out.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {(problem || change.isError) && (
            <Alert variant="destructive">
              <AlertDescription>{problem ?? change.error?.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending && <Spinner data-icon="inline-start" />}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
