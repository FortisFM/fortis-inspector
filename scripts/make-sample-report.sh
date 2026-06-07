#!/usr/bin/env bash
set -e
BASE="http://localhost:5000"
JAR=/tmp/fortis-cookies.txt
rm -f "$JAR"

echo "Logging in..."
TOKEN=$(curl -s -c "$JAR" -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fortisfm.com.au","password":"Password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"
echo "Token: ${TOKEN:0:12}..."

echo "Getting site 1 checklist..."
CHK=$(curl -s -H "$AUTH" "$BASE/api/sites/1/checklist")
echo "$CHK" | python3 -m json.tool | head -30

echo "Creating fresh inspection on site 1..."
INSP=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" "$BASE/api/sites/1/inspections" -d '{}')
INSP_ID=$(echo "$INSP" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Inspection id: $INSP_ID"

# Upload three photos using existing files
upload_photo() {
  local FILE="$1"
  curl -s -H "$AUTH" -X POST "$BASE/api/photos" -F "photo=@$FILE" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"
}

P1=$(upload_photo /home/user/workspace/fortis-inspector/uploads/482be8c8512afcf9274b.jpg)
P2=$(upload_photo /home/user/workspace/fortis-inspector/uploads/50af8f4576ceec833852.jpg)
P3=$(upload_photo /home/user/workspace/fortis-inspector/uploads/7af333c4d60679d03119.jpg)
P4=$(upload_photo /home/user/workspace/fortis-inspector/uploads/ec0f56f714dde8e9f297.jpg)
echo "Photo ids: $P1 $P2 $P3 $P4"

# Build entries: take the first 7 checklist items plus one observation
PAYLOAD=$(python3 <<PY
import json
chk = json.loads('''$CHK''')
entries = []
# Map the first seven checklist items to a realistic mix.
mix = [
  ("pass", None, "All extinguishers tagged and within service date. Pressure gauges in green.", []),
  ("fail", "moderate", "Two emergency exits in the basement carpark were blocked by stacked cardboard boxes. Cleared at the time of inspection. Recommend tenant communication to prevent recurrence.", [$P1]),
  ("pass", None, "Exit and emergency lighting tested via test switch. All units operational.", []),
  ("fail", "minor", "Foyer floor has visible scuff marks and a small coffee spill near the lift lobby. Routine clean required.", [$P2]),
  ("pass", None, "Both passenger lifts operating normally. Current certification displayed and valid until November 2026.", []),
  ("fail", "urgent", "External signage on the Queen Street facade has a damaged power feed. Sign is currently unlit overnight. Electrical attendance required.", [$P3]),
  ("pass", None, "Car park line marking and bollards in good condition. No remedial work required.", []),
]
for i, item in enumerate(chk[:7]):
  status, sev, note, photos = mix[i]
  entries.append({
    "checklistItemId": item["id"],
    "label": item["label"],
    "section": item.get("section",""),
    "status": status,
    "severity": sev,
    "note": note,
    "isObservation": False,
    "photoIds": photos,
  })

# One freeform observation
entries.append({
  "checklistItemId": None,
  "label": "Roof access door",
  "section": "",
  "status": "observation",
  "severity": "moderate",
  "note": "Roof access door latch is stiff and only closes fully with force. Hinges show light surface rust. Recommend lubrication and weather seal review.",
  "isObservation": True,
  "photoIds": [$P4],
})

payload = {
  "entries": entries,
  "weather": "Fine and dry, 22 degrees, light easterly wind.",
  "generalNotes": "Routine monthly inspection. Building Manager available on site. Two tenants reported aircon temperature concerns on Level 4, follow up with HVAC contractor next visit.",
  "inspectorName": "Fortis FM Admin",
  "status": "submitted",
}
print(json.dumps(payload))
PY
)

echo "Submitting inspection..."
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$BASE/api/inspections/$INSP_ID/save" \
  --data "$PAYLOAD" | python3 -m json.tool

echo "Waiting for PDF generation..."
sleep 4

echo "Downloading PDF..."
curl -s -H "$AUTH" -o /home/user/workspace/fortis-inspector/sample-report.pdf "$BASE/api/inspections/$INSP_ID/pdf"
ls -la /home/user/workspace/fortis-inspector/sample-report.pdf
