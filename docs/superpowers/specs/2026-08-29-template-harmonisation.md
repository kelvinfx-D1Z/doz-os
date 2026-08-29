# Harmonising the event templates with the rate card

**Date:** 2026-08-29
**Status:** Approved by the founder, ready to implement

## Why

The rate card holds 102 services with real BP and CP figures. The three event
templates hold 45 lines that name the same things differently, so **0 of 45**
match and a template-seeded budget still arrives with an empty cost column —
the exact thing the rate card was built to fix.

Two matchers have to agree for money to flow:

- **BP** flows through `EventTemplateItem.serviceItemId` (an id).
- **CP** flows through the pricing route's `name|category` fold, where
  `ProjectService.category` is the template line's **section**.

So a template line must carry the catalogue service's **name**, the catalogue
**department** as its section, and the service's **id**. Setting only the id
gets BP and silently leaves CP on the markup formula.

## Founder's corrections, taken as authoritative

1. **One LED screen is 3m x 2m** — "that is referred to as one screen". That is
   6sqm, so the existing row already means one screen. Larger walls take more
   panels to reach 6sqm, 10sqm, or whatever the job needs.
2. **The marked-up price of one screen is 250,000**, not the 225,000 seeded.
3. **"6 Channel Video Mixer + Recorder" is not a bundle** — "6 channel" is the
   mixer's input count. It maps 1:1 to the single catalogue mixer row. A
   12-channel mixer is planned but not yet acquired, so no row for it.
4. **Personnel can be split** — "they can be increase per production", so a
   split gives each role its own quantity.

## Catalogue changes

| Service | Change |
|---|---|
| `Displays > LED screen (6sqm)` | rename to **`LED screen (3m x 2m)`**; CP **225000 -> 250000**; BP unchanged at 150000; unit DAY |
| `Displays > LED wall (per sqm)` | **new row**. BP **25000**, CP **41667**, unit **SQM** |

The per-sqm figures are one screen divided by six (150000/6 = 25000,
250000/6 = 41666.67, rounded to the naira) so the two rows never disagree.
The founder can round CP to 42000 on the rate card page if he would rather
quote a round number; that is his call, not the seed's.

`prisma/seed-rate-card.mjs`'s `CATALOGUE` table must be updated to match, so a
fresh run of the seed produces the same figures. Note the seed is create-only
by design: it will **not** update the existing LED row, so that row's rename
and CP correction need an explicit, reported write.

## Template line mapping

For every row below: set the line's `name` to the service name, its `section`
to the department, and its `serviceItemId` to that service's id.

| Template | Current line | -> Service | Department |
|---|---|---|---|
| One-day | LED Screen | LED screen (3m x 2m) | Displays |
| One-day | Live Streaming | Livestreaming | Streaming & Broadcast |
| One-day | HD Cameras Complete Rig | Professional camera package | Cameras & Capture |
| One-day | Complete Audio System | Standard event sound | Sound |
| One-day | 6 Channel Video Mixer + Recorder | 6-channel HD mixer + monitor | Cameras & Capture |
| One-day | Stage Lights and Audience Light with Truss Stand | Stage & ambient lighting | Lighting |
| One-day | Photography | Photographer | Personnel |
| One-day | 65 Inch TV with Stands | TV + stand | Displays |
| One-day | Goose Mic — Panellist Microphones | Wired microphone | Sound |
| One-day | Background Lights | LED par / wash light | Lighting |
| Multi-day | Stage TV Monitor & Stand | TV + stand | Displays |
| Multi-day | Stage Timer Stand & Attendant | Stage timer | Displays |
| Multi-day | Live Streaming | Livestreaming | Streaming & Broadcast |
| Multi-day | HD Camera Chain | Professional camera package | Cameras & Capture |
| Multi-day | Complete Audio System | Standard event sound | Sound |
| Multi-day | Panellist Microphones | Wired microphone | Sound |
| Multi-day | 6 Channel Video Mixer + Recorder | 6-channel HD mixer + monitor | Cameras & Capture |
| Multi-day | Stage / Red Carpet / Welcome / Flags Branding | Backdrop branding | Branding & Print |
| Multi-day | Stage Lights and Audience Light with Truss Stand | Stage & ambient lighting | Lighting |
| Multi-day | Opening Animation and Partner Animation | Animated logo | Motion Graphics |
| Multi-day | Programme Slides | Event screen graphics | Motion Graphics |
| Multi-day | Photography | Photographer | Personnel |
| Lecture | HD Camera Chain | Professional camera package | Cameras & Capture |
| Lecture | Stage and Conference Platform Construction | Stage | Stage & Scenic Fabrication |
| Lecture | Video Mixer / Technical Presentation / Recorder and Playback | 6-channel HD mixer + monitor | Cameras & Capture |
| Lecture | 50 Inch Stage Monitor with Stand | TV + stand | Displays |
| Lecture | 50 Inch Timer | Stage timer | Displays |
| Lecture | Complete PA System including Speakers and Panellist Mics | Standard event sound | Sound |
| Lecture | Streaming Equipment | Livestreaming | Streaming & Broadcast |
| Lecture | Programme Slides / Animation | Event screen graphics | Motion Graphics |
| Lecture | Stage Lights and Audience Light with Truss | Stage & ambient lighting | Lighting |
| Lecture | Photography | Photographer | Personnel |
| Lecture | Post Production and Editing | Basic event edit | Post-Production |
| Lecture | External Branding — Red Carpet Background and Gate Banner | Backdrop branding | Branding & Print |

### Lines that split

**`Production Personnel`** (in all three templates) becomes three lines, each
with the split line's `defaultDays`, quantity 1, and its own `serviceItemId`:

| Service | Department |
|---|---|
| Production manager | Personnel |
| Videographer | Personnel |
| Camera assistant | Personnel |

**`Panellist Chairs and Stools`** (Multi-day) becomes two lines:

| Service | Department |
|---|---|
| Panel chair | Furniture |
| High stool | Furniture |

**`LED Screen + Riser`** (Multi-day and Lecture) becomes two lines: one mapped
to `LED screen (3m x 2m)` / Displays, and one left named **`Riser`** in section
`Stage & Scenic Fabrication` with **no** `serviceItemId` — the catalogue has no
riser, and inventing a match would put someone else's rate on it.

Splits inherit the original line's `sortOrder`, `defaultDays` and
`enabledByDefault`; give the extra lines adjacent sort orders so they stay
together.

### Lines with no counterpart — leave untouched, report them

`Professional Fees` (One-day, Lecture), `Decoration (Main Hall)` (Multi-day),
`Poster Session` (Multi-day), `Conference Advert Production` (Lecture), and the
two new `Riser` lines. These are real gaps in the rate card, not naming
mismatches, and the founder should see the list.

## What must be true afterwards

- Every mapped line's `name` equals its service's name **exactly**, its
  `section` equals the department name **exactly**, and its `serviceItemId`
  resolves to that service.
- A project seeded from a template arrives with real BP on every mapped line,
  and its `category` matches a department so the CP lookup resolves too.
- The six unmatched lines still exist, still seed, and are reported by name.
- Nothing is deleted. No `ProjectService`, `Project`, `Invoice` or `Quotation`
  row is touched.
