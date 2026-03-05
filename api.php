<?php
require_once 'config.php';
require_once 'functions.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

// Fahrt speichern
if ($action === 'save_trip') {
    $userId = (int)$_POST['user_id'];
    $carId = (int)$_POST['car_id'];
    $km = (float)$_POST['km'];
    $type = $_POST['type']; // 'start' oder 'end'
    $clientLastId = isset($_POST['last_trip_id']) && is_numeric($_POST['last_trip_id']) ? (int)$_POST['last_trip_id'] : null;
    
    $cars = loadJSON(CARS_FILE);

    // locate the car in the cars array once (reuse index for reads/writes)
    $carIndex = null;
    foreach ($cars as $i => $cc) {
        if (($cc['id'] ?? null) == $carId) { $carIndex = $i; break; }
    }

    // Open and lock the trips file for this car immediately so we can
    // perform an authoritative last-trip-id check before any further
    // validation. This prevents TOCTOU races where an unlocked read
    // would be stale.
    $tripsFile = getTripsFileForCar($carId);
    if (!file_exists($tripsFile)) file_put_contents($tripsFile, json_encode([]));
    $fp = fopen($tripsFile, 'c+');
    if (!$fp) {
        echo json_encode(['success' => false, 'message' => 'Fehler beim Zugriff auf die Trip-Datei.']);
        exit;
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        echo json_encode(['success' => false, 'message' => 'Fehler beim Sperren der Trip-Datei.']);
        exit;
    }
    // Read existing trips under lock
    rewind($fp);
    $contents = stream_get_contents($fp);
    $existingTrips = json_decode($contents, true) ?: [];

    // determine multiple aggregates in one pass to avoid repeated loops
    $currentLastIdFromPrev = null;
    $maxTripKm = null;
    $foundStart = null;
    $bestKm = null;
    $lastEntryId = null;
    foreach ($existingTrips as $pt) {
        if (isset($pt['id']) && is_numeric($pt['id'])) {
            $tid = (int)$pt['id'];
            if ($currentLastIdFromPrev === null || $tid > $currentLastIdFromPrev) $currentLastIdFromPrev = $tid;
            if ($lastEntryId === null || $tid > $lastEntryId) $lastEntryId = $tid;
        }
        if (isset($pt['km']) && is_numeric($pt['km'])) {
            $ptKm = (float)$pt['km'];
            if ($maxTripKm === null || $ptKm > $maxTripKm) $maxTripKm = $ptKm;
            if ((($pt['type'] ?? '') === 'end') && $ptKm < $km && ($bestKm === null || $ptKm > $bestKm)) {
                $bestKm = $ptKm;
            }
        }
        if ((($pt['type'] ?? '') === 'start') && (($pt['user_id'] ?? null) == $userId)) {
            if ($foundStart === null || ($pt['id'] ?? 0) > ($foundStart['id'] ?? 0)) {
                $foundStart = $pt;
            }
        }
    }
    // If client provided a last_trip_id, validate immediately against the locked file
    if ($clientLastId !== null && $currentLastIdFromPrev !== null && $clientLastId !== $currentLastIdFromPrev) {
        // release lock and respond with conflict
        flock($fp, LOCK_UN);
        fclose($fp);
        echo json_encode([
            'success' => false,
            'message' => 'Paralleler Zugriff auf die Trip-Datei. Bitte Daten erneut erfassen.',
            'client_last_trip_id' => $clientLastId,
            'server_last_trip_id' => $currentLastIdFromPrev
        ]);
        exit;
    }

    $newTrip = [
        // id will be assigned atomically while holding file lock
        'id' => null,
        'user_id' => $userId,
        'car_id' => $carId,
        'km' => $km,
        'type' => $type,
        'timestamp' => date('Y-m-d H:i:s')
    ];

        // (locked) prevTrips are already available and clientLastId was
        // validated earlier.

    // Wenn Client signalisiert, dass es sich um das Füllen einer Lücke handelt,
    // speichere dies im Trip (ist später in trips_<car>.json sichtbar).
    if (isset($_POST['is_gap']) && $_POST['is_gap'] == '1') {
        // Do not mark stored trip as an artificial gap; instead mark as gap_filled
        $newTrip['gap_filled'] = true;
        // Markiere Start-Quelle, falls später auswertbar
        $newTrip['start_source'] = 'gap-filling';
    }
    
    // Bei "Ende": Speichere auch den Start-KM oder Verweise auf vorherigen Eintrag
    if ($type === 'end') {
        // Ermittle initialen KM-Stand des Fahrzeugs aus cars.json (initial_km oder fallback current_km)
        $initialKm = 0;
        if ($carIndex !== null) {
            $cinfo = $cars[$carIndex];
            if (isset($cinfo['initial_km'])) $initialKm = (float)$cinfo['initial_km'];
            elseif (isset($cinfo['current_km'])) $initialKm = (float)$cinfo['current_km'];
        }



        // current car km computed from aggregated $maxTripKm
        $currentCarKm = $maxTripKm !== null ? max($maxTripKm, $initialKm) : $initialKm;



        // 1) Wenn Start-KM vom Client mitgegeben wurde (Korrektur), benutze diese
        if (isset($_POST['start_km']) && is_numeric($_POST['start_km'])) {
            $newTrip['start_km'] = (float)$_POST['start_km'];
            $newTrip['start_source'] = 'correction';
        } else {
            $resolved = false;

            if ($foundStart) {
                // Wenn der gefundene Start-Trip selbst KM enthält, verwende diese
                if (isset($foundStart['km']) && is_numeric($foundStart['km'])) {
                    $newTrip['start_km'] = (float)$foundStart['km'];
                    $newTrip['start_trip_id'] = $foundStart['id'];
                    $newTrip['start_source'] = 'start-button';
                    $resolved = true;
                }
            }

            // 3) Wenn noch nicht aufgelöst: prüfe cars.json open_start_km
            if (!$resolved && $carIndex !== null) {
                $c = $cars[$carIndex];
                if (isset($c['open_start_km'])) {
                    if (!isset($c['open_start_user']) || $c['open_start_user'] == $userId) {
                        $newTrip['start_km'] = (float)$c['open_start_km'];
                        $newTrip['start_source'] = 'open-start';
                        $resolved = true;
                    }
                }
            }

            // 4) Wenn immer noch nicht aufgelöst: berechne größten vorherigen End-KM < eingegebenem KM
            if (!$resolved) {
                if ($bestKm !== null) {
                    $newTrip['start_km'] = $bestKm;
                    if (isset($_POST['user_selected']) && $_POST['user_selected'] == '1') {
                        $newTrip['start_source'] = 'user_selected';
                    } else {
                        $newTrip['start_source'] = 'history-guess';
                    }
                    $resolved = true;
                }
            }

            // 5) Fallback: verwende aktuellen KM-Stand des Autos
            if (!$resolved) {
                $newTrip['start_km'] = $currentCarKm;
                $newTrip['start_source'] = 'fallback-current';
            }

            // Speichere zusätzlich die ID des letzten Eintrags in trips_<car>.json
            if ($lastEntryId !== null) $newTrip['linked_trip_id'] = $lastEntryId;
        }
    }
    
    // Zusätzliche Validierung: Ende-KM darf ni cht kleiner/gleich dem aktuellen Fahrzeugstand sein
    // Hinweis: Beim Füllen einer Lücke (Client übergibt 'is_gap'='1') soll diese Prüfung nicht greifen.
    if ($type === 'end') {
        if (!(isset($_POST['is_gap']) && $_POST['is_gap'] == '1')) {
            if ($km <= $currentCarKm) {
                echo json_encode([
                    'success' => false,
                    'message' => 'End-KM muss größer sein als aktueller KM-Stand (' . number_format($currentCarKm,0,',','.') . ' km)'
                ]);
                exit;
            }
        }
    }
    
    // Speichere Trip
    // Wenn es eine Start-Fahrt ist: persistiere die offene Fahrt im cars.json
    if ($type === 'start') {
        // Ermittle aktuellen KM-Stand des Fahrzeugs (aus trips oder cars.json)
        $initialKm = 0;
        if ($carIndex !== null) {
            $cinfo = $cars[$carIndex];
            if (isset($cinfo['initial_km'])) $initialKm = (float)$cinfo['initial_km'];
            elseif (isset($cinfo['current_km'])) $initialKm = (float)$cinfo['current_km'];
        }
        // Use aggregated $maxTripKm computed above
        $currentCarKm = $maxTripKm !== null ? max($maxTripKm, $initialKm) : $initialKm;

        // Validierung: Start-KM muss größer als aktueller Stand sein
        if ($km <= $currentCarKm) {
            echo json_encode([
                'success' => false,
                'message' => 'Start-KM muss größer sein als aktueller KM-Stand (' . number_format($currentCarKm,0,',','.') . ' km)'
            ]);
            exit;
        }

        // Do not persist the start trip in trips_<car>.json; keep the open_start in cars.json instead
        if (isset($newTrip['km'])) unset($newTrip['km']);
        $newTrip['start_source'] = 'start-button';

        // open start im cars.json speichern (nur eine offene Fahrt pro Auto)
        if ($carIndex !== null) {
            $cars[$carIndex]['open_start_km'] = $km;
            $cars[$carIndex]['open_start_user'] = $userId;
            $cars[$carIndex]['open_start_ts'] = $newTrip['timestamp'];
            // remaining_range_value: if provided, set or clear persistent remaining range value for this car
            if (isset($_POST['remaining_range_value'])) {
                $rr = $_POST['remaining_range_value'];
                if ($rr === '' || $rr === '0') {
                    if (isset($cars[$carIndex]['remaining_range_value'])) unset($cars[$carIndex]['remaining_range_value']);
                } else {
                    if (is_numeric($rr)) {
                        $cars[$carIndex]['remaining_range_value'] = (int)$rr;
                    } else {
                        $cars[$carIndex]['remaining_range_value'] = $rr;
                    }
                }
            }
        }
        saveJSON(CARS_FILE, $cars);
        echo json_encode([
            'success' => true,
            'message' => 'Start-Fahrt erfasst.'
        ]);
        exit;
    }

    // Allgemeines Speichern für Ende und andere Typen
    // We already opened and locked the trips file above and populated
    // $existingTrips. Use that locked view to perform the append atomically.

    // reuse previously computed last id from the locked snapshot
    $currentLastId = $currentLastIdFromPrev;

    // Note: client last-trip validation already performed earlier under lock.
    // No additional re-check here to avoid duplicate responses.

    // Assign a new id (max existing id + 1)
    $newId = ($currentLastId !== null) ? $currentLastId + 1 : 1;
    $newTrip['id'] = $newId;

    // Append and write back under the same lock
    $existingTrips[] = $newTrip;
    usort($existingTrips, function($a, $b) { return ($a['id'] ?? 0) - ($b['id'] ?? 0); });

    // Truncate and write
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($existingTrips, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    // release lock and close
    flock($fp, LOCK_UN);
    fclose($fp);

    // Bei Ende: entferne offene Start-Felder und aktualisiere current_km im cars.json
    if ($type === 'end') {
        if ($carIndex !== null) {
            if (isset($cars[$carIndex]['open_start_km'])) unset($cars[$carIndex]['open_start_km']);
            if (isset($cars[$carIndex]['open_start_user'])) unset($cars[$carIndex]['open_start_user']);
            if (isset($cars[$carIndex]['open_start_ts'])) unset($cars[$carIndex]['open_start_ts']);

            $existing = isset($cars[$carIndex]['current_km']) ? (float)$cars[$carIndex]['current_km'] : (isset($cars[$carIndex]['initial_km']) ? (float)$cars[$carIndex]['initial_km'] : 0);
            $cars[$carIndex]['current_km'] = max($existing, $km);
            // remaining_range_value: if provided, set or clear persistent remaining range value for this car
            if (isset($_POST['remaining_range_value'])) {
                $rr = $_POST['remaining_range_value'];
                if ($rr === '' || $rr === '0') {
                    if (isset($cars[$carIndex]['remaining_range_value'])) unset($cars[$carIndex]['remaining_range_value']);
                } else {
                    // store normalized integer value if numeric
                    if (is_numeric($rr)) {
                        $cars[$carIndex]['remaining_range_value'] = (int)$rr;
                    } else {
                        $cars[$carIndex]['remaining_range_value'] = $rr;
                    }
                }
            }
        }
        saveJSON(CARS_FILE, $cars);
    }
    
    // Berechne Distanz dynamisch für die Antwort
    $allTrips = loadAllTrips();
    $enrichedTrip = enrichTripWithDistance($newTrip, $allTrips, $cars);
    $distance = $enrichedTrip['distance'] ?? null;
    
    echo json_encode([
        'success' => true,
        'trip' => $enrichedTrip,
        'message' => $type === 'start' ? 'Fahrt gestartet!' : 'Fahrt beendet!' . ($distance ? ' Gefahren: ' . number_format($distance, 0, ',', '.') . ' km' : ''),
        'client_last_trip_id' => $clientLastId,
        'server_last_trip_id' => $newId
    ]);
    exit;
}

// Auto hinzufügen
if ($action === 'add_car') {
    $name = $_POST['name'] ?? '';
    $currentKm = (float)($_POST['current_km'] ?? 0);
    // optional cost fields (may be passed as "1.99" or "1,99")
    $rawCostKm = isset($_POST['cost_per_km']) ? trim((string)$_POST['cost_per_km']) : '';
    $rawCostMonth = isset($_POST['cost_per_month']) ? trim((string)$_POST['cost_per_month']) : '';
    
    $cars = loadJSON(CARS_FILE);
    
    $maxId = 0;
    foreach ($cars as $car) {
        if ($car['id'] > $maxId) {
            $maxId = $car['id'];
        }
    }
    $newId = $maxId + 1;
    
    $imagePath = '';
    
    // Bild-Upload
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $extension = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
        $filename = 'car_' . $newId . '_' . time() . '.' . $extension;
        $uploadPath = UPLOAD_DIR . $filename;
        
        if (move_uploaded_file($_FILES['image']['tmp_name'], $uploadPath)) {
            $imagePath = 'uploads/' . $filename;
        }
    }

    // Wenn kein Bild hochgeladen wurde: rotierendes Fallback-Bild verwenden (img/car_1.png..img/car_6.png)
    if (empty($imagePath)) {
        $countExisting = count($cars);
        $idx = ($countExisting % 6) + 1; // 1..6
        $imagePath = 'img/car_' . $idx . '.png';
    }
    
    $newCar = [
        'id' => $newId,
        'name' => $name,
        // store initial km and set current_km to the same value on creation
        'initial_km' => $currentKm,
        'current_km' => $currentKm,
        'image' => $imagePath
    ];
    // store optional costs if provided and numeric
    if ($rawCostKm !== '') {
        $costKm = str_replace(',', '.', $rawCostKm);
        if (is_numeric($costKm)) {
            $newCar['cost_per_km'] = (float)$costKm;
        }
    }
    if ($rawCostMonth !== '') {
        $costMonth = str_replace(',', '.', $rawCostMonth);
        if (is_numeric($costMonth)) {
            $newCar['cost_per_month'] = (float)$costMonth;
        }
    }
    // remaining_range (checkbox) - treat presence/1 as true, otherwise false
    $remaining = false;
    if (isset($_POST['remaining_range'])) {
        $val = $_POST['remaining_range'];
        if ($val === '1' || $val === 'true' || $val === 'on' || $val === 1) $remaining = true;
    }
    if ($remaining) {
        $newCar['remaining_range'] = true;
    }
    
    $cars[] = $newCar;
    saveJSON(CARS_FILE, $cars);

    // Erzeuge initialen Trip-Eintrag in trips_<carId>.json
    $initialTrip = [
        'id' => generateTripId(),
        'user_id' => null,
        'car_id' => $newId,
        'km' => $currentKm,
        'type' => 'end',
        'timestamp' => date('Y-m-d H:i:s'),
        'start_source' => 'initial',
        // markiere diesen Eintrag für die Anzeige als initial
        'is_initial' => true
    ];
    // Speichere initialen Trip
    saveTrip($initialTrip);
    
    echo json_encode([
        'success' => true,
        'car' => $newCar,
        'message' => 'Auto erfolgreich hinzugefügt!'
    ]);
    exit;
}

