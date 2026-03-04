**Boxen**
- **Container**: .container — Haupt-Wrapper für Seiteninhalt.
- **Header**: .header, .header-logo — oben, Logo + Begrüßung.
- **KM-Eingabe / Aktionen**: .km-input-section, .action-buttons — Eingabefeld + Start/Ende-Buttons.
- **Bestätigungs-Box**: .confirmation-section, .confirmation-content, .confirmation-info, .confirmation-actions, .confirmation-correction — Modal/Inline-Box zur Fahrtbestätigung.
- **Korrektur-Box**: .gap-correction-box, .corr-row, .corr-msg, .debug-bounds, .gap-correction-row — Inline-Row zum Lücken schließen.
- **Fahrzeug-Grid**: .car-selection, .car-grid, .car-item, .car-placeholder, .car-name, .car-km, .car-open-start — Karten/Items für Autos.
- **Listen / Tabellen**: .trips-history, .table-inline, .table-inline th/td — Tabellendarstellung der Fahrten.

**Buttons**
- **Base**: .btn — gemeinsames Grundstyling (Padding, border-radius, font).
- **Aktionen / Varianten**: .btn-start, .btn-end, .btn-success, .btn-warning, .btn-secondary, .btn-capture — farbliche/semantische Varianten.
- **Navigation**: .page-btn, .car-tab, .page-info — Pagination / Tab-Buttons.

**Info-Meldung**
- **Status**: .status-message — allgemeine Infos (grün/neutral).
- **Bestätigungstext**: .confirm-last-entry, #confirm-distance — Details in der Confirmation-Box.
- **Kleine Hilfstexte**: .small, .initial-badge — sekundäre Hinweise.

**Fehlermeldung**
- **KM-Fehler**: #km-error-message — zentrale rote Fehlermeldung unter Inputs.
- **Korrektur-Meldung**: .corr-msg — Inline-Warnungen in der Korrektur-Box (orange).
- **Debug / Hilfsinfo**: .debug-bounds — graue Zusatzinfos (nur zu Debug-Zwecken).

**Input**
- **Hauptinput**: #km-input — globale KM-Eingabe oben.
- **Korrektur-Inputs**: .corr-start, .corr-end, #correction-km — number-Inputs in Confirmation/Korrektur.
- **Attribute**: Inputs nutzen `type="number"` mit `min` / `max` Attributen (gesetzt durch JS bei Korrektur-Box).

**Empfehlungen zur Konsolidierung in `styles_v1.css`**
- **Buttons zusammenführen**: Definiere ein zentrales `.btn` mit Modifier-Klassen (`.btn--success`, `.btn--warning`, `.btn--secondary`) statt viele einzelne, um Farben/disabled/hover zentral zu pflegen. Beispiel:
  - `.btn { /* basis */ }`
  - `.btn--success { background: var(--color-success); }`
- **Meldungs-Boxen vereinheitlichen**: Erzeuge Utility-Box-Klassen wie `.box`, `.box--warning`, `.box--error`, `.box--info` und wende sie auf `#km-error-message`, `.status-message`, `.corr-msg` an. Dadurch gleiche Padding/Border/Radius.
- **Disabled-Zustand nur für Buttons**: Aktuelle UX verlangt, dass nur Buttons visuell deaktiviert werden. Stelle `:disabled`-Regeln nur für `.btn:disabled` ein und nicht für `.gap-correction-box.disabled`.
- **Inputs vereinheitlichen**: Gemeinsame Regeln für `input[type="number"]` (Breite, Font, Padding, Fokus-Ring) statt einzelne Regeln verteilt im CSS.
- **Tabelle & Listen**: Gemeinsame Tabellenvorlagen (`.table-inline`) mit `.table-inline th` / `td` zentralisieren; Paging `.page-btn` / `.page-info` ebenfalls hier definieren.
- **Grid-Komponenten**: `.car-grid` / `.car-item` sollten responsive Grid-Varianten in einem Abschnitt `/* Grid */` besitzen—so sind alle Karten konsistent.
- **Farben / Abstände als Variablen**: Lege CSS-Variablen am Anfang von `styles_v1.css` an: `--color-primary`, `--color-warning`, `--color-error`, `--gap`, `--radius`. Das vereinfacht spätere Anpassungen.
- **Utility-Klassen**: `.small`, `.muted`, `.initial-badge`, `.trip-gap`, `.trip-initial` als kleine Utility-Klassen zusammenfassen.

**Praktische Vorschläge**
- Verschiebe alle Button-Varianten und disabled-Regeln in einen zusammenhängenden Abschnitt `/* Buttons */` in [styles_v1.css](styles_v1.css).
- Lege `/* Boxes */` für `.box` und Modifikatoren an und ersetze Inline-Farben durch Klassen (`.box--warning` statt inline style in JS).
- Definiere `input[type="number"]` zusammen mit Pseudo-Selektoren `:invalid` und `:focus` für konsistente Browser-Feedbacks.
- Entferne visuelle Manipulationen von Boxen in JS; ändere stattdessen Klassen (`.is-disabled`) und style diese Klassen in `styles_v1.css`.

**Referenzen im Codebase**
- Styling: [styles_v1.css](styles_v1.css)
- Korrektur-UI / Input-Logik: [trips-paging.js](trips-paging.js)
- Seiten-Rendering / Daten: [drive.php](drive.php)

Wenn du willst, kann ich jetzt `styles_v1.css` umbenennen/strukturieren und die empfohlenen Utility-Klassen hinzufügen. Soll ich damit fortfahren (kleine refactor-Änderungen)?
