from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.local_assets = []
        self.mailto_links = []
        self.forms = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "form":
            self.forms.append(values)
        for attribute in ("href", "src"):
            value = values.get(attribute, "")
            if value.startswith("mailto:"):
                self.mailto_links.append(value)
            elif value and not value.startswith(("#", "http://", "https://", "data:")):
                self.local_assets.append(value.split("?", 1)[0])


def main():
    index = SITE / "index.html"
    assert index.is_file(), "site/index.html is missing"

    parser = SiteParser()
    parser.feed(index.read_text(encoding="utf-8"))

    required_sections = {"top", "racing", "coach", "intelligence", "partners", "contact"}
    assert required_sections <= parser.ids, f"missing sections: {required_sections - parser.ids}"
    assert not parser.mailto_links, "the contact email must not be exposed as a mailto link"
    assert any(form.get("id") == "contact-form" for form in parser.forms), "contact form is missing"

    missing = [asset for asset in parser.local_assets if not (SITE / asset).is_file()]
    assert not missing, f"missing local assets: {missing}"

    html = index.read_text(encoding="utf-8")
    assert "Jordan Wiseley" in html
    assert "Driver Coach" in html
    assert "socalnmotorsports.com" in html
    assert "mike@socalnmotorsports.com" not in html, "the email address is visible in the page source"
    assert "ct4-v-blackwing-race.webp" in html
    assert "jordan-wiseley-paddock.webp" in html
    assert "jordan-wiseley-racing.webp" not in html
    assert "Arrive-and-drive" in html
    assert "Zenith" in html
    assert "GRIDLIFE" in html
    assert "Practice days" in html
    assert "hill climbs" in html
    assert "insurance" in html
    assert "price" not in html.lower()

    script = SITE / "contact.js"
    assert script.is_file(), "contact form script is missing"
    script_text = script.read_text(encoding="utf-8")
    assert '["mike", "socalnmotorsports.com"].join("@")' in script_text
    assert "mailto:" in script_text
    print("Site checks passed.")


if __name__ == "__main__":
    main()