// Auto löschen
if ($action === 'delete_car') {
    $carId = (int)$_POST['car_id'];
    $cars = loadJSON(CARS_FILE);
    
    $filtered = array_filter($cars, function($car) use ($carId) {
        return $car['id'] !== $carId;
    });
    
    saveJSON(CARS_FILE, array_values($filtered));
    
    echo json_encode([
        'success' => true,
        'message' => 'Auto gelöscht!'
    ]);
    exit;
}

// Auto bearbeiten (nur Name aktuell)
if ($action === 'edit_car') {
    $carId = (int)($_POST['car_id'] ?? 0);
    $name = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
    // optional cost fields (may be sent as dot or comma decimal)
    $rawCostKm = isset($_POST['cost_per_km']) ? trim((string)$_POST['cost_per_km']) : null;
    $rawCostMonth = isset($_POST['cost_per_month']) ? trim((string)$_POST['cost_per_month']) : null;

    if ($carId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Ungültige Auto-ID']);
        exit;
    }
    if ($name === '') {
        echo json_encode(['success' => false, 'message' => 'Name darf nicht leer sein']);
        exit;
    }

    $cars = loadJSON(CARS_FILE);
    $found = false;
    foreach ($cars as $i => $c) {
        if (($c['id'] ?? 0) == $carId) {
            $cars[$i]['name'] = $name;
            // update optional costs if provided
            if ($rawCostKm !== null) {
                $val = $rawCostKm === '' ? null : str_replace(',', '.', $rawCostKm);
                if ($val === null || $val === '') {
                    if (isset($cars[$i]['cost_per_km'])) unset($cars[$i]['cost_per_km']);
                } elseif (is_numeric($val)) {
                    $cars[$i]['cost_per_km'] = (float)$val;
                }
            }
            if ($rawCostMonth !== null) {
                $val = $rawCostMonth === '' ? null : str_replace(',', '.', $rawCostMonth);
                if ($val === null || $val === '') {
                    if (isset($cars[$i]['cost_per_month'])) unset($cars[$i]['cost_per_month']);
                } elseif (is_numeric($val)) {
                    $cars[$i]['cost_per_month'] = (float)$val;
                }
            }
            // remaining_range handling: if provided in POST, set or unset accordingly
            $rawRemaining = isset($_POST['remaining_range']) ? $_POST['remaining_range'] : null;
            if ($rawRemaining !== null) {
                if ($rawRemaining === '1' || $rawRemaining === 'true' || $rawRemaining === 'on' || $rawRemaining === 1) {
                    $cars[$i]['remaining_range'] = true;
                } else {
                    if (isset($cars[$i]['remaining_range'])) unset($cars[$i]['remaining_range']);
                }
            }
            $found = true;
            $updatedCar = $cars[$i];
            break;
        }
    }
    if (!$found) {
        echo json_encode(['success' => false, 'message' => 'Auto nicht gefunden']);
        exit;
    }
    saveJSON(CARS_FILE, $cars);
    echo json_encode(['success' => true, 'car' => $updatedCar, 'message' => 'Auto aktualisiert']);
    exit;
}

