<?php
// Fehlerausgabe aktivieren (zum Debuggen auf dem Webspace – nach Diagnose wieder entfernen)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once 'config.php';
require_once 'functions.php';

// Cache-Header: Verhindere aggressive Browser-Caches (insbesondere bei iOS)
header('Cache-Control: no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// Login-Prüfung
// Hilfsfunktion: absolute URL zur aktuellen Seite
function selfUrl() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'];
    $script = $_SERVER['PHP_SELF'];
    return $scheme . '://' . $host . $script;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login'])) {
    if ($_POST['password'] === ADMIN_PASSWORD) {
        $_SESSION['admin'] = true;
        header('Location: ' . selfUrl());
        exit;
    } else {
        $_SESSION['admin_login_error'] = 'Falsches Passwort!';
        header('Location: ' . selfUrl());
        exit;
    }
}

// Logout
if (isset($_GET['logout'])) {
    unset($_SESSION['admin']);
    header('Location: ' . selfUrl());
    exit;
}

$error = $_SESSION['admin_login_error'] ?? null;
if ($error !== null) {
    unset($_SESSION['admin_login_error']);
}

// Nicht eingeloggt
if (!checkAdmin()) {
    ?>
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Login</title>
        <link rel="stylesheet" href="styles_v003.css">
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="logo.png" alt="DriveJournal Logo" class="header-logo">
                <h1>Admin-Bereich</h1>
            </div>
            <div class="login-form">
                <?php if (isset($error)): ?>
                    <div class="status-message status-message--error"><?= $error ?></div>
                <?php endif; ?>
                <form method="POST">
                    <input class="input_text input_text--lg" type="password" name="password" placeholder="Admin-Passwort" required autofocus>
                    <button type="submit" name="login" class="btn btn--primary btn--normal">Anmelden</button>
                </form>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// Admin ist eingeloggt
$users = loadJSON(USERS_FILE);
$cars = loadJSON(CARS_FILE);
$trips = loadAllTrips();

// Reichere Fahrten mit dynamisch berechneten Distanzen an
$trips = enrichTripsWithDistances($trips, $cars);

// Statistiken berechnen
$carStats = [];
foreach ($cars as $car) {
    $carStats[$car['id']] = [
        'car' => $car,
        'total_km' => 0,
        'trips' => []
    ];
}

foreach ($trips as $trip) {
    if ($trip['type'] === 'end' && isset($trip['distance'])) {
        if (isset($carStats[$trip['car_id']])) {
            $carStats[$trip['car_id']]['total_km'] += $trip['distance'];
            $carStats[$trip['car_id']]['trips'][] = $trip;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DriveJournal - Admin</title>
    <link rel="stylesheet" href="styles_v003.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="logo.png" alt="DriveJournal Logo" class="header-logo">
            <button class="btn btn--appcontrol btn--small" onclick="location.href='?logout'">Abmelden</button>
            <h1>Admin-Panel</h1>
        </div>

        <!-- Tab Navigation -->
        <div class="tabs">
            <button class="tab-button active" data-tab="cars">🚗 Autos</button>
            <button class="tab-button" data-tab="users">👥 Benutzer</button>
            <button class="tab-button" data-tab="stats">📊 Statistiken</button>
        </div>

        <!-- Autos Tab -->
        <div class="tab-panel active" id="tab-cars">            
            <div class="add-form">
                <h3>Neues Auto hinzufügen</h3>
                <form id="add-car-form" enctype="multipart/form-data">
                    <div class="form_grid">
                        <div class="form_row">
                            <div class="label">Name</div>
                            <input class="input_text input_text--lg" type="text" name="name" placeholder="Auto Name (z.B. VW Golf)" required>
                        </div>
                        <div class="form_row">
                            <div class="label">KM-Stand</div>
                            <input class="input_text input_text--lg" type="number" name="current_km" placeholder="Aktueller KM-Stand" required>
                        </div>
                        <div class="form_row">
                            <div class="label">Bild</div>
                            <input class="input_text input_text--lg" type="file" name="image" accept="image/*">
                        </div>
                        <div class="form_row">
                            <div class="label">€/km</div>
                            <input class="input_text input_text--lg" type="text" name="cost_per_km" placeholder="z.B. 1,99">
                        </div>
                        <div class="form_row">
                            <div class="label">€/Monat</div>
                            <input class="input_text input_text--lg" type="text" name="cost_per_month" placeholder="z.B. 19,99">
                        </div>
                        <div class="form_row">
                            <div class="label">Reichweite</div>
                            <label class="checkbox-label"><input type="checkbox" name="remaining_range" value="1"> Erfassung Restreichweite</label>
                        </div>
                        <div class="form_row">
                            <div class="label"></div>
                            <button type="submit" class="btn btn--primary btn--normal">Auto hinzufügen</button>
                        </div>
                    </div>
                </form>
            </div>

            <div class="item-list">
                <?php foreach ($cars as $car): ?>
                    <div class="admin-item" data-car-id="<?= $car['id'] ?>">
                        <?php if (!empty($car['image'])): ?>
                            <img id="car-img-<?= $car['id'] ?>" src="<?= htmlspecialchars($car['image']) ?>" alt="<?= htmlspecialchars($car['name']) ?>" >
                        <?php else: ?>
                            <div id="car-img-placeholder-<?= $car['id'] ?>" class="car-placeholder">🚗</div>
                        <?php endif; ?>

                        <div class="admin-info">
                            <div class="controls-top">
                                <button class="btn btn--primary btn--small" data-action="edit" data-car-id="<?= $car['id'] ?>" onclick="startCarEdit(<?= $car['id'] ?>)">✏️ Bearbeiten</button>
                                <button class="btn btn--secondary btn--small hidden" data-action="cancel" data-car-id="<?= $car['id'] ?>" onclick="cancelCarEdit(<?= $car['id'] ?>)">Abbruch</button>
                                <button class="btn btn--primary btn--small hidden" data-action="save" data-car-id="<?= $car['id'] ?>" disabled title="Speichern" onclick="saveCarEdit(<?= $car['id'] ?>)">💾 speichern</button>
                                <button class="btn btn--critical btn--small" onclick="deleteCar(<?= $car['id'] ?>)">🗑️ löschen</button>
                            </div>

                            <div class="form_grid">
                                <div class="form_row">
                                    <div>Name</div>
                                    <input class="input_text input_text--bold" id="car-name-input-<?= $car['id'] ?>"  value="<?= htmlspecialchars($car['name'], ENT_QUOTES) ?>" disabled>
                                </div>

                                <div class="form_row">
                                    <div>KM-Stand</div>
                                    <input class="input_text" value="<?= number_format((float)($car['current_km'] ?? 0), 0, ',', '.') ?>" disabled>
                                </div>
                                <?php if (isset($car['open_start_km'])): ?>
                                <div class="form_row">
                                    <div>Offene Fahrt</div>
                                    <input class="input_text" value="<?= number_format($car['open_start_km'], 0, ',', '.') ?>" disabled>
                                </div>
                                <?php endif; ?>
                                <div class="form_row">
                                    <div>Bild</div>
                                    <input class="input_text" id="car-image-input-<?= $car['id'] ?>" value="<?= htmlspecialchars($car['image'] ?? '', ENT_QUOTES) ?>" disabled>
                                </div>
                                <div class="form_row">
                                    <div>€/km</div>
                                    <?php $costKm = isset($car['cost_per_km']) && $car['cost_per_km'] !== '' ? number_format((float)$car['cost_per_km'], 2, ',', '') : ''; ?>
                                    <input class="input_text" id="car-cost-km-input-<?= $car['id'] ?>" value="<?= htmlspecialchars($costKm, ENT_QUOTES) ?>" disabled>
                                </div>
                                <div class="form_row">
                                    <div>€/Monat</div>
                                    <?php $costMonth = isset($car['cost_per_month']) && $car['cost_per_month'] !== '' ? number_format((float)$car['cost_per_month'], 2, ',', '') : ''; ?>
                                    <input class="input_text" id="car-cost-month-input-<?= $car['id'] ?>" value="<?= htmlspecialchars($costMonth, ENT_QUOTES) ?>" disabled>
                                </div>
                                <div class="form_row">
                                    <div>Reichweite</div>
                                    <?php $remaining = !empty($car['remaining_range']); ?>
                                    <label><input type="checkbox" id="car-remaining-range-input-<?= $car['id'] ?>" value="1" <?= $remaining ? 'checked' : '' ?> disabled> Erfassung Restreichweite</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="status-message" id="car-status-<?= $car['id'] ?>"></div>
                <?php endforeach; ?>
            </div>

        </div>

        <!-- Benutzer Tab -->
        <div class="tab-panel" id="tab-users">
            <div class="add-form">
                <h3>Neuen Benutzer hinzufügen</h3>
                <form id="add-user-form">
                    <div class="form_grid">
                        <div class="form_row">
                            <div class="label">Name</div>
                            <input class="input_text input_text--lg" type="text" name="name" placeholder="Name (z.B. Papa, Mama)" required>
                        </div>
                        <div class="form_row">
                            <div class="label">E-Mail</div>
                            <input class="input_text input_text--lg" type="email" name="email" placeholder="E-Mail (optional)">
                        </div>
                        <div class="form_row">
                            <div class="label"></div>
                            <button type="submit" class="btn btn--primary btn--normal">Benutzer hinzufügen</button>
                          
                        </div>
                    </div>
                </form>
            </div>

            <div class="item-list">
                <?php foreach ($users as $user): ?>
                    <div class="admin-item">
                        <div class="admin-info">
                            <div>
                                <div class="controls-top">
                                    <button class="btn btn--primary btn--small" data-action="edit" data-user-id="<?= $user['id'] ?>" onclick="startInlineEdit(<?= $user['id'] ?>)">✏️ editieren</button>
                                    <button class="btn btn--secondary btn--small hidden" data-action="cancel" data-user-id="<?= $user['id'] ?>" onclick="cancelInlineEdit(<?= $user['id'] ?>)">✏️ Abbruch</button>
                                    <button class="btn btn--primary btn--small hidden" data-action="save" data-user-id="<?= $user['id'] ?>" disabled title="Speichern" onclick="saveInlineEdit(<?= $user['id'] ?>)">💾 speichern</button>
                                    <button class="btn btn--critical btn--small" onclick="deleteUser(<?= $user['id'] ?>)">🗑️ löschen</button>
                                </div>

                                <?php 
                                $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
                                $host = $_SERVER['HTTP_HOST'];
                                $path = dirname($_SERVER['PHP_SELF']);
                                $baseUrl = $protocol . '://' . $host . rtrim($path, '/') . '/drive.php?token=' . $user['token'];
                                ?>

                                <div class="form_grid">
                                    <div class="form_row">
                                        <div>Name</div>
                                        <input class="input_text input_text--bold" id="user-name-input-<?= $user['id'] ?>" value="<?= htmlspecialchars($user['name'], ENT_QUOTES) ?>" enterkeyhint="done" autocomplete="off" inputmode="text" disabled>
                                    </div>

                                    <div class="form_row">
                                        <div>E-Mail</div>
                                        <?php $emailVal = $user['email'] ?? ''; ?>
                                        <input class="input_text" id="user-email-input-<?= $user['id'] ?>" value="<?= htmlspecialchars($emailVal, ENT_QUOTES) ?>" type="email" placeholder="E-Mail (optional)" disabled>
                                    </div>

                                    <div class="form_row">
                                        <div>Link</div>
                                        <input class="input_text" id="user-link-<?= $user['id'] ?>" value="<?= htmlspecialchars($baseUrl, ENT_QUOTES) ?>" disabled>
                                        <div class="link-actions">
                                            <button class="btn btn--secondary btn--small" data-link="<?= htmlspecialchars($baseUrl, ENT_QUOTES) ?>" onclick="copyLink(this)">📋 kopieren</button>
                                            <button class="btn btn--secondary btn--small" data-link="<?= htmlspecialchars($baseUrl, ENT_QUOTES) ?>" onclick="openLink(this)">🔗 öffnen</button>
                                            <button class="btn btn--critical btn--small" data-link="<?= htmlspecialchars($baseUrl, ENT_QUOTES) ?>" onclick="regenerateToken(<?= $user['id'] ?>)">⭮ neuer Link</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Statistiken Tab -->
        <div class="tab-panel" id="tab-stats">
            <div class="trips-history" id="user-cost-summary-admin">
                <h3>💶 Kosten je Nutzer</h3>
                <table class="table-inline">
                    <thead>
                        <tr>
                            <th class="col-left">Benutzer</th>
                            <th class="col-right" id="user-cost-month-label-1">Monat 1</th>
                            <th class="col-right" id="user-cost-month-label-2">Monat 2</th>
                            <th class="col-right" id="user-cost-month-label-3">Monat 3</th>
                            <th class="col-right" id="user-cost-year-label">Jahr</th>
                        </tr>
                    </thead>
                    <tbody id="user-cost-summary-body"></tbody>
                    <tfoot>
                        <tr class="summary-total">
                            <td><strong>Gesamt</strong></td>
                            <td class="col-right"><strong id="user-cost-total-prev3">0,00 €</strong></td>
                            <td class="col-right"><strong id="user-cost-total-prev2">0,00 €</strong></td>
                            <td class="col-right"><strong id="user-cost-total-prev1">0,00 €</strong></td>
                            <td class="col-right"><strong id="user-cost-total-year">0,00 €</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <?php
            $tripsByCar = buildTripsByCar($cars, $trips);
            if (empty($tripsByCar)) {
                echo '<p class="empty">Keine Autos vorhanden.</p>';
            } else {
                render_trip_history_ui($tripsByCar, $cars, $users, null, true);
            }
            ?>
        </div>
    </div>

    <?php 
        $tripsByCar = buildTripsByCar($cars, $trips);
        render_app_data_script($users, $cars, null, true, [], $tripsByCar); 
    ?>
    <script src="admin.js"></script>
    <script src="script.js"></script>
    <script src="trips.js"></script>
    <script src="statistics.js"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof renderAdminUserCostSummary === 'function') {
            renderAdminUserCostSummary(carsData, carTripsData, userMap);
        }
    });
    </script>
</body>
</html>
