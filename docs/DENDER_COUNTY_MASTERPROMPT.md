# Dender County — Canonical Autonomous AAA + Real-World Geography Masterprompt

## Mission
Continue the existing **Dender County** project in `chillerken/Hub`, branch `dender-county-3d`. Do not restart it. Build it autonomously toward an original, high-end, photorealistic Belgian open-world action-adventure game. Modern AAA open-world games may be used only as a quality reference; never copy GTA/Rockstar characters, maps, missions, UI, dialogue, code, vehicles, brands, music, assets or storylines.

## Existing baseline
Preserve and improve the working systems already in the project: Three.js/WebGL rendering, third-person player, vehicles, traffic, NPCs, police/wanted, missions, minimap, day/night, weather, interiors, save/load, mobile controls, GLB/GLTF + DRACO asset pipeline, rigged character support, PBR materials, Poly Haven/Khronos asset sources, CI and Render deployment.

## Autonomous execution loop
Do not stop after tiny versions or ask for routine confirmation. Repeatedly:
1. inspect the current build and choose the largest visible/technical weakness;
2. implement a real improvement;
3. test syntax, assets, runtime assumptions and regressions;
4. fix failures;
5. commit;
6. run CI;
7. deploy only when stable;
8. verify deployment;
9. continue with the next weakness.

Stop only for unavoidable paid actions, secrets/API keys, irreversible destructive actions, legal uncertainty, or a genuinely consequential design decision. Never claim AAA, photorealistic, tested, production-ready or finished unless evidence supports it.

## Visual target
Push toward physically believable modern AAA presentation:
- PBR base color / normal / roughness / metallic / AO where appropriate;
- image-based lighting, HDR environments, realistic shadows and contact shading;
- subtle bloom/color grading/exposure, atmospheric fog, rain, puddles and wet-surface response;
- decals, dirt, moss, road wear, cracks, repairs, drainage, tire/skid marks;
- correct scale and material response; no plastic/glossy-everything look;
- replace primitive placeholders systematically with legal production assets while retaining hidden low-cost collision proxies.

## Real-world geography is a hard requirement
Public geography for real-world areas must match the real world as closely as technically possible. Do **not** invent public streets or distort their connectivity for convenience.

### Geographic rollout
Start with:
**Burst → Erpe-Mere → Lede → Aalst**, then expand sector-by-sector across East Flanders.

Include the real locations and connectivity of:
- municipality/submunicipality boundaries and village cores;
- street names and road centerlines;
- intersections, roundabouts, bridges, motorway ramps;
- railway lines, stations and level crossings;
- waterways, canals and major paths;
- cycleways, footways, squares, car parks and industrial zones.

Target a world scale of **1 real metre ≈ 1 game metre**. Use one stable geographic origin per streamed sector and store original WGS84 latitude/longitude in metadata.

### Source priority
1. **Digitaal Vlaanderen / Wegenregister** and other official Flemish open datasets for authoritative geometry/attributes.
2. Other official Belgian/Flemish open data.
3. **OpenStreetMap** for missing street labels, paths, buildings and POIs, with full ODbL attribution.
4. Other clearly licensed open data only when needed.

Never scrape/copy Google Maps, Google Street View or proprietary map geometry.

### Data pipeline
For each sector:
OPEN DATA → download/API → validate license/source → normalize to GeoJSON → retain source IDs/lat/lon → convert to local metres → generate spline/mesh roads → intersections → sidewalks/cycleways → road graph → traffic graph → pedestrian/cycle graph → minimap → labels → building footprints → LOD/streaming → validation.

The exact same road graph must drive the 3D roads, minimap, traffic routing, police routing and mission navigation.

### Geographic validation
Automate checks for:
- bounding box and coordinate validity;
- unique source IDs;
- street names;
- road connectivity;
- road count and geometry count;
- municipality/sector metadata;
- railway/water layers when added;
- correct source attribution.

Document every intentional geographic deviation in development metadata.

## Flemish world art
Make the result unmistakably Flemish/East Flemish rather than a generic American city:
Belgian road signs, red cycle lanes, zebra crossings, traffic lights, bollards, bus stops, concrete/asphalt/cobble roads, drainage, row houses, semi-detached homes, 1950s/1970s/1990s/modern façades, roof tiles, gutters/downpipes, shutters, solar panels, garages, cafés, frituren, supermarkets, industrial estates, farms, churches, stations, rail crossings, fields and waterways.

