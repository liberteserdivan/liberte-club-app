package cafe.liberte.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

// Ana aktivite — Capacitor köprüsü ve native izin eklentileri
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotificationPermissionPlugin.class);
        registerPlugin(CameraPermissionPlugin.class);
        super.onCreate(savedInstanceState);
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
    }
}
