"use client"

import { BookOpen, CreditCard, Headphones, Mail, Package, Phone, UserRound } from "lucide-react"
import { useState } from "react"
import { CallWidget } from "@/components/call-widget"

const topics = [
  { icon: Package, title: "Orders and delivery", text: "Track a parcel, change an address, or report a missing item." },
  { icon: CreditCard, title: "Billing and payments", text: "Declined cards, refunds, invoices, and payment plans." },
  { icon: UserRound, title: "Your account", text: "Sign-in trouble, profile changes, and security settings." },
]

/** A generic contact center page, the kind a client would embed the call widget in. */
export default function ContactCenter() {
  const [callOpen, setCallOpen] = useState(false)

  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-5">
        <a href="#" className="flex items-center gap-2 font-display text-xl font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">A</span>
          Acme Support
        </a>
        <nav className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#topics" className="hover:text-foreground">
            Help topics
          </a>
          <a href="#contact" className="hover:text-foreground">
            Contact
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
              <span className="size-1.5 rounded-full bg-success" /> Lines open now
            </p>
            <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
              We&apos;re here to help, any time.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Talk to us straight from your browser. Our assistant answers right away and solves most things on the
              spot. If you need a person, you&apos;re connected to one who already knows your story.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setCallOpen(true)}
                className="flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 font-medium text-brand-foreground shadow-lg shadow-brand/25 transition hover:-translate-y-0.5"
              >
                <Phone className="size-4" /> Call us now
              </button>
              <a
                href="#topics"
                className="flex items-center gap-2 rounded-full border border-border px-6 py-3.5 font-medium hover:bg-muted"
              >
                <BookOpen className="size-4" /> Browse help topics
              </a>
            </div>
          </div>

          <div className="relative hidden md:block" aria-hidden>
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand-soft via-transparent to-accent/20" />
            <div className="relative flex flex-col gap-4 rounded-[2rem] border border-border bg-card p-7 shadow-xl">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <Headphones className="size-5" />
                </span>
                <div>
                  <p className="font-medium">Average wait</p>
                  <p className="text-sm text-muted-foreground">Answered instantly, any hour</p>
                </div>
                <p className="ml-auto font-display text-3xl font-semibold">0s</p>
              </div>
              <div className="rounded-2xl bg-muted p-4 text-sm">
                <p className="text-[11px] font-medium text-muted-foreground">Assistant</p>
                Hi Jane, I can see your order from Tuesday. Is this about the delivery?
              </div>
              <div className="ml-10 rounded-2xl bg-brand-soft p-4 text-sm">
                <p className="text-[11px] font-medium text-muted-foreground">You</p>
                Yes, it says delivered but I never got it.
              </div>
            </div>
          </div>
        </section>

        <section id="topics" className="border-y border-border bg-muted/50">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-3xl font-semibold">What can we help with?</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {topics.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-2xl border border-border bg-card p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-3xl font-semibold">Ways to reach us</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <button
              onClick={() => setCallOpen(true)}
              className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-6 text-left transition hover:border-brand"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <Phone className="size-5" />
              </span>
              <span>
                <span className="block font-medium">Call from your browser</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Answered instantly. Free, no phone needed. Ask for a person any time.
                </span>
              </span>
            </button>
            <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Mail className="size-5" />
              </span>
              <span>
                <span className="block font-medium">Email</span>
                <span className="mt-1 block text-sm text-muted-foreground">support@acme.example · replies within a day</span>
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Acme Support is a demo contact center for oneix.
      </footer>

      <CallWidget open={callOpen} onOpenChange={setCallOpen} />
    </div>
  )
}
