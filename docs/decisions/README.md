# Architecture decisions

Short, dated records of *why a specific implementation was chosen*, for requirements that would
otherwise force implementation detail (concrete markup, CSS mechanism, pixel math, a particular
DOM structure) into [REQUIREMENTS.md](../../REQUIREMENTS.md).

[REQUIREMENTS.md](../../REQUIREMENTS.md) describes *outcomes and observable behavior* — what the
app does, from a user's/tester's point of view, kept implementation-independent so an
alternative implementation of the same requirement wouldn't need it rewritten.
[CONTRIBUTING.md](../../CONTRIBUTING.md) describes *conventions* — where code belongs, what gets
tested, styling/i18n rules. A decision here is the third layer: *why this particular solution*,
kept separate so it can be revisited (or superseded by a new ADR) without touching the
outcome-level requirement it implements.

This isn't a retroactive migration of everything implementation-specific already in
REQUIREMENTS.md — that would cost more than it returns for text that has been stable and
uncontroversial. New ADRs get added when a requirement is added or reworked and its
implementation reasoning would otherwise bloat REQUIREMENTS.md's outcome-level description (see
0001 for the first concrete case). Numbered sequentially, one file per decision, never edited
after the fact to reflect a later change — a later decision that changes course gets its own new
ADR that references and supersedes the old one, so the history of *why* stays intact.
