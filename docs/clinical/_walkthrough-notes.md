# Services walkthrough — working notes (draft material for the deep-dives)

> **Scratch doc, not a deliverable.** Captures the layman-language walkthrough
> of the 9-service framework done interactively with the user (the clinic
> owner/dev learning ophthalmology to make better EMR decisions). The polished
> versions of this material become the 8 deep-dives under `docs/clinical/`
> (deliverable 3 of `../clinical-primer-plan.md`). Delete or fold in once those
> ship. Style here is deliberately layman-first, jargon in parentheses, matching
> how the user wanted to learn it.

## Master analogy — the eye as a networked camera in a building

- **3 services ARE the camera** (data plane): Optical (lens) → Sensor (chip) →
  Transport (cable to the recorder/brain).
- **1 service aims two cameras together** (cross-plane): Coordination.
- **5 services are the building utilities** keeping the camera alive (support
  plane): Surface, Pressure, Vascular, Immune, Autonomic.

Load-bearing point throughout: services **share hardware**, so failures cascade
(glaucoma = Pressure→Transport; diabetic retinopathy = Vascular→Sensor; uveitis =
Immune→Optical+Pressure+Vascular). A future diagnostic/AI layer must model the
cascade graph, not nine isolated checkers.

## One-line layman model per service

| # | Service | Color | Camera analogy | Fails as |
|---|---|---|---|---|
| 1 | Optical 🔵 | `#2563eb` | the lens barrel (focus) | refractive error, presbyopia, cataract |
| 2 | Sensor 🟣 | `#7c3aed` | the image chip (retina) | AMD, detachment, RP |
| 3 | Transport 🔷 | `#4338ca` | the cable to the recorder | glaucoma (victim), optic neuritis, NAION |
| 4 | Coordination 🟢 | `#0d9488` | two cameras on one rig | strabismus, diplopia, amblyopia |
| 5 | Surface 🩵 | `#0891b2` | protective glass + wipers/washer | dry eye (MGD), conjunctivitis, keratitis |
| 6 | Pressure 🟠 | `#ea580c` | housing air pressure + drain | glaucoma (cause) |
| 7 | Vascular 🔴 | `#dc2626` | power + cooling supply | diabetic retinopathy, RVO/RAO, wet AMD |
| 8 | Immune 🟢 | `#16a34a` | building security guards | uveitis, scleritis |
| 9 | Autonomic 🟡 | `#ca8a04` | auto-settings (aperture + autofocus) | Horner, Adie, CN III pupil |

---

## Service 1 — Optical stack 🔵 (covered in depth)

**Job, precisely:** bend incoming light so a sharp image lands exactly on the
retina. Pure optics — nothing here detects or interprets. If this is the *only*
fault, the eye is healthy tissue; the picture just isn't landing in focus. Unique
property: **patchable from outside** with a corrective lens (glasses/CL) — you're
adding to the lens stack, not healing tissue.

**Parts in light's order:**
1. **Cornea (giác mạc)** — clear front dome, *fixed* +43 D, does **~⅔** of all
   focusing (the surprising bit — not the inner lens).
2. **Aqueous (thủy dịch)** — clear fluid spacer; just stays transparent.
3. **Pupil (đồng tử)** — the aperture/hole (the iris that sizes it = Autonomic).
4. **Crystalline lens (thủy tinh thể)** — *variable* ~+20 D, changes shape to
   fine-tune.
5. **Vitreous (dịch kính)** — clear gel spacer; just stays clear.

→ Two lenses (cornea + lens) separated by clear spacers; total ~+60 D for a
normal eye matched to its ~24 mm length.

**Diopter (D, đi-ốp):** unit of bending power. Normal eye's ~+60 D must match its
length so focus lands *on* the retina. Glasses Rx is in diopters = the
added/subtracted power to fix a mismatch.

**Accommodation (điều tiết) = autofocus.** Near light diverges and needs more
bending; the **ciliary muscle (thể mi)** contracts → lens fattens → power up →
near snaps into focus. Relax → flatten → distance.

**Four failure modes:**
- **Refractive error (tật khúc xạ)** — power vs length mismatch:
  - **Myopia (cận thị)**: eye too long/strong → focus in front → distance blur →
    *minus* lens. NB: a long myopic eye is *stretched/thinner* → higher lifetime
    risk of retinal tears + glaucoma. So myopia is also a structural risk flag for
    other services, not just an optical nuisance.
  - **Hyperopia (viễn thị)**: eye too short/weak → focus behind → near blur first;
    the young hide it by accommodating → *plus* lens.
  - **Astigmatism (loạn thị)**: cornea shaped like a rugby ball, not a sphere →
    bends differently by direction → smeared at all distances → *cylinder* + axis.
  - axial (length) vs refractive (power) blur look identical on the chart but differ
    in downstream risk.
- **Presbyopia (lão thị):** autofocus wears out ~40 — lens stiffens, ciliary can't
  deform it. Universal clock, not a disease → reading add / bifocal / progressive.
- **Cataract (đục thủy tinh thể):** the variable lens goes **cloudy** — a
  *transparency* failure, not a focus error. Glasses can't fix it; remove lens,
  implant an **IOL**. Hands off to surgery + biometry.
- **Media opacity (edge case):** corneal scar / vitreous hemorrhage clouds the
  clear spacers even if the lenses are fine.

**How we measure it:** autorefractor (fast machine guess + K), subjective
refraction (phoropter "better 1 or 2?" — patient confirms), slit lamp (lens/cornea),
biometry (IOL power pre-op), **pinhole** (sharpens only *optical* blur → fast test
to separate Optical from Sensor/Transport).

**One-sentence model:** Optical = a two-lens focusing stack + autofocus motor;
fails by mismatch (refractive error), worn motor (presbyopia), or cloudiness
(cataract) — and uniquely, mismatches are patchable with an external lens.

### MAEC hooks noticed during this pass (for the refractive-error / cataract deep-dives)
- Pinhole result is a cheap, high-value structured field — it pre-sorts "correctable
  vs not" before any expensive test. Candidate registration/triage field.
- Myopia-as-risk-flag argues for storing axial length (when biometry runs) on the
  patient, not just the encounter — feeds the deferred compare-over-time + peds
  myopia-control tracker.
- Cataract is the Optical→surgery handoff; biometry → IOL formula → surgical plan is
  its own workflow (P2 in CLAUDE.md) and belongs in `cataract-and-iol.md`.

---

## Services 2–9 — TODO (continue the walkthrough)

Not yet covered in depth. Resume here: Sensor next, same format (job → parts →
mechanism → failure modes → tests → MAEC hooks). User is asking confirming
questions between services, so expect clarifications to fold in.
