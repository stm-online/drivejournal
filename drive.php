<?php
require_once 'config.php';
require_once 'functions.php';

// Cache-Header: Verhindere aggressive Browser-Caches (insbesondere bei iOS)
header('Cache-Control: no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// Token prüfen
$token = $_GET['token'] ?? '';
$users = loadJSON(USERS_FILE);
$currentUser = null;

foreach ($users as $user) {
    if ($user['token'] === $token) {
        $currentUser = $user;
        break;
    }
}

if (!$currentUser) {
    header('Location: index.html');
    exit;
}

$cars = loadJSON(CARS_FILE);
$trips = loadAllTrips();

// Reichere Fahrten mit dynamisch berechneten Distanzen an
$trips = enrichTripsWithDistances($trips, $cars);

// Alle Fahrten für die Liste (nur "Ende"-Fahrten mit Distanz)
$allTrips = array_filter($trips, function($trip) {
    return $trip['type'] === 'end';
});

// Nach KM absteigend sortieren
usort($allTrips, function($a, $b) {
    return $b['km'] - $a['km'];
});

// Fahrten des aktuellen Benutzers filtern
$userTrips = array_filter($allTrips, function($trip) use ($currentUser) {
    return $trip['user_id'] == $currentUser['id'];
});
$userTrips = array_values($userTrips); // Re-index

// Benutzer-Fahrten nach Datum absteigend sortieren
usort($userTrips, function($a, $b) {
    $aTs = isset($a['timestamp']) ? strtotime($a['timestamp']) : 0;
    $bTs = isset($b['timestamp']) ? strtotime($b['timestamp']) : 0;
    return $bTs - $aTs;
});

// Fahrten pro Auto gruppieren (Zentrale Funktion)
$tripsByCar = buildTripsByCar($cars, $trips);

// Erstelle User-Map für JavaScript
$userMap = [];
foreach ($users as $user) {
    $userMap[$user['id']] = $user['name'];
}

// Erstelle Car-Map für JavaScript
$carMap = [];
foreach ($cars as $car) {
    $carMap[$car['id']] = $car['name'];
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title>DriveJournal - <?= htmlspecialchars($currentUser['name']) ?></title>
    <link rel="stylesheet" href="styles_v002.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <img class="header-logo" src="logo.png" alt="DriveJournal Logo">
            <button class="btn btn--appcontrol btn--small" id="btn-reload" onclick="location.href='drive.php?token=<?= htmlspecialchars($token, ENT_QUOTES) ?>'">Neuladen</button>
            <h1>Hallo <?= htmlspecialchars($currentUser['name']) ?>!</h1>
        </div>

        <!-- KM Eingabe -->
        <div class="km-input-section">
            <input id="km-input" class="input_text input_text--xl" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="Neuer Kilometerstand" aria-label="Kilometerstand">
            <!-- Start/Ende Buttons -->
            <div class="action-buttons">
                <button class="btn btn--secondary btn--normal" id="btn-start">Start</button>
                <button class="btn btn--primary btn--normal" id="btn-end">Ende</button>
            </div>
        </div>

        <!-- Gemeinsame Status-Anzeige (success | validation | error) -->
        <div class="status-message" id="status-message" tabindex="-1" role="status" aria-live="polite"></div>

        <!-- Auto Auswahl -->
        <?php if (!empty($cars)): ?>
        <div class="car-selection">
            <div class="car-grid" id="car-grid">
                <?php foreach ($cars as $car): ?>
                    <div class="car-item" data-car-id="<?= htmlspecialchars($car['id'], ENT_QUOTES) ?>" data-car-name="<?= htmlspecialchars($car['name'], ENT_QUOTES) ?>" data-current-km="<?= htmlspecialchars($car['current_km'], ENT_QUOTES) ?>" data-last-trip-id="<?= isset($car['last_trip_id']) ? htmlspecialchars($car['last_trip_id'], ENT_QUOTES) : '' ?>">
                        <?php if (!empty($car['image'])): ?>
                            <img src="<?= htmlspecialchars($car['image'], ENT_QUOTES) ?>" alt="<?= htmlspecialchars($car['name'], ENT_QUOTES) ?>">
                        <?php else: ?>
                            <div class="car-placeholder">🚗</div>
                        <?php endif; ?>
                        <div class="car-name"><?= htmlspecialchars($car['name'], ENT_QUOTES) ?></div>
                        <div class="car-km"><?= number_format($car['current_km'], 0, ',', '.') ?> km</div>
                        <?php if (isset($car['open_start_km'])): ?>
                            <div class="car-open-start">Offene Fahrt<br><?= number_format($car['open_start_km'], 0, ',', '.') ?> km</div>
                        <?php endif; ?>

                        <?php
                            // Wenn eine persistente Restreichweite vorhanden ist, zeige eine stilisierte Batterie
                            if (isset($car['remaining_range_value']) && $car['remaining_range_value'] !== null) {
                                $rr = (int)$car['remaining_range_value'];
                                if ($rr >= 100) { $filled = 4; $color = '#22C55E'; }
                                elseif ($rr >= 75) { $filled = 3; $color = '#FACC15'; }
                                elseif ($rr >= 50) { $filled = 2; $color = '#F97316'; }
                                elseif ($rr >= 25) { $filled = 1; $color = '#EF4444'; }
                                else { $filled = 0; $color = '#EF4444'; }
                                $icons = str_repeat('▮', $filled) . str_repeat('▯', 4 - $filled);
                                ?>
                                <div class="car-battery">
                                    <span class="battery-icons" style="color: <?= htmlspecialchars($color, ENT_QUOTES) ?>"><?= $icons ?></span>
                                    <span class="battery-km"><?= number_format($rr, 0, ',', '.') ?> km</span>
                                </div>
                            <?php }
                        ?>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php else: ?>
        <div class="empty">
            <p>Keine Autos vorhanden. Bitte im Admin-Bereich Autos anlegen.</p>
        </div>
        <?php endif; ?>

        <!-- Bestätigungsdialog mit Möglichkeit zur Korrektur der gefahrenen KM -->
        <div class="confirmation-section hidden" id="confirmation-dialog">
            <div class="confirmation-content">
                <div class="confirmation-info">
                    <h3 id="confirm-title">Fahrt bestätigen</h3>
                    <div class="confirmation-details">
                        <p><strong id="confirm-car-name"></strong></p>
                        <p><span id="confirm-distance-label">Gefahrene KM:</span> <strong id="confirm-distance"></strong></p>
                        <p class="confirm-last-entry small" id="confirm-last-entry"></p>
                    </div>
                    <div class="remaining-range-picker" id="remaining-range-picker">
                        <label class="small">Restreichweite (KM)</label>
                        <div class="range-btns">
                            <button type="button" class="btn range-btn btn--notselected" data-range="25">25</button>
                            <button type="button" class="btn range-btn btn--notselected" data-range="50">50</button>
                            <button type="button" class="btn range-btn btn--notselected" data-range="75">75</button>
                            <button type="button" class="btn range-btn btn--notselected" data-range="100">100</button>
                        </div>
                    </div>
                    <div class="confirmation-actions">
                        <button class="btn btn--primary btn--normal" id="btn-confirm-ok">OK</button>
                        <div class="confirmation-correction">
                            <label for="correction-km">Korrektur - Gefahrene KM:</label>
                            <input id="correction-km" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="Gefahrene KM">
                            <button class="btn btn--critical btn--normal" id="btn-confirm-correction">Korrektur</button>
                        </div>
                        <button class="btn btn--secondary btn--normal" id="btn-confirm-cancel">Abbrechen</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Status-Anzeige für Meldungen aus dem Bestätigungsdialog -->
        <div class="status-message" id="status-message-dialog" tabindex="-1" role="status" aria-live="polite"></div>
        <!-- KM und Kosten Box (direkt vor Summe der Fahrten) -->
        <div class="trips-history" id="km-cost-box">
            <h3>💶 Kosten</h3>
            <div class="km-cost-inner">
                <div class="cost-current">
                    <div class="current-month-name" id="current-month-name">Monat</div>
                    <div class="current-cost"><span id="cost-month">0,00</span>&nbsp;€</div>
                </div>
                <div class="cost-prev">
                    <div class="cost-row">
                        <div  id="prev1-name">Monat 1</div>
                        <div class="cost-value"><span id="cost-prev1">0,00</span>&nbsp;€</div>
                    </div>
                    <div class="cost-row">
                        <div  id="prev2-name">Monat 2</div>
                        <div class="cost-value"><span id="cost-prev2">0,00</span>&nbsp;€</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Summe deiner Fahrten (€) -->
        <div class="trips-history" id="cost-summary">
            <h3>📊 Summe deiner Fahrten (€)</h3>
            <table class="table-inline">
                <thead>
                    <tr>
                        <th class="col-left">Fahrzeug</th>
                        <th class="col-right">Diese Woche</th>
                        <th class="col-right">Dieser Monat</th>
                        <th class="col-right">Dieses Jahr</th>
                    </tr>
                </thead>
                <tbody id="cost-summary-body"></tbody>
                <tfoot>
                    <tr class="summary-total">
                        <td><strong>Gesamt</strong></td>
                        <td class="col-right"><strong id="cost-summary-week">0,00 €</strong></td>
                        <td class="col-right"><strong id="cost-summary-month">0,00 €</strong></td>
                        <td class="col-right"><strong id="cost-summary-year">0,00 €</strong></td>
                    </tr>
                </tfoot>
            </table>
        </div>        

        <!-- Summe deiner Fahrten (KM) -->
        <div class="trips-history" id="km-summary">
            <h3>📊 Summe deiner Fahrten (KM)</h3>
            <table class="table-inline">
                <thead>
                    <tr>
                        <th class="col-left">Fahrzeug</th>
                        <th class="col-right">Diese Woche</th>
                        <th class="col-right">Dieser Monat</th>
                        <th class="col-right">Dieses Jahr</th>
                    </tr>
                </thead>
                <tbody id="km-summary-body"></tbody>
                <tfoot>
                    <tr class="summary-total">
                        <td><strong>Gesamt</strong></td>
                        <td class="col-right"><strong id="km-summary-week">0</strong></td>
                        <td class="col-right"><strong id="km-summary-month">0</strong></td>
                        <td class="col-right"><strong id="km-summary-year">0</strong></td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Fahrtenliste des Benutzers -->
        <?php if (!empty($userTrips)): ?>
        <div class="trips-history">
            <h3>📋 Deine Fahrten</h3>
            <table class="table-inline">
                <thead>
                    <tr>
                        <th class="col-left">Datum</th>
                        <th class="col-left">Auto</th>
                        <th class="col-center">KM</th>
                        <th class="col-right">KM-Stand</th>
                    </tr>
                </thead>
                <tbody id="user-trips-body">
                    <!-- Wird von JavaScript gefüllt -->
                </tbody>
            </table>
            
            <div class="pagination" id="user-trips-pagination">
                <!-- Wird von JavaScript gefüllt -->
            </div>
        </div>
        <?php endif; ?>
        <?php render_trip_history_ui($tripsByCar, $cars, $users, $currentUser['id'], false); ?>
    </div>

    <?php render_app_data_script($users, $cars, $currentUser['id'], false, $userTrips, $tripsByCar); ?>
    <script src="statistics.js"></script>
    <script src="script.js"></script>
    <script src="trips.js"></script>
    <script>
    renderKmCostBox(carsData, carTripsData, userTripsData);
    renderSummaryTables(userId, carsData, carTripsData, ['week','month','year']);
    </script>
</body>
</html>

