"""Generate the import-test fixtures in app/src-tauri/tests/fixtures/.

Run once with `python -I scripts/make_icc_fixture.py`; the outputs are committed.

Pillow's ImageCms.createProfile only knows sRGB/LAB/XYZ, so the Display P3 profile is
written by hand as a standard ICC v2 matrix/TRC display profile: P3 primaries, D65 white
Bradford-adapted to the D50 PCS, and the sRGB transfer curve (as Display P3 uses).
ImageCms then loads it back to check it parses before it is embedded.
"""

import io
import struct
from pathlib import Path

from PIL import Image, ImageCms

OUT = Path(__file__).resolve().parent.parent / "app" / "src-tauri" / "tests" / "fixtures"


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def mat_vec(m, v):
    return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]


def mat_inv(m):
    (a, b, c), (d, e, f), (g, h, i) = m
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return [
        [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
        [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
        [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
    ]


def xy_to_xyz(x, y):
    return [x / y, 1.0, (1 - x - y) / y]


def p3_colorants_d50():
    prims = [xy_to_xyz(0.680, 0.320), xy_to_xyz(0.265, 0.690), xy_to_xyz(0.150, 0.060)]
    white = xy_to_xyz(0.3127, 0.3290)  # D65
    p = [[prims[j][i] for j in range(3)] for i in range(3)]  # columns are primaries
    s = mat_vec(mat_inv(p), white)
    rgb_to_xyz = [[p[i][j] * s[j] for j in range(3)] for i in range(3)]
    bradford = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]]
    d50 = [0.9642, 1.0, 0.8249]
    src, dst = mat_vec(bradford, white), mat_vec(bradford, d50)
    scale = [[dst[i] / src[i] if i == j else 0.0 for j in range(3)] for i in range(3)]
    adapt = mat_mul(mat_inv(bradford), mat_mul(scale, bradford))
    m = mat_mul(adapt, rgb_to_xyz)
    return [[m[i][j] for i in range(3)] for j in range(3)]  # r, g, b XYZ


def s15(v):
    return struct.pack(">i", round(v * 65536))


def xyz_tag(xyz):
    return b"XYZ " + b"\0" * 4 + b"".join(s15(c) for c in xyz)


def srgb_curve(n=1024):
    def eotf(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    vals = [round(eotf(i / (n - 1)) * 65535) for i in range(n)]
    return b"curv" + b"\0" * 4 + struct.pack(">I", n) + struct.pack(f">{n}H", *vals)


def desc_tag(text):
    a = text.encode("ascii") + b"\0"
    return b"desc" + b"\0" * 4 + struct.pack(">I", len(a)) + a + b"\0" * 8 + b"\0" * 3 + b"\0" * 67


def text_tag(text):
    return b"text" + b"\0" * 4 + text.encode("ascii") + b"\0"


def build_icc(colorants, description):
    r, g, b = colorants
    curve = srgb_curve()
    tags = [
        (b"desc", desc_tag(description)),
        (b"cprt", text_tag("No copyright, test fixture")),
        (b"wtpt", xyz_tag([0.9642, 1.0, 0.8249])),
        (b"rXYZ", xyz_tag(r)),
        (b"gXYZ", xyz_tag(g)),
        (b"bXYZ", xyz_tag(b)),
        (b"rTRC", curve),
        (b"gTRC", curve),
        (b"bTRC", curve),
    ]
    table_len = 4 + 12 * len(tags)
    offset = 128 + table_len
    table, data = struct.pack(">I", len(tags)), b""
    for sig, body in tags:
        body += b"\0" * (-len(body) % 4)
        table += sig + struct.pack(">II", offset + len(data), len(body))
        data += body
    size = offset + len(data)
    header = (
        struct.pack(">I", size)
        + b"\0" * 4
        + struct.pack(">I", 0x02100000)
        + b"mntrRGB XYZ "
        + struct.pack(">6H", 2026, 11, 25, 0, 0, 0)
        + b"acsp"
        + b"\0" * 24
        + struct.pack(">I", 0)  # perceptual
        + s15(0.9642) + s15(1.0) + s15(0.8249)
        + b"\0" * 4
        + b"\0" * 16
        + b"\0" * 28
    )
    assert len(header) == 128
    return header + table + data


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    p3 = build_icc(p3_colorants_d50(), "Display P3 (Horus test fixture)")
    prof = ImageCms.ImageCmsProfile(io.BytesIO(p3))  # must parse
    srgb = ImageCms.createProfile("sRGB")

    # Not pure P3 red: (255,0,0) lies outside sRGB and clips back to (255,0,0), which would
    # make a skipped conversion indistinguishable from a real one. (255,70,70) is a P3 red
    # that lands inside sRGB, so its G and B visibly drop when converted.
    red = Image.new("RGB", (64, 64), (255, 70, 70))
    red.save(OUT / "p3_red.png", icc_profile=p3)
    for c in [(255, 0, 0), (255, 70, 70)]:
        px = ImageCms.profileToProfile(Image.new("RGB", (1, 1), c), prof, srgb).getpixel((0, 0))
        print(f"P3 {c} -> sRGB via LittleCMS {px}")

    Image.new("RGB", (32, 32), (200, 100, 50)).save(
        # Claims "RGB " at the colour-space offset so it reaches qcms, which must reject it.
        OUT / "bad_icc.png",
        icc_profile=b"\0" * 16 + b"RGB " + b"this is not an ICC profile" * 8,
    )

    small = Image.new("RGB", (64, 48))
    small.putdata([(x * 4, y * 5, 128) for y in range(48) for x in range(64)])
    small.save(OUT / "small.jpg", quality=90)

    # Stored landscape 64x48; EXIF Orientation=6 means "rotate 90 degrees clockwise to view",
    # so it displays portrait 48x64.
    exif = Image.Exif()
    exif[0x0112] = 6
    small.save(OUT / "rotated.jpg", quality=90, exif=exif.tobytes())

    (OUT / "fake.psd").write_bytes(b"8BPS" + bytes(range(256)) * 4)
    (OUT / "empty.jpg").write_bytes(b"")


if __name__ == "__main__":
    main()
