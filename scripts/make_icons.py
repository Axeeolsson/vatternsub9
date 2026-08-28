"""Dependency-free PNG icon generator for the Sub9 PWA.

Draws a dark navy tile with a cyan speed/wheel gauge and a progress arc.
No external libraries required (uses only struct/zlib).
"""
import math
import struct
import zlib
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def draw(size, pad_ratio=0.0):
    px = bytearray(size * size * 4)

    cx = cy = size / 2.0
    R = size * (0.5 - pad_ratio)

    ring_outer = R * 0.86
    ring_inner = R * 0.66
    hub_r = R * 0.14

    # gauge arc goes from 135deg to 405deg (270deg sweep), progress ~72%
    start = math.radians(135)
    end = math.radians(135 + 270)
    progress_end = start + (end - start) * 0.72

    def set_px(x, y, r, g, b, a=255):
        i = (y * size + x) * 4
        # simple alpha-over onto existing
        ba = px[i + 3]
        if ba == 0:
            px[i] = r
            px[i + 1] = g
            px[i + 2] = b
            px[i + 3] = a
        else:
            fa = a / 255.0
            px[i] = int(r * fa + px[i] * (1 - fa))
            px[i + 1] = int(g * fa + px[i + 1] * (1 - fa))
            px[i + 2] = int(b * fa + px[i + 2] * (1 - fa))
            px[i + 3] = max(px[i + 3], a)

    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)

            # background: vertical gradient navy
            t = y / size
            bg_r = int(lerp(11, 8, t))
            bg_g = int(lerp(17, 12, t))
            bg_b = int(lerp(32, 24, t))

            if pad_ratio > 0:
                # maskable: fill whole canvas with bg
                inside_bg = True
            else:
                inside_bg = dist <= R + 0.5

            if inside_bg:
                set_px(x, y, bg_r, bg_g, bg_b, 255)

            # gauge track (dim)
            if ring_inner <= dist <= ring_outer:
                ang = math.atan2(dy, dx)
                # normalize angle to [start, start+2pi)
                a2 = ang
                while a2 < start:
                    a2 += 2 * math.pi
                if start <= a2 <= end:
                    if a2 <= progress_end:
                        # bright cyan progress
                        edge = min(dist - ring_inner, ring_outer - dist)
                        aa = max(0, min(255, int(edge * 4)))
                        set_px(x, y, 56, 189, 248, 200 + aa // 5 if False else 255)
                    else:
                        set_px(x, y, 40, 55, 78, 255)

            # hub
            if dist <= hub_r:
                set_px(x, y, 56, 189, 248, 255)
            # spokes
            elif dist <= ring_inner:
                ang = math.atan2(dy, dx)
                for k in range(6):
                    sp = k * math.pi / 3
                    d = abs(((ang - sp + math.pi) % (2 * math.pi)) - math.pi)
                    if d < 0.05 and dist > hub_r:
                        set_px(x, y, 51, 65, 85, 255)

    return bytes(px)


def write_png(path, size, raw):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    # add filter byte 0 per scanline
    stride = size * 4
    filtered = bytearray()
    for y in range(size):
        filtered.append(0)
        filtered.extend(raw[y * stride:(y + 1) * stride])
    idat = zlib.compress(bytes(filtered), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


write_png(os.path.join(OUT, "icon-512.png"), 512, draw(512, 0.0))
write_png(os.path.join(OUT, "icon-512-maskable.png"), 512, draw(512, 0.14))
print("icons written to", os.path.abspath(OUT))
