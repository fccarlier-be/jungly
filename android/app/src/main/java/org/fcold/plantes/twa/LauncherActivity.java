/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.fcold.plantes.twa;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {




    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Premier lancement (ou apres reinitialisation) : aucune instance
        // choisie encore -- montre l'assistant plutot que de lancer la TWA
        // avec l'URL par defaut du manifeste (voir SetupActivity).
        if (!InstancePrefs.isConfigured(this)) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Instance choisie par l'utilisateur (auto-hebergee ou offre
        // hebergee) plutot que l'URL fixe du manifeste -- voir InstancePrefs
        // et SetupActivity. A ce stade, isConfigured() est deja garanti par
        // onCreate() ci-dessus.
        String targetUrl = InstancePrefs.getTargetUrl(this);
        if (targetUrl != null) {
            return Uri.parse(targetUrl);
        }

        return super.getLaunchingUrl();
    }
}
