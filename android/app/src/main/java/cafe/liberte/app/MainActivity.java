package cafe.liberte.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import cafe.liberte.app.BuildConfig;
import com.getcapacitor.BridgeActivity;

// Ana aktivite — Capacitor köprüsü ve native izin eklentileri
public class MainActivity extends BridgeActivity {

    private static final String PUSH_CHANNEL_ID = "liberte_campaign";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotificationPermissionPlugin.class);
        registerPlugin(CameraPermissionPlugin.class);
        super.onCreate(savedInstanceState);
        ensurePushNotificationChannel();
    }

    // FCM bildirim kanalı — sunucu tarafı channelId ile eşleşir
    private void ensurePushNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            PUSH_CHANNEL_ID,
            "Kampanyalar",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Kampanya ve LP bildirimleri");

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewMedia();
    }

    // WebView getUserMedia yedek yolu — Capacitor varsayılan WebChromeClient korunur
    private void configureWebViewMedia() {
        if (getBridge() == null) return;

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        // Appium/BrowserStack WebView baglami icin — yalnizca smoke build veya debug
        if (BuildConfig.DEBUG || BuildConfig.ENABLE_WEBVIEW_DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }
}
