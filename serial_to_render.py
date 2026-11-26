#!/usr/bin/env python3
"""
Lit les lignes série de l'Arduino (9600 bauds) et transmet les distances à Render.
Exemple de ligne attendue : Distance : 12 cm
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request

try:
    import serial
except ImportError:
    print("pyserial n'est pas installé. Lance : python -m pip install pyserial")
    sys.exit(1)

DISTANCE_RE = re.compile(r"Distance\s*:\s*(\d+)\s*cm", re.IGNORECASE)

def send_measurement(url, token, distance):
    payload = json.dumps({"distance_cm": distance}).encode("utf-8")
    request = urllib.request.Request(
        url.rstrip("/") + "/api/measurements",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        method="POST"
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        return response.status

def main():
    parser = argparse.ArgumentParser(description="Pont USB Arduino vers Render")
    parser.add_argument("--port", required=True, help="Exemple Windows: COM3 ; macOS: /dev/cu.usbmodem... ; Linux: /dev/ttyACM0")
    parser.add_argument("--url", required=True, help="URL Render, par exemple https://mon-site.onrender.com")
    parser.add_argument("--token", required=True, help="Valeur API_TOKEN définie dans Render")
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--interval", type=float, default=1.0,
                        help="Secondes minimum entre deux envois (défaut 1). L'Arduino mesure ~3 fois par seconde.")
    args = parser.parse_args()

    print(f"Connexion à {args.port} à {args.baud} bauds...")
    print("Ferme le Moniteur série Arduino IDE avant de lancer ce programme.")
    try:
        with serial.Serial(args.port, args.baud, timeout=2) as arduino:
            time.sleep(2)  # certains Arduino redémarrent à l'ouverture du port série
            print("Connecté. Envoi des mesures vers Render (Ctrl+C pour arrêter).")
            last_sent = 0.0
            while True:
                line = arduino.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                match = DISTANCE_RE.search(line)
                if not match:
                    continue
                distance = int(match.group(1))
                if not 1 <= distance <= 400:
                    print(f"Mesure ignorée : {distance} cm (mesure invalide ou hors plage)")
                    continue
                if time.monotonic() - last_sent < args.interval:
                    continue
                last_sent = time.monotonic()
                try:
                    status = send_measurement(args.url, args.token, distance)
                    print(f"Envoyé : {distance} cm — HTTP {status}")
                except (urllib.error.URLError, TimeoutError) as error:
                    print(f"Erreur d'envoi : {error}")
                except Exception as error:
                    print(f"Erreur : {error}")
    except serial.SerialException as error:
        print(f"Impossible d'ouvrir le port série : {error}")
        print("Vérifie le port USB et ferme le Moniteur série Arduino IDE.")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nArrêt du programme.")

if __name__ == "__main__":
    main()
