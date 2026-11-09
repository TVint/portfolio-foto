#!/bin/bash
cd "$(dirname "$0")"
PORT=8081

# Se la porta 8081 è già attiva con il nostro server, apri direttamente il browser
if lsof -i :$PORT >/dev/null 2>&1; then
  echo "Il server Darkroom CMS è già attivo sulla porta $PORT. Apro il pannello..."
  open "http://localhost:$PORT/admin.html"
  exit 0
fi

echo "Avvio di Nicola Vianello Darkroom Contact-Sheet CMS sulla porta $PORT..."
(sleep 1.2 && open "http://localhost:$PORT/admin.html") &
/usr/bin/python3 server.py $PORT
