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

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
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
    assert parser.mailto_links, "contact email link is missing"
    assert all("mike@socalnmotorsports.com" in link for link in parser.mailto_links)

    missing = [asset for asset in parser.local_assets if not (SITE / asset).is_file()]
    assert not missing, f"missing local assets: {missing}"

    html = index.read_text(encoding="utf-8")
    assert "Jordan Wiseley" in html
    assert "Driver Coach" in html
    assert "socalnmotorsports.com" in html
    print("Site checks passed.")


if __name__ == "__main__":
    main()
