from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.local_assets = []
        self.mailto_links = []
        self.forms = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "form":
            self.forms.append(values)
        if tag == "img":
            self.images.append(values)
        for attribute in ("href", "src"):
            value = values.get(attribute, "")
            if value.startswith("mailto:"):
                self.mailto_links.append(value)
            elif value and not value.startswith(("#", "http://", "https://", "data:")):
                self.local_assets.append(unquote(value.split("#", 1)[0].split("?", 1)[0]))


def check_page(path):
    html = path.read_text(encoding="utf-8")
    parser = SiteParser()
    parser.feed(html)
    assert not parser.mailto_links, f"email exposed as mailto link in {path}"
    assert '<link rel="canonical" href="https://socalnmotorsports.com/' in html
    assert "<title>" in html and 'name="description"' in html

    missing = []
    for asset in parser.local_assets:
        resolved = (path.parent / asset).resolve()
        if not resolved.exists():
            missing.append(asset)
    assert not missing, f"missing local assets in {path}: {missing}"

    for image in parser.images:
        assert image.get("alt", "").strip(), f"image missing alt text in {path}"
        assert image.get("width") and image.get("height"), f"image dimensions missing in {path}"
    return html, parser


def main():
    expected_pages = [
        SITE / "index.html",
        SITE / "arrive-and-drive" / "index.html",
        SITE / "driver-coaching" / "index.html",
        SITE / "practice-days-hill-climbs" / "index.html",
        SITE / "racing-intelligence" / "index.html",
        SITE / "partnerships" / "index.html",
        SITE / "privacy" / "index.html",
    ]
    store_url = "https://socalnmotorsports.store"
    for page in expected_pages:
        assert page.is_file(), f"missing page: {page.relative_to(SITE)}"
        page_html, _ = check_page(page)
        assert store_url in page_html, f"store link is missing from {page.relative_to(SITE)}"

    html, parser = check_page(SITE / "index.html")
    required_sections = {"top", "racing", "coach", "intelligence", "partners", "store", "contact"}
    assert required_sections <= parser.ids, f"missing sections: {required_sections - parser.ids}"
    assert any(form.get("id") == "contact-form" for form in parser.forms), "contact form is missing"
    assert 'type="application/ld+json"' in html, "organization structured data is missing"
    assert "Jordan Wiseley" in html and "Driver Coach" in html
    assert "mike@socalnmotorsports.com" not in html, "email address is visible in page source"
    assert "ct4-v-blackwing-race.webp" in html
    assert "jordan-wiseley-paddock.webp" in html
    assert "jordan-wiseley-racing.webp" not in html
    assert html.count(store_url) >= 10, "homepage store links and calls to action are incomplete"
    assert 'data-track="hero_store"' in html
    assert 'data-track="store_shop"' in html
    assert 'data-track="store_intelligence"' in html
    for phrase in ("Arrive-and-drive", "Zenith", "GRIDLIFE", "Practice days", "hill climbs", "insurance"):
        assert phrase in html, f"required homepage phrase is missing: {phrase}"
    assert "price" not in html.lower()

    contact_script = (SITE / "contact.js").read_text(encoding="utf-8")
    assert '["mike", "socalnmotorsports.com"].join("@")' in contact_script
    assert "formsubmit.co/ajax" in contact_script
    assert "mailto:" not in contact_script
    assert (SITE / "analytics.js").is_file()

    robots = (SITE / "robots.txt").read_text(encoding="utf-8")
    sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
    assert "Sitemap: https://socalnmotorsports.com/sitemap.xml" in robots
    for path in ("arrive-and-drive", "driver-coaching", "practice-days-hill-climbs", "racing-intelligence", "partnerships", "privacy"):
        assert f"https://socalnmotorsports.com/{path}/" in sitemap
    assert (SITE / "CNAME").read_text(encoding="utf-8").strip() == "socalnmotorsports.com"
    print(f"Site checks passed for {len(expected_pages)} pages.")


if __name__ == "__main__":
    main()
