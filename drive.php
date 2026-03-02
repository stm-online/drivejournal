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
    <link rel="stylesheet" href="styles.css?v=<?php echo filemtime(__DIR__ . '/styles.css'); ?>">
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
            <input id="km-input" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="Neuer Kilometerstand" aria-label="Kilometerstand">
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
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php else: ?>
        <div class="no-cars">
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

        <!-- Summe der Fahrten -->
        <div class="trips-history">
            <h3>Summe deiner Fahrten (KM)</h3>
            <?php
            // Berechne Distanzen pro Fahrzeug und Zeitraum (diese Woche, diesen Monat, dieses Jahr)
            $now = time();
            // Wochenbeginn (Montag)
            $weekStart = strtotime('-' . (date('N', $now) - 1) . ' days', strtotime('today'));
            $monthStart = strtotime(date('Y-m-01', $now));
            $yearStart = strtotime(date('Y-01-01', $now));

            // Initialisierung
            $perCar = []; // car_id => ['name'=>..., 'week'=>0,'month'=>0,'year'=>0]
            $totals = ['week' => 0, 'month' => 0, 'year' => 0];

            foreach ($trips as $t) {
                if (($t['user_id'] ?? null) != $currentUser['id']) continue;
                if (($t['type'] ?? '') !== 'end') continue;
                $ts = isset($t['timestamp']) ? strtotime($t['timestamp']) : 0;
                $dist = isset($t['distance']) && is_numeric($t['distance']) ? (float)$t['distance'] : null;
                if ($dist === null) continue;
                $cid = $t['car_id'];
                if (!isset($perCar[$cid])) {
                    $perCar[$cid] = ['name' => ($carMap[$cid] ?? 'Unbekannt'), 'week' => 0.0, 'month' => 0.0, 'year' => 0.0];
                }
                if ($ts >= $weekStart) {
                    $perCar[$cid]['week'] += $dist;
                    $totals['week'] += $dist;
                }
                if ($ts >= $monthStart) {
                    $perCar[$cid]['month'] += $dist;
                    $totals['month'] += $dist;
                }
                if ($ts >= $yearStart) {
                    $perCar[$cid]['year'] += $dist;
                    $totals['year'] += $dist;
                }
            }

            // Sortiere Fahrzeuge nach Name
            uasort($perCar, function($a, $b){ return strcmp($a['name'], $b['name']); });
            ?>

            <table class="trips-table">
                <thead>
                    <tr>
                        <th class="text-left">Fahrzeug</th>
                        <th class="text-center">Diese Woche</th>
                        <th class="text-center">Dieser Monat</th>
                        <th class="text-center">Dieses Jahr</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="summary-total">
                        <td><strong>Gesamt</strong></td>
                        <td class="text-center"><strong><?= number_format($totals['week'],0,',','.') ?></strong></td>
                        <td class="text-center"><strong><?= number_format($totals['month'],0,',','.') ?></strong></td>
                        <td class="text-center"><strong><?= number_format($totals['year'],0,',','.') ?></strong></td>
                    </tr>
                    <?php foreach ($perCar as $cid => $row): ?>
                    <tr>
                        <td><?= htmlspecialchars($row['name']) ?></td>
                        <td class="text-center"><?= number_format($row['week'],0,',','.') ?></td>
                        <td class="text-center"><?= number_format($row['month'],0,',','.') ?></td>
                        <td class="text-center"><?= number_format($row['year'],0,',','.') ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- Fahrtenliste des Benutzers -->
        <?php if (!empty($userTrips)): ?>
        <div class="trips-history">
            <h3>📋 Deine Fahrten</h3>
            <table class="trips-table">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Auto</th>
                        <th>KM</th>
                        <th>KM-Stand</th>
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
    <script src="script.js"></script>
    <script src="trips.js"></script>
</body>
</html>

