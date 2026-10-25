from html import escape
from pathlib import Path
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT_PNG = ROOT / "readyou-workflow.png"
OUT_SVG = ROOT / "readyou-workflow.svg"
W, H = 2300, 1780

CREAM = "#FFF8EE"
PAPER = "#FFFCF7"
INK = "#25211F"
MUTED = "#786E63"
ORANGE = "#F45B2A"
LIME = "#E8F78B"
LAVENDER = "#EEE8FF"
PEACH = "#FFF0E5"
WHITE = "#FFFFFF"
LINE = "#D9CFC3"
GREEN = "#DDF3E2"

FONT_DIR = Path("C:/Windows/Fonts")
FONT = str(FONT_DIR / "segoeui.ttf")
FONT_BOLD = str(FONT_DIR / "segoeuib.ttf")
FONT_MONO = str(FONT_DIR / "consola.ttf")

image = Image.new("RGB", (W, H), CREAM)
draw = ImageDraw.Draw(image)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
svg.append(f'<rect width="{W}" height="{H}" fill="{CREAM}"/>')


def get_font(size, bold=False, mono=False):
    return ImageFont.truetype(FONT_MONO if mono else (FONT_BOLD if bold else FONT), size)


def svg_rect(x, y, w, h, fill, stroke="none", sw=0, radius=0):
    svg.append(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    )


def draw_text(x, y, value, size, color=INK, bold=False, mono=False):
    font = get_font(size, bold, mono)
    draw.text((x, y), value, font=font, fill=color)
    family = "Consolas, monospace" if mono else "Segoe UI, sans-serif"
    weight = "700" if bold else "400"
    svg.append(
        f'<text x="{x}" y="{y + size}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" fill="{color}">{escape(value)}</text>'
    )


def wrap_lines(value, font, max_width):
    words = value.split()
    lines, line = [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if line and draw.textlength(candidate, font=font) > max_width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def paragraph(x, y, value, size, max_width, color=MUTED, line_gap=8):
    font = get_font(size)
    lines = wrap_lines(value, font, max_width)
    line_h = size + line_gap
    for i, line in enumerate(lines):
        draw_text(x, y + i * line_h, line, size, color=color)
    return len(lines) * line_h


def panel(y, h, number, heading, subtitle):
    draw.rounded_rectangle((78, y + 9, 2222, y + h + 9), radius=24, fill=INK)
    draw.rounded_rectangle((68, y, 2212, y + h), radius=24, fill=PAPER, outline=INK, width=3)
    svg_rect(68, y, 2144, h, PAPER, INK, 3, 24)
    draw.rounded_rectangle((100, y + 24, 164, y + 70), radius=14, fill=LIME, outline=INK, width=2)
    svg_rect(100, y + 24, 64, 46, LIME, INK, 2, 14)
    draw_text(113, y + 30, number, 24, color=INK, bold=True, mono=True)
    draw_text(184, y + 20, heading, 34, color=INK, bold=True)
    draw_text(184, y + 63, subtitle, 20, color=MUTED)


def card(x, y, w, h, title, body, fill, tag, tag_fill=None, body_size=20):
    if tag_fill is None:
        tag_fill = {"DEV.TO": PEACH, "BACKEND": PEACH, "RESEARCH": PEACH,
                    "LOCAL AI": LIME, "SOURCES → UI": LAVENDER,
                    "BROWSER": LAVENDER, "ELEVENLABS": PEACH,
                    "LOCAL CACHE": GREEN, "VOICE ONLY": PEACH,
                    "VALIDATION": GREEN}.get(tag, WHITE)
    draw.rounded_rectangle((x + 7, y + 8, x + w + 7, y + h + 8), radius=18, fill=INK)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=18, fill=fill, outline=INK, width=2)
    svg_rect(x, y, w, h, fill, INK, 2, 18)
    tag_font = get_font(14, bold=True, mono=True)
    tag_width = int(draw.textlength(tag.upper(), font=tag_font)) + 26
    draw.rounded_rectangle((x + 17, y + 15, x + 17 + tag_width, y + 43), radius=10, fill=tag_fill, outline=INK, width=1)
    svg_rect(x + 17, y + 15, tag_width, 28, tag_fill, INK, 1, 10)
    draw_text(x + 29, y + 18, tag.upper(), 14, color=INK, bold=True, mono=True)
    title_y = y + 56
    title_font = get_font(24, bold=True)
    title_lines = wrap_lines(title, title_font, w - 36)
    for i, line in enumerate(title_lines[:2]):
        draw_text(x + 18, title_y + i * 29, line, 24, color=INK, bold=True)
    body_y = title_y + min(len(title_lines), 2) * 29 + 10
    paragraph(x + 18, body_y, body, body_size, w - 36, color=INK, line_gap=5)


