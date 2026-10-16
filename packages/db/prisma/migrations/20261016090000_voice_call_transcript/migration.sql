-- The AI part of a call, kept live for the ticket.
ALTER TABLE "VoiceCall" ADD COLUMN "transcript" JSONB;
