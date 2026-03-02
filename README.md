# DriveJournal - Familien-Fahrtenbuch

Eine mobile-optimierte PHP-Webanwendung für ein einfaches Fahrtenbuch ohne Datenbank (nur JSON-Speicher).

## Features

- ✅ Einfache Kilometer-Eingabe für Start und Ende von Fahrten
- ✅ Individuelle Links für jedes Familienmitglied
- ✅ Automatische Zuordnung zum passenden Auto basierend auf KM-Stand
- ✅ Berechnung gefahrener Kilometer
- ✅ Admin-Panel zum Verwalten von Autos und Benutzern
- ✅ Statistiken und Fahrthistorie pro Auto
- ✅ Mobile-optimiert / Progressive Web App

## Installation

1. Kopiere alle Dateien in dein Webserver-Verzeichnis (z.B. `c:\inetpub\wwwroot\drivejournal`)

2. Stelle sicher, dass PHP aktiviert ist

3. Öffne die Anwendung im Browser: `http://localhost/drivejournal/`

## Erste Schritte

1. **Admin-Zugang**: Standard-Passwort ist `admin123` (bitte in `config.php` ändern!)

2. **Autos anlegen**: Im Admin-Bereich unter "Autos" kannst du Fahrzeuge hinzufügen

3. **Benutzer anlegen**: Unter "Benutzer" kannst du Familienmitglieder hinzufügen und deren Links erhalten

4. **Links verteilen**: Jedes Familienmitglied erhält einen individuellen Link für die App

## Verwendung

### Für Benutzer:
1. Öffne deinen persönlichen Link
2. Gib den aktuellen Kilometerstand ein
3. Wähle "Start" oder "Ende"
4. Wähle das Auto aus (oder bei "Ende" wird automatisch das passende Auto ermittelt)

### Für Admins:
- **Autos verwalten**: Name, Bild und aktuellen KM-Stand pflegen
- **Benutzer verwalten**: Familienmitglieder hinzufügen/entfernen
- **Statistiken**: Übersicht der gefahrenen Kilometer pro Auto und Fahrer

## Technische Details

- **Backend**: PHP 7.4+
- **Datenspeicher**: JSON-Dateien (keine Datenbank benötigt)
- **Frontend**: Vanilla JavaScript, Mobile-optimiertes CSS
- **Ordnerstruktur**:
  - `/data/` - JSON-Dateien für Benutzer, Autos, Fahrten
    - `users.json` - Benutzerdaten
    - `cars.json` - Fahrzeugdaten
    - `trips_<car_id>.json` - Fahrten pro Fahrzeug (separate Dateien)
  - `/uploads/` - Bilder der Autos

### Datenstruktur

Die Anwendung speichert Fahrten-Daten in separaten JSON-Dateien pro Fahrzeug:
- `trips_1.json` - Fahrten für Auto mit ID 1
- `trips_2.json` - Fahrten für Auto mit ID 2
- etc.

Dies verbessert die Performance und erleichtert die Wartung bei vielen Fahrten.

**Zentrale Funktionen** in `functions.php`:
- `loadTripsForCar($carId)` - Lädt Fahrten für ein bestimmtes Auto
- `loadAllTrips()` - Lädt alle Fahrten von allen Autos
- `saveTrip($trip)` - Speichert eine Fahrt in der entsprechenden Datei
- `generateTripId()` - Generiert eindeutige IDs über alle Autos hinweg

### Migration von alter Datenstruktur

Falls du eine bestehende `trips.json` hast, führe einmalig die Migration aus:
1. Öffne im Browser: `http://localhost/drivejournal/migrate.php`
2. Das Skript teilt die Fahrten automatisch auf separate Dateien auf
3. Die alte `trips.json` wird als Backup umbenannt

## Sicherheit

⚠️ **Wichtig**: Bitte ändere das Admin-Passwort in `config.php`!

```php
define('ADMIN_PASSWORD', 'dein-sicheres-passwort');
```

## Support

Bei Fragen oder Problemen überprüfe:
- PHP ist aktiv und Version 7.4+
- Schreibrechte für `/data/` und `/uploads/` Ordner

## Lizenz

Frei verwendbar für private Zwecke.
