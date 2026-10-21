# The Great Wave — a generative homage

An animated, procedural canvas piece built with Angular, inspired by Katsushika Hokusai's woodblock print *Under the Wave off Kanagawa* (c. 1831), the best-known image from his series *Thirty-six Views of Mount Fuji*.

## Inspiration

Hokusai's print sets a towering wave, its crest breaking into clawing fingers of foam, against the calm, distant cone of Mount Fuji. Small fishing boats are dwarfed beneath the swell. It balances violence and stillness, and it renders water as pattern: flat Prussian blue, fine ink contour lines, and foam that fragments into hooked, branching shapes.

This project asks what that foam would look like if it kept breaking apart: each claw splitting into smaller claws, each of those splitting again.

## What is borrowed

- The composition: a large curling wave on the left, Fuji small and pale beneath its arc, boats in the troughs, a lower horizon.
- The palette: Prussian blues for the water, cream foam, a pale warm sky, and an aged-paper grain.
- The line work: dense contour striations along the face of the wave, with a thin ink outline.
- The foam as claws: curling, tapering fingers thrown forward off the crest.

## What is new

- **Fractal foam.** Each claw is a recursive curling tendril that splits into two or three smaller tendrils per level. The depth is adjustable.
- **Motion.** A looping cycle in which the wave builds, the foam explodes outward through the fractal levels, then dissolves and falls. Clicking the canvas triggers a new break.
- **Variation.** Every cycle draws a different wave: its height, curl, droop and tip position, the number of claws, and the number and placement of background waves and peaks.
- **Liberties.** A yellow sky, a light grey Fuji, extra peaks, and foam-capped swells across the sea. These are my own interpretation and are not in the print.

## Attribution

Hokusai's print is long in the public domain. This piece is an original, procedurally generated interpretation. It does not trace or reproduce the print, and every shape is generated in code.

## Running it

```bash
npm install
npm start      # http://localhost:4200
```

The gear button in the top right opens a panel for cycle length, fractal depth, spray, wave variation, background waves, swells and boats.

## Code

- `src/app/great-wave/great-wave.ts` — the Angular component: full-screen canvas, animation loop, settings panel.
- `src/app/great-wave/wave-renderer.ts` — all of the drawing: sky, mountains, sea, swells, boats, the great wave and its recursive foam.
