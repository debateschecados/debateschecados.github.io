"""Render the hand-drawn sprites (ASCII grids) to SVG.

Both candidates share BODY rows and pose; only the head differs.
Flávio is mirrored so the two face each other. Run: python3 site/sprites/render.py
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent

# Shared body, rows 21..31 (32 cols). Facing right.
BODY = [
    "...........KKSSSSSK.............",
    "..........KTTKSSSKTK............",
    ".......KKKJTTTKKKTTJKKK.........",
    ".....KKJJJJJTTTRTTTJJJJJKK......",
    "....KJJJJJJJJTTRRTTJJJJJJJK.....",
    "...KJJJjJJJJJJTRRTJJJJjJJJJK....",
    "...KJJJjJJJJJJTRRrJJJJjJJJJJK...",
    "..KJJJJjJJJJJJJRRJJJJJjJJJJJK...",
    "..KJJJJjJJJJJJJRrJJJJJjJJJJJJK..",
    "..KJJJJjJJJJJJJJJJJJJJjJJJJJJK..",
    "..KJJJJjJJJJJJJJJJJJJJjJJJJJJK..",
]

HEADS = {
    "lula": [
        "................................",
        "................................",
        "............KKKKKKK.............",
        "..........KKHHHHHHHKK...........",
        ".........KHHHHhhhHHHHK..........",
        "........KHHHHHSSSSSSSSK.........",
        "........KHHHHSSSSSSSSSSK........",
        ".......KHHHHSSSSSSSSSSSK........",
        ".......KHHHSSSSSSSSSSSSK........",
        ".......KHHHSSSSGGSSSSSGGK.......",
        ".......KHHKKSSSSSGSSSGSSK.......",
        ".......KHKssKSSSKESSSKESSK......",
        ".......KHKsSKSSSSSSSSSSSSSK.....",
        ".......KHKssKSSSSSSSSSSsSSK.....",
        ".......KWWKKSSSSSSSSSSSssK......",
        ".......KWWWWSSSSSSSWWWWWWK......",
        "........KWWWWWSSSWWWMMMWWK......",
        "........KWWWWWWWWWWWWWWWWK......",
        ".........KWWWWWwWWWWWWWWK.......",
        "..........KWWWwwWWWWWWWK........",
        "...........KKWWWWWWWWKK.........",
    ],
    "flavio": [
        "................................",
        "................................",
        "............KKKKKKKK............",
        "..........KKHHHHHHHHKK..........",
        ".........KHHHHHhhHHHHHK.........",
        "........KHHHHHHHHHHHHHHK........",
        "........KHHHHHHHHHHHSSSK........",
        ".......KHHHHHSSSSSSSSSSSK.......",
        ".......KHHHSSSSSSSSSSSSSK.......",
        ".......KHHHSSSSGGSSSSSGGK.......",
        ".......KHHKKSSSSSGSSSGSSK.......",
        ".......KHKssKSSSKESSSKESSK......",
        ".......KHKsSKSSSSSSSSSSSSSK.....",
        ".......KHKssKSSSSSSSSSSsSSK.....",
        "........KSKKSSSSSSSSSSSssK......",
        "........KSsSSSSSSSSSSSSSSK......",
        "........KSssSSSSSSSSMMMSSK......",
        "........KSsssSSSSSSSSSSSSK......",
        ".........KssssSSSSSSSSSSK.......",
        "..........KsssSSSSSSSSSK........",
        "...........KKSSSSSSSSKK.........",
    ],
}

PALETTES = {
    "lula": {
        "K": "#2b2420", "H": "#d9d6d0", "h": "#f2f0ec", "S": "#e2a17f", "s": "#c4805f",
        "G": "#9a958d", "E": "#2b2420", "W": "#ecebe7", "w": "#c9c6bf", "M": "#8a5a48",
        "J": "#23314f", "j": "#1a2540", "T": "#f4f4f2", "R": "#8e2f45", "r": "#6e2234",
    },
    "flavio": {
        "K": "#2b2420", "H": "#3a2c24", "h": "#57443a", "S": "#e9b896", "s": "#dcac8c",
        "G": "#3a2c24", "E": "#2b2420", "W": "#ecebe7", "w": "#c9c6bf", "M": "#a2634f",
        "J": "#2f3236", "j": "#24272a", "T": "#f4f4f2", "R": "#a9b4c2", "r": "#8794a5",
    },
}


def grid(name):
    rows = HEADS[name] + BODY
    for i, r in enumerate(rows):
        if len(r) != 32:
            sys.exit(f"{name} row {i} has {len(r)} cols")
    return rows


# Mouth frames, two per candidate. Shapes differ so each one talks his own way;
# the count of frames is the same for both. Coordinates are in the unmirrored,
# facing-right grid.
MOUTHS = {
    "lula": {
        # wide shout, bottom teeth showing
        "a": [
            (19, 16, "D"), (20, 16, "D"), (21, 16, "D"), (22, 16, "D"), (23, 16, "D"),
            (19, 17, "D"), (20, 17, "D"), (21, 17, "D"), (22, 17, "D"), (23, 17, "D"),
            (19, 18, "D"), (20, 18, "T"), (21, 18, "T"), (22, 18, "T"), (23, 18, "D"),
        ],
        # round "O", mid-word
        "b": [
            (20, 16, "D"), (21, 16, "D"),
            (19, 17, "D"), (20, 17, "D"), (21, 17, "D"), (22, 17, "D"),
            (20, 18, "D"), (21, 18, "D"),
        ],
    },
    "flavio": {
        # shout, top teeth showing
        "a": [
            (19, 16, "D"), (20, 16, "T"), (21, 16, "T"), (22, 16, "D"),
            (19, 17, "D"), (20, 17, "D"), (21, 17, "D"), (22, 17, "D"),
            (20, 18, "D"), (21, 18, "D"),
        ],
        # gritted teeth, corners down
        "b": [
            (20, 16, "D"), (21, 16, "D"), (22, 16, "D"),
            (19, 17, "D"), (20, 17, "T"), (21, 17, "T"), (22, 17, "T"), (23, 17, "D"),
            (19, 18, "D"), (20, 18, "D"), (21, 18, "D"), (22, 18, "D"), (23, 18, "D"),
        ],
    },
}
MOUTH_DARK = "#3b1d1a"


def runs(cells, mirror):
    """Merge horizontal runs of the same color into one rect each."""
    by_row = {}
    for x, y, color in cells:
        by_row.setdefault(y, []).append((31 - x if mirror else x, color))
    rects = []
    for y in sorted(by_row):
        row = sorted(by_row[y])
        start, prev, color = row[0][0], row[0][0], row[0][1]
        for x, c in row[1:] + [(None, None)]:
            if x == prev + 1 and c == color:
                prev = x
                continue
            rects.append(f'<rect x="{start}" y="{y}" width="{prev - start + 1}" height="1" fill="{color}"/>')
            if x is not None:
                start, prev, color = x, x, c
    return "".join(rects)


def svg(name, mirror=False, px=1, mouths=False):
    rows = grid(name)
    pal = {**PALETTES[name], "D": MOUTH_DARK}
    base = [(x, y, pal[ch]) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch != "."]
    layers = [f'<g>{runs(base, mirror)}</g>']
    if mouths:
        for frame, cells in MOUTHS[name].items():
            colored = [(x, y, pal[ch]) for x, y, ch in cells]
            layers.append(f'<g class="m-{frame}">{runs(colored, mirror)}</g>')
    h = len(rows)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 {h}" width="{32 * px}" '
        f'height="{h * px}" shape-rendering="crispEdges">{"".join(layers)}</svg>'
    )


if __name__ == "__main__":
    # <name>.svg: still portrait for the scoreboard. <name>-talk.svg: same drawing plus
    # the two mouth frames, inlined in the page by the site build.
    out = HERE
    for name, mirror in (("lula", False), ("flavio", True)):
        (out / f"{name}.svg").write_text(svg(name, mirror=mirror))
        (out / f"{name}-talk.svg").write_text(svg(name, mirror=mirror, mouths=True))
    print(json.dumps({"rows": len(grid("lula"))}))
