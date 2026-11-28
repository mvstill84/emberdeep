#!/usr/bin/env bash
# Runs the quick regression set against a local copy of the game.
# Usage: tests/run.sh            (quick set, ~3 min)
#        tests/run.sh all        (adds the slow full-run and power-curve bots, ~25 min)
# Needs: python3, playwright (pip install playwright), Chrome. Set CHROME=/path/to/chrome if it isn't /usr/bin/google-chrome.
cd "$(dirname "$0")/.." || exit 1
node build.mjs >/dev/null || exit 1
python3 -m http.server 8765 >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
mkdir -p tests/out && cd tests/out || exit 1
QUICK="pits run_summary balance_rules room_shapes_chasms route_layouts retreat_trials_champions cubes_slime_bag corpse_recovery dev_mode save_export qr_handshake coop_3p coop_inputs coop_late_join_drop mobile_hud loot_curves"
SLOW="fullrun_fighter fullrun_mage fullrun_ranger"
LIST="$QUICK"; [ "$1" = all ] && LIST="$QUICK $SLOW"
for t in $LIST; do echo "== $t"; timeout 600 python3 "../$t.py" 2>&1 | grep -v "agent-proxy" | tail -4; done
[ "$1" = all ] && { echo "== power_curve fighter"; timeout 700 python3 ../power_curve.py fighter SEEDC | cut -c1-140; }
