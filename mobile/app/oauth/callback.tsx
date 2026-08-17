import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { saveSessionToken } from "../../lib/api";

const oauthStateKey = "together-ledger-oauth-state";

type CallbackParams = {
  token?: string | string[];
  state?: string | string[];
};

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<CallbackParams>();
  const [message, setMessage] = useState("正在完成安全登入…");

  useEffect(() => {
    let mounted = true;
    const completeLogin = async () => {
      try {
        const token = firstParam(params.token);
        const state = firstParam(params.state);
        const expectedState = await AsyncStorage.getItem(oauthStateKey);

        if (!token) throw new Error("登入完成，但沒有收到 session token。");
        if (expectedState && state !== expectedState) {
          throw new Error("登入回呼驗證失敗，請重新嘗試。");
        }

        await saveSessionToken(token);
        await AsyncStorage.removeItem(oauthStateKey);
        if (mounted) {
          setMessage("登入成功，正在載入你的帳本…");
          router.replace("/");
        }
      } catch (error) {
        if (!mounted) return;
        setMessage(error instanceof Error ? error.message : "登入回呼處理失敗，請重新嘗試。");
      }
    };

    void completeLogin();
    return () => {
      mounted = false;
    };
  }, [params.state, params.token]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>共</Text>
        </View>
        <Text style={styles.title}>共帳 Together Ledger</Text>
        <ActivityIndicator color="#B56C78" style={styles.spinner} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBF7F3",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    borderRadius: 28,
    backgroundColor: "#FFFCF9",
    paddingHorizontal: 28,
    paddingVertical: 34,
    shadowColor: "#5A3E43",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  logo: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#F6E5E5",
  },
  logoText: {
    color: "#B56C78",
    fontSize: 27,
    fontWeight: "800",
  },
  title: {
    marginTop: 16,
    color: "#3A2F2B",
    fontSize: 19,
    fontWeight: "800",
  },
  spinner: {
    marginTop: 26,
  },
  message: {
    marginTop: 14,
    color: "#927E75",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
});
