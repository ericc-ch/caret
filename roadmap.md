# Roadmap

## TUI Follow-Ups

- Improve streaming transcript performance. Current updates copy the transcript array on each assistant/thinking chunk, which is acceptable for short chats but may not scale to long sessions or fast streams.
- Add virtualization or another bounded rendering strategy for long transcripts.
- Avoid serializing full tool payloads before truncating compact previews.
- Add cancellation or timeout behavior for a hung `Agent.create()` while the UI is in the connecting state.
- Decide whether `Ctrl+C` should cancel an active run before exiting, or remain exit-only.
- Add an integration-style regression test for lazy `Agent.create()` through stream handling into transcript commits.
