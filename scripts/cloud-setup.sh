#!/usr/bin/env bash
# Jednorazové nastavenie projektu v Google Cloud Shell (https://shell.cloud.google.com).
#
#   bash cloud-setup.sh chrisstop-app
#
# Skript:
#   1. zapne potrebné Google Cloud služby,
#   2. uloží e-mail majiteľa a Anthropic API kľúč do Secret Manageru (nie do kódu),
#   3. vytvorí servisný účet "github-deploy" pre automatické nasadzovanie z GitHubu
#      a vypíše jeho kľúč, ktorý vložíte do GitHubu ako tajomstvo FIREBASE_SERVICE_ACCOUNT.
set -euo pipefail

PROJECT="${1:-chrisstop-app}"
gcloud config set project "$PROJECT" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"

echo "== Projekt: $PROJECT ($PROJECT_NUMBER)"

echo "== Zapínam služby (môže trvať 1–2 minúty)…"
gcloud services enable \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  firebaserules.googleapis.com firebasehosting.googleapis.com firebasestorage.googleapis.com \
  identitytoolkit.googleapis.com cloudresourcemanager.googleapis.com iam.googleapis.com

put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy=automatic --data-file=- >/dev/null
  fi
  echo "   uložené: $name"
}

echo
read -r -p "E-mail majiteľa aplikácie (Enter = $ACCOUNT): " OWNER
OWNER="${OWNER:-$ACCOUNT}"
put_secret OWNER_EMAILS "$OWNER"

echo
echo "Anthropic API kľúč vytvoríte na https://console.anthropic.com → API Keys (začína sk-ant-)."
read -r -s -p "Vložte Anthropic API kľúč (text sa nezobrazuje): " ANTHROPIC_KEY
echo
if [[ -n "$ANTHROPIC_KEY" ]]; then
  put_secret ANTHROPIC_API_KEY "$ANTHROPIC_KEY"
else
  echo "   preskočené – AI asistent nebude fungovať, kým kľúč nedoplníte (spustite skript znova)."
  gcloud secrets describe ANTHROPIC_API_KEY >/dev/null 2>&1 || put_secret ANTHROPIC_API_KEY "chyba-kluc"
fi

echo
echo "== Oprávnenia pre build serverových funkcií…"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for ROLE in roles/cloudbuild.builds.builder roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$COMPUTE_SA" --role="$ROLE" --condition=None -q >/dev/null
done

echo "== Servisný účet pre nasadzovanie z GitHubu…"
SA_NAME=github-deploy
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub – nasadenie ChrisStop"
for ROLE in \
  roles/firebase.admin roles/cloudfunctions.admin roles/run.admin roles/iam.serviceAccountUser \
  roles/artifactregistry.admin roles/cloudbuild.builds.editor roles/secretmanager.admin \
  roles/serviceusage.serviceUsageAdmin roles/firebaserules.admin roles/datastore.indexAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE" --condition=None -q >/dev/null
done

KEY_FILE="$HOME/github-deploy-key.json"
gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA" >/dev/null
echo
echo "================================================================================"
echo "HOTOVO. Posledný krok:"
echo "  1. Otvorte GitHub → repozitár → Settings → Secrets and variables → Actions"
echo "  2. New repository secret, názov: FIREBASE_SERVICE_ACCOUNT"
echo "  3. Ako hodnotu vložte CELÝ text medzi čiarami nižšie (vrátane { a })."
echo "--------------------------------------------------------------------------------"
cat "$KEY_FILE"
echo
echo "--------------------------------------------------------------------------------"
echo "Po skopírovaní kľúč z Cloud Shellu zmažte:  rm $KEY_FILE"
