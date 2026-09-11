-- Prisma 7 (adapter-better-sqlite3) stocke desormais les DateTime en TEXTE
-- ISO-8601 ("YYYY-MM-DDTHH:MM:SS.SSS+00:00"), alors que le moteur precedent
-- (prisma-client-js) les stockait en ENTIER (epoch millisecondes). SQLite
-- n'a pas de type strict par colonne : les deux formats coexistaient sans
-- erreur, mais toute comparaison (WHERE dueAt <= ?) entre un entier stocke
-- et un texte envoye par le nouveau client est fausse -- SQLite considere
-- systematiquement un entier comme "inferieur" a un texte, quel que soit le
-- contenu (regle de tri des classes de stockage SQLite : NULL < INTEGER/REAL
-- < TEXT < BLOB). Constate en production le 2026-09-11 : toutes les taches
-- PENDING/SNOOZED remontaient comme "a faire aujourd'hui".
--
-- Conversion idempotente (WHERE typeof(...) = 'integer') : ne touche que les
-- valeurs encore au format entier, laisse intactes celles deja au format
-- texte (nouvelles lignes creees depuis le passage a Prisma 7, ou un
-- deploiement precedent de cette meme migration).

UPDATE "User" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';
UPDATE "User" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';

UPDATE "Plant" SET "acquiredAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "acquiredAt"/1000.0, 'unixepoch') WHERE typeof("acquiredAt") = 'integer';
UPDATE "Plant" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';
UPDATE "Plant" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';

UPDATE "PlantPhoto" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';

UPDATE "PlantCareRule" SET "nextDueAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "nextDueAt"/1000.0, 'unixepoch') WHERE typeof("nextDueAt") = 'integer';
UPDATE "PlantCareRule" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';
UPDATE "PlantCareRule" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';

UPDATE "Task" SET "dueAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "dueAt"/1000.0, 'unixepoch') WHERE typeof("dueAt") = 'integer';
UPDATE "Task" SET "completedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "completedAt"/1000.0, 'unixepoch') WHERE typeof("completedAt") = 'integer';
UPDATE "Task" SET "snoozedUntil" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "snoozedUntil"/1000.0, 'unixepoch') WHERE typeof("snoozedUntil") = 'integer';
UPDATE "Task" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';

UPDATE "CareEvent" SET "performedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "performedAt"/1000.0, 'unixepoch') WHERE typeof("performedAt") = 'integer';
UPDATE "CareEvent" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';

UPDATE "Fertilizer" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';
UPDATE "Fertilizer" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';

UPDATE "Note" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';
UPDATE "Note" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';

UPDATE "PlantLibraryEntry" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';
UPDATE "PlantLibraryEntry" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';
UPDATE "PlantLibraryEntry" SET "importedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "importedAt"/1000.0, 'unixepoch') WHERE typeof("importedAt") = 'integer';
UPDATE "PlantLibraryEntry" SET "lastSyncedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "lastSyncedAt"/1000.0, 'unixepoch') WHERE typeof("lastSyncedAt") = 'integer';

UPDATE "NotificationPreference" SET "lastDigestSentAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "lastDigestSentAt"/1000.0, 'unixepoch') WHERE typeof("lastDigestSentAt") = 'integer';

UPDATE "PushSubscription" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';

UPDATE "Sensor" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';

UPDATE "SensorReading" SET "recordedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "recordedAt"/1000.0, 'unixepoch') WHERE typeof("recordedAt") = 'integer';

UPDATE "Upload" SET "createdAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "createdAt"/1000.0, 'unixepoch') WHERE typeof("createdAt") = 'integer';

UPDATE "SeedFingerprint" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';

UPDATE "WeatherProfile" SET "updatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updatedAt"/1000.0, 'unixepoch') WHERE typeof("updatedAt") = 'integer';
