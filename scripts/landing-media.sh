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
stitch() { # stitch <out> <in1> "<cuts>" <in2> "<cuts>"   two recordings cut together (the $ create take ends before Invite; the ₹ one has it, and those screens show no currency)
  joined "$2" /tmp/lm_a.mp4 $3; joined "$4" /tmp/lm_b.mp4 $5
  printf "file '/tmp/lm_a.mp4'\nfile '/tmp/lm_b.mp4'\n" > /tmp/lm_c.txt
  ffmpeg -v error -y -f concat -safe 0 -i /tmp/lm_c.txt -c copy -movflags +faststart "$1"
}
# Homebrew ffmpeg has no webp encoder, so .webp posters go through cwebp (brew install webp).
still() { case "$2" in *.webp) ffmpeg -v error -y $1 -frames:v 1 -update 1 /tmp/lm_still.png && cwebp -quiet -q 82 /tmp/lm_still.png -o "$2";; *) ffmpeg -v error -y $1 -frames:v 1 -update 1 -q:v 82 "$2";; esac; }
last() { still "-sseof -0.2 -i $1" "$2"; }  # poster: the clip's finished state
frame() { still "-ss $2 -i $1" "$3"; }  # <in> <t> <out>
crop() { ffmpeg -v error -y -ss "$2" -i "$1" -frames:v 1 -update 1 -vf "crop=576:640:0:$3" "$4"; }  # <in> <t> <y> <out>: 576x640 still
# The wrap-up card: "Plan this month" sits 8px under "Share your wrapped", so the crop stops between them and the last row is stretched into 30px of breathing room.
streak() { ffmpeg -v error -y -ss "$2" -i "$1" -frames:v 1 -update 1 -filter_complex "[0:v]split[a][b];[a]crop=576:610:0:290[top];[b]crop=w=576:h=2:x=0:y=898,scale=576:30:flags=neighbor[pad];[top][pad]vstack" "$3"; }  # <in> <t> <out>

# Both regions share one cut list; the moments (seconds into each take) are set per region below.
build() {
  r=$1; out=public/landing$2; store=$STORE$2; mkdir -p "$out" "$store"
  src=$REC/$r
  # Skips the hold-to-save ring, which reads as a glitch at clip size.
  joined "$src/log-expense.mp4" "$out/clip-log.mp4" $LOG
  frame "$src/log-expense.mp4" "$KEYPAD" "$out/poster-log.webp"
  # The "Added" card, cropped to the phone's middle so it reads at card size.
  ffmpeg -v error -y -ss "$ADDED" -i "$src/log-expense.mp4" -vf "crop=576:640:0:$ADDED_Y" $ENC "$out/clip-added.mp4"
  last "$out/clip-added.mp4" "$out/poster-added.webp"
  clip "$src/scan-bill.mp4" "$out/clip-scan.mp4" "$SCAN"; last "$out/clip-scan.mp4" "$out/poster-scan.webp"
  joined "$src/ask-aviary.mp4" "$out/clip-ask.mp4" $ASK; last "$out/clip-ask.mp4" "$out/poster-ask.webp"
  clip "$src/insights.mp4" "$out/clip-insights.mp4" $INSIGHTS; last "$out/clip-insights.mp4" "$out/poster-insights.webp"
  clip "$src/investments.mp4" "$out/clip-invest.mp4" "$INVEST"; last "$out/clip-invest.mp4" "$out/poster-invest.webp"
  frame "$src/insights.mp4" "$SUBS" "$out/subscriptions.png"
  # Shared budgets: create + invite, join with a code, and the members list with who-logged-what.
  if [ -n "$CREATE_TAIL" ]; then stitch "$out/clip-create.mp4" "$src/create-budget.mp4" "$CREATE" "$REC/india/create-budget.mp4" "$CREATE_TAIL"
  else joined "$src/create-budget.mp4" "$out/clip-create.mp4" $CREATE; fi
  last "$out/clip-create.mp4" "$out/poster-create.webp"
  joined "$src/join-budget.mp4" "$out/clip-join.mp4" $JOIN; last "$out/clip-join.mp4" "$out/poster-join.webp"
  if [ -f "$src/members.mp4" ]; then joined "$src/members.mp4" "$out/clip-members.mp4" $MEMBERS; last "$out/clip-members.mp4" "$out/poster-members.webp"; fi
  # Switching apps: a YNAB export picked, read, checked, and Home with the history in.
  joined "$src/import.mp4" "$out/clip-import.mp4" $IMPORT; last "$out/clip-import.mp4" "$out/poster-import.webp"
  # Catch-up from screenshots: pick, read, check, logged.
  joined "$src/statement-upload.mp4" "$out/clip-catchup.mp4" $CATCHUP; last "$out/clip-catchup.mp4" "$out/poster-catchup.webp"
  streak "$src/wrapped.mp4" "$STREAK" "$out/wrapped-streak.png"
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

KEYPAD=3.9 LOG="0 3.95 4.55 99" ADDED=6.4 ADDED_Y=208 SCAN=10.5 ASK="6.5 13.5 19.2 24.9 27.4 29.2" INSIGHTS="3.0 21.0" SUBS=29.6 INVEST=3.0 STREAK=51.5 PERSONA=47 CARD=9.0 \
  CREATE="3.8 5.0 7.6 9.8 11.3 12.2 14.0 18.5" CREATE_TAIL="" JOIN="2.8 3.6 6.5 10.6 11.0 99" MEMBERS="0.3 1.0 2.9 5.3 6.0 11.6" CATCHUP="4.4 6.0 7.6 9.6 10.4 11.4 12.4 15.0 23.5 99" IMPORT="1.0 3.2 4.0 5.0 9.0 12.5 22.8 25.8 40.6 42.2" \
  build india ""
KEYPAD=4.8 LOG="0 5.15 5.95 99" ADDED=7.6 ADDED_Y=215 SCAN=7.4 ASK="6.5 13.0 17.0 22.6 25.0 26.8" INSIGHTS="2.5 23.0" SUBS=30.9 INVEST=17.5 STREAK=52 PERSONA=47 CARD=10.4 \
  CREATE="4.4 5.2 7.4 8.6 15.2 16.4 20.0 21.0" CREATE_TAIL="14.6 18.5" JOIN="2.8 3.6 5.0 7.4 8.4 99" MEMBERS="0.3 1.0 3.2 6.0 8.6 99" CATCHUP="3.0 4.2 5.6 7.2 8.4 11.4 22.4 99" IMPORT="1.0 3.4 4.4 5.4 6.2 7.0 7.4 8.0 10.0 12.5 22.4 26.0 38.0 39.5" \
  build international /intl
