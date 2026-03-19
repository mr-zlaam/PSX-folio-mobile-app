import Constants from "expo-constants";
import { Platform } from "react-native";

function isExpoGoEnvironment(): boolean {
  return (
    Constants.executionEnvironment === "storeClient" ||
    Constants.appOwnership === "expo"
  );
}

export async function ensureNotificationPermissionAtStartup(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  // Expo Go on Android SDK 53+ does not support remote push APIs from expo-notifications.
  if (Platform.OS === "android" && isExpoGoEnvironment()) {
    return false;
  }

  try {
    const Notifications = await import("expo-notifications");
    const currentPermission = await Notifications.getPermissionsAsync();
    if (
      currentPermission.granted ||
      currentPermission.status === Notifications.PermissionStatus.GRANTED
    ) {
      return true;
    }

    const requestedPermission = await Notifications.requestPermissionsAsync();
    return (
      requestedPermission.granted ||
      requestedPermission.status === Notifications.PermissionStatus.GRANTED
    );
  } catch {
    return false;
  }
}
