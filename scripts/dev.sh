#!/bin/sh
# Starts Vite with the Google Maps browser key from AWS Secrets Manager (ai-travel-app/google-maps-browser-key).
# A key already set in the environment or in .env.local wins; without AWS access or a key, maps show a note instead.
SECRET_ID="ai-travel-app/google-maps-browser-key"

if [ -z "$VITE_GOOGLE_MAPS_API_KEY" ] && ! grep -q '^VITE_GOOGLE_MAPS_API_KEY=.' .env.local 2>/dev/null; then
  key=$(aws secretsmanager get-secret-value --region us-east-2 --secret-id "$SECRET_ID" \
    --query SecretString --output text 2>/dev/null)
  if [ -n "$key" ] && [ "$key" != "None" ]; then
    export VITE_GOOGLE_MAPS_API_KEY="$key"
    echo "Google Maps key loaded from Secrets Manager ($SECRET_ID)."
  else
    echo "No Google Maps key in Secrets Manager ($SECRET_ID); maps are disabled."
  fi
fi

exec vite "$@"
