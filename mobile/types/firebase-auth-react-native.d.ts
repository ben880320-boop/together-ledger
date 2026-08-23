import "@firebase/auth";
import type { Persistence } from "@firebase/auth";

declare module "@firebase/auth" {
  /**
   * Firebase's React Native export exposes this API through the package's
   * `react-native` condition. Its general public declaration intentionally
   * omits the platform-specific symbol, so Expo TypeScript needs this bridge.
   */
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
