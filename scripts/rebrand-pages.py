#!/usr/bin/env python3
"""Generate the rebrand template JSONs that repeat across many pages.

Forty-odd person pages, twenty-two class pages and four class indexes all wear
the same handful of shapes. Writing them by hand is how one of them ends up
showing somebody else's portrait, which is exactly the bug this replaces — so
the shapes live here once and the files are generated.

Everything lands as templates/rb-<name>.json; rebrand-deploy.py renames those
to templates/<name>.json on the way to the draft theme, which is how the repo
keeps the LIVE theme's templates untouched.

Deliberate rule throughout: person images are left blank so rb-person-hero
reads them off the collection (portrait = the collection image, artwork = the
first piece that is not that photo). Never hardcode a portrait into a shared
shape.

    python3 scripts/rebrand-pages.py
"""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES = os.path.join(REPO, "templates")

INK = "#1e1e1e"
WHITE = "#ffffff"
CHERRY = "#b00e3f"
CORAL = "#e07468"
MOSS = "#505a43"
SAGE = "#9da887"
SAGE_PALE = "#a5ad93"
TEAL = "#0c3642"
SAND = "#e6ddc6"
GREY_RULE = "#c9c9c9"

# The booking widget is an app block, so it needs a host section that accepts
# @app blocks. Dawn's "apps" section is that host and adds no product chrome of
# its own — unlike main-product, which would drag Dawn's whole gallery and buy
# button onto a page the design has no room for.
BOOKING_APP_BLOCK = (
    "shopify://apps/sa-booking-admin/blocks/booking-widget/"
    "019effec-1823-75cb-82db-853f80a4249c"
)

ARTISTS = [
    "susan-orpen", "kerri-sassen", "zara-leigh", "amara-dube",
    "liesel-van-der-berg", "natasha-hendricks", "jacqui-sundelson",
    "janice-grant", "shelley-cowling",
] + [f"artist-{n}" for n in range(1, 26)]

TEACHERS = [
    "susan-orpen-1", "shelley-cowling-1", "jacqui-sundelson-1",
    "janice-grant-1", "zara-leigh-farinha-1",
] + [f"teacher-{n}" for n in range(1, 16)]

# The storefront resolves these two, the Admin API does not list them, and the
# catalogue still links classes at kerri-sassen-1. Templated the same way as
# their siblings so no route falls back to the pre-rebrand design.
GHOST_TEACHERS = ["kerri-sassen-1"]
GHOST_ARTISTS = ["zara-leigh-farinha"]

# The eight the Studio page's wall shows, in its order.
STUDIO_TEACHERS = TEACHERS[:5] + ["teacher-1", "teacher-2", "teacher-3"]

# Every class product's template_suffix. The catalogue puts fifteen classes on
# the shared "booking" suffix and gives each of the seven real ones its own.
CLASS_SUFFIXES = [
    "booking",
    "booking-7953118691406", "booking-7953508040782", "booking-7953531371598",
    "booking-7953538580558", "booking-7953650417742", "booking-7955596214350",
    "booking-7955606700110",
]

TEAM_URL = "/pages/the-team"
STUDIO_URL = "/pages/studio"


