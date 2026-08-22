package com.jrncarrizo.bodegastock;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

  @PluginMethod
  public void canRequestPackageInstalls(PluginCall call) {
    boolean allowed = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      allowed = getContext().getPackageManager().canRequestPackageInstalls();
    }
    JSObject ret = new JSObject();
    ret.put("value", allowed);
    call.resolve(ret);
  }

  @PluginMethod
  public void openInstallSettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
      intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
    }
    call.resolve();
  }

  @PluginMethod
  public void install(PluginCall call) {
    String pathOrUri = call.getString("path");
    if (pathOrUri == null || pathOrUri.isEmpty()) {
      call.reject("Falta la ruta del APK");
      return;
    }

    try {
      Uri apkUri;
      if (pathOrUri.startsWith("content://") || pathOrUri.startsWith("file://")) {
        if (pathOrUri.startsWith("file://")) {
          File file = new File(Uri.parse(pathOrUri).getPath());
          apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
          );
        } else {
          apkUri = Uri.parse(pathOrUri);
        }
      } else {
        File file = new File(pathOrUri);
        if (!file.exists()) {
          call.reject("No se encontró el APK descargado");
          return;
        }
        apkUri = FileProvider.getUriForFile(
          getContext(),
          getContext().getPackageName() + ".fileprovider",
          file
        );
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
          && !getContext().getPackageManager().canRequestPackageInstalls()) {
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        settings.setData(Uri.parse("package:" + getContext().getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(settings);
        call.reject("Activá el permiso para instalar apps desconocidas y volvé a intentar.");
        return;
      }

      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("No se pudo abrir el instalador: " + e.getMessage(), e);
    }
  }
}
