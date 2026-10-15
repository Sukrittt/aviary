#!/bin/sh
# Cuts the landing page clips, posters and stills (public/landing/, public/landing/intl/) and the
# store screenshot frames (../store-screenshots/src/) from the demo recordings in ../demo-recordings/.
# Re-run after re-recording; adjust the timestamps below to the new takes. Usage: scripts/landing-media.sh
set -e
cd "$(dirname "$0")/.."
REC=../demo-recordings; STORE=../store-screenshots/src
ENC="-c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p -r 30 -an -movflags +faststart"

clip() { # clip <in> <out> <start> [end]   trims a recording to a 30fps landing clip
  ffmpeg -v error -y -ss "$3" ${4:+-to "$4"} -i "$1" $ENC "$2"
}
joined() { # joined <in> <out> <start end>...   pieces of one recording cut together (skips the dead waits)
  j_in=$1; j_out=$2; shift 2; j_f=""; j_n=0
  while [ $# -ge 2 ]; do j_f="$j_f[0:v]trim=$1:$2,setpts=PTS-STARTPTS[s$j_n];"; j_n=$((j_n+1)); shift 2; done
  j_i=0; while [ $j_i -lt $j_n ]; do j_f="$j_f[s$j_i]"; j_i=$((j_i+1)); done
  ffmpeg -v error -y -i "$j_in" -filter_complex "${j_f}concat=n=$j_n:v=1:a=0" $ENC "$j_out"
}
last() { ffmpeg -v error -y -sseof -0.2 -i "$1" -frames:v 1 -update 1 -q:v 3 "$2"; }  # poster: the clip's finished state
frame() { ffmpeg -v error -y -ss "$2" -i "$1" -frames:v 1 -update 1 -q:v 3 "$3"; }  # <in> <t> <out>
crop() { ffmpeg -v error -y -ss "$2" -i "$1" -frames:v 1 -update 1 -vf "crop=576:640:0:$3" "$4"; }  # <in> <t> <y> <out>: 576x640 still

# Both regions share one cut list; the moments (seconds into each take) are set per region below.
build() {
  r=$1; out=public/landing$2; store=$STORE$2; mkdir -p "$out" "$store"
  src=$REC/$r
  clip "$src/log-expense.mp4" "$out/clip-log.mp4" 0
  frame "$src/log-expense.mp4" "$KEYPAD" "$out/poster-log.jpg"
  # The "Added" card, cropped to the phone's middle so it reads at card size.
  ffmpeg -v error -y -ss "$ADDED" -i "$src/log-expense.mp4" -vf "crop=576:640:0:$ADDED_Y" $ENC "$out/clip-added.mp4"
  last "$out/clip-added.mp4" "$out/poster-added.jpg"
  clip "$src/scan-bill.mp4" "$out/clip-scan.mp4" "$SCAN"; last "$out/clip-scan.mp4" "$out/poster-scan.jpg"
  joined "$src/ask-aviary.mp4" "$out/clip-ask.mp4" $ASK; last "$out/clip-ask.mp4" "$out/poster-ask.jpg"
  clip "$src/insights.mp4" "$out/clip-insights.mp4" $INSIGHTS; last "$out/clip-insights.mp4" "$out/poster-insights.jpg"
  clip "$src/investments.mp4" "$out/clip-invest.mp4" "$INVEST"; last "$out/clip-invest.mp4" "$out/poster-invest.jpg"
  frame "$src/insights.mp4" "$SUBS" "$out/subscriptions.png"
  crop "$src/wrapped.mp4" "$STREAK" 380 "$out/wrapped-streak.png"
  crop "$src/wrapped.mp4" "$PERSONA" 390 "$out/wrapped-persona.png"
  # Store screenshot frames (slides.html reads these as *@2x.png).
  frame "$src/log-expense.mp4" "$KEYPAD" "$store/log_amount@2x.png"
  last "$out/clip-log.mp4" "$store/log_added@2x.png"
  last "$out/clip-ask.mp4" "$store/ask_iphone@2x.png"
  frame "$src/scan-bill.mp4" 0.3 "$store/home@2x.png"
  frame "$src/insights.mp4" "$CARD" "$store/insights_card@2x.png"
  cp "$out/subscriptions.png" "$store/subs_card@2x.png"
  frame "$src/wrapped.mp4" 12 "$store/wr_total@2x.png"
  frame "$src/wrapped.mp4" 7.5 "$store/wr_days@2x.png"
  frame "$src/wrapped.mp4" "$PERSONA" "$store/wr_homebody@2x.png"
}

KEYPAD=4.6 ADDED=6.4 ADDED_Y=235 SCAN=10.5 ASK="6.5 13.5 19.2 24.9 27.4 29.2" INSIGHTS="3.0 21.0" SUBS=29.6 INVEST=3.0 STREAK=43 PERSONA=52 CARD=10.8 \
  build india ""
KEYPAD=5.6 ADDED=7.6 ADDED_Y=265 SCAN=7.4 ASK="6.5 13.0 17.0 22.6 25.0 26.8" INSIGHTS="2.5 23.0" SUBS=30.9 INVEST=17.5 STREAK=42 PERSONA=50 CARD=12.8 \
  build international /intl
