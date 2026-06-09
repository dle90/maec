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

## Service 2 — Sensor 🟣 (the retina) (covered in depth)

**Job, precisely:** convert light into a neural signal (**phototransduction**) — high-res
center, low-res wide periphery. Camera's image chip. From here on it's *sick tissue* —
not patchable from outside; a dead pixel is dead.

**The inverted layout (counterintuitive):** light passes *through* the transparent neural
layers and is caught at the **back**, by photoreceptors resting on the RPE. Signal then
makes a U-turn forward and exits via the optic nerve.

**Photon layer trace (inner/light side → outer/back), 10 layers:**
`1 ILM · 2 RNFL (ganglion axons) · 3 ganglion bodies · 4 IPL · 5 INL(bipolar) ·
6 OPL · 7 ONL · 8 ELM · 9 PHOTORECEPTORS ★caught here · 10 RPE` → Bruch's → choroid.
Signal flows back: photoreceptor(9)→bipolar(5)→ganglion(3)→axon along RNFL(2)→disc→nerve.
The 3 load-bearing layers (★ in anatomy HTML §3): **RNFL** (glaucoma), **photoreceptors**
(RP), **RPE** (AMD).

**Rods vs cones:** cones (~6M, center/macula, detail+color, daylight) vs rods (~120M,
periphery, dim-light+motion, no color). → color/detail only central; off-center + colorless
at night.

**Fovea is a PIT, not "all layers stacked" (clarified):** macula = central ~5.5mm region,
*fully* layered (parafovea is the thickest retina). Fovea = a **depression** where the
inner layers are **swept aside** so light hits cones directly; foveola (~0.35mm) is
essentially **cones only**. Plus the **foveal avascular zone** (no vessels at center).
Sharp *because* layers removed, not added. The OCT "dip" = this pit. Macular hole = the
pit tearing; macular edema = fluid flooding/flattening it.

**RPE = the support cell that explains AMD:** recycles visual pigment (the *visual cycle*,
vitamin-A dependent → deficiency = night blindness), eats shed photoreceptor debris,
absorbs stray light (black backing), gatekeeps the choroidal blood supply. RPE fails →
debris (**drusen**) piles up → photoreceptors starve = **AMD** (a *support-cell* failure).

**Failure modes:** macula (AMD dry=RPE attrition+drusen / wet=choroidal neovascular leak;
DME; macular hole; epiretinal membrane), genetic photoreceptor (retinitis pigmentosa),
**retinal detachment** (film peels off — emergency; preceded by flashes/floaters from
vitreous traction), and vascular-driven (DR, RVO/RAO — cause = Vascular, victim = Sensor).

**Sensor blur ≠ Optical blur (the tells):** distortion (**metamorphopsia** — wavy lines),
a blind patch (**scotoma**), flashes/floaters/curtain, night/color trouble — and crucially
**glasses + pinhole DON'T help** (the bedside flag you've left Optical).

**Macular treatments (clarified — mostly NOT scalpel surgery):**
- Access problem: drops barely reach the back; pills need toxic doses → solution is
  **intravitreal injection** through the **pars plana** (~4mm behind cornea, behind the
  lens, in front of the retina — the one safe corridor; same door as pars-plana vitrectomy).
  *Never through the cornea* (it's the main lens → scar=blur; most pain-sensitive tissue;
  and the crystalline lens sits right behind it blocking the path → would cause cataract).
- **Injections** (workhorse): **anti-VEGF** (wet AMD, DME, RVO edema — repeat q1–3mo, not a
  cure), intravitreal steroids, complement inhibitors (slow dry-AMD geographic atrophy).
- **Laser** adjunct (focal/grid, PDT) — kept *off* the fovea.
- **Surgery = vitrectomy** only for *mechanical* problems (macular hole, ERM, traction,
  detachment).
- **Supplements** (AREDS2) slow dry AMD. Dead photoreceptors/geographic atrophy = not yet
  reversible (gene/cell therapy frontier).

