# Persona asset licenses

The MIT license covers Persona's **application source**. It does not grant
rights to VRM or VRMA files under `public/assets/`.

## Bundled environment

Persona includes the `dawn.exr` environment from `@pmndrs/assets`. That
collection is published under CC0 1.0 (HDR environments from Poly Haven).

## Local development media

VRM and VRMA files are intentionally ignored by Git.

`npm run assets:dev-pack` / `assets:dev-model` download **third-party sample**
files for local testing only (for example VRM Seed-san samples and community
VRMA demos). Those downloads are **not** cleared for redistribution in a
Persona release until you independently verify each license and replace or
document them.

Therefore:

- do not publish unverified files in a source repository;
- do not attach a package containing them to a release;
- do not represent the MIT license as covering them; and
- do not set `distributionAllowed` to `true` for these files.

The automated release gate enforces the last two requirements. Authors remain
responsible for not committing restricted files.

## Stable asset slots

```text
public/assets/
├── model.vrm
├── manifest.json
└── animations/
    ├── idle.vrma
    ├── idle2.vrma          # optional; runtime uses primary idle by default
    ├── talk1.vrma
    ├── talk2.vrma
    ├── talk3.vrma
    ├── greeting.vrma
    ├── happy.vrma
    ├── finger-gun.vrma
    └── dance.vrma
```

## Replacing assets for release

1. Put redistributable files in the exact paths above.  
2. Edit `public/assets/manifest.json`:  
   - `license` — SPDX or clear license name  
   - `source` — public provenance (not `local-test-only`)  
   - roles must match the stable contract  
3. Confirm redistribution is allowed in this app.  
4. Set `distributionAllowed` to `true`.  
5. Add any required attribution to this file.  
6. Run `npm run assets:release`.  

Only then remove VRM/VRMA ignore rules if those exact files are safe to commit.
