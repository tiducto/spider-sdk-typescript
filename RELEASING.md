# Releasing

`@tiducto/spider-sdk-typescript` publishes to the **public npm registry** using
**npm Trusted Publishing (OIDC)** — no long-lived token. The
`.github/workflows/publish-npm.yml` workflow authenticates to npm via GitHub's OIDC identity
and emits [provenance](https://docs.npmjs.com/generating-provenance-statements) from that same
identity (a verifiable link from the tarball back to this repo and the exact run that built it —
possible because the repo is public).

Why OIDC and not an automation token: npm is deprecating 2FA-bypass / automation tokens for
publishing (publishing capability is removed around January 2027), and trusted publishing is the
endorsed replacement. It also means one less secret to manage — there is **no `NPM_TOKEN`**.

## One-time setup (maintainer)

1. **Claim the `@tiducto` org on npm.** Sign in at [npmjs.com](https://www.npmjs.com/) and create
   the organization `tiducto` (the scope is unclaimed, so the name is free; the Free plan covers
   public packages).

2. **First publish (manual, once) to create the package.** Trusted publishing configures a
   relationship for an *existing* package, so the first `0.1.0` is published by hand:

   ```bash
   npm login                                   # your npm account (with 2FA)
   npm ci && npm run build
   npm publish --access public                 # no --provenance: that only works from CI
   ```

3. **Configure the trusted publisher** so every later release needs no token — either in the npm
   web UI (package → **Settings → Trusted Publisher** → GitHub Actions: repo
   `tiducto/spider-sdk-typescript`, workflow file `publish-npm.yml`, allow publish), or via the CLI:

   ```bash
   npm trust github @tiducto/spider-sdk-typescript \
     --repo tiducto/spider-sdk-typescript --file publish-npm.yml --allow-publish
   ```

No repo secrets are required — OIDC replaces the token entirely.

## Cutting a release (after setup)

The published version is `package.json`'s `version`, derived from `version.properties`
(`contract` + `patch`). npm **rejects re-publishing an existing version**, so bump first.

1. Bump `version.properties` (e.g. `patch=1` → `0.1.1`), then run `npm run stamp-version` to stamp
   `package.json` + `src/sdkVersion.ts`. Commit that.
2. Tag and push:

   ```bash
   git tag 0.1.1      # must match the stamped version and the X.Y.Z pattern
   git push origin 0.1.1
   ```

   The tag push triggers the `publish npm` workflow, which builds and runs
   `npm publish --provenance` over OIDC. Once green, the package is live at
   <https://www.npmjs.com/package/@tiducto/spider-sdk-typescript> with a verified provenance badge.
