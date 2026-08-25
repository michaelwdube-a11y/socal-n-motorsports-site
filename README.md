# SoCal N Motorsports website

Static marketing site for GitHub Pages. Every push to `main` automatically publishes through GitHub Actions.

## Publish once

1. Install and authenticate the GitHub CLI (`gh auth login`).
2. Run:

   ```bash
   ./scripts/publish-github-pages.sh michaelwdube-a11y/socal-n-motorsports-site socalnmotorsports.com
   ```

The script creates a public repository if needed, pushes the site, enables GitHub Pages, assigns the custom domain through the GitHub API, and starts the deployment workflow.

## Publish later updates

Run the same command again. Only committed changes are pushed, and GitHub Pages redeploys automatically.

## Verify locally

```bash
python3 tests/test_site.py
python3 -m http.server 8000 --directory site
```

Open `http://127.0.0.1:8000`.

## DNS for `socalnmotorsports.com`

Add these records at the domain's DNS provider:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `michaelwdube-a11y.github.io` |

Do not include the repository name in the `www` CNAME target.

After GitHub finishes its DNS check and issues a certificate, enable HTTPS:

```bash
gh api --method PUT repos/michaelwdube-a11y/socal-n-motorsports-site/pages -F https_enforced=true
```