// Benutzer hinzufügen
if ($action === 'add_user') {
    $name = $_POST['name'] ?? '';
    $email = isset($_POST['email']) ? trim((string)$_POST['email']) : '';
    $users = loadJSON(USERS_FILE);
    
    $maxId = 0;
    foreach ($users as $user) {
        if ($user['id'] > $maxId) {
            $maxId = $user['id'];
        }
    }
    $newId = $maxId + 1;
    
    $newUser = [
        'id' => $newId,
        'name' => $name,
        'token' => generateToken(),
        'email' => $email
    ];
    
    $users[] = $newUser;
    saveJSON(USERS_FILE, $users);
    
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $path = dirname($_SERVER['PHP_SELF']);
    $userLink = $protocol . '://' . $host . rtrim($path, '/') . '/drive.php?token=' . $newUser['token'];
    
    echo json_encode([
        'success' => true,
        'user' => $newUser,
        'link' => $userLink,
        'message' => 'Benutzer erfolgreich hinzugefügt!'
    ]);
    exit;
}

// Benutzer löschen
if ($action === 'delete_user') {
    $userId = (int)$_POST['user_id'];
    $users = loadJSON(USERS_FILE);
    
    $filtered = array_filter($users, function($user) use ($userId) {
        return $user['id'] !== $userId;
    });
    
    saveJSON(USERS_FILE, array_values($filtered));
    
    echo json_encode([
        'success' => true,
        'message' => 'Benutzer gelöscht!'
    ]);
    exit;
}