def write(name, data):
    path = os.path.join(TEMPLATES, f"rb-{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


# ---------------------------------------------------------------- heroes ----

def hero_band(heading, colour, mark, *, style="page_title", auto=False,
              text=WHITE, height=690, mark_width=150):
    """The coloured paper hero the artists page wears, retitled per page."""
    return {
        "type": "rb-hero",
        "settings": {
            "fill": "colour",
            "background": colour,
            "texture": 100,
            "band_height": height,
            "min_height": 260,
            "mobile_ratio": "4 / 3",
            "focal_x": 50,
            "focal_y": 50,
            "overlay_opacity": 0,
            "show_mark": True,
            "mark": mark,
            "mark_width": mark_width,
            "heading": heading,
            "auto_heading": auto,
            "heading_style": style,
            "text_color": text,
        },
    }


# --------------------------------------------------------- person pages ----

def person_hero(*, name_colour, align, text_width, portrait_x, portrait_y,
                button_label=""):
    return {
        "type": "rb-person-hero",
        "settings": {
            "name": "",
            "script": "",
            "tags": "",
            "social_url": "",
            "button_label": button_label,
            "button_link": "",
            "align": align,
            "text_width": text_width,
            "background": WHITE,
            "name_color": name_colour,
            "script_color": INK,
            "tag_color": TEAL,
            "image": "",
            "focal_x": 50,
            "focal_y": 50,
            "portrait": "",
            "portrait_w": 40,
            "portrait_ratio": "382 / 313",
            "portrait_x": portrait_x,
            "portrait_y": portrait_y,
        },
    }


def artist_template():
    return {
        "sections": {
            "hero": person_hero(name_colour=MOSS, align="center", text_width=38,
                                portrait_x=50, portrait_y=48),
            "artworks": {
                "type": "rb-artworks",
                "settings": {
                    "heading": "Available Artworks",
                    "collection": "",
                    "layout": "rail",
                    "per_page": 12,
                    "columns": 3,
                    "image_ratio": "233 / 200",
                    "hover_label": "View Artwork",
                    "rail_title": "Filter By:",
                    "rail_width": 190,
                    "card_button": "Browse Collection",
                    "more_label": "",
                    "background": WHITE,
                    "heading_color": MOSS,
                    "card_title_color": INK,
                    "card_meta_color": INK,
                },
            },
        },
        "order": ["hero", "artworks"],
    }


def teacher_template():
    return {
        "sections": {
            "hero": person_hero(name_colour=CORAL, align="left", text_width=40,
                                portrait_x=54, portrait_y=46,
                                button_label="See Portfolio"),
            "statement": {
                "type": "rb-script-statement",
                # The script line stays the designer's flourish; the paragraph
                # under it is the teacher's real bio, read off the collection.
                "settings": {
                    "heading": "<p>Teaching is <em>making, together.</em></p>",
                    "body": "",
                    "use_collection_description": True,
                    "background": WHITE,
                    "heading_color": INK,
                    "accent_color": CORAL,
                    "body_color": INK,
                    "heading_width": 900,
                    "body_width": 640,
                    "padding_top": 150,
                    "padding_bottom": 160,
                },
            },
            "classes": {
                "type": "rb-class-cards",
                # Blank collection: a teacher collection already holds that
                # teacher's classes, so no per-page name filter is needed and
                # none can go stale.
                "settings": {
                    "collection": "",
                    "count": 12,
                    "only_classes": True,
                    "eyebrow": "<p>View classes by [teacher]</p>",
                    "eyebrow_name": "",
                    "teacher_filter": "",
                    "intro": "",
                    "intro_color": INK,
                    "by_prefix": "By",
                    "show_excerpt": True,
                    "button_label": "View Class",
                    "columns": 3,
                    "grid_width": 1300,
                    "image_ratio": "398 / 380",
                    "radius": 18,
                    "background": WHITE,
                    "pattern": "alternate",
                    "tone_a": CORAL,
                    "tone_a_text": WHITE,
                    "tone_b": CHERRY,
                    "tone_b_text": WHITE,
                    "texture": 100,
                    "more_label": "Meet our teachers",
                    "more_link": TEAM_URL,
                },
            },
        },
        "order": ["hero", "statement", "classes"],
    }


# --------------------------------------------------------- class indexes ----

def people_grid(handles, *, eyebrow, intro="", more_label="", more_link=""):
    blocks, order = {}, []
    for i, handle in enumerate(handles):
        key = f"p{i}"
        order.append(key)
        blocks[key] = {
            "type": "person",
            "settings": {
                "collection": handle,
                "name": "",
                "role": "Art Classes",
                "image": "",
                "link": "",
                "button_label": "Learn More",
                "tone": "auto",
            },
        }
    return {
        "type": "rb-people-grid",
        "blocks": blocks,
        "block_order": order,
        "settings": {
            "eyebrow": eyebrow,
            "intro": intro,
            "intro_color": INK,
            "columns": 4,
            "image_ratio": "227 / 200",
            "background": WHITE,
            "tone_a": CHERRY,
            "tone_a_text": WHITE,
            "tone_b": CORAL,
            "tone_b_text": WHITE,
            "texture": 100,
            "more_label": more_label,
            "more_link": more_link,
        },
    }


def class_cards(*, eyebrow, count=24, intro="", more_label="", more_link=""):
    return {
        "type": "rb-class-cards",
        "settings": {
            "collection": "",
            "count": count,
            "only_classes": True,
            "eyebrow": eyebrow,
            "eyebrow_name": "",
            "teacher_filter": "",
            "intro": intro,
            "intro_color": INK,
            "by_prefix": "By",
            "show_excerpt": True,
            "button_label": "View Class",
            "columns": 3,
            "grid_width": 1300,
            "image_ratio": "398 / 380",
            "radius": 18,
            "background": WHITE,
            "pattern": "alternate",
            "tone_a": CORAL,
            "tone_a_text": WHITE,
            "tone_b": CHERRY,
            "tone_b_text": WHITE,
            "texture": 100,
            "more_label": more_label,
            "more_link": more_link,
        },
    }


def class_index(title_html, eyebrow, intro):
    """Hero, the whole collection as class cards, then who teaches them."""
    return {
        "sections": {
            "hero": hero_band(title_html, CORAL, "studio"),
            "classes": class_cards(eyebrow=eyebrow, intro=intro),
            "teachers": people_grid(
                STUDIO_TEACHERS,
                eyebrow="<p>Meet our teachers</p>",
                intro="<p>Every class is led by a working artist from the "
                      "studio.</p>",
                more_label="Meet all our teachers",
                more_link=TEAM_URL,
            ),
        },
        "order": ["hero", "classes", "teachers"],
    }


# ---------------------------------------------------------- class pages ----

def class_product_template():
    return {
        "sections": {
            "hero": {
                "type": "rb-class-hero",
                # Every text field blank: each one fills itself from that
                # class's booking metafields, which is what lets one template
                # serve all twenty-two classes.
                "settings": {
                    "eyebrow": "",
                    "title": "",
                    "strip_teacher": True,
                    "teacher_prefix": "With",
                    "teacher": "",
                    "fact_time": "",
                    "fact_level": "",
                    "fact_size": "",
                    "button_label": "Book Now",
                    "button_link": "",
                    "image_a": "",
                    "image_b": "",
                    "image_a_width": 62,
                    "text_width": 52,
                    "background": WHITE,
                    "title_color": CORAL,
                    "teacher_color": INK,
                    "fact_color": INK,
                },
            },
            "detail": {
                "type": "rb-class-detail",
                "blocks": {
                    "description": {
                        "type": "note",
                        "settings": {
                            "label": "Description:",
                            "body": "",
                            "use_product_description": True,
                        },
                    },
                    "costs": {
                        "type": "note",
                        "settings": {
                            "label": "Costs:",
                            "body": "<p>From [price] — [sessions] sessions</p>",
                            "use_product_description": False,
                        },
                    },
                },
                "block_order": ["description", "costs"],
                "settings": {
                    "heading": "<p>A guided <em>[class]</em> session.</p>",
                    "anchor": "booking",
                    "button_label": "Make a Booking",
                    "button_link": "",
                    "heading_width": 46,
                    "show_rule": True,
                    "background": WHITE,
                    "heading_color": INK,
                    "accent_color": CORAL,
                    "label_color": INK,
                    "body_color": INK,
                    "rule_color": GREY_RULE,
                },
            },
            "booking": {
                "type": "apps",
                "blocks": {
                    "booking_widget": {
                        "type": BOOKING_APP_BLOCK,
                        "settings": {
                            "class_product": "",
                            "eyebrow": "Book Your Spot",
                            "hold_minutes": 15,
                        },
                    },
                },
                "block_order": ["booking_widget"],
                "settings": {"include_margins": True},
            },
            "teacher": {
                "type": "rb-feature-person",
                "settings": {
                    "source": "product_teacher",
                    "eyebrow": "Teacher",
                    "name": "",
                    "body": "",
                    "button_a_label": "See Teachers Page",
                    "button_a_link": "",
                    "button_b_label": "See Artist Page",
                    "button_b_link": "",
                    "panel_color": CORAL,
                    "text_color": WHITE,
                    "eyebrow_color": INK,
                    "button_bg": CHERRY,
                    "button_text": WHITE,
                    "button_radius": 60,
                    "texture": 100,
                    "image": "",
                    "panel_width": 48,
                    "min_height": 560,
                    "focal_x": 50,
                    "focal_y": 60,
                    "portrait": "",
                    "portrait_w": 34,
                    "portrait_ratio": "382 / 313",
                    "portrait_x": 46,
                    "portrait_y": 40,
                },
            },
            "browse": {
                "type": "rb-class-cards",
                "settings": dict(
                    class_cards(
                        eyebrow="<p>Browse our classes</p>",
                        count=6,
                        intro="<p>More from the studio calendar.</p>",
                        more_label="See all classes",
                        more_link="/collections/classes",
                    )["settings"],
                    collection="classes",
                    pattern="all_a",
                ),
            },
        },
        "order": ["hero", "detail", "booking", "teacher", "browse"],
    }


# ------------------------------------------------------------- the team ----

def team_template():
    return {
        "sections": {
            "hero": hero_band("The Team", CHERRY, "saaf"),
            "founders": {
                "type": "rb-founders",
                "settings": {
                    "image": "shopify://shop_images/saf-home-founders.png",
                    "image_width": 475,
                    "show_stamp": True,
                    "stamp_width": 175,
                    "heading": "SA Art Fair is run by Bianca and Georgina, out "
                               "of the studio in Hout Bay.",
                    "heading_color": CHERRY,
                    "column_one": "",
                    "column_two": "",
                    "body_color": INK,
                    "signature": "– Bianca & Georgina",
                    "background": WHITE,
                },
            },
            "teachers": people_grid(
                TEACHERS,
                eyebrow="<p>Meet our teachers</p>",
                intro="<p>The artists who teach the studio's classes and "
                      "workshops.</p>",
            ),
        },
        "order": ["hero", "founders", "teachers"],
    }


# ------------------------------------------------ default collection page ---

def default_collection_template():
    """Every collection without a template of its own — Originals, Limited
    Editions, Art under R5 000 and anything the client adds later."""
    return {
        "sections": {
            "hero": hero_band("", SAGE_PALE, "store", auto=True, height=560,
                              mark_width=130),
            "artworks": {
                "type": "rb-artworks",
                "settings": {
                    "heading": "Available Artworks",
                    "collection": "",
                    "layout": "toolbar",
                    "per_page": 24,
                    "columns": 4,
                    "image_ratio": "1 / 1",
                    "hover_label": "View Artwork",
                    "search_placeholder": "Search artworks, artists, mediums…",
                    "bar_color": "#f4f4f1",
                    "card_button": "Browse Collection",
                    "more_label": "",
                    "background": WHITE,
                    "heading_color": MOSS,
                    "card_title_color": INK,
                    "card_meta_color": INK,
                },
            },
        },
        "order": ["hero", "artworks"],
    }


# ------------------------------------------------------------- patching ----

def patch(name, fn):
    path = os.path.join(TEMPLATES, f"rb-{name}.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    fn(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def main():
    written = []

    for handle in ARTISTS + GHOST_ARTISTS:
        written.append(write(f"collection.{handle}", artist_template()))
    written.append(write("collection.artist", artist_template()))

    for handle in TEACHERS + GHOST_TEACHERS:
        written.append(write(f"collection.{handle}", teacher_template()))
    written.append(write("collection.teacher", teacher_template()))

    written.append(write("collection.classes", class_index(
        "Classes",
        "<p>Browse our classes</p>",
        "<p>Weekly and term classes at the studio in Hout Bay.</p>")))
    written.append(write("collection.workshops", class_index(
        "Workshops",
        "<p>Browse our workshops</p>",
        "<p>One-off workshops, no experience needed.</p>")))
    # The "Workshops & Classes" collection routes through this suffix.
    written.append(write("collection.workshops-and-classes", class_index(
        "Classes &amp; Workshops",
        "<p>Everything on at the studio</p>",
        "<p>Every class and workshop currently taking bookings.</p>")))

    written.append(write("collection", default_collection_template()))
    written.append(write("page.the-team", team_template()))

    for suffix in CLASS_SUFFIXES:
        written.append(write(f"product.{suffix}", class_product_template()))
    written.append(write("product.class", class_product_template()))

    def studio(data):
        # Eight of twenty teachers are on this wall; the rest need a way in.
        data["sections"]["teachers"]["settings"]["more_label"] = \
            "Meet all our teachers"
        data["sections"]["teachers"]["settings"]["more_link"] = TEAM_URL
        for block in data["sections"]["teachers"]["blocks"].values():
            block["settings"]["name"] = ""
        # "Studio Events" pointed at a duplicate collection with no template.
        data["sections"]["offer"]["blocks"]["events"]["settings"]["collection"] \
            = "workshops-classes"
    written.append(patch("page.studio", studio))

    def index(data):
        # "Visit our studio" belongs on the Studio page, not on a collection
        # of class products that has no page of its own.
        data["sections"]["two_paths"]["blocks"]["make"]["settings"] \
            ["button_link"] = STUDIO_URL
    written.append(patch("index", index))

    print(f"wrote {len(written)} template(s)")
    for p in written:
        print("  ", os.path.relpath(p, REPO))


if __name__ == "__main__":
    main()