def arrow(x1, y1, x2, y2, color=ORANGE, dashed=False, width=4):
    if dashed:
        # Dashed straight connector for optional/bypass paths.
        dx, dy = x2 - x1, y2 - y1
        length = max(1, (dx * dx + dy * dy) ** 0.5)
        ux, uy = dx / length, dy / length
        pos = 0
        while pos < length - 18:
            end = min(pos + 13, length - 18)
            draw.line((x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end), fill=color, width=width)
            pos += 22
    else:
        draw.line((x1, y1, x2, y2), fill=color, width=width)
    svg.append(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
        f'stroke-width="{width}"' + (' stroke-dasharray="10 9"' if dashed else '') + '/>'
    )
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 14
    points = [
        (x2, y2),
        (x2 - size * math.cos(angle - 0.48), y2 - size * math.sin(angle - 0.48)),
        (x2 - size * math.cos(angle + 0.48), y2 - size * math.sin(angle + 0.48)),
    ]
    draw.polygon(points, fill=color)
    svg_points = " ".join(f"{px:.1f},{py:.1f}" for px, py in points)
    svg.append(f'<polygon points="{svg_points}" fill="{color}"/>')


def chip(x, y, label, fill, width):
    draw.rounded_rectangle((x, y, x + width, y + 34), radius=12, fill=fill, outline=INK, width=1)
    svg_rect(x, y, width, 34, fill, INK, 1, 12)
    draw_text(x + 12, y + 5, label, 16, color=INK, bold=True)


# Header
draw_text(82, 46, "ReadYou workflow", 58, color=INK, bold=True)
draw_text(84, 119, "From winner announcements to source-grounded project conversations", 27, color=MUTED)
chip(84, 168, "BROWSER", LAVENDER, 142)
chip(242, 168, "BACKEND", PEACH, 142)
chip(400, 168, "LOCAL GEMMA / OLLAMA", LIME, 260)
chip(678, 168, "EXTERNAL SERVICE", WHITE, 195)

# 01 — research and digest
panel(226, 430, "01", "Build the project digest", "Repository documentation is checked against each submission before it reaches the summary prompt.")
top_y, top_h, top_w = 338, 248, 360
top_xs = [92, 512, 932, 1352, 1772]
cards = [
    ("Winner sources", "DEV Team announcements and DEV.to submission articles enter the pipeline.", PEACH, "DEV.TO"),
    ("Winner discovery", "The backend extracts winning submissions. A scheduler scans at startup and every 3 hours by default.", PEACH, "BACKEND"),
    ("Submission research", "Read the article and collect up to five linked GitHub README candidates.", PEACH, "RESEARCH"),
    ("Repository relevance gate", "Gemma compares each README with the article. Uncertain results or errors exclude that README.", LIME, "LOCAL AI"),
    ("Briefing + digest cache", "Use the DEV article plus any confidently matched README. Gemma writes the briefing; JSON state is saved under reports/ and shown in the React digest.", LAVENDER, "SOURCES → UI"),
]
for x, item in zip(top_xs, cards):
    card(x, top_y, top_w, top_h, *item, body_size=19)
for i in range(4):
    arrow(top_xs[i] + top_w + 8, top_y + 124, top_xs[i + 1] - 12, top_y + 124)

# 02 — basic audio
panel(692, 336, "02", "Basic Listening", "The project introduction is a separate, reusable listening path.")
audio_xs = [130, 650, 1170, 1690]
audio_w, audio_y, audio_h = 400, 790, 158
audio_cards = [
    ("Choose Listen", "The reader starts a project's short introduction.", LAVENDER, "BROWSER"),
    ("Prepare intro text", "Gemma turns the briefing into a concise narration script.", LIME, "LOCAL AI"),
    ("Generate speech", "ElevenLabs converts the script into an MP3.", PEACH, "ELEVENLABS"),
    ("Cache + playback", "The MP3 is cached locally under reports/audio and reused on replay.", GREEN, "LOCAL CACHE"),
]
for x, item in zip(audio_xs, audio_cards):
    card(x, audio_y, audio_w, audio_h, *item, body_size=19)
for i in range(3):
    arrow(audio_xs[i] + audio_w + 8, audio_y + 79, audio_xs[i + 1] - 12, audio_y + 79)

