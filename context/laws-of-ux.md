# Laws of UX (21)

Source: https://www.uxdesigninstitute.com/blog/laws-of-ux/ (ingested 2026-09-02)
Reference companion to [[design-principles]] and [[style-guide]]. Each law: what it says, then how it applies to SolarOps.

## Heuristics

1. **Aesthetic-Usability Effect.** People judge attractive interfaces as easier to use, and forgive minor usability flaws in them. Polish is not decoration, it buys tolerance. But it also HIDES real problems in usability tests: pretty screens get fewer complaints than they deserve. Watch behaviour, not praise.
2. **Fitts's Law.** Time to hit a target scales with distance and inversely with size. Big, close targets are fast. SolarOps: field techs use phones one-handed. Primary actions go bottom, large, thumb-reachable; destructive actions go far from the primary.
3. **Goal-Gradient Effect.** Motivation rises the closer the goal looks. Show progress, and give a head start where honest (the "2 of 6 steps already done" framing). Applies to the sales XP/level system and to multi-step SO forms.
4. **Hick's Law.** Decision time grows with the number and complexity of choices. Break long option lists into steps, highlight a recommended default, progressively disclose the advanced stuff. Applies hard to the SO panel's tab and status pickers.
5. **Jakob's Law.** Users spend most of their time on OTHER products, so they expect yours to work the same way. Do not reinvent kanban, tables, date pickers, or nav. Ship the conventional pattern first.
6. **Miller's Law.** Working memory holds about 7 items, plus or minus 2. Chunk. Group related fields, cap what a card shows, put the most important information first. Do not make the user hold a case number in their head across two screens.
7. **Parkinson's Law.** A task expands to fill the time allotted. Make tasks finish faster than the user expects: autofill, sensible defaults, prefilled forms, a stated estimate. The Excel import and lead conversion are the places this pays.

## Gestalt principles

8. **Law of Common Region.** Elements inside a shared boundary are perceived as a group. A card, panel, or border is how you say "these belong together" without a label.
9. **Law of Proximity.** Things placed near each other are perceived as related. Whitespace is the cheapest grouping tool there is. If a label and its field drift apart, the pairing breaks.
10. **Law of Prägnanz.** The eye resolves complex shapes into the simplest form it can. Simple, regular layouts are processed and remembered faster. Prefer plain geometry over ornament.
11. **Law of Similarity.** Visually similar elements are read as having the same function. So: identical styling implies identical behaviour. Never style a non-clickable element like a button, and never style two different actions the same.
12. **Law of Uniform Connectedness.** Elements visually joined (a line, an arrow, a shared container) are perceived as more related than ones merely near each other. Use it for flows and status pipelines.

## Cognitive bias

13. **Peak-End Rule.** People judge an experience by its most intense moment and its ending, not its average. Invest in the peaks (the moment a job is marked complete) and the endings (confirmations, success states, error recovery).
14. **Serial Position Effect.** First and last items in a list are remembered best. Put the key actions at the start and end of a nav or menu; the middle is where things go to be ignored.
15. **Von Restorff (Isolation) Effect.** The item that differs is the one remembered. Exactly one visual standout per view. If everything is emphasised, nothing is. Reserve the accent colour for the primary action.
16. **Zeigarnik Effect.** Uncompleted tasks are remembered better than completed ones. Progress bars, checklists, and "3 items need attention" states create productive pull. Do not fake incompleteness to manipulate.

## Additional principles

17. **Doherty Threshold.** Productivity soars when system response is under 400ms. Below that, the user and the machine stay in flow. Above it, use skeletons, optimistic UI, and progress indicators to hold attention. Relevant to every sync and Supabase round trip.
18. **Occam's Razor.** Among designs with equal outcomes, choose the one with the fewest elements. Remove until it breaks, then put back one thing.
19. **Pareto Principle.** Roughly 80% of the value comes from 20% of the features. Find the few screens and actions that carry the real workload (Billing board, SO panel, contractor kanban) and spend the effort there.
20. **Postel's Law.** Be liberal in what you accept, conservative in what you require. Accept "FL" and "Florida", messy phone formats, pasted addresses. Ask only for fields you truly need. Normalize on ingest, never bounce the user for formatting.
21. **Tesler's Law (Conservation of Complexity).** Every system has irreducible complexity. The only question is who absorbs it, the user or the code. Absorb it in the code. A hidden default is cheaper than another form field.

## How to use these
They are heuristics, not rules. They inform decisions and give language for design critique, they do not replace user research or testing. When two conflict (Jakob vs a genuinely better new pattern, Miller vs an information-dense ops table), the real user's task wins.
