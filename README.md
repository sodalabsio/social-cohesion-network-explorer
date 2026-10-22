# Social Cohesion Network Explorer

Explore social cohesion through the relationships reported in local news. The website brings together an interactive network map, guided stories and a weekly view of how connections change over time—with selected news passages alongside the relationships they describe.

The current exhibit focuses on **Geelong, Australia, in 2015–2016**.

## Explore the website

- **Network stories:** follow five guided stories about food support, education and workers, GROW, national support and Norlane, and flood response. Select a highlighted relationship to read its supporting news excerpt and source details.
- **Network over time:** play or scrub through weekly snapshots to see reported cooperative and antagonistic ties appear and fade across a rolling ten-week window.
- **Social Cohesion Network Index (SCNI):** explore how cooperative connections combine reachability and proximity, with the January 2016 Geelong flood marked on the timeline.

Start with **How to read this** for an interactive walkthrough. **About this project** explains the research approach and links to related work.

Blue lines represent cooperative relationships; red lines represent antagonistic relationships. The four scope bands—Federal, State, Local and Community—are research classifications, not rankings of importance or authority. The map's coordinates are a display layout, not geographical locations.

## What the network shows

The explorer presents relationships extracted from news reporting. A link records a reported interaction; it does not by itself establish a successful outcome, a lasting partnership or a causal effect. Counts refer to retained extraction records, not necessarily distinct articles or events.

The weekly SCNI shown here is reconstructed for the population displayed in this exhibit. It combines how widely actors can reach one another through cooperative paths with how close those connections are. It is a descriptive series, not a causal estimate of the flood's effect or a direct reproduction of a published regional series.

Selected news excerpts are accompanied by source information and, where relevant, original-to-network actor mappings. Read those details alongside the visualisation: the relationship classifications and actor mappings are research outputs rather than statements made by the news publishers.

## Research and people

The research is conducted by **Noah Star and Professor Simon Angus**, **SoDa Labs, Department of Economics, Monash University**, as part of the wider research activities of the **Australian Resilient Democracy Network (ARDN)**.

The accompanying research paper is *How do Climate Disasters Affect Social Cohesion? Evidence from a New(s) High Frequency Approach*.

- [Simon Angus's Monash profile](https://research.monash.edu/en/persons/simon-angus/)
- [ARDN: measuring social cohesion in Australia](https://australiandemocraticresilience.substack.com/p/measuring-social-cohesion-in-australia)
- Contact: [simon.angus@monash.edu](mailto:simon.angus@monash.edu)

## Run locally

Use **Node.js 22 or later**. No dependency installation is required.

```sh
npm test
npm run build
npm run preview
```

Open <http://127.0.0.1:4173/>. Stop the server with Ctrl+C. For development, `npm run dev` serves `src/` directly.

The website loads JSON data, so it must be served over HTTP rather than opened as a local HTML file. It runs as a static site, with no backend, API key, analytics or external runtime dependencies.

## Repository and hosting

- `src/` contains the website and the data delivered to the browser: guided stories and selected news excerpts, actor labels and classifications, aggregate relationships, and weekly network measures.
- `scripts/` contains the local server, validation and static-build scripts.
- `tools/` contains research-side export utilities; running the website does not require the original research inputs.

`npm run build` validates the inputs and generates `dist/`. For GitHub Pages, deploy the **contents of `dist/`**, rather than serving the repository root. Asset paths are relative, supporting project-subpath hosting.

The browser-delivered data can be downloaded by visitors. The public repository also exposes its committed source files; it does not include the original article corpus, source Stata files or actor workbook as required website inputs. The selected excerpts remain attributed to their news sources; inclusion here does not imply publisher endorsement.

See [LICENSE](LICENSE) for the repository's licence.