Use real public geometry, but use fictional commercial branding unless a real brand is legally safe and useful.

## Buildings and interiors
Use real building footprints where open data allows it. Location, footprint, orientation and scale should be close to real-world. Architectural appearance may be procedurally reconstructed when no reusable imagery exists. Add modular interiors for homes, garages, cafés, frituren, supermarkets, police, hospital, station, offices, workshops and warehouses.

## Characters
Replace placeholders with original realistic characters using legal assets. Support idle/walk/jog/sprint/turn/start-stop/jump/land/crouch/vault/climb/enter-exit vehicle/interact/melee and animation blending. Reduce clone effect with variation in age, clothing, build, hair and accessories.

## NPC AI
Implement states such as HOME, WORK, SHOP, WALK, WAIT, SOCIALIZE, DRIVE, EAT, FLEE, INVESTIGATE, CALL_POLICE, PANIC and RETURN_HOME. NPCs should react to weather, time, traffic, crashes, horns, player behaviour and police, while avoiding walls, cars and one another.

## Traffic and vehicle simulation
Traffic must follow the real road graph, lane direction, lights, priority/roundabouts, pedestrian crossings, parking and queues. Add fictional vehicle classes: hatchback, sedan, estate, SUV, van, taxi, truck, bus, motorbike and bicycle.

Vehicle handling should account for mass, acceleration, braking, steering curve, grip, suspension/body roll, wet grip, handbrake and surface type. Add lights, indicators, dashboard/camera modes, wipers, layered engine/tire/collision/skid sounds and progressive visual damage.

## Police
Replace direct homing with road-graph navigation and staged response:
report → dispatch → local search → pursuit → interception/roadblocks → wider search.
Track information such as location, vehicle type/color/plate-like identifier, witnesses and camera zones. Information reliability may decay if the player changes vehicle/clothes unseen.

## Missions/story/economy
Build an original contemporary East-Flanders story; no GTA plot imitation. Grow toward 30+ functioning missions across driving, delivery, investigation, social, infiltration, pursuit, business, rescue, timed and exploration categories, with branching objectives where suitable. Add money, shops, vehicle ownership/repair, clothing, properties and fictional businesses.

## Weather/audio/cinematics/UI
Implement gradual Belgian weather (sun/cloud/light rain/heavy rain/fog/storm/morning mist), a convincing day/night cycle, layered ambience and legal/original radio, cinematic camera paths/subtitles, original minimap/map/phone UI, mission routing and reliable autosave.

## Streaming/performance
Sector-stream the world. Use async asset loading, cache/unload, instancing, frustum culling, LOD0-LOD3/impostors, texture scaling and quality presets (Performance/Balanced/Quality/Ultra). Support modern desktop and capable phones.

## Free/legal asset policy
Prefer:
1. procedural/self-created assets;
2. Poly Haven CC0;
3. Khronos glTF sample assets;
4. other explicit CC0;
5. CC BY with visible attribution;
6. free/open-source generation tools such as TRELLIS/TripoSR/Blender scripting.
Do not spend money or invoke paid Meshy generation without explicit approval.

Every external asset must have id, source/path, license, attribution, LOD metadata and fallback.

## CI / QA
CI must check at minimum:
- JavaScript syntax;
- required files/import maps;
- GeoJSON/JSON validity;
- external asset reachability and GLB signatures;
- geodata source metadata and coordinate bounds;
- key gameplay regressions where automation is possible.

After major changes re-check spawn, walking, driving, enter/exit, camera, missions, minimap, save/load and mobile controls.

## Definition of progress
A smaller geographically accurate and highly polished sector is better than a large fake province. The geography acceptance test is that a local person can recognize the real road layout without needing the street labels.

## Immediate execution priorities
1. Migrate Burst public road geometry to real open geodata at 1:1 scale.
2. Use the same Burst road graph in the 3D road layer and minimap.
3. Add real street-name metadata and Burst/Erpe-Mere location detection.
4. Add real rail/station geometry.
5. Add real building footprints.
6. Validate against official/open sources.
7. Then repeat for the rest of Erpe-Mere, Lede and Aalst.
8. Continue all visual/AI/physics/content improvements in parallel without undoing geographic accuracy.

**Start building. Do not merely re-plan.**
