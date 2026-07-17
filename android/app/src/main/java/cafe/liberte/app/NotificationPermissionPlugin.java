package cafe.liberte.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Android 13+ bildirim izni — WebView Notification API öncesi gerekli
@CapacitorPlugin(
    name = "LiberteNotifications",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class NotificationPermissionPlugin extends Plugin {

    // Sistem bildirim ayarı + Android 13 POST_NOTIFICATIONS birlikte kontrol edilir
    private boolean areNotificationsEnabled() {
        Context context = getContext();
        if (context == null) return false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled();
    }

    // Allow sonrası OEM'lerde NotificationManager gecikebilir — kısa poll
    private boolean waitUntilNotificationsEnabled(int attempts, int delayMs) {
        for (int i = 0; i < attempts; i++) {
            if (areNotificationsEnabled()) {
                return true;
            }
            if (i < attempts - 1) {
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return false;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", areNotificationsEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (waitUntilNotificationsEnabled(3, 80)) {
            call.resolve();
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Eski Android'de runtime diyalog yok — uygulama bildirimi açıksa yeterli
            if (areNotificationsEnabled()) {
                call.resolve();
                return;
            }
            call.reject("Android bildirimleri kapalı. Ayarlardan açın.");
            return;
        }

        // Runtime GRANTED ama app-level bildirim kapalıysa tekrar diyalog açılmaz
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            if (waitUntilNotificationsEnabled(6, 120)) {
                call.resolve();
                return;
            }
            call.reject("Android bildirimleri kapalı. Ayarlardan açın.");
            return;
        }

        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (waitUntilNotificationsEnabled(8, 120)) {
            call.resolve();
            return;
        }
        call.reject("Android bildirim izni reddedildi");
    }

    // Uygulama ön plandayken gelen push için yerel bildirim göster
    @PluginMethod
    public void showLocalNotification(PluginCall call) {
        String title = call.getString("title", "Liberte");
        String body = call.getString("body", "");
        String channelId = call.getString("channelId", "liberte_campaign");

        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.reject("notification_manager_unavailable");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                channelId,
                "Kampanyalar",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Kampanya ve LP bildirimleri");
            manager.createNotificationChannel(channel);
        }

        int icon = context.getResources().getIdentifier("notification_icon", "drawable", context.getPackageName());
        if (icon == 0) {
            icon = context.getApplicationInfo().icon;
        }

        Notification notification = new NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(icon)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();

        manager.notify((int) System.currentTimeMillis(), notification);
        call.resolve();
    }

    // Bildirim ayarları ekranını doğrudan aç
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent();
            String packageName = getContext().getPackageName();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, packageName);
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + packageName));
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Bildirim ayarları açılamadı");
        }
    }
}