// Benutzer bearbeiten
if ($action === 'edit_user') {
    $userId = (int)($_POST['user_id'] ?? 0);
    $name = isset($_POST['name']) ? trim((string)$_POST['name'] ) : '';
    $email = isset($_POST['email']) ? trim((string)$_POST['email']) : null;

    if ($userId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Ungültige Benutzer-ID']);
        exit;
    }
    if ($name === '') {
        echo json_encode(['success' => false, 'message' => 'Name darf nicht leer sein']);
        exit;
    }

    $users = loadJSON(USERS_FILE);
    $found = false;
    foreach ($users as $i => $u) {
        if (($u['id'] ?? 0) == $userId) {
            $users[$i]['name'] = $name;
            if ($email !== null) {
                $users[$i]['email'] = $email;
            }
            $found = true;
            $updatedUser = $users[$i];
            break;
        }
    }

    if (!$found) {
        echo json_encode(['success' => false, 'message' => 'Benutzer nicht gefunden']);
        exit;
    }

    saveJSON(USERS_FILE, $users);

    echo json_encode(['success' => true, 'user' => $updatedUser, 'message' => 'Benutzer erfolgreich aktualisiert']);
    exit;
}

// Token neu generieren
if ($action === 'regenerate_token') {
    $userId = (int)($_POST['user_id'] ?? 0);
    if ($userId <= 0) {
        echo json_encode(['success' => false, 'message' => 'Ungültige Benutzer-ID']);
        exit;
    }
    $users = loadJSON(USERS_FILE);
    $found = false;
    foreach ($users as $i => $u) {
        if (($u['id'] ?? 0) == $userId) {
            $users[$i]['token'] = generateToken();
            $found = true;
            $updatedUser = $users[$i];
            break;
        }
    }
    if (!$found) {
        echo json_encode(['success' => false, 'message' => 'Benutzer nicht gefunden']);
        exit;
    }
    saveJSON(USERS_FILE, $users);

    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $path = dirname($_SERVER['PHP_SELF']);
    $userLink = $protocol . '://' . $host . rtrim($path, '/') . '/drive.php?token=' . $updatedUser['token'];

    echo json_encode(['success' => true, 'user' => $updatedUser, 'link' => $userLink, 'message' => 'Token neu generiert']);
    exit;
}

