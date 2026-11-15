#!/usr/bin/env bash
# Stitches the recordings from `DEMO=1 npm run e2e -- demo` into docs/demo.gif:
# teacher console on the left, the student's phone on the right.
set -euo pipefail
cd "$(dirname "$0")/.."
T=e2e/screens/demo-teacher.webm
S=e2e/screens/demo-student.webm
OUT=docs/demo.gif
START=${START:-1.0}   # skip the first second (page load)
FPS=${FPS:-12}
WIDTH=${WIDTH:-1100}

ffmpeg -y -loglevel error -ss "$START" -i "$T" -ss "$START" -i "$S" -filter_complex "
  [0:v]setpts=PTS-STARTPTS[t];
  [1:v]setpts=PTS-STARTPTS,pad=iw+24:ih:24:0:color=0xf6f5fb[s];
  [t][s]hstack=inputs=2:shortest=1,fps=$FPS,scale=$WIDTH:-1:flags=lanczos,split[a][b];
  [a]palettegen=max_colors=192:stats_mode=diff[p];
  [b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
