# Themegit

An opinionated workflow for continuously previewing and deploying Shopify themes

TODO
- [ ] A note about strategies
- [ ] Periodic test

## Inputs

### `BUILT_THEME_DIR`

**Required** The directory for your (pre-built) Shopify theme. Default `"."`.

### `SHOPIFY_STORE_DOMAIN`

**Required** Your Shopify store domain, like example.myshopify.com.

### `SHOPIFY_PASSWORD`

**Required** The same Shopify password you use with Themekit locally

### `CONFIG_CONFLICT_STRATEGY`

**Required** The strategy we use to resolve differences in config files from deploy
to deploy. Must be one of: `raise`, `take-live-version`, `take-branch-version`,
`merge-into-live-version`, `merge-into-branch-version`.

### `LOCALE_CONFLICT_STRATEGY`

**Required** The strategy we use to resolve differences in locale files from deploy
to deploy. Must be one of: `raise`, `take-live-version`, `take-branch-version`,
`merge-into-live-version`, `merge-into-branch-version`.

## Outputs

### `SHOPIFY_PREVIEW_THEME_URL`

The preview URL to see the theme

## Example usage

```
...
  steps:
      - uses: actions/checkout@v5
      - name: Themegit
        uses: in-house-dot-dev/themegit
        with:
          BUILT_THEME_DIR: './my_theme'
          SHOPIFY_STORE_DOMAIN: example-store.myshopify.com
          SHOPIFY_PASSWORD: ${{ secrets.SHOPIFY_PASSWORD }}
          CONFIG_CONFLICT_STRATEGY: raise
          LOCALE_CONFLICT_STRATEGY: raise
```
