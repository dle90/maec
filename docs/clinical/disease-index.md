# Eye disease index — by service, with plain-language glosses

> **Scratch/reference doc** (draft material for the eventual `docs/clinical/*.md`
> deep-dives, deliverable 3 of [`../clinical-primer-plan.md`](../clinical-primer-plan.md)).
> Organized by the **9-service framework** from
> [`../clinical-primer.md`](../clinical-primer.md): each disease mapped to **which
> service(s) failed**, its symptoms, the test that confirms it, and treatment.
> Written from training-data knowledge — a clinical reviewer should verify before
> any patient-facing or vendor use. Plain-language gloss in **( )** next to jargon.

**Legend:** ⚠️ = emergency / urgent. Cascade arrows (e.g. Pressure→Transport) =
the failure starts in one service and damages another.

## Abbreviation cheat-sheet (plain meaning)
- **VA** = visual acuity (how sharp the vision is — the eye-chart number, e.g. 20/20)
- **IOP** = intraocular pressure (the pressure inside the eyeball)
- **VF** = visual field (the full map of side-to-side vision; tested by "perimetry")
- **OCT** = optical coherence tomography (a cross-section scan of the retina/nerve — like an ultrasound made of light)
- **FA** = fluorescein angiography (photos of the retinal blood vessels after a dye is injected into an arm vein)
- **fundus** = the back inside of the eye (retina, disc, vessels) seen/photographed through the pupil
- **RAPD** = relative afferent pupillary defect (a pupil sign of a bad optic nerve, found with the swinging-flashlight test)
- **RNFL** = retinal nerve fiber layer (the layer of optic-nerve wires; its thickness is measured on OCT)
- **TBUT** = tear break-up time (how many seconds the tear film lasts before it breaks — a dry-eye test)
- **CL** = contact lens
- **anti-VEGF** = an injection that blocks the "grow new vessels / leak" chemical signal
- **PRP** = panretinal photocoagulation (laser burns to the peripheral retina)
- **IOL** = intraocular lens (the artificial lens implanted in cataract surgery)
- **SLT** = selective laser trabeculoplasty (laser that rejuvenates the eye's drain)
- **LPI** = laser peripheral iridotomy (a tiny laser hole in the iris to relieve angle-closure)
- **CXL** = corneal cross-linking (a treatment that stiffens a weak cornea)
- **ICP** = intracranial pressure (the pressure inside the skull/brain)
- **MGD** = meibomian gland dysfunction (clogged eyelid oil glands — the main cause of dry eye)

---

## 1. Optical 🔵 (focusing — the lens stack)
| Disease | Symptoms (plain) | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Myopia** (cận thị, short-sighted) | distance blurry, near clear | refraction (autorefractor + "better 1 or 2?" trial lenses) | Optical | minus (concave) glasses/CL; refractive surgery (laser reshaping) |
| **Hyperopia** (viễn thị, long-sighted) | near blurs first; young people hide it by straining to focus | cycloplegic refraction (refraction after drops that switch off focusing) | Optical | plus (convex) glasses/CL |
| **Astigmatism** (loạn thị, rugby-ball cornea) | smeared/ghosted at all distances | refraction + topography (a curvature map of the cornea) | Optical | cylinder lens (a direction-specific correction) / toric lens |
| **Presbyopia** (lão thị, age-40 near-focus loss) | can't focus up close, starts ~40 | refraction with a near "add" (extra reading power) | Optical (the lens stiffens with age) | reading glasses / bifocals / progressives |
| **Cataract** (đục thủy tinh thể, clouded lens) | slow painless cloudy/foggy vision, glare at night | slit lamp (microscope exam of the lens) | Optical | surgery: remove the cloudy lens, implant an **IOL** (artificial lens) |

## 2. Sensor 🟣 (the retina — the "image chip")
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Dry AMD** (age-related macular degeneration, the slow form) | gradual blur/dim spot in central vision, elderly | OCT/fundus showing **drusen** (yellow waste deposits under the retina) | Sensor (the RPE support cell fails) | AREDS2 vitamins (slow it); injections for advanced "geographic atrophy" (large dead patch) |
| **Wet AMD** | **sudden central distortion** (straight lines look wavy) | OCT/FA (shows leaking new vessels) | Vascular→Sensor (leaky vessels invade) | **anti-VEGF injections** (block the leak signal) |
| **Diabetic macular edema (DME)** (swelling of the central retina in diabetes) | central blur in a diabetic | OCT (shows fluid) | Vascular→Sensor | anti-VEGF injections ± laser; control blood sugar |
| ⚠️ **Retinal detachment** (võng mạc bong, the film peels off) | flashes, a shower of floaters, then a **dark curtain** | dilated exam / OCT / ultrasound | Sensor (mechanical) | urgent surgery (vitrectomy = gel-removal; or scleral buckle = a band around the eye) |
| **Macular hole / pucker (ERM)** (a hole or wrinkle at the center) | central distortion/blur | OCT | Sensor (mechanical) | vitrectomy + membrane peel (surgery) |
| **Retinitis pigmentosa** (genetic photoreceptor death) | night blindness first → shrinking "tunnel" vision | fundus + electroretinogram (a test of retinal electrical response) / genetics | Sensor (photoreceptors = light-catching cells) | no cure yet; supportive; gene therapy emerging |
| **Posterior vitreous detachment** (the gel pulls away — usually harmless) | sudden new floaters/flashes | dilated exam (to rule out a tear) | (vitreous gel) | observe; laser any retinal tear it caused |

## 3. Transport 🔷 (the optic nerve & pathway to the brain)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Open-angle glaucoma (POAG)** | **silent** — peripheral vision lost first → "tunnel vision" (central sharpness normal until very late) | IOP + OCT **RNFL** (nerve-wire thickness) + **VF** (side-vision map) | Pressure→Transport (pressure strangles the nerve) | lower the IOP: drops → **SLT** laser → surgery |
| ⚠️ **Optic neuritis** (inflamed optic nerve) | over hours-days, 1-eye blur, **pain on moving the eye**, colors look washed out, RAPD | clinical exam + MRI (brain scan) | Transport (often from MS = multiple sclerosis, a nerve-insulation disease) | IV steroids; treat the MS |
| ⚠️ **NAION** (a "stroke" of the optic nerve from poor blood flow) | **sudden painless** loss of the top or bottom half of vision | disc exam (swollen disc) | Vascular→Transport | no proven cure; manage risk factors (BP, sleep apnea) |
| ⚠️ **Giant cell arteritis** (the artery-inflammation type of nerve stroke) | sudden loss + headache/scalp tenderness/jaw ache, elderly | ESR/CRP (inflammation blood tests) + artery biopsy | Vascular/Immune→Transport | **urgent high-dose steroids** to save the other eye |
| **Papilledema** (both optic discs swollen from brain pressure) | brief grey-outs of vision, headache | exam + MRI + lumbar puncture (spinal-fluid pressure check) | brain (raised **ICP** = skull pressure) | treat the brain cause / lower the pressure |
| **Compression** (e.g. pituitary tumor at the crossover) | **bitemporal** loss (both outer halves of vision gone) | VF + MRI | Transport (the chiasm = the nerve crossover) | neurosurgery |
| **Occipital stroke** (visual cortex) | **homonymous** loss (the same side missing in both eyes) | VF + MRI | brain (cortex) | stroke care |

## 4. Coordination 🟢 (aiming both eyes together)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Strabismus** (lác/lé, an eye that turns) | double vision (adults); a visible eye-turn | cover test (cover/uncover and watch for a shift) | Coordination | glasses/prism (a lens that shifts the image); patching; muscle surgery |
| **Amblyopia** (nhược thị, "lazy eye") | one eye sees poorly though it looks normal | VA tested in each eye separately | Coordination (brain wiring fails to develop) | patch or blur the good eye + fix the refraction — **works only inside the childhood window (~up to 7–8)** |
| ⚠️ **CN III palsy** (third cranial-nerve weakness) | double vision, droopy lid, eye sits "down-and-out", ± **blown (big fixed) pupil** | eye-movement + pupil exam; **CT-angiogram** (vessel scan) | Coordination/Autonomic | a blown pupil = **aneurysm (ballooning artery) emergency**; otherwise treat cause / prism / surgery |
| **CN IV / VI palsy** (fourth/sixth nerve) | vertical double vision (IV) or horizontal, can't turn eye out (VI) | eye-movement + cover test ± MRI | Coordination | treat cause; prism; surgery |
| **Convergence insufficiency** (eyes don't team up for near) | eyestrain/doubling when reading | near-point-of-convergence measurement | Coordination/Autonomic | vision therapy (eye exercises) / reading help |

## 5. Surface 🩵 (tear film, lids, front of the cornea)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Dry eye** (khô mắt; usually **MGD** = clogged oil glands) | gritty/burning, **blur that clears when you blink, watery** (paradoxically) | TBUT + surface staining (dye showing dry/damaged spots) + Schirmer (paper-strip tear-volume test) + meibography (infrared photo of the oil glands) | Surface | warm compress + lid hygiene; artificial tears; anti-inflammatory drops; punctal plugs (tiny stoppers that keep tears in) |
| **Blepharitis** (lid-margin inflammation) | crusty, itchy, red eyelid edges | slit lamp | Surface | lid hygiene/scrubs |
| **Conjunctivitis** (viêm kết mạc, "pink eye": viral/bacterial/allergic) | red eye; watery (viral) / sticky pus (bacterial) / **itchy** (allergic) | clinical + slit lamp | Surface (allergic also Immune) | supportive (viral) / antibiotic drops (bacterial) / antihistamine (allergic) |
| ⚠️ **Bacterial keratitis (corneal ulcer)** (viêm/loét giác mạc) | pain, red, light sensitivity, a **white spot** on the cornea, usually a CL wearer | slit lamp + stain + **culture** (growing the germ) | Surface | intensive antibiotic drops; stop CL; can scar/perforate |
| **Herpes simplex keratitis** (herpes virus on the cornea) | pain, a **branching (dendritic) ulcer** | slit lamp (dye shows the branch pattern) | Surface (+Immune) | antiviral drugs; **don't give steroid alone** (makes it worse) |
| **Corneal abrasion** (a scratch) | sudden sharp pain, foreign-body feeling, tearing | fluorescein dye stain | Surface | lubricant/antibiotic; heals in days |
| **Keratoconus** (giác mạc hình chóp, cornea bulges into a cone) | progressive blur/worsening astigmatism, young | **topography** (curvature map) | Surface/Optical | rigid/scleral CL; **CXL** (stiffening) to halt; corneal transplant |
| **Pterygium** (mộng thịt, fleshy growth on the white) | a growth creeping onto the cornea, irritation/astig | exam | Surface (UV/dryness) | lubricants; surgery if it threatens vision |

## 6. Pressure 🟠 (eye pressure / drainage)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Open-angle glaucoma** | (see Transport — silent) | IOP + RNFL + VF | Pressure→Transport | lower the IOP |
| ⚠️ **Acute angle-closure** (the drain suddenly jams) | **sudden severe eye pain**, red, halos around lights, nausea, rock-hard eye | IOP (very high) + **gonioscopy** (mirror-lens view of the drainage angle) | Pressure | emergency pressure-lowering + **LPI** (laser hole in iris) |
| **Ocular hypertension** | none (high IOP but the nerve is still healthy) | IOP + normal disc/VF | Pressure | monitor ± treat depending on risk |
| **Normal-tension glaucoma** | silent nerve damage despite **normal** IOP | VF + OCT (with normal IOP) | Pressure/Transport | lower the IOP even further |
| **Secondary glaucoma** (from new vessels / inflammation / steroids / pigment / trauma) | varies (e.g. red, painful in the new-vessel type) | IOP + gonioscopy + exam | Pressure + the cause service | treat the underlying cause **and** lower IOP |

## 7. Vascular 🔴 (blood supply)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Diabetic retinopathy** (bệnh võng mạc tiểu đường; early "NPDR" → advanced "PDR") | often none early → floaters/loss late | fundus + OCT + FA | Vascular(→Sensor) | control sugar; anti-VEGF; **PRP** laser; vitrectomy for bleeds |
| **Hypertensive retinopathy** (from high blood pressure) | usually none | fundus | Vascular | control blood pressure |
| **Retinal vein occlusion (RVO)** (a clogged retinal vein) | sudden/gradual painless blur | fundus + OCT + FA | Vascular→Sensor | anti-VEGF/steroid for the swelling; laser |
| ⚠️ **Retinal artery occlusion (RAO)** (a blocked retinal artery = "eye stroke") | **sudden painless severe** loss in one eye | fundus (pale retina + "cherry-red spot") | Vascular→Sensor | **emergency — same as a brain stroke** (urgent workup); vision rarely recovers |
| **Retinopathy of prematurity (ROP)** (abnormal vessels in premature babies) | found on newborn screening | dilated screening exam | Vascular | laser / anti-VEGF |

## 8. Immune 🟢 (inflammation / defense)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| **Anterior uveitis (iritis)** (viêm màng bồ đào trước, inflammation of the front uvea) | pain, red, light sensitivity, small pupil | slit lamp showing **"cells and flare"** (floating white cells + protein haze inside the eye) | Immune | steroid drops + cycloplegic (focus-relaxing) drops; check for body-wide cause |
| **Intermediate/posterior uveitis** (inflammation of the mid/back of the eye) | floaters, blur | dilated exam + OCT/FA | Immune | steroids/immune-calming drugs; anti-infective if it's an infection |
| **Scleritis** (viêm củng mạc, inflammation of the white wall) | **deep "boring" pain**, red, tender | exam (± body-wide workup) | Immune (rheumatoid arthritis / vasculitis = inflamed vessels) | oral NSAID/steroid/immunosuppressants |
| **Episcleritis** (mild, surface inflammation of the white) | mild redness/ache (harmless) | exam | Immune | self-limited; lubricant/NSAID |
| ⚠️ **Endophthalmitis** (viêm nội nhãn, infection **inside** the eye) | **pain + vision drop after surgery/injection**, a pus level (hypopyon) | vitreous tap + culture | Immune (infection) | **emergency** — antibiotics injected into the eye ± vitrectomy |
| **Allergic conjunctivitis** | **itch**, red, watery, both eyes | clinical | Immune/Surface | antihistamine/mast-cell-stabilizer drops |

## 9. Autonomic 🟡 (automatic pupil & focus settings)
| Disease | Symptoms | Confirming test | Service(s) | Treatment |
|---|---|---|---|---|
| ⚠️ **Horner syndrome** (a cut sympathetic "dilate" wire) | **small pupil + slightly droopy lid** (± less sweating), one side | pupil exam + diagnostic drops; imaging | Autonomic (sympathetic) | find the cause (rule out carotid-artery tear / lung-apex tumor) |
| ⚠️ **CN III palsy (pupil-involving)** | **blown (big, fixed) pupil** + droopy lid + down-and-out eye | pupil/eye-movement exam + **CT-angiogram** | Autonomic/Coordination | **aneurysm (ballooning artery) emergency** |
| **Adie's tonic pupil** (a damaged "constrict" relay) | one large pupil that reacts to near but barely to light | pupil exam + dilute pilocarpine drop test | Autonomic | reassure; reading help (usually benign) |
| **Argyll Robertson pupil** | small pupils that react to near but not to light | exam + **syphilis blood test** | Autonomic | treat the syphilis |
| **Accommodative spasm / insufficiency** (over- or under-focusing) | near blur, eyestrain | accommodation (focusing) testing | Autonomic | vision therapy / reading add |

---

## Cross-cutting: trauma & tumors (span multiple services)
| Condition | Symptoms | Test | Service(s) | Treatment |
|---|---|---|---|---|
| ⚠️ **Chemical burn** (acid/alkali splash) | pain, red, after a splash | pH test of the tear film | Surface (+ all) | **irrigate (rinse) immediately** — before any other step |
| ⚠️ **Open globe** (a ruptured/perforated eyeball) | trauma, misshapen eye, very low VA | exam / CT scan (never press on the eye) | all | shield the eye + urgent surgery |
| ⚠️ **Hyphema** (blood pooled in the front chamber) | trauma, a blood layer behind the cornea, blur | slit lamp | Vascular/Pressure | rest, head up; watch the IOP |
| **Retinoblastoma** (child eye cancer) | a **white pupil reflex** (instead of red) in a child | exam under anesthesia + imaging | (tumor) | urgent cancer treatment |
| **Uveal melanoma** (cancer of the eye's pigment layer) | often none / flashes / field loss | fundus + ultrasound | (tumor) | radiation / surgery |

---

## The triage reflex (the payoff of the whole framework)
Three symptom buckets map to predictable services + urgency:

- **"Sudden painless vision loss"** → **Vascular** (artery/vein block) · **Transport** (nerve stroke/inflammation) · **Sensor** (retinal detachment). **Almost all urgent.**
- **"Red + painful eye"** → **Surface** (corneal ulcer) · **Pressure** (acute angle-closure) · **Immune** (uveitis/scleritis).
- **"Gradual painless blur"** → **Optical** (cataract/refractive error) · **Sensor** (macular degeneration). **Mostly non-urgent.**

Knowing *which service* + *how urgent* from the opening complaint is the real clinical value of the 9-service map.

---

*Draft for the deep-dives. Pairs with [`../clinical-primer.md`](../clinical-primer.md)
(the hub) and [`../clinical-anatomy.html`](../clinical-anatomy.html) (visuals).
Anything uncertain should be flagged `[CHECK]` for a clinical reviewer.*