# 03 — Voice Mentor
panel(1060, 590, "03", "Voice Mentor", "Text and voice questions share the same source-grounded chat; only spoken input needs transcription.")
mentor_xs = [82, 445, 808, 1171, 1534, 1897]
mentor_w, mentor_y, mentor_h = 300, 1195, 210
mentor_cards = [
    ("Ask a question", "Type a question or record it in Voice Mentor.", LAVENDER, "BROWSER"),
    ("Transcribe voice", "ElevenLabs Scribe turns a recording into text. Typed questions skip this step.", PEACH, "VOICE ONLY"),
    ("Retrieve project sources", "The backend selects relevant passages from the DEV post and verified README.", PEACH, "BACKEND"),
    ("Assess + answer", "In one call, Gemma judges project relevance from meaning and drafts an answer with evidence quotes.", LIME, "LOCAL AI"),
    ("Check the evidence", "The backend checks that each quote appears in its cited source section.", GREEN, "VALIDATION"),
    ("Show the reply", "Unrelated questions are redirected; invalid assessments fail closed. Supported answers show source references.", LAVENDER, "BROWSER"),
]
for x, item in zip(mentor_xs, mentor_cards):
    card(x, mentor_y, mentor_w, mentor_h, *item, body_size=18)
for i in (0, 1, 2, 3, 4):
    arrow(mentor_xs[i] + mentor_w + 7, mentor_y + 105, mentor_xs[i + 1] - 11, mentor_y + 105)

# Direct text bypass for the optional transcription step.
arrow(mentor_xs[0] + 150, mentor_y + mentor_h + 14, mentor_xs[2] + 150, mentor_y + mentor_h + 14, color=MUTED, dashed=True, width=3)
draw_text(mentor_xs[0] + 355, mentor_y + mentor_h + 18, "Typed questions go straight to chat", 17, color=MUTED, bold=True)
svg.append(f'<text x="{mentor_xs[0] + 355}" y="{mentor_y + mentor_h + 35}" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" fill="{MUTED}">Typed questions go straight to chat</text>')

# Optional spoken response loop.
draw.rounded_rectangle((126, 1492, 2174, 1581), radius=18, fill=PEACH, outline=INK, width=2)
svg_rect(126, 1492, 2048, 89, PEACH, INK, 2, 18)
draw_text(153, 1510, "OPTIONAL SPOKEN REPLY", 16, color=ORANGE, bold=True, mono=True)
draw_text(452, 1507, "Validated answer → ElevenLabs TTS → browser playback", 23, color=INK, bold=True)
draw_text(452, 1542, "A new question stops the current speech. Chat answer speech is generated on demand.", 18, color=MUTED)
svg.append(f'<text x="153" y="1526" font-family="Consolas, monospace" font-size="16" font-weight="700" fill="{ORANGE}">OPTIONAL SPOKEN REPLY</text>')
svg.append(f'<text x="452" y="1529" font-family="Segoe UI, sans-serif" font-size="23" font-weight="700" fill="{INK}">Validated answer → ElevenLabs TTS → browser playback</text>')
svg.append(f'<text x="452" y="1560" font-family="Segoe UI, sans-serif" font-size="18" fill="{MUTED}">A new question stops the current speech. Chat answer speech is generated on demand.</text>')

# Footer notes
draw.line((84, 1690, 2215, 1690), fill=LINE, width=2)
svg.append(f'<line x1="84" y1="1690" x2="2215" y2="1690" stroke="{LINE}" stroke-width="2"/>')
draw_text(86, 1711, "LOCAL", 16, color=ORANGE, bold=True, mono=True)
draw_text(164, 1708, "Gemma inference · digest JSON · cached intro MP3s", 18, color=INK)
draw_text(1068, 1711, "NETWORK", 16, color=ORANGE, bold=True, mono=True)
draw_text(1170, 1708, "DEV.to + GitHub source fetches · ElevenLabs speech", 18, color=INK)
svg.append(f'<text x="86" y="1727" font-family="Consolas, monospace" font-size="16" font-weight="700" fill="{ORANGE}">LOCAL</text>')
svg.append(f'<text x="164" y="1727" font-family="Segoe UI, sans-serif" font-size="18" fill="{INK}">Gemma inference · digest JSON · cached intro MP3s</text>')
svg.append(f'<text x="1068" y="1727" font-family="Consolas, monospace" font-size="16" font-weight="700" fill="{ORANGE}">NETWORK</text>')
svg.append(f'<text x="1170" y="1727" font-family="Segoe UI, sans-serif" font-size="18" fill="{INK}">DEV.to + GitHub source fetches · ElevenLabs speech</text>')

svg.append("</svg>")
OUT_SVG.write_text("\n".join(svg), encoding="utf-8")
image.save(OUT_PNG, optimize=True)
print(f"Created {OUT_PNG}")
print(f"Created {OUT_SVG}")
