# Repository extraction, October 21, 2026

Maintainer and release owner: brodynelly. Destination: https://github.com/brodynelly/beacon.

- Source: brodynelly/luuna at `fd42d59c5f608b9120d9cdc2e2354b66f945a5ed`, path `components/beacon`.
- Component-scoped history: `git subtree split --prefix=components/beacon fd42d59c5f608b9120d9cdc2e2354b66f945a5ed` produced `bc87c5fe5fca8d43d32eb656ed233df36a20af8a`.
- The extracted baseline tree exactly matches the source subtree before independent-repository metadata changes.
- Original upstream provenance and pre-branding import revision remain in UPSTREAM.md; the complete earlier monorepo history stays in Luuna.
- Source, data formats, aliases, dependencies and lockfile are unchanged by extraction. LICENSE SHA-256: `fe1956a36381a8ac9e13e229247eb1f05f951bb6a96153773025d03a0fd62519`.
- This commit adds standalone ownership, documentation and CI. Luuna consumes the exact reviewed Git commit as a submodule at the existing path.
- No registry package is published. GitHub access supplies source retrieval; npm release credentials are intentionally unnecessary.

Visibility: public, explicitly authorized by the owner on October 21, 2026. Luuna remains private. No private authoring records or credential files are included in the extracted history.
