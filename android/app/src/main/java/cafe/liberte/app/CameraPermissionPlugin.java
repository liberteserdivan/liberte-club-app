package cafe.liberte.app;

import android.Manifest;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// QR tarama — WebView getUserMedia öncesi kamera izni
@CapacitorPlugin(
    name = "LiberteCamera",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        )
    }
)
public class CameraPermissionPlugin extends Plugin {

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }

        requestPermissionForAlias("camera", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        call.reject("Android kamera izni reddedildi");
    }
}