// Auto basierend auf KM-Stand finden
if ($action === 'find_nearest_car') {
    $km = (float)($_GET['km'] ?? 0);
    $cars = loadJSON(CARS_FILE);

    $nearestCar = null;
    $minDiff = PHP_FLOAT_MAX;

    // For each car determine the effective current km derived from trips or initial_km
    foreach ($cars as $car) {
        $initialKm = isset($car['initial_km']) ? (float)$car['initial_km'] : (isset($car['current_km']) ? (float)$car['current_km'] : 0);
        $prevTrips = loadTripsForCar($car['id']);
        $maxTripKm = null;
        foreach ($prevTrips as $pt) {
            if (isset($pt['km']) && is_numeric($pt['km'])) {
                $ptKm = (float)$pt['km'];
                if ($maxTripKm === null || $ptKm > $maxTripKm) $maxTripKm = $ptKm;
            }
        }
        $effectiveKm = $maxTripKm !== null ? max($maxTripKm, $initialKm) : $initialKm;

        $diff = abs($effectiveKm - $km);
        if ($diff < $minDiff) {
            $minDiff = $diff;
            // attach effective km for client convenience
            $car['current_km'] = $effectiveKm;
            $nearestCar = $car;
        }
    }
    
    echo json_encode([
        'success' => true,
        'car' => $nearestCar
    ]);
    exit;
}

echo json_encode([
    'success' => false,
    'message' => 'Unbekannte Aktion'
]);