**Blind spot (clarified — it's NOT the fovea):** it's the **optic disc**, ~15° nasal on the
retina (~15° temporal in the field), off-center, where the nerve exits and there are **no
photoreceptors**. Normal in everyone (not "broken"); unnoticed because off-center + other
eye covers it + brain fills in. *Opposite* of the fovea (best vs no vision). Physiological
blind spot vs pathological **scotoma** (new/abnormal).

**Scotoma localization (clarified — it's a localizer, not one place):** shape + location =
which part broke. One eye = retina/optic-nerve (before chiasm); both eyes/homonymous =
behind chiasm. Central = macula/optic-nerve; arcuate = glaucoma; bitemporal = chiasm.
Positive (sees a blob → retinal) vs negative (doesn't notice → neural). Mapped by perimetry.

**Tests:** dilated fundus exam, fundus photo, **OCT** (workhorse — layer cross-section),
OCT-A, FA, Amsler grid (home, central), visual field. Clinic: **Nidek RS-330 (TB-017)** =
OCT + fundus.

**MAEC hooks:** imaging-heavy → needs the imaging pipeline (DICOM/PACS or doc-path);
prime case for **compare-over-time** (OCT macula progression) and **anti-VEGF injection
tracking** (drug/eye/injection#/interval — repeat-visit lifelong patients); DR/AMD
screening pipelines (diabetes prevalence in VN = real volume).

---

## Service 3 — Transport 🔷 (optic nerve & visual pathway) (covered in depth)

**Job, precisely:** carry the signal from eye to visual cortex intact. The cable + network.
**Mostly a *victim* service** — its big diseases originate elsewhere and just show up here
(the optic nerve is the *final common path*).

**Route:** retina → **optic nerve (CN II)** → **chiasm** → **optic tract** → **LGN** (relay,
thalamus) → **optic radiations** → **V1** (occipital cortex).

**The chiasm trick (clarified — it's a RE-SORT, not a mush):** organizing principle changes
from **"by eye"** (each nerve = one whole eye) *before* the chiasm to **"by field side"**
(each tract = one half-field from *both* eyes) *after*. Nasal fibers cross, temporal stay;
for any field side, one eye sees it nasally + the other temporally, so crossing the nasal
ones gathers "same field, both eyes" into one tract. → lesion **before** chiasm = one eye
(monocular); **at** chiasm = bitemporal; **behind** = homonymous. (Camera-cable-splice
analogy works.) Anatomy HTML §6.

**Optic nerve is CNS, not PNS (clarified):** it's brain tissue → (1) **doesn't regenerate**
→ glaucoma/optic-nerve damage is **permanent**; (2) catches CNS disease (**MS** → optic
neuritis). Contrast: the eye-movement nerves (CN III/IV/VI, next service) are PNS-like and
*can* recover.

**Axon refresher (clarified):** axon = a neuron's long output wire. Neuron = dendrites
(in) + cell body + axon (out). Nerve = bundle of axons. Each **ganglion-cell axon** runs
from its body in the retina (layer 3), along the **RNFL** (layer 2) to the disc, out through
the **lamina cribrosa**, through nerve/chiasm/tract, and **ends at the LGN** (~5–7cm for one
cell!). It does **not** reach cortex — relay: ganglion→LGN, then a *2nd* neuron LGN→V1 via
radiations. Long thin wires = fragile (glaucoma, toxic/nutritional, papilledema = transport
backing up). Minority branch to pretectum (pupil reflex) + SCN (body clock).

**Optic disc ↔ 10 layers (clarified):** the disc is a **hole/exit**, not stacked layers.
Inner conducting layer (**RNFL/2**) converges, piles up at the rim, turns 90° and **exits**
through the **lamina cribrosa** (a perforated scleral plate; axons unmyelinated in front so
the retina stays clear, myelinated behind → white nerve). Outer sensing layers
(**photoreceptors/9, ONL/7, RPE/10**) **terminate at the disc margin** → no light sensing →
blind spot. **Cup** = central depression (few axons), **rim** = doughnut of axon bundles,
**CDR** = cup/disc ratio.

**Glaucoma mechanism (clarified — lamina is the *mechanism/site*, not the definition):**
glaucoma *is* the **death of ganglion-cell axons** (cupping + field loss). Chain: drainage
problem → high IOP → **lamina cribrosa bows back / pores deform → pinches axons + blocks
axoplasmic transport** (mechanical theory) ± **poor nerve-head blood flow** (vascular
theory) → axon death. "Tightens" is wrong (it bows/deforms). High IOP = main *risk factor*,
not necessary nor sufficient: **normal-tension glaucoma** (damage at normal IOP) +
**ocular hypertension** (high IOP, no damage) both exist. Treatment lowers IOP regardless
of theory. Pressure(6) → Transport(3) cascade.

**Central vs peripheral fibers (clarified — KEY glaucoma fact):** **papillomacular bundle**
= macular/central axons (enter disc temporally; ~half of all fibers, high redundancy);
**arcuate bundles** = peripheral (enter the weak superior/inferior disc poles).
**Glaucoma kills arcuate/peripheral first, spares the macular center until end-stage** →
field shrinks to **tunnel vision** while **20/20 acuity persists till late** → why it's
**silent** and why you **screen with visual fields, not the eye chart** (acuity = a macula
test). **Mirror image of macular disease** (center-first, periphery spared). Caveat: other
optic neuropathies (toxic/nutritional/neuritis) attack the **central** papillomacular bundle
*first* — vulnerability pattern is disease-specific.

**The pupil window — RAPD:** swinging-flashlight test; bad-nerve eye's pupils paradoxically
**dilate** when light swings to it = that optic nerve underperforming. **Cataract gives NO
RAPD** → separates signal problem (nerve/retina) from optics problem.

**Tells (eye can look normal up front):** RAPD, **color desaturation** (red washed out),
localizing field defects, disc changes (**cupping**=glaucoma, **swelling**=neuritis/
papilledema, **pallor**=old damage).

**Failure modes:** glaucoma (Pressure→), optic neuritis (Immune/CNS, MS), **AION/NAION**
(Vascular→, sudden painless altitudinal; arteritic = GCA = emergency, can blind 2nd eye in
days), compression (pituitary/orbit/thyroid), **papilledema** (raised intracranial pressure,
both discs — a brain red flag; IIH), post-chiasmal stroke/tumor (homonymous), toxic/
nutritional/hereditary.

**Tests:** **perimetry/visual field** (localizes), **OCT RNFL + ganglion-cell** (catches
glaucoma pre-field-loss), disc exam/photo (CDR), pupil/RAPD, color vision, **IOP/tonometry**,
MRI (compression/MS/stroke). Clinic: RS-330 (OCT/RNFL), tonometer TB-020 (IOP), perimetry =
add-on station ("thị trường").

**MAEC hooks:** **glaucoma = the marquee lifelong-monitoring workflow** — the IOP+RNFL+field
triad tracked over years → strongest case for **compare-over-time UI** + structured
values(value/unit/refLow/refHigh/flag) + a glaucoma register/recall (silent disease, must
recall or they go blind). Best example of the "asymptomatic screening" branch of the
diagnostic spine.

---

## Service 4 — Coordination 🟢 (two eyes as one) (covered in depth)

**Job:** aim both eyes at the same target + let the brain **fuse** the two images into one
3-D picture. Only *cross-plane* service. Camera analogy: two cameras on a rig that must stay
aligned + a processor stitching stereo.

**Why two eyes:** stereopsis (depth from the ~6cm offset) + wider field/redundancy. Cost:
images must align or the brain sees double.

**Parts:** 6 EOMs (extraocular muscles)/eye — 4 recti (sup/inf/med/lat; adduct=in,
abduct=out) + 2 obliques. 3 nerves (**LR₆SO₄**): CN VI→lateral rectus, CN IV→superior
oblique, CN III→the other 4 + lid lift + pupil. Brainstem **yokes** the pair; cortex
**fuses**.

**Failure modes:** **strabismus** (lác — eso=in, exo=out, hyper/hypo=up/down); **CN
palsies** (VI→can't abduct/eso/horizontal diplopia; IV→vertical diplopia + head tilt;
III→down-and-out + ptosis + maybe blown pupil = **aneurysm emergency**); **amblyopia**
(nhược thị) — childhood-only: brain suppresses a mismatched/blurry eye → permanent if missed
the **critical window (~age 7–8)**; eye is healthy, the *brain wiring* never developed.

**Diplopia rule:** true binocular double vision **disappears when one eye is covered** →
alignment problem. Monocular diplopia (one eye alone) → Optical (cataract/astigmatism).

**Cycloplegic refraction (clarified — when to use):** kids' accommodation is strong+labile.
Direction of error: **hyperopia gets HIDDEN** (they accommodate over it → manifest
under-measures; cycloplegia reveals latent hyperopia — the cause of accommodative
esotropia), **myopia gets OVER-stated** (over-minus/pseudomyopia). So cyclopege for: young
kids, first exam, **any esotropia**, suspected hyperopia, amblyopia, inconsistent results.
Can SKIP for cooperative older kids/teens with stable consistent myopia. Trust a manifest
refraction *without* drops via **fogging / push-plus (max plus to best acuity)**, duochrome,
retinoscopy, consistency + age-expected checks; escalate to drops if any flag. Don't always
cyclopege: drops = 45-min wait + hours-to-days of blur/photophobia + small side-effect risk
+ the cycloplegic number needs interpreting (adjust hyperopia down before prescribing).

**Tests:** cover test (alignment), motility H-pattern (localize weak muscle/nerve, HTML §7),
VA each eye separately (amblyopia), stereopsis (Worth 4-dot), cycloplegic refraction, pupil/
lid (CN III overlap).

**MAEC hooks:** **the cycloplegic-wait timer/queue** (FOLLOWUPS P1) — make cyclopegia a
*conditional* encounter step (triggered by age/eso/hyperopia/amblyopia/inconsistent manifest)
so the 45-min timer fires only on that path; peds/amblyopia recall (racing the critical
window); per-eye structured data (OD/OS asymmetry IS the signal); binocular-vision station =
workflow #2.

---

## Service 5 — Surface 🩵 (tear film, lids, conjunctiva, cornea surface) (covered in depth)

**Job:** keep the front wet, smooth, clear, defended — a smooth optical surface AND a
barrier. **Highest-volume service** (dry eye everywhere).

**Optical surprise:** the tear film is the eye's **first refracting surface** → breaks up →
fluctuating blur even with perfect cornea/lens/retina. Tells: "blur that **clears on
blinking**." Rule: **treat the surface before you measure** (dry film corrupts topo/biometry).

**Parts:** **3-layer tear film** — oil/lipid (meibomian glands in lids; stops evaporation) /
aqueous/water (lacrimal gland; bulk+nutrients) / mucin (conjunctival goblet cells; helps it
stick). **Lids** = wipers (spread+pump tears, house oil glands). **Conjunctiva** = lining,
makes mucin. **Corneal epithelium** = renewing barrier skin (CN V dense → very pain-
sensitive). **Lacrimal plumbing** = gland (makes) + drain (puncta→...→nose). **Blink reflex**
= CN V (sense) + CN VII (motor).

**Mechanism:** each blink relays the film; between blinks it thins → **TBUT (tear break-up
time, normal >10s)**; too fast → dry spots.

**Failure modes:** **dry eye** (khô mắt) — evaporative (most common; **MGD** = clogged oil
glands) vs aqueous-deficient (e.g. Sjögren's); mostly mixed/MGD-led → why tx is warm
compress + lid hygiene, not just tears. **Paradox: dry eye → watery eyes** (reflex flood of
bad tears). **Blepharitis** (lid-margin inflammation, MGD). **Conjunctivitis** (viral=watery
contagious / bacterial=purulent / allergic=itchy bilateral). **Keratitis/corneal ulcer** —
sight-threatening; bacterial/HSV(dendritic)/fungal/Acanthamoeba; **contact-lens overwear** a
top cause. **Abrasion** (agonizing). **Exposure** (can't close lid — CN VII) /
**neurotrophic** (lost CN V sensation → painless non-healing ulcer).

**Tell:** Surface is **felt** (gritty/burn/itch/water/photophobia) — opposite of silent
deep services. Itch→allergic; discharge→infective; pain+corneal spot+CL wearer→**urgent
ulcer**.

**Tests:** slit lamp (primary), TBUT, surface staining (fluorescein/lissamine), Schirmer
(tear volume), meibography (gland dropout). Devices: slit lamp Keeler TB-002, SBM **IDRA**
(surface analyzer, PDF+structured), Medmont (corrupted by bad surface).

**Treatments:** dry eye/MGD = warm compress + lid hygiene/massage, omega-3, artificial tears,
anti-inflammatory drops (cyclosporine/lifitegrast/steroid pulse), punctal plugs, IPL;
conjunctivitis by cause; keratitis = urgent culture + intensive drops, stop CL.

**Slit lamp (clarified — not "a flashlight"):** binocular **microscope** + a shapeable
**slit/sheet of light**; the slit at an angle gives an **optical cross-section** of
transparent tissue (which corneal layer; "cells & flare" in the aqueous like dust in a
projector beam). Adjustable width/angle/filters (cobalt blue→fluorescein). A **platform**:
hosts the tonometer, fundus/gonio lenses. The clinic's **anchor station**.

**MAEC hooks:** highest volume → throughput; IDRA + meibography = structured + PDF →
**document-path ingestor** (P2); **compare-over-time for meibography** (named in CLAUDE.md);
CL follow-up (#4) ≈ a Surface check; "treat-before-measure" = workflow ordering rule;
structured dry-eye metrics (TBUT/Schirmer/osmolarity/staining/meibo) = serviceFindings.

---

## Service 6 — Pressure 🟠 (aqueous production & drainage) (covered in depth)

**Job:** keep the globe inflated at the right pressure (IOP 10–21 mmHg) by balancing fluid
made vs drained. **Plus a nutrition role:** cornea+lens are **avascular** (clear because no
vessels) → the **aqueous itself feeds them**.

**Hydraulic loop (HTML §2):** ciliary body MAKES aqueous → posterior chamber → pupil →
anterior chamber → ANGLE → trabecular meshwork → Schlemm's canal → episcleral veins (~90%
conventional, ~10% uveoscleral). **IOP = flow vs outflow-resistance**; production ~constant,
so resistance is the variable. Every glaucoma drug = ↓production or ↑outflow.

**Failure modes — the two-way drain fork:**
- **Open-angle (POAG):** angle open but meshwork clogged → slow silent IOP rise (most
  common; the silent thief).
- **Angle-closure (PACG):** iris blocks the angle. **Acute crisis** = sudden severe pain,
  red eye, halos, nausea, mid-dilated fixed pupil, rock-hard eye, very high IOP =
  **emergency**. Predisposed: shallow AC, small/hyperopic eyes, older; **dilation can trigger
  it** → assess angle before dilating.
- **Secondary** (pigment/pseudoexfoliation/blood-hyphema/uveitis/neovascular[Vascular→]/
  steroid). **Ocular hypertension** (high IOP, healthy nerve). **Normal-tension** (damage at
  normal IOP). **Hypotony** (IOP too low → macular wrinkling).

**Measurement:** **tonometry** — Goldmann applanation (gold standard, on slit lamp), air-
puff (screening), **handheld (TB-020, "IOP follows the patient")**. Catch: **pachymetry**
(corneal thickness) skews it — thick reads falsely high, thin falsely low. **Gonioscopy**
(mirror lens) to see open vs closed angle. Diagnosis = **triad: IOP + structure (disc/RNFL)
+ function (visual field)**.

**Treatment ladder (↓production or ↑outflow):** drops (prostaglandins↑outflow=1st line;
beta-blockers/CAIs/alpha↓production; rho-kinase↑trabecular; pilocarpine for closure); laser
(**SLT** trabecular; **LPI** iridotomy for closure); surgery (trabeculectomy, tubes, MIGS,
cyclophotocoagulation). Acute closure = emergency IOP-lowering then LPI.

**MAEC hooks:** IOP = screening vital on every comprehensive exam; **portable IOP "follows
the patient"** (mobile v1 scope); glaucoma lifelong monitoring → structured IOP + compare-
over-time + register/recall; **angle/dilation safety flag** in encounter form; pachymetry =
interpretation modifier (value needs context).

---

## Service 7 — Vascular 🔴 (blood supply) (covered in depth)

**Job:** deliver O₂/nutrients + clear waste to retina + optic nerve via 2 circuits behind a
tight barrier. Retina = one of the hungriest tissues → very ischemia-sensitive.

**Supply (HTML §5):** **central retinal artery** (end-artery, no backup) → inner retina;
**choroid** (via short posterior ciliary arteries) → outer retina (photoreceptors+RPE,
highest blood flow/gram); optic-nerve-head own supply → NAION.

**Choroid anatomy (clarified):** it's a **vascular SHEET** (layers: Bruch's → choriocapillaris
capillary mat → Sattler medium → Haller large → suprachoroid). Fed by ~15–20 **short
posterior ciliary arteries that PIERCE the sclera from outside, near the optic nerve** (not
one tree — many pipes through the wall into a hidden mat); drained by **vortex veins piercing
the sclera at the equator**. Opposite architecture to the retinal artery's single "tree" off
the disc. Feeds photoreceptors by **diffusion across Bruch's** → cracks in Bruch's = wet AMD.

**Blood-retina barrier:** tight seals keep blood contents OUT of retina. Most vascular
disease = barrier breakdown → **leak → edema → blur**.

**Two mechanisms:** blockage (ischemia/infarct) or leak/wall-damage. Linked by **VEGF**:
ischemia → VEGF → leakage + **neovascularization** (fragile new vessels). → anti-VEGF blocks
signal; PRP laser destroys ischemic tissue making the signal.

**Failure modes:** **diabetic retinopathy (DR)** — NPDR (microaneurysms, hemorrhages,
exudates, **DME**) → PDR (neovascular → vitreous hemorrhage, tractional detachment,
neovascular glaucoma[→Pressure]); ETDRS-graded; tx = control sugar + anti-VEGF + PRP +
vitrectomy. **Hypertensive retinopathy** (AV nicking). **RVO** (vein clot → backed-up edema;
CRVO/BRVO). **RAO** = "eye stroke" — sudden painless loss, cherry-red spot, **embolic →
urgent stroke workup**, retina dies ~90min. Cascades: wet AMD (→Sensor), NAION (→Transport),
neovascular glaucoma (→Pressure). **ROP** (premature babies, screen).

**Window on the body:** retina = only place to *see* live vessels → diabetes/HTN often first
caught here; embolus = stroke/heart flag.

**Tests:** fundus exam/photo, OCT (edema), **FA** (dye — leakage/non-perfusion), OCT-A
(dye-free); systemic HbA1c/BP/carotid. Device: RS-330 (OCT+fundus+OCT-A).

**MAEC hooks:** **DR screening big for VN** (fundus-photo screening, structured DR-stage, AI-
grading candidate); anti-VEGF injection tracking + compare-over-time (shared w/ Sensor);
link eye↔systemic (HbA1c/BP) + referral loop; RAO = red-flag triage; cross-service cascades
= the inter-service reasoning layer argument.

---

## Service 8 — Immune 🟢 (defense system) (covered in depth)

**Job:** defend + police inside the eye (infection, debris) without damaging clear tissue.
Most disease = inflammation (overactive), not infection.

**Immune privilege:** the eye dials *down* internal immunity to stay transparent (barriers +
calming environment). Trade-off: internal **infections are devastating** (slow response) AND
immunity **over-reacts** when it fires → most inflammatory eye disease.

**Parts:** **uvea (màng bồ đào = iris+ciliary body+choroid)** = main battleground (vascular →
immune-cell access); inflammation = **uveitis**. Shared hardware → spills into Pressure/
Optical/Vascular. **Sclera** → scleritis. Conjunctiva/lacrimal (surface, allergy).

**Mechanism:** inflammation spills cells+protein into the anterior chamber → **"cells and
flare"** on slit lamp (dust+haze in a projector beam) = active intraocular inflammation.

**Failure modes:** **uveitis** by location — anterior/iritis (most common; pain+red+
photophobia+small pupil; HLA-B27, ankylosing spondylitis, IBD), intermediate (vitreous,
floaters), posterior (retina/choroid; toxoplasmosis, CMV), pan. Causes: autoimmune/systemic
(sarcoid, Behçet, JIA), infectious (toxo/herpes/TB/syphilis/CMV), idiopathic. Tx: steroids +
cycloplegic + immunomodulators/biologics + anti-infective if infectious. Complications
(cascades): glaucoma (inflammatory/steroid→Pressure), cataract, synechiae, **CME**(→Sensor).
**Scleritis** (deep boring pain, RA/vasculitis, can perforate; vs benign episcleritis).
**Endophthalmitis** (infection INSIDE eye — post-op/injection/trauma — **emergency**;
intravitreal abx + vitrectomy). **Allergic** (itch; overlaps Surface). **Sympathetic
ophthalmia** (injury to 1 eye → autoimmune attack on both). **Graft rejection**.

**Window on body:** uveitis/scleritis often = eye sign of systemic autoimmune/infectious
disease → systemic workup + co-manage rheum/ID.

**Tests:** slit lamp (cells & flare, keratic precipitates, synechiae), dilated exam/OCT
(posterior, CME), FA/OCT-A (vasculitis), IOP (inflammatory glaucoma), systemic workup.

**MAEC hooks:** chronic relapsing systemic-linked → longitudinal tracking + link systemic
dx/meds + recall; **steroid-use safety rule** (monitor IOP+lens — steroid glaucoma/cataract)
= encounter-form flag; **endophthalmitis red-flag** (pain+vision drop after injection/op →
emergency) in injection-tracking workflow; cross-service cascades.

---

## Service 9 — Autonomic 🟡 (automatic settings) (covered in depth)

**Job:** auto-tune pupil size (aperture), focusing (autofocus), lid tone — involuntarily.
Mostly valuable as a **diagnostic readout** (pupil = visible window to deep wiring).

**Two opposing wires:** **parasympathetic** (CN III) → constricts pupil (miosis) + drives
accommodation; **sympathetic** (long 3-stage path brain→chest→neck/carotid→eye) → dilates
pupil (mydriasis) + lifts lid (Müller's).

**Pupil reflexes:** light reflex — IN = optic nerve (afferent, Transport) → brainstem → OUT =
CN III (efferent, this service); **consensual** (both constrict). Near reflex triad =
converge + accommodate + constrict.

**Afferent vs efferent (key split):** **RAPD + EQUAL pupils = Transport** (IN wire); **UNEQUAL
pupils (anisocoria) = Autonomic** (OUT wire).

**Failure modes:** **Horner** (sympathetic cut → small pupil + ptosis + ↓sweat; long path →
serious causes: Pancoast tumor, **carotid dissection**, stroke → hunt cause). **CN III palsy
+ blown pupil** (compression/**aneurysm** = emergency; "**rule of the pupil**" —
compressive involves pupil, ischemic/diabetic spares it). **Adie's tonic pupil** (large,
light-near dissociation, benign). **Argyll Robertson** (small, reacts to near not light —
neurosyphilis). **Accommodation**: spasm/pseudomyopia (over-focus — the cyclo-refraction
issue), insufficiency; distinguish from **presbyopia** (lens hardware stiffening = Optical,
not the drive). Drug pupils (atropine→big, opioids→pinpoint).

**Anisocoria workup:** bigger pupil abnormal (won't constrict → parasym/CN III, worse in
light) vs smaller abnormal (won't dilate → sympathetic/Horner, worse in dark); physiologic
anisocoria (equal in light+dark) is benign/common.

**Window on body/brain:** pupil = core neuro vital (blown pupil in trauma = brain herniation).

**Tests:** pupil exam (size light/dark, direct+consensual, near, swinging-flashlight/RAPD,
light-vs-dark anisocoria), pharmacologic drops (Horner/Adie), accommodation measures,
MRI/CTA for red flags (aneurysm, dissection). Tx: mostly treat the cause; reading add/vision
therapy for accommodation; the service's drugs are also *tools* (mydriatics to dilate,
cycloplegics to refract).

**MAEC hooks:** structured per-eye pupil fields (size light/dark, reactivity, RAPD); dilation
safety flag (mydriatics → angle-closure, Autonomic→Pressure); red-flag triage (blown-pupil
CN III, new Horner → neuro/emergency); cycloplegia/accommodation ties to the cyclo-wait timer.

---

## All 9 covered. Next steps

The full map: **data plane** Optical→Sensor→Transport · **cross-plane** Coordination ·
**support plane** Surface·Pressure·Vascular·Immune·Autonomic. Load-bearing theme = shared
hardware + cascades (Pressure→Transport, Vascular→Sensor, Immune→multi, Vascular→Pressure).

Remaining options discussed with user:
- Synthesis pass — full cross-service cascade map; run real complaints through the diagnostic
  spine end-to-end (e.g. "red painful eye", "sudden painless vision loss").
- Turn this into deliverable 3 (the `docs/clinical/*.md` deep-dives).

> Possible doc improvement flagged during Transport: redraw anatomy HTML §6 with the
> explicit "by-eye → by-field-side" re-sort framing (currently shows only lesion sites +
> defect pictograms).
> User preference (from Service 7 on): keep a plain-language gloss next to every jargon term
> + abbreviation. Earlier services 1–6 in this doc are terser/jargon-first; re-gloss if these
> notes get promoted to the real deep-dives.
