# Themegit

An opinionated workflow for continuously previewing and deploying Shopify themes

## Inputs

### `BUILT_THEME_DIR`

**Required** The directory for your (pre-built) Shopify theme. Default `"."`.

### `SHOPIFY_STORE_DOMAIN`

**Required** Your Shopify store domain, like example.myshopify.com.

### `SHOPIFY_PASSWORD`

**Required** The same Shopify password you use with Themekit locally

## Example usage

```
...
  steps:
      - uses: actions/checkout@v2
      - name: Themegit
        uses: in-house-dot-dev/themegit
        with:
          BUILT_THEME_DIR: './my_theme'
          SHOPIFY_STORE_DOMAIN: ${{ secrets.SHOPIFY_STORE_DOMAIN }}
          SHOPIFY_PASSWORD: ${{ secrets.SHOPIFY_PASSWORD }}
```
