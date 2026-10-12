import { describe, expect, it } from "vitest";
import { toChannel } from "./mapping.js";

describe("toChannel", () => {
  it.each([
    ["email", "email", null],
    ["chat", "chat", null],
    ["native_messaging", "messaging", "Messaging"],
    ["sunshine_conversations_facebook_messenger", "sunshine_conversations", "Messenger"],
    ["sunshine_conversations_api", "sunshine_conversations", "API"],
    ["whatsapp", "social", "WhatsApp"],
    ["viber", "social", "Viber"],
    ["voice", "phone", "Voice"],
    ["web", "web_form", "Web form"],
    ["api", "api", null],
    ["side_conversation", "other", "Side conversation"],
    ["closed_ticket", "other", "Closed ticket"],
    [null, "other", null],
  ])("maps %s to %s", (via, channel, detail) => {
    expect(toChannel(via)).toEqual({ channel, detail });
  });
});
