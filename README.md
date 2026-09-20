# Probe the Fly

3D discovery game built on the real male fruit fly connectome.

Probe the Fly turns neuroscience data into a playable puzzle. Players explore a 3D fly brain, probe neuron hotspots, follow signals through connected cells, and discover how neural circuits relate to behavior.

**Project status:** Work in progress. The neuPrint data pipeline and several verified neural pathways are currently in the repository. The full game, final visuals, and complete gameplay instructions are still under development.

## Table of contents

- [The idea](#the-idea)
- [How it works](#how-it-works)
- [What is real - and what is simplified?](#what-is-real---and-what-is-simplified)
- [Current repository](#current-repository)
- [Data pipeline](#data-pipeline)
- [Gameplay and controls](#gameplay-and-controls)
- [Planned technology](#planned-technology)
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
scripts/                 neuPrint queries, path building, and export tools
data/results/            intermediate analysis and candidate pathways
data/handoffs/           reviewed pathway packages for game development
game_data/geometry/      SWC skeletons and GLB neuron models
levels.json              early level data
```

Pathways currently represented in the repository include turning, feeding, object tracking, courtship song, and escape responses. These are still being integrated into the final game.

## Data pipeline

The pipeline follows a literature-first workflow: choose a documented behavior, locate the relevant neuron type, inspect its real downstream connectivity, review candidate paths, and only then export a pathway for the game.

### Setup

You will need Python 3.10 or newer and access to [neuPrint](https://neuprint.janelia.org/).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export NEUPRINT_APPLICATION_CREDENTIALS="your-neuprint-token"
python scripts/01_check_access.py
```

Keep your neuPrint token private. The `.env` file is ignored by Git, and credentials should never be committed.

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

For example, the first analysis step can be run with:

```bash
python scripts/02_find_neurons.py --type DNa02
```

Run any script with `--help` to see its current options. Candidate pathways must still be reviewed against neuron annotations, anatomy, and published research; the highest-scoring route is not automatically the most biologically meaningful one.

## Gameplay and controls

The complete gameplay loop, controls, screenshots, and installation instructions will be added as the game client is finalized.

The current design centers on probing a neural hotspot, watching its signal travel through the 3D pathway, observing the fly's response, and remembering the circuit well enough to solve later challenges.

## Planned technology

- **Data and analysis:** Python, pandas, neuPrint, Neuroglancer
- **3D assets:** SWC neuron skeletons, Blender, GLB/glTF
- **Game client:** Three.js and Vite
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
