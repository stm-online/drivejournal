<?php
// DriveJournal - Konfiguration
session_start();

// Pfade
define('DATA_DIR', __DIR__ . '/data/');
define('UPLOAD_DIR', __DIR__ . '/uploads/');

// JSON-Dateien
define('USERS_FILE', DATA_DIR . 'users.json');
define('CARS_FILE', DATA_DIR . 'cars.json');
define('TRIPS_FILE', DATA_DIR . 'trips.json');

// Initialisierung der Datenverzeichnisse
if (!file_exists(DATA_DIR)) {
    mkdir(DATA_DIR, 0777, true);
}

if (!file_exists(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0777, true);
}

// Hilfsfunktionen
function loadJSON($file) {
    if (!file_exists($file)) {
        file_put_contents($file, json_encode([]));
        return [];
    }
    $content = file_get_contents($file);
    return json_decode($content, true) ?: [];
}

function saveJSON($file, $data) {
    return file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function generateToken($length = 8) {
    return bin2hex(random_bytes($length));
}

// Admin-Passwort (ändern Sie dies!)
define('ADMIN_PASSWORD', 'admin123');

function checkAdmin() {
    return isset($_SESSION['admin']) && $_SESSION['admin'] === true;
}
