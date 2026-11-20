"""Draw the extension icons as PNG files.

The icon is a blue rounded square with three white text lines. It is drawn pixel by pixel with
the standard library, so no imaging package is needed. By default the files go to
extension/icons next to this script; pass another directory as the first argument to change that.

The 128-pixel icon doubles as the Chrome Web Store icon, so it follows the store's guideline:
96x96 artwork inside 16 pixels of transparent padding. The smaller toolbar sizes fill their
whole canvas.
"""

import os
import struct
import sys
import zlib

# Each entry is (icon size, transparent padding on every side), both in pixels.
SIZES = ((16, 0), (48, 0), (128, 16))
BLUE = (35, 154, 255)
# Each text line is (top, right end) as fractions of the artwork size.
LINES = ((0.28, 0.78), (0.46, 0.78), (0.64, 0.58))


def draw(size, padding):
    """Return the RGBA PNG bytes for one icon size with the given transparent padding."""
    art = size - 2 * padding
    radius = art * 0.22
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # Coordinates inside the artwork square; the padding stays fully transparent.
            ax, ay = x - padding + 0.5, y - padding + 0.5
            if not (0 <= ax < art and 0 <= ay < art):
                row += bytes((0, 0, 0, 0))
                continue
            cx = min(max(ax, radius), art - radius)
            cy = min(max(ay, radius), art - radius)
            distance = ((ax - cx) ** 2 + (ay - cy) ** 2) ** 0.5
            alpha = max(0.0, min(1.0, radius - distance + 0.5))
            red, green, blue = BLUE
            fy, fx = ay / art, ax / art
            for top, right in LINES:
                if top <= fy < top + 0.09 and 0.22 <= fx < right:
                    red, green, blue = 255, 255, 255
            row += bytes((red, green, blue, int(alpha * 255)))
        rows.append(bytes(row))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "extension", "icons")
    os.makedirs(out, exist_ok=True)
    for size, padding in SIZES:
        path = os.path.join(out, f"icon-{size}.png")
        with open(path, "wb") as handle:
            handle.write(draw(size, padding))
        print(f"wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
