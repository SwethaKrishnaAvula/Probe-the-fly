# Probe the Fly

3D discovery game built on the real male fruit fly connectome.

Probe the Fly turns neuroscience data into a playable puzzle. Players explore a 3D fly brain, probe neuron hotspots, follow signals through connected cells, and discover how neural circuits relate to behavior.

**Project status:** Playable prototype. The game client (Three.js and Vite) runs five levels on eleven hotspots, with the neuPrint data pipeline behind them. Some hotspots are still placeholders and some data is derived rather than supplied; both are listed openly in [Known placeholders and limits](#known-placeholders-and-limits).

## Table of contents

- [The idea](#the-idea)
- [How it works](#how-it-works)
- [What is real - and what is simplified?](#what-is-real---and-what-is-simplified)
- [Current repository](#current-repository)
- [Data pipeline](#data-pipeline)
- [Play it locally](#play-it-locally)
- [Gameplay and controls](#gameplay-and-controls)
- [The hotspots and their evidence](#the-hotspots-and-their-evidence)
- [Honesty statements](#honesty-statements)
- [Known placeholders and limits](#known-placeholders-and-limits)
- [Technology](#technology)
- [Scientific note](#scientific-note)
- [Contributing](#contributing)
- [Contact](#contact)
- [Acknowledgments](#acknowledgments)

## The idea

The fruit fly may be tiny, but its nervous system contains roughly 166,700 neurons and 125 million synapses. Probe the Fly uses real wiring and neuron geometry from the male fruit fly central nervous system to make that complexity approachable through play.

The planned experience combines:

- an interactive 3D brain built with Three.js and Vite;
- literature-backed neuron hotspots associated with fly behaviors;
- visible pulses that travel along representative neural pathways;
- fly animations that respond to the selected pathway; and
- an adaptive memory system designed to revisit concepts a player finds difficult.

## How it works

1. **Start with real brain data.** Neurons, skeletons, and synaptic connections come from the `male-cns:v1.0` dataset in neuPrint and are checked in Neuroglancer.
2. **Build a playable pathway.** Python scripts identify relevant neurons, inspect downstream partners, find short candidate routes, and export reviewed results.
3. **Bring the pathway into 3D.** Neuron skeletons are exported as SWC files and converted into game-ready GLB geometry.
4. **Probe and observe.** In the planned game, selecting a hotspot sends a visible pulse through the pathway and triggers a corresponding fly behavior.
5. **Learn through repetition.** The proposed memory layer records probe events and uses accuracy and response time to shape later challenges.

## What is real - and what is simplified?

| Layer | Meaning |
| --- | --- |
| **Real** | Neuron body IDs, reconstructed geometry, directed connections, and synapse counts come from neuPrint. |
| **Literature-backed** | Starting neurons are chosen because published research connects them to a behavior. |
| **Simplified** | Each level presents a short representative pathway, not the complete biological circuit. |
| **Game-authored** | Pulse timing, brightness, challenges, and animated fly responses are design choices rather than a simulation of live neural activity. |

## Current repository

The current branch focuses on preparing trustworthy neural data for the game:

```text
src/                     the game client (Three.js): rules, hotspots, fly, kitchen, sound
public/data/levels.json  the five levels and the notebook text
scripts/                 neuPrint queries, path building, export tools, data sync
data/results/            intermediate analysis and candidate pathways
data/handoffs/           reviewed pathway packages for game development
game_data/geometry/      SWC skeletons, GLB neuron models and their metadata
path_jsons/math_filled/  each pathway with its pulse timing and brightness filled in
server/                  the optional Python API for probe events and the memory layer
```

Pathways in the game today: turning (left and right), feeding, object tracking, courtship song, and the escape response (left and right).

## Data pipeline

The pipeline follows a literature-first workflow: choose a documented behavior, locate the relevant neuron type, inspect its real downstream connectivity, review candidate paths, and only then export a pathway for the game.

### Pipeline stages

```text
01_check_access.py        confirm access to the Male CNS dataset
02_find_neurons.py        find body IDs for a chosen cell type
03_analyze_downstream.py  compare downstream partners and thresholds
04_build_paths.py         discover or verify short directed pathways
05_export_handoff.py      package a reviewed pathway for the game
06_export_skeletons.py    download neuron skeletons for 3D conversion
blender_swc_to_glb.py     convert SWC skeletons into a GLB model in Blender
```

Candidate pathways are reviewed against neuron annotations, anatomy, and published research; the highest-scoring route is not automatically the most biologically meaningful one.

## Play it locally

You need Node.js. From the project folder:

```text
npm install
npm run dev          # serves the game at http://localhost:5173
```

The game works on its own: it never depends on the API. The optional backend (probe events and the memory layer) is `npm run api`, which needs the Python packages in `server/requirements.txt` and a database connection; without it the game plays normally and quietly keeps its event log.

Useful web addresses while developing: `?level=1` to `?level=5` starts at that level, `?intro=0` skips the opening video and the fly-in, and `?debug` exposes internals for testing.

## Gameplay and controls

You are looking at a real fly nervous system on the left and a fly in a kitchen on the right. There are no movement buttons: the brain is the only controller.

- **Hover a hotspot** on the brain and a glowing circle shows where it is. Nothing else lights up.
- **Click it** and a spark travels along the real neurons of that pathway; when it arrives, the fly acts.
- **Left screen:** drag to turn the brain, scroll or pinch to zoom. **Right screen:** drag to look around, scroll or pinch to move, or use the arrow buttons; *Recenter* returns to the opening view and *Fly view* looks through the fly's eyes.
- **Field notebook:** in the discovery level every probe is recorded with a snapshot and a line of text; in the task levels it is hidden and you work from memory.
- Sound follows the fly: one sound while it is in the air, another for everything else, over a quiet music track (with an on/off button).

The five levels:

1. **Discovery lab** - probe freely; at least five different hotspots unlock the first task. Not scored.
2. **Reach the pie** - fly to the pie and feed, within a click budget and without the notebook.
3. **Pie plus shadow** - the same, while a shadow sweeps the counter; freezing in time keeps the fly safe.
4. **Lesion** - one hotspot is dead; find another route that does the same job.
5. **Threshold** - build the case with two cues, then sing within the window.

The game is designed to remember what you forget: each probe is logged with an anonymous player ID and no personal data, so that challenges can be built around your weakest hotspots.

## The hotspots and their evidence

Each hotspot's shape and wiring are real (`male-cns:v1.0`); the link from a circuit to a behavior comes from the literature cited here, as recorded in the reviewed handoff files in `path_jsons/math_filled/`. Weights are neuPrint synapse counts along each hop.

| Hotspot | Behavior in the game | Real pathway (cell types) | Synapse weights | Evidence |
| --- | --- | --- | --- | --- |
| Turn left / turn right | Airborne turn, 90 degrees | DNa02 to sternal anterior rotator motor neuron (one per side) | 106 (L), 134 (R) | Berg et al. 2026, *Sexual dimorphism in the complete connectome of the Drosophila male central nervous system*. DNa02 is literature-associated with steering; the direct motor path is supported by the connectivity. |
| Feeding | Proboscis extension | AN13B002 to AN05B099 to DNge032 to MN8 (proboscis motor neuron) | 70, 43, 29 | Tastekin et al., *The Comprehensive Drosophila Taste-Feeding Connectome*, doi:10.1101/2025.08.25.671814. A representative pathway, not presented as the complete bilateral feeding circuit. |
| Wing song | One wing extends and vibrates | pIP10 to TN1a_i to hg1 motor neuron | 171, 43 | von Philipsborn et al. 2011, *Neuronal Control of Drosophila Courtship Song*, Neuron 69(3):509-522; Shirangi, Wong, Truman and Stern 2016, Dev Cell 37(6):533-544; Shirangi, Stern and Truman 2013, Cell Reports 5:678-686. Every node and link is independently confirmed in prior literature. One open question is flagged: the premotor neuron dPR1 connects to hg1 more strongly than TN1a does. |
| Object tracking | Pursue: turn toward the target, then fly forward | LC10a to AOTU041 to AOTU064 to aSP22 | 65, 46, 77 | bioRxiv 2025.10.09.680999v2: LC10a supports courtship tracking; aSP22/DNa12 is associated with pursuit steering. The end roles are supported by the literature; the exact route between them is a connectome-derived candidate. |
| Escape (left and right) | Jump, then a sustained flight | The giant fiber DNp01 drives two paths at once: to the tergotrochanteral motor neuron (jump), and through PSI to a DLM motor neuron (flight) | jump 20 (L), 70 (R); flight 9 then 67 (L), 3 then 67 (R) | Classic giant fiber literature; **the exact citation is still pending biology review.** The connections are verified in `male-cns:v1.0`. One DLM motor neuron stands in for several. |

## Honesty statements

- **Real:** neuron shapes and wiring come from the male fruit fly central nervous system connectome.
- **From research, not from the connectome alone:** which hotspot causes which behavior comes from the published papers above. A connectome shows wiring, not function.
- **Our own simple model:** how the spark spreads is game-authored (fixed timing per synaptic hop, brightness scaled from connection weights). It is not a validated simulation of a living fly's activity.
- **Hand-authored:** the last step from a motor neuron to the fly's animation is drawn by hand.
- **Small numbers:** player statistics come from few players and are for gameplay, not science.
- **No language model:** the game contains no language model, in the client or the API.

## Known placeholders and limits

- **Four hotspots are stand-ins, not real neurons:** walk forward, freeze, groom head and approach odor have no circuit data yet. Each is an invented wire, drawn only while its spark plays, and the levels need them to be playable. Each will be replaced when its real pathway is reviewed and exported.
- **Some geometry metadata is derived:** where a pathway's own metadata file was missing or incomplete (feeding, wing song, the escape circuit), `scripts/derive_geometry_metadata.mjs` recomputes the scale and centre from the SWC files (the same rule reproduces the supplied files exactly) and chooses the click point. The click point is ours, not a measurement.
- **The feeding hotspot's placement:** AN13B002 is an ascending neuron whose cell body lies in the nerve cord. The hotspot is placed at its brain end so that every hotspot sits in the brain.
- **Representative pathways:** each pathway is a short representative route, not the full biological circuit.
- **Left and right on screen:** the left and right hotspots are named after the neuron's annotated side; the display's left-right handedness has not been independently checked against the dataset's orientation.
- **Provisional numbers:** scoring and click budgets are provisional until the scoring file is finalized.

## Technology

- **Data and analysis:** Python, pandas, neuPrint, Neuroglancer
- **3D assets:** SWC neuron skeletons, Blender, GLB/glTF
- **Game client:** Three.js and Vite (plain JavaScript, no physics engine, no language model)
- **Adaptive memory:** Tiger Data / PostgreSQL time-series events

## Scientific note

Probe the Fly is an educational game, not a validated simulation of neural activity. Connectome data describes physical wiring, while behavior labels require evidence from published biological research. The project keeps those measured, literature-supported, and game-designed layers separate.

## Contributing

The project is actively evolving. More documentation for game setup, level authoring, developer scripts, controls, and deployment will be added as those parts stabilize.

If you contribute a new pathway, please keep it traceable: document the source behavior, preserve neuPrint body IDs and connection weights, record supporting literature, and review the anatomy before adding it to the game.

## Contact

For questions, issues, or contributions, please reach out through:

| Purpose | Contact |
| --- | --- |
|  Swetha Avula|  savula@andrew.cmu.edu|
|  Cherishma Subhasa K|  csubhasa@andrew.cmu.edu|
|  Shreya Nandakumar| snandak2@andrew.cmu.edu|
Samridhi Makkar| smakkar@andrew.cmu.edu |

## Acknowledgments

Probe the Fly is made possible by the researchers and organizations that make connectome data and neuroscience tools openly available. We gratefully acknowledge:

- the teams behind the male fruit fly central nervous system connectome and the `male-cns:v1.0` dataset;
- [neuPrint](https://neuprint.janelia.org/) and the Janelia Research Campus for providing access to neuron connectivity data;
- [Neuroglancer](https://github.com/google/neuroglancer) for supporting visual inspection of neural anatomy; and
- the wider *Drosophila* neuroscience community whose published research connects neural circuits with behavior.

This project builds an educational game on top of their scientific work; it does not claim ownership of the underlying connectome data or research.

---

**Last updated:** September 2026 | **Version:** 1.0
