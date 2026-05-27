# Eye-exam primer — why so many machines, and what each one is for

Reference doc for anyone (dev or clinical) joining MAEC and trying to make sense
of the equipment inventory. Written from first principles — covers the structure
of the eye, why each device exists, how they map to the [4 documented clinic
workflows](../CLAUDE.md#documented-patient-workflows-4), and a Vietnamese ↔
English jargon dictionary.

## 1. The eye is several organs in one — that's the root cause

A normal physical exam covers one body. An eye exam covers *six layered systems*
in a 24 mm sphere, plus the optical-system-and-brain combo on top of that. Each
system fails in distinctive ways, so each system has its own purpose-built
measurement instrument.

```
        ┌─ 1. Optical layer  ──── light enters → cornea + lens focus it onto retina
        │   "Are they in focus?"     → REFRACTION devices
        │
        ├─ 2. Front surface ─────── cornea, conjunctiva, tear film, eyelids
        │   "Is the surface healthy?" → SLIT LAMP, TOPOGRAPHER, DRY-EYE
        │
        ├─ 3. Anterior chamber ──── space between cornea and iris (aqueous humor)
        │   "Is fluid flowing out?" (glaucoma) → TONOMETER, anterior OCT
        │
EYE ────┼─ 4. Lens ──────────────── focuses light, becomes cloudy with age
        │   "How cloudy is it?"     → SLIT LAMP; for cataract surgery → BIOMETER
        │
        ├─ 5. Vitreous + retina ─── light-sensing layer at the back
        │   "Is the retina healthy?" → FUNDUS CAMERA, OCT
        │
        ├─ 6. Optic nerve ───────── carries signal to brain
        │   "Is it being damaged?"  → OCT (RNFL thickness), visual field
        │
        └─ 7. Binocular system ──── the two eyes + brain working together
            "Do they coordinate?"   → VA CHART + manual tools (Worth 4-dot etc.)
```

A general physician's stethoscope + BP cuff + thermometer covers most of what
they need. Eyes don't compress that way — you can't take pictures of the retina
with the same instrument that maps the cornea, and you can't measure pressure
with either of those. So each clinical question gets its own machine.

## 2. The "what does each machine answer" map (KG inventory)

Reframed by **the clinical question it answers**:

| Clinical question | Machine | Equipment code |
|---|---|---|
| What prescription do their current glasses have? | Lensmeter | TB-001 Potec PLM-8000PD |
| What's the machine's first guess at their Rx? | Auto-refractor | TB-003 Potec PRK-9000 (also measures K — corneal curvature) |
| Does the patient confirm that Rx? | VA chart + trial lens | TB-009/010/011 IKAChart |
| Is the front surface of the eye healthy? | Slit lamp biomicroscope | TB-002 Keeler KSL-H5-Dr |
| Is the cornea regular shape? | Corneal topographer | TB-008 Medmont Pro |
| Is the whole ocular surface OK for scleral lenses? | Eye surface profiler | TB-018 Eaglet ESP |
| What's the eye pressure? (glaucoma) | Tonometer | TB-020 handheld tonometer |
| Is the retina healthy? Is the optic nerve damaged? | OCT + fundus camera | TB-017 Nidek RS-330 (Retina Scan Duo 2) |
| What size IOL for cataract surgery? | Optical biometer | TB-019 Syseye |

Furniture (TB-004..007) is just seating + tables for the patient and the slit lamp.

## 3. Why the clinic has *this exact* set — workflow walkthrough

Mapping the equipment to the [4 documented workflows in CLAUDE.md](../CLAUDE.md#documented-patient-workflows-4):

### 1. Khám mắt cơ bản (basic eye exam)

```
Reception → Lensmeter (TB-001) → Auto-ref (TB-003) → VA + trial lens (IKAChart)
       → IOP (tonometer TB-020) → Slit lamp (TB-002) → [optional OCT/fundus TB-017]
       → Glasses consult → Payment
```

Every device is used.

### 2. Khám khúc xạ + thị giác hai mắt (refraction + binocular vision)

Same as #1 + binocular-vision tests on IKAChart (Worth 4-dot, color, contrast).
Plus the **45-min cycloplegic wait** (eye drops to relax the focus muscle so
kids' true refraction shows through — no machine, just drops + a clock).

### 3. Khám kính tiếp xúc mới (new contact-lens fitting)

Adds **TB-008 Medmont Pro** (corneal topography — you need to know the curvature
to fit a CL). For scleral lenses (advanced cases): **TB-018 Eaglet ESP**
(whole-surface 3D scan, 22 mm chord, well beyond a regular topographer's 10 mm).

### 4. Tái khám kính tiếp xúc (CL follow-up)

VA + slit lamp evaluation of fit + corneal health. Sometimes topography if
something changed.

The set isn't arbitrary — it's the minimum kit to run those 4 flows. Anything
extra (OCT, biometer) is for the "add-on" diagnostic stations the workflow calls
out: *"Optional add-ons (bản đồ giác mạc / OCT / đáy mắt / thị trường)"*.

## 4. Jargon dictionary

### Anatomy

| EN | VN | What it is |
|---|---|---|
| Cornea | Giác mạc | Clear front "window" of the eye — does 2/3 of the focusing |
| Sclera | Củng mạc | The "white" of the eye, structural shell |
| Iris | Mống mắt | Colored ring with the pupil hole in the middle |
| Pupil | Đồng tử | The hole — opens/closes with light |
| Lens | Thủy tinh thể | Focuses light onto retina; becomes cloudy with age (cataract) |
| Anterior chamber | Tiền phòng | Fluid-filled space between cornea and iris |
| Vitreous | Dịch kính | Gel that fills the back of the eye |
| Retina | Võng mạc | Light-sensing layer at the back of the eye |
| Macula | Hoàng điểm | Central retina — gives you sharp vision |
| Optic disc / nerve head | Đĩa thị / Gai thị | Where the optic nerve exits the eye — visible on fundus photo |
| Optic nerve | Thần kinh thị giác | Cable from eye to brain |
| Conjunctiva | Kết mạc | Thin clear membrane over the white |
| Tear film | Phim nước mắt | Liquid layer on the cornea (3 layers: oil, water, mucin) |
| Meibomian glands | Tuyến Meibomian | Glands in the lids — make the oil layer of the tear film |
| RPE | Biểu mô sắc tố võng mạc | Retinal pigment epithelium — layer behind retina, big in macular disease |

### Refraction & optics

| EN | VN | What it means |
|---|---|---|
| Refraction | Khúc xạ | How the eye bends light to focus it — the whole optical-Rx domain |
| Sphere / SPH | Cầu | Far-sighted (+) or near-sighted (−) power |
| Cylinder / CYL | Trụ | Astigmatism strength (irregular curvature) |
| Axis | Trục | Direction of the astigmatism (0–180°) |
| Add | Cộng / Đọc gần | Extra reading power for over-40 (presbyopia) |
| Diopter / D | Đi-ốp | Unit of lens power |
| PD (pupillary distance) | Khoảng cách đồng tử | Mm between pupils — needed to make glasses |
| Visual acuity / VA | Thị lực | How clearly the patient sees — e.g. 20/20, 6/6, LogMAR 0.0 |
| LogMAR / Snellen / ETDRS | (same) | Three notations for VA. ETDRS is the research-grade chart |
| Keratometry / K | Độ cong giác mạc | Corneal curvature (K1 flat, K2 steep, axis) — needed for IOL calc + CL fitting |
| Cycloplegia | Liệt điều tiết | Drops that paralyze the focus muscle so kids' true Rx shows |

### Eye-health measurements

| EN | VN | What it is |
|---|---|---|
| IOP (intraocular pressure) | Nhãn áp | Pressure inside the eye, mmHg. Normal 10–21. High = glaucoma risk |
| Axial length / AL | Trục nhãn cầu | Length of the eye, mm. Normal ~23.5. Long = myopic. Needed for IOL calc |
| ACD | Độ sâu tiền phòng | Anterior chamber depth — IOL calc input |
| WTW | Khoảng cách rìa giác mạc | White-to-white — corneal diameter, used in CL/IOL sizing |
| RNFL | Lớp sợi thần kinh võng mạc | Retinal nerve fiber layer — OCT measures thickness; thinning = glaucoma |
| Pachymetry | Đo độ dày giác mạc | Corneal thickness measurement |

### Conditions / diseases

| EN | VN | What it is |
|---|---|---|
| Myopia | Cận thị | Short-sighted (blur in distance) |
| Hyperopia | Viễn thị | Long-sighted |
| Astigmatism | Loạn thị | Irregular corneal curvature |
| Presbyopia | Lão thị | Age-related loss of near focus (~40+) |
| Cataract | Đục thủy tinh thể | Cloudy lens — fixed by surgical IOL implant |
| Glaucoma | Tăng nhãn áp / Glôcôm | Optic nerve damage, often from high IOP |
| Macular degeneration | Thoái hóa hoàng điểm | Central retina disease — common in elderly |
| Diabetic retinopathy | Bệnh võng mạc tiểu đường | Retinal blood-vessel damage from diabetes |
| Keratoconus | Giác mạc hình chóp | Cornea bulges into a cone — needs scleral CL or transplant |
| Dry eye | Khô mắt | Tear film dysfunction — itchy, gritty eyes |
| Strabismus | Lác mắt | Eye misalignment |
| Amblyopia | Nhược thị | "Lazy eye" — brain ignores one eye, develops in childhood |

### Imaging modalities

| EN | VN | What it is |
|---|---|---|
| Slit-lamp biomicroscopy | Sinh hiển vi | Doctor's primary exam — bright slit of light + microscope to see front of eye in detail |
| Fundus photography | Chụp đáy mắt | Color photo of the back of the eye |
| OCT (Optical Coherence Tomography) | Chụp cắt lớp võng mạc | "Ultrasound-with-light" — cross-section through retina layers |
| OCT-A (OCT-Angiography) | OCT mạch máu | OCT mode that shows retinal blood vessels (no dye) |
| Corneal topography | Bản đồ giác mạc | 3D map of corneal curvature |
| FAF (fundus autofluorescence) | Chụp tự động cảm quang | Special fundus mode — RPE health, early macular disease |
| Indirect ophthalmoscopy | Soi đáy mắt gián tiếp | Doctor wears headlamp + holds hand lens to view retina |
| Meibography | Chụp tuyến Meibomian | Infrared image of meibomian glands in the eyelids — dry-eye workup |

### Contact lenses

| EN | VN | What it is |
|---|---|---|
| Soft CL | Kính tiếp xúc mềm | Day-to-day soft contact lens |
| RGP | Kính tiếp xúc cứng (RGP) | Rigid gas-permeable — better optics, harder to adapt |
| Scleral CL | Kính tiếp xúc scleral | Big rigid lens that sits on sclera, vaults the cornea — for keratoconus, severe dry eye |
| Ortho-K | Ortho-K (chỉnh hình giác mạc) | Overnight rigid CL that flattens cornea — wake up with clear vision, slows kids' myopia |
| CL fitting | Lắp kính tiếp xúc | Process of picking the right CL parameters for a patient |

### Surgical / IOL

| EN | VN | What it is |
|---|---|---|
| IOL | Thủy tinh thể nhân tạo (TTTNT) | Intraocular lens — implant during cataract surgery |
| Biometry | Sinh trắc nhãn cầu | Measuring AL/ACD/K/WTW to calculate IOL power |
| IOL formula | Công thức tính IOL | Math formula (SRK/T, Barrett, Haigis, etc.) that takes biometry → IOL power |

### Tech / integration

| EN | VN | What it is |
|---|---|---|
| DICOM | (same) | Medical imaging file/transport standard — devices export DICOM, PACS stores it |
| PACS | (same) | Picture Archiving and Communication System — server that stores all imaging |
| Modality Worklist (MWL) | Danh sách thiết bị / lịch chụp | DICOM service that pushes patient demographics to imaging devices so techs don't retype |
| RIS | Hệ thống thông tin chẩn đoán hình ảnh | Radiology Information System — workflow + reporting layer above PACS |
| Watched folder | Thư mục theo dõi | Cheaper alternative to DICOM — a service watches a Windows folder where devices drop PDFs/images, auto-attaches them |
| OHIF | (same) | Open-source web viewer for DICOM images (the one in the dormant `pacs/` setup) |
| Orthanc | (same) | Open-source DICOM server (the PACS engine in the dormant `pacs/` setup) |

## 5. TL;DR — first principles in 3 lines

1. **The eye has 6+ structurally distinct components**, each fails differently,
   each needs its own measurement tool.
2. **The 4 clinic workflows** are the union of "what every patient needs"
   (refraction + IOP + slit lamp) and "what their complaint requires"
   (topography for CL, OCT for retinal complaints, biometry for cataract). The
   KG kit is the minimum set to run those.
3. **Software-side**, the work splits into two patterns: structured numerical
   fields (refraction, IOP, axial length) feed encounter form fields directly;
   imaging (OCT, fundus, topography) gets stored as a file (PDF today, DICOM
   later) and linked to the encounter.
